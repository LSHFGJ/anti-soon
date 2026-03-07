import { render, screen, waitFor } from '@testing-library/react'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockUseWallet,
  mockGetLogsWithRangeFallback,
  mockMulticallWithRpcFallback,
  mockReadContractWithRpcFallback,
} = vi.hoisted(() => ({
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

vi.mock('../lib/previewFallback', () => ({
  formatPreviewFallbackMessage: (message: string) => message,
  shouldUsePreviewFallback: () => false,
}))

import Leaderboard from '../pages/Leaderboard'

function getFunctionName(parameters: unknown): string | null {
  if (typeof parameters !== 'object' || parameters === null || !('functionName' in parameters)) {
    return null
  }

  const value = parameters.functionName
  return typeof value === 'string' ? value : null
}

describe('Leaderboard contract-native reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      address: '0x1111111111111111111111111111111111111111' as Address,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
    })
    mockGetLogsWithRangeFallback.mockRejectedValue(new Error('legacy leaderboard log scan should not run'))
    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)
      if (functionName === 'getLeaderboardAuditors') {
        return [['0x2222222222222222222222222222222222222222'], 0n]
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })
    mockMulticallWithRpcFallback.mockResolvedValue([
      [7n, 3n, 0n, 2n, 1n, 0n, 1_500_000_000_000_000_000n, 0n],
    ])
  })

  it('renders leaderboard rows from contract stats without log scanning', async () => {
    render(<Leaderboard />)

    await waitFor(() => {
      expect(screen.getByText('0x2222...2222')).toBeVisible()
    })

    expect(mockGetLogsWithRangeFallback).not.toHaveBeenCalled()
    expect(screen.getByText(/1\.5 ETH/)).toBeVisible()
    expect(screen.getByText('2')).toBeVisible()
  })
})
