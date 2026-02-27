import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import type { RenderOptions } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { Address } from 'viem'
import type { Project, Submission, ProjectRules } from '../types'

export const ONE_ETH = 1000000000000000000n
export const HALF_ETH = 500000000000000000n
export const TEN_ETH = 10000000000000000000n
export const ONE_HUNDREDTH_ETH = 10000000000000000n
export const ONE_TENTH_ETH = 100000000000000000n
export const ONE_THOUSANDTH_ETH = 1000000000000000n
export const ONE_DAY_SECONDS = 86400n
export const ONE_HOUR_SECONDS = 3600n

export function createMockProject(overrides: Partial<Project> = {}): Project {
  const now = BigInt(Math.floor(Date.now() / 1000))
  return {
    id: 0n,
    owner: '0x1234567890123456789012345678901234567890' as Address,
    bountyPool: ONE_ETH,
    maxPayoutPerBug: HALF_ETH,
    targetContract: '0xabcdef1234567890123456789012345678901234' as Address,
    forkBlock: 21000000n,
    active: true,
    mode: 0,
    commitDeadline: now + ONE_DAY_SECONDS,
    revealDeadline: now + ONE_DAY_SECONDS * 2n,
    disputeWindow: ONE_DAY_SECONDS,
    rulesHash: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    vnetStatus: 2,
    vnetRpcUrl: '',
    baseSnapshotId: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    vnetCreatedAt: now,
    repoUrl: '',
    ...overrides
  }
}

export function createMockProjectRules(overrides: Partial<ProjectRules> = {}): ProjectRules {
  return {
    maxAttackerSeedWei: TEN_ETH,
    maxWarpSeconds: ONE_HOUR_SECONDS,
    allowImpersonation: true,
    thresholds: {
      criticalDrainWei: ONE_ETH,
      highDrainWei: ONE_TENTH_ETH,
      mediumDrainWei: ONE_HUNDREDTH_ETH,
      lowDrainWei: ONE_THOUSANDTH_ETH,
    },
    ...overrides
  }
}

export const SUBMISSION_STATUS_COMMITTED = 0
export const SUBMISSION_STATUS_REVEALED = 1
export const SUBMISSION_STATUS_VERIFIED = 2
export const SEVERITY_NONE = 0

export function createMockSubmission(overrides: Partial<Submission> = {}): Submission {
  const now = BigInt(Math.floor(Date.now() / 1000))
  return {
    id: 0n,
    auditor: '0x9876543210987654321098765432109876543210' as Address,
    projectId: 0n,
    commitHash: '0x1111111111111111111111111111111111111111111111111111111111111111' as `0x${string}`,
    cipherURI: 'oasis://test/mock-submission',
    salt: '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`,
    commitTimestamp: now - ONE_HOUR_SECONDS,
    revealTimestamp: 0n,
    status: SUBMISSION_STATUS_COMMITTED,
    drainAmountWei: 0n,
    severity: SEVERITY_NONE,
    payoutAmount: 0n,
    disputeDeadline: 0n,
    challenged: false,
    challenger: '0x0000000000000000000000000000000000000000' as Address,
    challengeBond: 0n,
    ...overrides
  }
}

export const MODE_UNIQUE = 0
export const MODE_MULTI = 1

export function createMockProjects(count: number): Project[] {
  return Array.from({ length: count }, (_, i) => 
    createMockProject({ 
      id: BigInt(i),
      mode: i % 2 === 0 ? MODE_UNIQUE : MODE_MULTI,
      active: i < count - 1
    })
  )
}

interface WrapperProps {
  children: React.ReactNode
}

function RouterWrapper({ children }: WrapperProps): ReactElement {
  return <BrowserRouter>{children}</BrowserRouter>
}

export function renderWithRouter(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: RouterWrapper, ...options })
}

export const mockPublicClient = {
  readContract: vi.fn(),
  getLogs: vi.fn(),
  getBlockNumber: vi.fn()
}

export function setupProjectMocks(projects: Project[], rules?: ProjectRules) {
  mockPublicClient.readContract.mockImplementation(async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
    if (functionName === 'nextProjectId') {
      return BigInt(projects.length)
    }
    if (functionName === 'projects') {
      const projectId = args[0] as bigint
      const project = projects[Number(projectId)]
      if (!project) throw new Error('Project not found')
      return [
        project.owner,
        project.bountyPool,
        project.maxPayoutPerBug,
        project.targetContract,
        project.forkBlock,
        project.active,
        project.mode,
        project.commitDeadline,
        project.revealDeadline,
        project.disputeWindow,
        project.rulesHash,
        project.vnetStatus,
        project.vnetRpcUrl,
        project.baseSnapshotId,
        project.vnetCreatedAt,
        project.repoUrl,
      ]
    }
    if (functionName === 'projectRules') {
      const r = rules || createMockProjectRules()
      return [
        r.maxAttackerSeedWei,
        r.maxWarpSeconds,
        r.allowImpersonation,
        r.thresholds
      ]
    }
    return undefined
  })
  
  mockPublicClient.getBlockNumber.mockResolvedValue(21000000n)
  mockPublicClient.getLogs.mockResolvedValue([])
  
  return mockPublicClient
}
