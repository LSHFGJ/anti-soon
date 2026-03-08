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
      [0, 0n, 0n, 0, 0, '0x00', '0x00'],
      [false, '', ''],
      [false, '', '', 0, 0]
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
    mockMulticallWithRpcFallback.mockImplementation(async ({ contracts }) => {
      return contracts.map((c: any) => {
        const id = c.args[0];
        if (c.functionName === 'submissions') {
          if (id === 7n) return ['0x9999999999999999999999999999999999999999', 1n, '0xaa', 'uri', '0x00', 1736200000n, 0n, 0, 0n, 0, 0n, 0n, false, '0x0', 0n];
          if (id === 6n) return ['0x1111111111111111111111111111111111111111', 1n, '0xbb', 'uri2', '0x00', 1736200000n, 0n, 0, 0n, 0, 0n, 0n, false, '0x0', 0n];
          return ['0x0000000000000000000000000000000000000000', 1n, '0xcc', 'uri3', '0x00', 1736200000n, 0n, 0, 0n, 0, 0n, 0n, false, '0x0', 0n];
        }
        if (c.functionName === 'getSubmissionLifecycle') return [0, 0n, 0n, 0, 0, '0x00', '0x00'];
        if (c.functionName === 'getSubmissionJuryMetadata') return [false, '', ''];
        if (c.functionName === 'getSubmissionGroupingMetadata') return [false, '', '', 0, 0];
        return [];
      });
    })

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
  it('reads new jury and grouping metadata getters', async () => {
    mockGetLogsWithRangeFallback.mockResolvedValue([
      { args: { submissionId: 99n }, transactionHash: '0x99' }
    ])

    mockMulticallWithRpcFallback.mockResolvedValue([
      [
        '0x1111111111111111111111111111111111111111', 1n, '0x0', 'uri', '0x0', 0n, 0n, 2, 0n, 1, 100n, 0n, false, '0x0', 0n
      ],
      [6, 123456789n, 0n, 2, 0, '0x0', '0x0'], // lifecycle: JuryPending
      [true, 'UPHOLD_RESULT', 'Valid finding'], // jury
      [true, 'A1', 'gid', 1n, 5n] // grouping
    ])

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      // Check for Jury UI elements
      expect(screen.getByText(/⚖️ UPHOLD/)).toBeVisible()
      expect(screen.getByText(/\[A1-1\/5\]/)).toBeVisible()
    })
  })
})
