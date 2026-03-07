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

function getFunctionName(parameters: unknown): string | null {
  if (typeof parameters !== 'object' || parameters === null || !('functionName' in parameters)) {
    return null
  }

  const value = parameters.functionName
  return typeof value === 'string' ? value : null
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
    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)
      if (functionName === 'getAuditorSubmissionIds') {
        return [[7n], 0n]
      }
      if (functionName === 'getAuditorStats') {
        return [9n, 4n, 2n, 3n, 1n, 0n, 5_000_000_000_000_000_000n, 0n]
      }
      if (functionName === 'getSubmissionGroupingMetadata') {
        return [false, '', '', 0n, 0n]
      }
      if (functionName === 'getSubmissionJuryMetadata') {
        return [false, '', '']
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })
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
    expect(screen.getByText(/5(\.0+)? ETH/)).toBeVisible()
    expect(screen.getByText('9')).toBeVisible()
    expect(screen.getByText('4')).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'SEPOLIA TX' })).toBeVisible()
    })
    expect(screen.getByRole('link', { name: 'SEPOLIA TX' })).toHaveAttribute(
      'href',
      expect.stringContaining('/tx/0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'),
    )
    expect(screen.queryByText(/SAPPHIRE TX/i)).not.toBeInTheDocument()
  })

  it('loads submissions from the contract index even when tx log lookup fails', async () => {
    mockGetLogsWithRangeFallback.mockRejectedValue(new Error('rpc log failure'))

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#7' })).toBeVisible()
    })

    const functionNames = mockReadContractWithRpcFallback.mock.calls
      .map(([parameters]) => getFunctionName(parameters))
      .filter((value): value is string => value !== null)

    expect(functionNames).toContain('getAuditorSubmissionIds')
    expect(functionNames).toContain('getAuditorStats')
    expect(functionNames).not.toContain('nextSubmissionId')
    expect(screen.queryByText(/Failed to load your submissions from blockchain/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'SEPOLIA TX' })).not.toBeInTheDocument()
  })
})
