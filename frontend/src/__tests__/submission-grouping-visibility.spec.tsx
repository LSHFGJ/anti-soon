import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Address } from 'viem'

import { Dashboard } from '../pages/Dashboard'
import { ProjectDetail } from '../pages/ProjectDetail'
import { SubmissionDetail } from '../pages/SubmissionDetail'
import { useWallet } from '../hooks/useWallet'
import { resolveSapphireTxHash } from '../lib/oasisUpload'
import { readProjectById } from '../lib/projectReads'
import type { Project, ProjectRules, Submission } from '../types'

type SubmissionTuple = readonly [
  auditor: Address,
  projectId: bigint,
  commitHash: `0x${string}`,
  cipherURI: string,
  salt: `0x${string}`,
  commitTimestamp: bigint,
  revealTimestamp: bigint,
  status: number,
  drainAmountWei: bigint,
  severity: number,
  payoutAmount: bigint,
  disputeDeadline: bigint,
  challenged: boolean,
  challenger: Address,
  challengeBond: bigint,
]

type RulesTuple = readonly [
  maxAttackerSeedWei: bigint,
  maxWarpSeconds: bigint,
  allowImpersonation: boolean,
  thresholds: ProjectRules['thresholds'],
]

const {
  mockReadContractWithRpcFallback,
  mockMulticallWithRpcFallback,
  mockGetLogsWithRangeFallback,
  mockReadSubmissionCommitTxHash,
  publicClientMock,
} = vi.hoisted(() => ({
  mockReadContractWithRpcFallback: vi.fn(),
  mockMulticallWithRpcFallback: vi.fn(),
  mockGetLogsWithRangeFallback: vi.fn(),
  mockReadSubmissionCommitTxHash: vi.fn(),
  publicClientMock: {
    waitForTransactionReceipt: vi.fn(),
  },
}))

vi.mock('../hooks/useWallet', () => ({
  useWallet: vi.fn(),
}))

vi.mock('../lib/publicClient', () => ({
  multicallWithRpcFallback: mockMulticallWithRpcFallback,
  publicClient: publicClientMock,
  readContractWithRpcFallback: mockReadContractWithRpcFallback,
}))

vi.mock('../lib/chainLogs', () => ({
  discoverDeploymentBlockWithFallback: vi.fn().mockResolvedValue(0n),
  getLogsWithRangeFallback: mockGetLogsWithRangeFallback,
}))

vi.mock('../lib/projectReads', () => ({
  readProjectById: vi.fn(),
}))

vi.mock('../lib/oasisUpload', () => ({
  readStoredPoCPreview: vi.fn(),
  resolveSapphireTxHash: vi.fn(),
}))

vi.mock('../lib/submissionArtifacts', () => ({
  readSubmissionCommitTxHash: mockReadSubmissionCommitTxHash,
}))

const MOCK_ADDRESS = '0x1234567890123456789012345678901234567890' as Address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
const ZERO_HASH = `0x${'0'.repeat(64)}` as `0x${string}`

const mockProject: Project = {
  id: 1n,
  owner: MOCK_ADDRESS,
  bountyPool: 1_000n,
  maxPayoutPerBug: 100n,
  targetContract: MOCK_ADDRESS,
  forkBlock: 12_345n,
  active: true,
  mode: 1,
  commitDeadline: 20_000_000_000n,
  revealDeadline: 20_000_100_000n,
  disputeWindow: 100n,
  rulesHash: ZERO_HASH,
  vnetStatus: 0,
  vnetRpcUrl: '',
  baseSnapshotId: ZERO_HASH,
  vnetCreatedAt: 0n,
  repoUrl: '',
}

const mockRules: ProjectRules = {
  maxAttackerSeedWei: 100n,
  maxWarpSeconds: 3_600n,
  allowImpersonation: false,
  thresholds: {
    criticalDrainWei: 400n,
    highDrainWei: 300n,
    mediumDrainWei: 200n,
    lowDrainWei: 100n,
  },
}

const mockRulesTuple: RulesTuple = [
  mockRules.maxAttackerSeedWei,
  mockRules.maxWarpSeconds,
  mockRules.allowImpersonation,
  mockRules.thresholds,
]

const mockSubmission: Submission = {
  id: 1001n,
  auditor: MOCK_ADDRESS,
  projectId: mockProject.id,
  commitHash: ZERO_HASH,
  cipherURI: 'oasis://preview/fallback',
  salt: ZERO_HASH,
  commitTimestamp: 1_700_000_000n,
  revealTimestamp: 1_700_000_100n,
  status: 2,
  drainAmountWei: 100n,
  severity: 3,
  payoutAmount: 0n,
  disputeDeadline: 1_700_000_200n,
  challenged: false,
  challenger: ZERO_ADDRESS,
  challengeBond: 0n,
}

const mockSubmissionTuple: SubmissionTuple = [
  mockSubmission.auditor,
  mockSubmission.projectId,
  mockSubmission.commitHash,
  mockSubmission.cipherURI,
  mockSubmission.salt,
  mockSubmission.commitTimestamp,
  mockSubmission.revealTimestamp,
  mockSubmission.status,
  mockSubmission.drainAmountWei,
  mockSubmission.severity,
  mockSubmission.payoutAmount,
  mockSubmission.disputeDeadline,
  mockSubmission.challenged,
  mockSubmission.challenger,
  mockSubmission.challengeBond,
]

function getFunctionName(parameters: unknown): string | null {
  if (typeof parameters !== 'object' || parameters === null || !('functionName' in parameters)) {
    return null
  }

  const value = parameters.functionName
  return typeof value === 'string' ? value : null
}

function renderProjectDetailRoute() {
  render(
    <MemoryRouter initialEntries={['/project/1']}>
      <Routes>
        <Route path="/project/:id" element={<ProjectDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

function renderSubmissionDetailRoute() {
  render(
    <MemoryRouter initialEntries={['/submission/1001']}>
      <Routes>
        <Route path="/submission/:id" element={<SubmissionDetail />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Submission views omit optional grouping and jury metadata when chain data lacks it', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    const mockWalletState: ReturnType<typeof useWallet> = {
      address: MOCK_ADDRESS,
      chainId: 11155111,
      chainName: 'Sepolia',
      connect: vi.fn(async () => {}),
      disconnect: vi.fn(),
      isConnected: true,
      isConnecting: false,
      isWrongNetwork: false,
      publicClient: undefined,
      switchToCorrectNetwork: vi.fn(async () => {}),
      walletClient: undefined,
    }

    vi.mocked(useWallet).mockReturnValue(mockWalletState)
    vi.mocked(readProjectById).mockResolvedValue(mockProject)
    vi.mocked(resolveSapphireTxHash).mockResolvedValue(undefined)

    mockGetLogsWithRangeFallback.mockResolvedValue([])
    mockMulticallWithRpcFallback.mockResolvedValue([mockSubmissionTuple])
    mockReadSubmissionCommitTxHash.mockResolvedValue(undefined)
    mockReadContractWithRpcFallback.mockImplementation(async (parameters: unknown) => {
      const functionName = getFunctionName(parameters)

      if (functionName === 'getAuditorSubmissionIds' || functionName === 'getProjectSubmissionIds') {
        return [[mockSubmission.id], 0n]
      }

      if (functionName === 'projectRules') {
        return mockRulesTuple
      }

      if (functionName === 'submissions') {
        return mockSubmissionTuple
      }

      throw new Error(`Unexpected readContract call: ${String(functionName)}`)
    })
  })

  it('Dashboard renders recent submissions without grouping or jury badges', async () => {
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: '#1001' })).toBeVisible()
    expect(screen.queryByText('[HIGH-1/3]')).not.toBeInTheDocument()
    expect(screen.queryByText(/⚖️/)).not.toBeInTheDocument()
  })

  it('ProjectDetail renders submissions without grouping or jury badges', async () => {
    renderProjectDetailRoute()

    expect(await screen.findByText('#1001')).toBeInTheDocument()
    expect(screen.queryByText('[HIGH-1/3]')).not.toBeInTheDocument()
    expect(screen.queryByText(/⚖️/)).not.toBeInTheDocument()
  })

  it('SubmissionDetail omits grouping and jury sections when metadata is unavailable', async () => {
    renderSubmissionDetailRoute()

    expect(await screen.findByText('SUBMISSION_#1001')).toBeInTheDocument()
    expect(screen.queryByText('GROUPING_METADATA')).not.toBeInTheDocument()
    expect(screen.queryByText('JURY_OUTPUT')).not.toBeInTheDocument()
  })
})
