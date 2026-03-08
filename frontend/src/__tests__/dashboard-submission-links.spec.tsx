import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseWallet, mockGetLogsWithRangeFallback, mockMulticallWithRpcFallback, mockReadAllAuditorSubmissionIds } = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockGetLogsWithRangeFallback: vi.fn(),
  mockMulticallWithRpcFallback: vi.fn(),
  mockReadAllAuditorSubmissionIds: vi.fn(),
}))

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

vi.mock('../lib/chainLogs', () => ({
  discoverDeploymentBlockWithFallback: vi.fn(),
  getLogsWithRangeFallback: (...args: unknown[]) => mockGetLogsWithRangeFallback(...args),
}))

vi.mock('../lib/submissionIndex', () => ({
  readAllAuditorSubmissionIds: (...args: unknown[]) => mockReadAllAuditorSubmissionIds(...args),
}))

vi.mock('../lib/publicClient', () => ({
  getBlockNumberWithRpcFallback: vi.fn(),
  getLogsWithRpcFallback: vi.fn(),
  multicallWithRpcFallback: (...args: unknown[]) => mockMulticallWithRpcFallback(...args),
  readContractWithRpcFallback: vi.fn(),
}))

import Dashboard from '../pages/Dashboard'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

describe('Dashboard chain-only submission entrypoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111' as Address,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
    })
    mockReadAllAuditorSubmissionIds.mockResolvedValue([7n])

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
  })

  it('renders indexed submission links and Sepolia tx links', async () => {
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
    expect(mockReadAllAuditorSubmissionIds).toHaveBeenCalledWith(
      '0x1111111111111111111111111111111111111111',
    )
  })

  it('still renders indexed submissions when optional tx hash lookup fails', async () => {
    mockGetLogsWithRangeFallback.mockRejectedValue(new Error('rpc log failure'))

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#7' })).toBeVisible()
    })

    expect(screen.queryByText(/Failed to load your submissions from blockchain/i)).not.toBeInTheDocument()
  })

  it('reads new jury and grouping metadata getters', async () => {
    mockReadAllAuditorSubmissionIds.mockResolvedValue([99n])
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

  it('keeps rendering indexed submissions when optional lifecycle metadata reverts', async () => {
    mockMulticallWithRpcFallback.mockResolvedValue([
      {
        status: 'success',
        result: [
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
      },
      { status: 'failure', error: new Error('legacy submission lifecycle unavailable') },
      { status: 'success', result: [false, '', ''] },
      { status: 'success', result: [false, '', '', 0, 0] },
    ])

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#7' })).toBeVisible()
    })

    expect(screen.queryByText(/Failed to load your submissions from blockchain/i)).toBeNull()
  })

  it('keeps rendering indexed submissions when optional jury and grouping metadata revert', async () => {
    mockMulticallWithRpcFallback.mockResolvedValue([
      {
        status: 'success',
        result: [
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
      },
      { status: 'success', result: [0, 0n, 0n, 0, 0, '0x00', '0x00'] },
      { status: 'failure', error: new Error('legacy jury metadata unavailable') },
      { status: 'failure', error: new Error('legacy grouping metadata unavailable') },
    ])

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#7' })).toBeVisible()
    })

    expect(screen.queryByText(/Failed to load your submissions from blockchain/i)).toBeNull()
  })

  it('ignores stale submission responses after wallet switches', async () => {
    const walletA = '0x1111111111111111111111111111111111111111' as Address
    const walletB = '0x2222222222222222222222222222222222222222' as Address
    const walletAIdsDeferred = deferred<bigint[]>()
    const walletBIdsDeferred = deferred<bigint[]>()
    let currentAddress = walletA

    mockUseWallet.mockImplementation(() => ({
      address: currentAddress,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
    }))
    mockReadAllAuditorSubmissionIds.mockImplementation((address: Address) => {
      if (address === walletA) {
        return walletAIdsDeferred.promise
      }

      return walletBIdsDeferred.promise
    })
    mockGetLogsWithRangeFallback.mockResolvedValue([])
    mockMulticallWithRpcFallback.mockImplementation(async ({ contracts }) => {
      const submissionId = contracts[0].args[0]
      const auditor = submissionId === 8n ? walletB : walletA

      return [
        [
          auditor,
          1n,
          '0x2222222222222222222222222222222222222222222222222222222222222222',
          `oasis://submission/${submissionId.toString()}`,
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
        [false, '', '', 0, 0],
      ]
    })

    const view = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    currentAddress = walletB
    view.rerender(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    walletAIdsDeferred.resolve([7n])

    await waitFor(() => {
      expect(screen.getByText('Loading submissions...')).toBeVisible()
    })

    expect(screen.queryByRole('link', { name: '#7' })).toBeNull()

    walletBIdsDeferred.resolve([8n])

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#8' })).toBeVisible()
      expect(screen.queryByRole('link', { name: '#7' })).toBeNull()
    })
  })
})
