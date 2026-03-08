import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from '../pages/Dashboard'
import { ProjectDetail } from '../pages/ProjectDetail'
import { SubmissionDetail } from '../pages/SubmissionDetail'

const {
  mockUseWallet,
  mockGetLogsWithRangeFallback,
  mockGetLogsWithRpcFallback,
  mockMulticallWithRpcFallback,
  mockReadAllAuditorSubmissionIds,
  mockReadAllProjectSubmissionIds,
  mockReadContractWithRpcFallback,
  mockReadProjectById,
  mockReadStoredPoCPreview,
  mockResolveSapphireTxHash,
} = vi.hoisted(() => ({
  mockUseWallet: vi.fn(),
  mockGetLogsWithRangeFallback: vi.fn(),
  mockGetLogsWithRpcFallback: vi.fn(),
  mockMulticallWithRpcFallback: vi.fn(),
  mockReadAllAuditorSubmissionIds: vi.fn(),
  mockReadAllProjectSubmissionIds: vi.fn(),
  mockReadContractWithRpcFallback: vi.fn(),
  mockReadProjectById: vi.fn(),
  mockReadStoredPoCPreview: vi.fn(),
  mockResolveSapphireTxHash: vi.fn(),
}))

vi.mock('../hooks/useWallet', () => ({
  useWallet: (...args: unknown[]) => mockUseWallet(...args),
}))

vi.mock('../lib/chainLogs', () => ({
  discoverDeploymentBlockWithFallback: vi.fn(),
  getLogsWithRangeFallback: (...args: unknown[]) => mockGetLogsWithRangeFallback(...args),
}))

vi.mock('../lib/publicClient', () => ({
  publicClient: {
    multicall: vi.fn(),
    readContract: vi.fn(),
    getLogs: vi.fn(),
  },
  getBlockNumberWithRpcFallback: vi.fn(),
  getLogsWithRpcFallback: (...args: unknown[]) => mockGetLogsWithRpcFallback(...args),
  multicallWithRpcFallback: (...args: unknown[]) => mockMulticallWithRpcFallback(...args),
  readContractWithRpcFallback: (...args: unknown[]) => mockReadContractWithRpcFallback(...args),
}))

vi.mock('../lib/projectReads', () => ({
  readProjectById: (...args: unknown[]) => mockReadProjectById(...args),
}))

vi.mock('../lib/submissionIndex', () => ({
  readAllAuditorSubmissionIds: (...args: unknown[]) => mockReadAllAuditorSubmissionIds(...args),
  readAllProjectSubmissionIds: (...args: unknown[]) => mockReadAllProjectSubmissionIds(...args),
}))

vi.mock('../lib/oasisUpload', () => ({
  readStoredPoCPreview: (...args: unknown[]) => mockReadStoredPoCPreview(...args),
  resolveSapphireTxHash: (...args: unknown[]) => mockResolveSapphireTxHash(...args),
}))

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as Address

const mockProject = {
  id: 1n,
  owner: MOCK_ADDRESS,
  bountyPool: 1_000n,
  maxPayoutPerBug: 100n,
  targetContract: '0x2222222222222222222222222222222222222222' as Address,
  forkBlock: 20_000_000n,
  active: true,
  mode: 1,
  commitDeadline: 10_000_000_000n,
  revealDeadline: 20_000_000_000n,
  disputeWindow: 100n,
  juryWindow: 100n,
  adjudicationWindow: 100n,
  rulesHash: `0x${'12'.repeat(32)}` as `0x${string}`,
  vnetStatus: 0,
  vnetRpcUrl: '',
  baseSnapshotId: `0x${'00'.repeat(32)}` as `0x${string}`,
  vnetCreatedAt: 0n,
  repoUrl: '',
}

const mockProjectRules = [
  100n,
  3600n,
  false,
  {
    criticalDrainWei: 100n,
    highDrainWei: 100n,
    mediumDrainWei: 100n,
    lowDrainWei: 100n,
  },
] as const

function makeSubmissionTuple(overrides?: Partial<{
  auditor: Address
  projectId: bigint
  status: number
  severity: number
  drainAmountWei: bigint
  payoutAmount: bigint
  disputeDeadline: bigint
  challenged: boolean
  challenger: Address
  challengeBond: bigint
}>) {
  return [
    overrides?.auditor ?? MOCK_ADDRESS,
    overrides?.projectId ?? 1n,
    `0x${'aa'.repeat(32)}` as `0x${string}`,
    'oasis://sapphire-testnet/0x2222222222222222222222222222222222222222/slot-1001#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    `0x${'00'.repeat(32)}` as `0x${string}`,
    1_736_200_000n,
    1_736_300_000n,
    overrides?.status ?? 2,
    overrides?.drainAmountWei ?? 100n,
    overrides?.severity ?? 3,
    overrides?.payoutAmount ?? 0n,
    overrides?.disputeDeadline ?? 0n,
    overrides?.challenged ?? false,
    overrides?.challenger ?? ('0x0000000000000000000000000000000000000000' as Address),
    overrides?.challengeBond ?? 0n,
  ] as const
}

function makeLifecycleTuple() {
  return [6, 1_736_400_000n, 1_736_500_000n, 2, 0, '0x0', '0x0'] as const
}

function makeJuryTuple() {
  return [true, 'UPHOLD_AI_RESULT', 'Looks good'] as const
}

function makeGroupingTuple() {
  return [true, 'HIGH', 'g123', 1n, 3n] as const
}

describe('Submission Grouping & Jury Visibility Alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseWallet.mockReturnValue({
      address: MOCK_ADDRESS,
      isConnected: true,
      isConnecting: false,
      connect: vi.fn(),
      walletClient: undefined,
    })

    mockGetLogsWithRangeFallback.mockResolvedValue([])
    mockGetLogsWithRpcFallback.mockResolvedValue([])
    mockMulticallWithRpcFallback.mockResolvedValue([])
    mockReadAllAuditorSubmissionIds.mockResolvedValue([])
    mockReadAllProjectSubmissionIds.mockResolvedValue([])
    mockReadProjectById.mockResolvedValue(mockProject)
    mockReadStoredPoCPreview.mockResolvedValue({ poc: { ok: true } })
    mockResolveSapphireTxHash.mockResolvedValue(undefined)
    mockReadContractWithRpcFallback.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'projectRules') return Promise.resolve(mockProjectRules)
      if (functionName === 'submissions') return Promise.resolve(makeSubmissionTuple())
      if (functionName === 'getSubmissionLifecycle') return Promise.resolve(makeLifecycleTuple())
      if (functionName === 'getSubmissionJuryMetadata') return Promise.resolve([false, '', ''])
      if (functionName === 'getSubmissionGroupingMetadata') return Promise.resolve([false, '', '', 0n, 0n])
      return Promise.resolve(null)
    })
  })

  it('Dashboard renders grouping and jury metadata gracefully', async () => {
    mockReadAllAuditorSubmissionIds.mockResolvedValue([1001n])
    mockGetLogsWithRangeFallback.mockResolvedValue([
      {
        args: { submissionId: 1001n },
        transactionHash: `0x${'c'.repeat(64)}`,
      },
    ])

    mockMulticallWithRpcFallback.mockResolvedValue([
      makeSubmissionTuple(),
      makeLifecycleTuple(),
      makeJuryTuple(),
      makeGroupingTuple(),
    ])

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '#1001' })).toBeVisible()
    })

    expect(screen.getByText(/\[HIGH-1\/3\]/)).toBeVisible()
    expect(screen.getByText(/UPHOLD AI/)).toBeVisible()
    expect(screen.queryByText(/Failed to load your submissions from blockchain/i)).not.toBeInTheDocument()
  })

  it('ProjectDetail renders grouping and jury metadata gracefully', async () => {
    mockReadAllProjectSubmissionIds.mockResolvedValue([3001n])
    mockGetLogsWithRangeFallback.mockResolvedValue([
      {
        args: { submissionId: 3001n },
        transactionHash: `0x${'d'.repeat(64)}`,
      },
    ])

    mockMulticallWithRpcFallback.mockResolvedValue([
      makeSubmissionTuple(),
      makeLifecycleTuple(),
      makeJuryTuple(),
      makeGroupingTuple(),
    ])

    render(
      <MemoryRouter initialEntries={['/project/1']}>
        <Routes>
          <Route path="/project/:id" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText(/\[HIGH-1\/3\]/)).toBeVisible()
      expect(screen.getByText('Source: Jury')).toBeVisible()
    })
  })

  it('SubmissionDetail renders grouping and jury metadata gracefully', async () => {
    mockReadContractWithRpcFallback.mockImplementation(({ functionName }: { functionName: string }) => {
      if (functionName === 'submissions') return Promise.resolve(makeSubmissionTuple())
      if (functionName === 'getSubmissionLifecycle') return Promise.resolve(makeLifecycleTuple())
      if (functionName === 'getSubmissionJuryMetadata') {
        return Promise.resolve(makeJuryTuple())
      }
      if (functionName === 'getSubmissionGroupingMetadata') {
        return Promise.resolve(makeGroupingTuple())
      }
      if (functionName === 'projectRules') return Promise.resolve(mockProjectRules)
      return Promise.resolve(null)
    })

    render(
      <MemoryRouter initialEntries={['/submission/1001']}>
        <Routes>
          <Route path="/submission/:id" element={<SubmissionDetail />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('GROUPING_METADATA')).toBeInTheDocument()
    expect(screen.getByText('g123')).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.getByText('JURY_OUTPUT')).toBeInTheDocument()
    expect(screen.getByText('UPHOLD_AI_RESULT')).toBeInTheDocument()
    expect(screen.getByText('Looks good')).toBeInTheDocument()
  })
})
