import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseWallet, mockGetLogsWithRangeFallback, mockMulticallWithRpcFallback, mockReadContractWithRpcFallback } = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockGetLogsWithRangeFallback: vi.fn(),
  mockMulticallWithRpcFallback: vi.fn(),
  mockReadContractWithRpcFallback: vi.fn(),
}))

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

vi.mock('../lib/chainLogs', () => ({
  discoverDeploymentBlockWithFallback: vi.fn(),
  getLogsWithRangeFallback: (...args: unknown[]) => mockGetLogsWithRangeFallback(...args),
}))

vi.mock('../lib/publicClient', () => ({
  getBlockNumberWithRpcFallback: vi.fn(),
  getLogsWithRpcFallback: vi.fn(),
  multicallWithRpcFallback: (...args: unknown[]) => mockMulticallWithRpcFallback(...args),
  readContractWithRpcFallback: (...args: unknown[]) => mockReadContractWithRpcFallback(...args),
}))

import Dashboard from '../pages/Dashboard'

describe('Dashboard chain-only submission entrypoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111' as Address,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
    })

    mockGetLogsWithRangeFallback.mockResolvedValue([
      {
        args: { submissionId: 7n },
        transactionHash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      },
    ])
    mockMulticallWithRpcFallback.mockResolvedValue([
      [
        '0x1111111111111111111111111111111111111111',
        1n,
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        'oasis://sapphire-testnet/mock-contract/slot-7#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        1736200000n,
        0n,
        0,
        0n,
        0,
        0n,
        0n,
        false,
        '0x0000000000000000000000000000000000000000',
        0n,
      ],
    ])
    mockReadContractWithRpcFallback.mockResolvedValue(8n)
  })

  it('renders chain-backed submission links and Sepolia tx links', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#7' })).toBeVisible()
    })

    expect(screen.getByRole('link', { name: '#7' })).toHaveAttribute('href', '/submission/7')
    expect(screen.getByRole('link', { name: 'SEPOLIA TX' })).toHaveAttribute(
      'href',
      expect.stringContaining('/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'),
    )
    expect(screen.queryByText(/SAPPHIRE TX/i)).not.toBeInTheDocument()
  })

  it('falls back to scanning submissions from nextSubmissionId when log discovery fails', async () => {
    mockGetLogsWithRangeFallback.mockRejectedValue(new Error('rpc log failure'))
    mockReadContractWithRpcFallback.mockResolvedValue(8n)
    mockMulticallWithRpcFallback.mockResolvedValue([
      [
        '0x9999999999999999999999999999999999999999',
        1n,
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'oasis://sapphire-testnet/mock-contract/slot-6#0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        1736200000n,
        0n,
        0,
        0n,
        0,
        0n,
        0n,
        false,
        '0x0000000000000000000000000000000000000000',
        0n,
      ],
      [
        '0x1111111111111111111111111111111111111111',
        1n,
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        'oasis://sapphire-testnet/mock-contract/slot-7#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0x0000000000000000000000000000000000000000000000000000000000000000',
        1736200000n,
        0n,
        0,
        0n,
        0,
        0n,
        0n,
        false,
        '0x0000000000000000000000000000000000000000',
        0n,
      ],
    ])

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#6' })).toBeVisible()
    })

    expect(screen.queryByText(/Failed to load your submissions from blockchain/i)).not.toBeInTheDocument()
  })
})
