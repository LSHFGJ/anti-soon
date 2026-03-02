import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Navbar } from '../components/Layout/Navbar'
import { renderWithRouter } from '../test/utils'

const mockUseWallet = vi.fn()
const mockSepoliaGetBalance = vi.fn()
const mockSapphireGetBalance = vi.fn()

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

vi.mock('../lib/publicClient', () => ({
  publicClient: {
    getBalance: (...args: unknown[]) => mockSepoliaGetBalance(...args),
  },
}))

vi.mock('viem', async () => {
  const actual = await vi.importActual<typeof import('viem')>('viem')

  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      getBalance: (...args: unknown[]) => mockSapphireGetBalance(...args),
    })),
  }
})

function createWalletState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    address: '0x1111111111111111111111111111111111111111',
    isConnected: true,
    isConnecting: false,
    isWrongNetwork: false,
    chainId: 11155111,
    chainName: 'Ethereum Sepolia',
    walletClient: undefined,
    publicClient: undefined,
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchToCorrectNetwork: vi.fn(),
    ...overrides,
  }
}

describe('Navbar chain indicator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSepoliaGetBalance.mockResolvedValue(1_000_000_000_000_000_000n)
    mockSapphireGetBalance.mockResolvedValue(2_000_000_000_000_000_000n)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    )
    mockUseWallet.mockReturnValue(createWalletState())
  })

  it('uses manual network switching in navbar wallet hook', () => {
    renderWithRouter(React.createElement(Navbar))

    expect(mockUseWallet).toHaveBeenCalledWith({ autoSwitchToSepolia: false })
  })

  it('renders current chain icon to the right of connected address', () => {
    renderWithRouter(React.createElement(Navbar))

    expect(screen.getByText('[0x1111...1111]')).toBeVisible()
    const chainIcon = screen.getByTestId('navbar-chain-icon')
    expect(chainIcon).toHaveAttribute('title', 'Ethereum Sepolia')
    expect(screen.getByAltText('Ethereum Sepolia')).toHaveAttribute('src', '/chains/ethereum.svg')
  })

  it('uses Oasis Sapphire logo when wallet chain is Sapphire', () => {
    mockUseWallet.mockReturnValue(
      createWalletState({
        chainId: 23295,
        chainName: 'Oasis Sapphire',
      }),
    )

    renderWithRouter(React.createElement(Navbar))

    expect(screen.getByAltText('Oasis Sapphire Testnet')).toHaveAttribute('src', '/chains/oasis-sapphire.svg')
  })

  it('uses Oasis Sapphire logo for chain id 23294 fallback', () => {
    mockUseWallet.mockReturnValue(
      createWalletState({
        chainId: 23294,
        chainName: null,
      }),
    )

    renderWithRouter(React.createElement(Navbar))

    const chainIcon = screen.getByTestId('navbar-chain-icon')
    expect(chainIcon).toHaveAttribute('title', 'Oasis Sapphire Testnet')
    expect(screen.getByAltText('Oasis Sapphire Testnet')).toHaveAttribute('src', '/chains/oasis-sapphire.svg')
  })

  it('uses Oasis Sapphire logo when chain name includes sapphire', () => {
    mockUseWallet.mockReturnValue(
      createWalletState({
        chainId: null,
        chainName: 'Oasis Sapphire Testnet',
      }),
    )

    renderWithRouter(React.createElement(Navbar))

    const chainIcon = screen.getByTestId('navbar-chain-icon')
    expect(chainIcon).toHaveAttribute('title', 'Oasis Sapphire Testnet')
    expect(screen.getByAltText('Oasis Sapphire Testnet')).toHaveAttribute('src', '/chains/oasis-sapphire.svg')
  })

  it('hides chain icon while disconnected', () => {
    mockUseWallet.mockReturnValue(
      createWalletState({
        isConnected: false,
      }),
    )

    renderWithRouter(React.createElement(Navbar))

    expect(screen.queryByTestId('navbar-chain-icon')).not.toBeInTheDocument()
  })

  it('loads and shows gas balances when hovering connected address', async () => {
    renderWithRouter(React.createElement(Navbar))

    const addressLabel = screen.getByText('[0x1111...1111]')
    const walletButton = addressLabel.closest('button')
    expect(walletButton).not.toBeNull()

    fireEvent.mouseEnter(walletButton as HTMLButtonElement)

    await waitFor(() => {
      expect(mockSepoliaGetBalance).toHaveBeenCalledWith({
        address: '0x1111111111111111111111111111111111111111',
      })
      expect(mockSapphireGetBalance).toHaveBeenCalledWith({
        address: '0x1111111111111111111111111111111111111111',
      })
    })

    expect(screen.getByText('Gas Balances')).toBeInTheDocument()
    expect(screen.getByText('1.0000 ETH')).toBeInTheDocument()
    expect(screen.getByText('2.0000 TEST')).toBeInTheDocument()
  })

  it('shows faucet hint when any chain gas is below threshold', async () => {
    mockSepoliaGetBalance.mockResolvedValue(5_000_000_000_000_000n)
    mockSapphireGetBalance.mockResolvedValue(1_000_000_000_000_000_000n)

    renderWithRouter(React.createElement(Navbar))

    const addressLabel = screen.getByText('[0x1111...1111]')
    const walletButton = addressLabel.closest('button')
    expect(walletButton).not.toBeNull()

    fireEvent.mouseEnter(walletButton as HTMLButtonElement)

    await waitFor(() => {
      expect(screen.getByText('Low gas detected, top up via faucet:')).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: 'Ethereum Sepolia Faucet' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Oasis Sapphire Testnet Faucet' })).not.toBeInTheDocument()
  })
})
