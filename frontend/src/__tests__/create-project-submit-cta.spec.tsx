import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProject } from '../pages/CreateProject'
import { renderWithRouter } from '../test/utils'

const mockConnect = vi.fn()

vi.mock('../hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: false,
    address: null,
    connect: mockConnect,
    walletClient: undefined,
  }),
}))

vi.mock('../components/ScriptPicker', () => ({
  ScriptPicker: ({ scripts, onSelect }: { scripts: Array<{ name: string }>; onSelect: (script: { name: string }) => void }) => (
    <button type="button" onClick={() => onSelect(scripts[0])}>
      select mock script
    </button>
  ),
}))

vi.mock('../components/ScopeEditor', () => ({
  ScopeEditor: ({ onScopeChange }: { onScopeChange: (scopes: Array<{ name: string; address: `0x${string}`; verified: boolean }>) => void }) => (
    <button
      type="button"
      onClick={() =>
        onScopeChange([
          {
            name: 'MockContract',
            address: '0x0000000000000000000000000000000000000001',
            verified: true,
          },
        ])
      }
    >
      select mock scope
    </button>
  ),
}))

describe('CreateProject submit CTA', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    mockConnect.mockReset()
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            name: 'Deploy.s.sol',
            path: 'script/Deploy.s.sol',
            type: 'file',
            download_url: 'https://example.com/script/Deploy.s.sol',
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'contract MockContract {}\nnew MockContract();',
      })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps the final CTA clickable by triggering wallet connect when review is reached disconnected', async () => {
    const user = userEvent.setup()

    renderWithRouter(<CreateProject />)

    await user.type(
      screen.getByPlaceholderText('https://github.com/owner/repo'),
      'https://github.com/example/repo',
    )
    await user.click(screen.getByRole('button', { name: /scan/i }))
    await screen.findByText(/Found 1 deployment script/i)
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /select mock script/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /select mock scope/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.clear(screen.getByPlaceholderText('1.0'))
    await user.type(screen.getByPlaceholderText('1.0'), '10')
    await user.clear(screen.getByPlaceholderText('0.5'))
    await user.type(screen.getByPlaceholderText('0.5'), '5')
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))

    const cta = await screen.findByRole('button', { name: /connect wallet to submit/i })
    expect(cta).not.toBeDisabled()

    await user.click(cta)

    expect(mockConnect).toHaveBeenCalledTimes(1)
  })
})
