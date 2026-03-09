import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProject } from '../pages/CreateProject'
import { renderWithRouter } from '../test/utils'

const mockWriteContract = vi.fn()
const mockConnect = vi.fn()

vi.mock('../hooks/useWallet', () => ({
  useWallet: () => ({
    isConnected: true,
    address: '0x00000000000000000000000000000000000000aa',
    connect: mockConnect,
    walletClient: {
      writeContract: mockWriteContract,
    },
  }),
}))

vi.mock('../components/ScriptPicker', () => ({
  ScriptPicker: ({ scripts, onSelect }: { scripts: Array<{ name: string }>; onSelect: (script: { name: string }) => void }) => (
    <button type="button" onClick={() => onSelect(scripts[0])}>
      select mock script
    </button>
  ),
}))

const selectedScopeAddress = '0x0000000000000000000000000000000000000001'

vi.mock('../components/ScopeEditor', () => ({
  ScopeEditor: ({ onScopeChange }: { onScopeChange: (scopes: Array<{ name: string; address: `0x${string}`; verified: boolean }>) => void }) => (
    <button
      type="button"
      onClick={() =>
        onScopeChange([
          {
            name: 'MockContract',
            address: selectedScopeAddress,
            verified: true,
          },
        ])
      }
    >
      select mock scope
    </button>
  ),
}))

describe('CreateProject submit flow', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    mockWriteContract.mockReset()
    mockConnect.mockReset()
    mockWriteContract.mockResolvedValue('0xabc123')
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

  it('keeps the scoped target contract through review and submit', async () => {
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

    await screen.findByText('// STEP_07: REVIEW & SUBMIT')
    expect(screen.getByText(selectedScopeAddress)).toBeInTheDocument()
    expect(mockWriteContract).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /submit project/i }))

    await waitFor(() => {
      expect(mockWriteContract).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining([selectedScopeAddress]),
        }),
      )
    })
  })
})
