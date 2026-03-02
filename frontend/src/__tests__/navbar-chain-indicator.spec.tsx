import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Navbar } from '../components/Layout/Navbar'
import { renderWithRouter } from '../test/utils'

const mockUseWallet = vi.fn()

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

function createWalletState(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    address: '0x1111111111111111111111111111111111111111',
    isConnected: true,
    isConnecting: false,
    isWrongNetwork: false,
    chainId: 11155111,
    chainName: 'Sepolia',
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
    expect(chainIcon).toHaveAttribute('title', 'Sepolia')
    expect(screen.getByAltText('Sepolia')).toHaveAttribute('src', '/chains/ethereum.svg')
  })

  it('uses Oasis Sapphire logo when wallet chain is Sapphire', () => {
    mockUseWallet.mockReturnValue(
      createWalletState({
        chainId: 23295,
        chainName: 'Oasis Sapphire',
      }),
    )

    renderWithRouter(React.createElement(Navbar))

    expect(screen.getByAltText('Oasis Sapphire')).toHaveAttribute('src', '/chains/oasis-sapphire.svg')
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
    expect(chainIcon).toHaveAttribute('title', 'Oasis Sapphire')
    expect(screen.getByAltText('Oasis Sapphire')).toHaveAttribute('src', '/chains/oasis-sapphire.svg')
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
})
