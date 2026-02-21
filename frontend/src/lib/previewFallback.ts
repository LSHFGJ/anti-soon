import type { Address } from 'viem'
import type { Project, ProjectRules, Submission } from '../types'

const ZERO_HASH = `0x${'0'.repeat(64)}` as `0x${string}`

const PREVIEW_OWNER = '0x1111111111111111111111111111111111111111' as Address
const PREVIEW_TARGET = '0x2222222222222222222222222222222222222222' as Address
const PREVIEW_AUDITOR = '0x3333333333333333333333333333333333333333' as Address

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

export function shouldUsePreviewFallback(
  flag = import.meta.env.VITE_PREVIEW_FALLBACK,
  mode = import.meta.env.MODE
): boolean {
  const normalizedFlag = flag?.toString().trim().toLowerCase()

  if (normalizedFlag === '1' || normalizedFlag === 'true') {
    return true
  }

  if (normalizedFlag === '0' || normalizedFlag === 'false') {
    return false
  }

  return mode === 'development' || mode === 'test'
}

export function formatPreviewFallbackMessage(message: string): string {
  return `${message}. Preview mode active: showing fallback demo data for UI testing.`
}

export function buildPreviewProject(projectId: bigint): Project {
  const now = nowSeconds()
  return {
    id: projectId,
    owner: PREVIEW_OWNER,
    bountyPool: 10_000_000_000_000_000_000n,
    maxPayoutPerBug: 1_000_000_000_000_000_000n,
    targetContract: PREVIEW_TARGET,
    forkBlock: 20_000_000n,
    active: true,
    mode: Number(projectId % 2n),
    commitDeadline: now + 86_400n,
    revealDeadline: now + 172_800n,
    disputeWindow: 43_200n,
    rulesHash: ZERO_HASH,
  }
}

export function buildPreviewProjectRules(): ProjectRules {
  return {
    maxAttackerSeedWei: 1_000_000_000_000_000_000n,
    maxWarpSeconds: 3_600n,
    allowImpersonation: true,
    thresholds: {
      criticalDrainWei: 1_000_000_000_000_000_000n,
      highDrainWei: 100_000_000_000_000_000n,
      mediumDrainWei: 10_000_000_000_000_000n,
      lowDrainWei: 1_000_000_000_000_000n,
    },
  }
}

export function buildPreviewSubmission(
  submissionId: bigint,
  projectId: bigint,
  auditor: Address = PREVIEW_AUDITOR,
  overrides: Partial<Submission> = {}
): Submission {
  const now = nowSeconds()
  return {
    id: submissionId,
    auditor,
    projectId,
    commitHash: ZERO_HASH,
    cipherURI: 'ipfs://preview-fallback',
    decryptionKey: ZERO_HASH,
    salt: ZERO_HASH,
    commitTimestamp: now - 3_600n,
    revealTimestamp: now - 1_800n,
    status: 2,
    drainAmountWei: 250_000_000_000_000_000n,
    severity: 3,
    payoutAmount: 500_000_000_000_000_000n,
    disputeDeadline: now + 7_200n,
    challenged: false,
    challenger: '0x0000000000000000000000000000000000000000' as Address,
    challengeBond: 0n,
    ...overrides,
  }
}
