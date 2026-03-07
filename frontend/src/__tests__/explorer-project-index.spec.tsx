import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Explorer } from '../pages/Explorer'
import { renderWithRouter } from '../test/utils'

const { mockReadContractWithRpcFallback, mockReadProjectsByIds } = vi.hoisted(() => ({
  mockReadContractWithRpcFallback: vi.fn(),
  mockReadProjectsByIds: vi.fn(),
}))

vi.mock('../lib/publicClient', () => ({
  readContractWithRpcFallback: (...args: unknown[]) => mockReadContractWithRpcFallback(...args),
}))

vi.mock('../lib/projectReads', () => ({
  readProjectById: vi.fn(),
  readProjectsByIds: (...args: unknown[]) => mockReadProjectsByIds(...args),
}))

vi.mock('../lib/previewFallback', () => ({
  buildPreviewProject: vi.fn(),
  formatPreviewFallbackMessage: (message: string) => message,
  shouldUsePreviewFallback: () => false,
}))

function getFunctionName(parameters: unknown): string | null {
  if (typeof parameters !== 'object' || parameters === null || !('functionName' in parameters)) {
    return null
  }

  const value = parameters.functionName
  return typeof value === 'string' ? value : null
}

describe('Explorer project id index reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)
      if (functionName === 'getProjectIds') {
        return [[4n, 3n], 0n]
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })
    mockReadProjectsByIds.mockResolvedValue([
      {
        id: 4n,
        owner: '0x1234567890123456789012345678901234567890',
        bountyPool: 1_000_000_000_000_000_000n,
        maxPayoutPerBug: 100_000_000_000_000_000n,
        targetContract: '0xabcdef1234567890123456789012345678901234',
        forkBlock: 1n,
        active: true,
        mode: 0,
        commitDeadline: 20_000_000_000n,
        revealDeadline: 20_000_100_000n,
        disputeWindow: 100n,
        rulesHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        vnetStatus: 2,
        vnetRpcUrl: '',
        baseSnapshotId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        vnetCreatedAt: 0n,
        repoUrl: '',
      },
      {
        id: 3n,
        owner: '0x1234567890123456789012345678901234567890',
        bountyPool: 2_000_000_000_000_000_000n,
        maxPayoutPerBug: 200_000_000_000_000_000n,
        targetContract: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        forkBlock: 1n,
        active: true,
        mode: 1,
        commitDeadline: 20_000_000_000n,
        revealDeadline: 20_000_100_000n,
        disputeWindow: 100n,
        rulesHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        vnetStatus: 2,
        vnetRpcUrl: '',
        baseSnapshotId: '0x0000000000000000000000000000000000000000000000000000000000000000',
        vnetCreatedAt: 0n,
        repoUrl: '',
      },
    ])
  })

  it('loads projects from the contract project index instead of nextProjectId scans', async () => {
    renderWithRouter(<Explorer />)

    await waitFor(() => {
      expect(screen.getByText('PROJECT_#4')).toBeVisible()
    })

    const functionNames = mockReadContractWithRpcFallback.mock.calls
      .map(([parameters]) => getFunctionName(parameters))
      .filter((value): value is string => value !== null)

    expect(functionNames).toContain('getProjectIds')
    expect(functionNames).not.toContain('nextProjectId')
  })
})
