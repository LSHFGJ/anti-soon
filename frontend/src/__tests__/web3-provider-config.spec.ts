import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('Web3Provider appkit config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('disables auto network-switch prompts for temporary non-sepolia flows', async () => {
    const createAppKit = vi.fn()
    const metaMaskConnector = { id: 'metamask' }
    const metaMask = vi.fn(() => metaMaskConnector)
    const WagmiAdapter = vi.fn(
      class {
        wagmiConfig = {}
      },
    )

    vi.doMock('@tanstack/react-query', () => ({
      QueryClient: class {},
      QueryClientProvider: ({ children }: { children: unknown }) => children,
    }))

    vi.doMock('wagmi', () => ({
      WagmiProvider: ({ children }: { children: unknown }) => children,
    }))

    vi.doMock('@wagmi/connectors', () => ({
      metaMask,
    }))

    vi.doMock('@reown/appkit/networks', () => ({
      sepolia: { id: 11155111, name: 'Sepolia' },
    }))

    vi.doMock('@reown/appkit-adapter-wagmi', () => ({
      WagmiAdapter,
    }))

    vi.doMock('@reown/appkit/react', () => ({
      createAppKit,
    }))

    await import('../providers/Web3Provider')

    expect(metaMask).toHaveBeenCalledTimes(1)
    expect(WagmiAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        connectors: [metaMaskConnector],
      }),
    )

    expect(createAppKit).toHaveBeenCalledWith(
      expect.objectContaining({
        allowUnsupportedChain: true,
        enableNetworkSwitch: false,
      }),
    )
  })
})
