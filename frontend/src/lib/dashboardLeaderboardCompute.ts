import type { Address } from 'viem'
import type { LeaderboardEntry, Submission } from '../types'

export interface DashboardMetrics {
  totalEarned: bigint
  totalCount: number
  validCount: number
  pendingCount: number
  pendingPayouts: Submission[]
}

export interface PayoutLogLike {
  auditor: Address
  amount: bigint
  submissionId: bigint
}

type AuditorAggregate = {
  validCount: number
  totalEarned: bigint
  highCount: number
  criticalCount: number
  firstSeenIndex: number
}

type RankedEntry = LeaderboardEntry & { firstSeenIndex: number }

export function deriveDashboardMetrics(
  submissions: Submission[],
  finalizedStatus = 4,
  verifiedStatus = 2
): DashboardMetrics {
  let totalEarned = 0n
  let validCount = 0
  let pendingCount = 0
  const pendingPayouts: Submission[] = []

  for (const submission of submissions) {
    if (submission.status === finalizedStatus) {
      totalEarned += submission.payoutAmount
    }

    if (
      submission.severity > 0 &&
      submission.status >= verifiedStatus &&
      submission.status <= finalizedStatus
    ) {
      validCount += 1
    }

    if (submission.status === verifiedStatus) {
      pendingCount += 1
      if (submission.payoutAmount > 0n) {
        pendingPayouts.push(submission)
      }
    }
  }

  return {
    totalEarned,
    totalCount: submissions.length,
    validCount,
    pendingCount,
    pendingPayouts
  }
}

export function aggregateLeaderboardEntries(
  payoutLogs: ReadonlyArray<PayoutLogLike>,
  severityBySubmissionId: ReadonlyMap<bigint, number>,
  highSeverity = 3,
  criticalSeverity = 4
): LeaderboardEntry[] {
  const auditorStats = new Map<Address, AuditorAggregate>()
  let nextSeenIndex = 0

  for (const payout of payoutLogs) {
    const severity = severityBySubmissionId.get(payout.submissionId) ?? 0
    const current = auditorStats.get(payout.auditor)

    if (!current) {
      auditorStats.set(payout.auditor, {
        validCount: 1,
        totalEarned: payout.amount,
        highCount: severity === highSeverity ? 1 : 0,
        criticalCount: severity === criticalSeverity ? 1 : 0,
        firstSeenIndex: nextSeenIndex
      })
      nextSeenIndex += 1
      continue
    }

    auditorStats.set(payout.auditor, {
      validCount: current.validCount + 1,
      totalEarned: current.totalEarned + payout.amount,
      highCount: current.highCount + (severity === highSeverity ? 1 : 0),
      criticalCount: current.criticalCount + (severity === criticalSeverity ? 1 : 0),
      firstSeenIndex: current.firstSeenIndex
    })
  }

  const ranked: RankedEntry[] = Array.from(auditorStats.entries())
    .map(([address, stats]) => ({
      address,
      rank: 0,
      validCount: stats.validCount,
      totalEarned: stats.totalEarned,
      highCount: stats.highCount,
      criticalCount: stats.criticalCount,
      firstSeenIndex: stats.firstSeenIndex
    }))
    .sort((a, b) => {
      if (b.totalEarned > a.totalEarned) return 1
      if (b.totalEarned < a.totalEarned) return -1
      return a.firstSeenIndex - b.firstSeenIndex
    })

  return ranked.map((entry, index) => ({
    rank: index + 1,
    address: entry.address,
    validCount: entry.validCount,
    totalEarned: entry.totalEarned,
    highCount: entry.highCount,
    criticalCount: entry.criticalCount
  }))
}
