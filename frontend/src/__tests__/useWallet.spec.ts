import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWallet } from '../hooks/useWallet'

const {
  mockUseAccount,
  mockUseDisconnect,
  mockUseSwitchChain,
  mockUseWalletClient,
  mockUsePublicClient,
  mockUseAppKit,
} = vi.hoisted(() => ({
  mockUseAccount: vi.fn(),
  mockUseDisconnect: vi.fn(),
  mockUseSwitchChain: vi.fn(),
  mockUseWalletClient: vi.fn(),
  mockUsePublicClient: vi.fn(),
  mockUseAppKit: vi.fn(),
}))

vi.mock('wagmi', () => ({
  useAccount: mockUseAccount,
  useDisconnect: mockUseDisconnect,
  useSwitchChain: mockUseSwitchChain,
  useWalletClient: mockUseWalletClient,
  usePublicClient: mockUsePublicClient,
}))

vi.mock('@reown/appkit/react', () => ({
  useAppKit: mockUseAppKit,
}))

vi.mock('@reown/appkit/networks', () => ({
  sepolia: { id: 11155111 },
}))

describe('useWallet auto-switch behavior', () => {
  const switchChain = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    mockUseAccount.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111',
      isConnected: true,
      chain: { id: 1 },
    })
    mockUseDisconnect.mockReturnValue({ disconnect: vi.fn() })
    mockUseSwitchChain.mockReturnValue({ switchChain, isPending: false })
    mockUseWalletClient.mockReturnValue({ data: undefined })
    mockUsePublicClient.mockReturnValue(undefined)
    mockUseAppKit.mockReturnValue({ open: vi.fn() })
  })

  it('auto-switches to Sepolia by default on wrong network', async () => {
    renderHook(() => useWallet())

    await waitFor(() => {
      expect(switchChain).toHaveBeenCalledWith({ chainId: 11155111 })
    })
  })

  it('does not auto-switch when autoSwitchToSepolia is disabled', async () => {
    renderHook(() => useWallet({ autoSwitchToSepolia: false }))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(switchChain).not.toHaveBeenCalled()
  })
})
