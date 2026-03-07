import type { Address } from 'viem'

export type SubmissionStatus = 'Committed' | 'Revealed' | 'Verified' | 'Disputed' | 'Finalized' | 'Invalid'
export const STATUS_LABELS: SubmissionStatus[] = ['Committed', 'Revealed', 'Verified', 'Disputed', 'Finalized', 'Invalid']

export type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export const SEVERITY_LABELS: Severity[] = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const SEVERITY_COLORS: Record<Severity, string> = {
  NONE: 'var(--color-text-dim)',
  LOW: 'var(--color-primary)',
  MEDIUM: 'var(--color-gold)',
  HIGH: 'var(--color-warning)',
  CRITICAL: 'var(--color-error)'
}

export type CompetitionMode = 'UNIQUE' | 'MULTI'

export interface Project {
  id: bigint
  owner: Address
  bountyPool: bigint
  maxPayoutPerBug: bigint
  targetContract: Address
  forkBlock: bigint
  active: boolean
  mode: number // 0 = UNIQUE, 1 = MULTI
  commitDeadline: bigint
  revealDeadline: bigint
  disputeWindow: bigint
  rulesHash: `0x${string}`
  vnetStatus: number
  vnetRpcUrl: string
  baseSnapshotId: `0x${string}`
  vnetCreatedAt: bigint
  repoUrl: string
}

export interface ContractScope {
  address: `0x${string}`;
  name: string;
  artifactRef: string;
  verified: boolean;
}

export interface ProjectV3 extends Project {
  scopes: ContractScope[];
}

export interface GitHubRepo {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export interface DeployScript {
  name: string;
  path: string;
  contracts: string[];
}

export interface ProjectRules {
  maxAttackerSeedWei: bigint
  maxWarpSeconds: bigint
  allowImpersonation: boolean
  thresholds: {
    criticalDrainWei: bigint
    highDrainWei: bigint
    mediumDrainWei: bigint
    lowDrainWei: bigint
  }
}

export interface Submission {
  id: bigint
  auditor: Address
  projectId: bigint
  commitHash: `0x${string}`
  cipherURI: string
  oasisTxHash?: `0x${string}`
  commitTxHash?: `0x${string}`
  salt: `0x${string}`
  commitTimestamp: bigint
  revealTimestamp: bigint
  status: number
  drainAmountWei: bigint
  severity: number
  payoutAmount: bigint
  disputeDeadline: bigint
  challenged: boolean
  challenger: Address
  challengeBond: bigint
}

export interface TimelineStep {
  label: string
  completed: boolean
  active: boolean
  timestamp?: bigint
}

export interface AuditorStats {
  totalEarned: bigint
  totalSubmitted: number
  validCount: number
  pendingCount: number
}

export interface LeaderboardEntry {
  rank: number
  address: Address
  validCount: number
  totalEarned: bigint
  highCount: number
  criticalCount: number
}

export interface SubmissionGrouping {
  cohort: string
  groupId: string
  groupRank: number
  groupSize: number
}

export interface SubmissionJury {
  action: string
  rationale?: string
}

export interface ExtendedSubmission extends Submission {
  grouping?: SubmissionGrouping
  jury?: SubmissionJury
}
