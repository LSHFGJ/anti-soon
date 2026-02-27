import { describe, expect, it } from 'vitest'
import type { Submission } from '../types'
import { aggregateLeaderboardEntries, deriveDashboardMetrics } from '../lib/dashboardLeaderboardCompute'

const zeroBytes32 = `0x${'00'.repeat(32)}` as const

function makeSubmission(overrides: Partial<Submission>): Submission {
  return {
    id: 1n,
    auditor: '0x0000000000000000000000000000000000000001',
    projectId: 1n,
    commitHash: zeroBytes32,
    cipherURI: 'oasis://mock/poc',
    salt: zeroBytes32,
    commitTimestamp: 1n,
    revealTimestamp: 0n,
    status: 0,
    drainAmountWei: 0n,
    severity: 0,
    payoutAmount: 0n,
    disputeDeadline: 0n,
    challenged: false,
    challenger: '0x0000000000000000000000000000000000000000',
    challengeBond: 0n,
    ...overrides
  }
}

describe('dashboard and leaderboard compute helpers', () => {
  it('derives dashboard totals and pending payouts in one pass', () => {
    const submissions: Submission[] = [
      makeSubmission({ id: 1n, status: 4, severity: 3, payoutAmount: 2n }),
      makeSubmission({ id: 2n, status: 2, severity: 2, payoutAmount: 3n }),
      makeSubmission({ id: 3n, status: 2, severity: 0, payoutAmount: 0n }),
      makeSubmission({ id: 4n, status: 1, severity: 4, payoutAmount: 5n }),
      makeSubmission({ id: 5n, status: 5, severity: 4, payoutAmount: 8n })
    ]

    const metrics = deriveDashboardMetrics(submissions)

    expect(metrics.totalEarned).toBe(2n)
    expect(metrics.totalCount).toBe(5)
    expect(metrics.validCount).toBe(2)
    expect(metrics.pendingCount).toBe(2)
    expect(metrics.pendingPayouts.map((s) => s.id)).toEqual([2n])
  })

  it('aggregates leaderboard entries with severity counts', () => {
    const logs = [
      {
        auditor: '0x0000000000000000000000000000000000000001',
        amount: 5n,
        submissionId: 11n
      },
      {
        auditor: '0x0000000000000000000000000000000000000002',
        amount: 3n,
        submissionId: 12n
      },
      {
        auditor: '0x0000000000000000000000000000000000000001',
        amount: 2n,
        submissionId: 13n
      }
    ] as const

    const severityBySubmissionId = new Map<bigint, number>([
      [11n, 4],
      [12n, 3],
      [13n, 3]
    ])

    const leaderboard = aggregateLeaderboardEntries(logs, severityBySubmissionId)

    expect(leaderboard).toHaveLength(2)
    expect(leaderboard[0]?.address).toBe('0x0000000000000000000000000000000000000001')
    expect(leaderboard[0]?.rank).toBe(1)
    expect(leaderboard[0]?.totalEarned).toBe(7n)
    expect(leaderboard[0]?.highCount).toBe(1)
    expect(leaderboard[0]?.criticalCount).toBe(1)

    expect(leaderboard[1]?.address).toBe('0x0000000000000000000000000000000000000002')
    expect(leaderboard[1]?.rank).toBe(2)
    expect(leaderboard[1]?.highCount).toBe(1)
    expect(leaderboard[1]?.criticalCount).toBe(0)
  })

  it('preserves deterministic first-seen order on equal total earned', () => {
    const logs = [
      {
        auditor: '0x000000000000000000000000000000000000000a',
        amount: 4n,
        submissionId: 21n
      },
      {
        auditor: '0x000000000000000000000000000000000000000b',
        amount: 4n,
        submissionId: 22n
      }
    ] as const

    const leaderboard = aggregateLeaderboardEntries(logs, new Map())

    expect(leaderboard.map((entry) => entry.address)).toEqual([
      '0x000000000000000000000000000000000000000a',
      '0x000000000000000000000000000000000000000b'
    ])
    expect(leaderboard.map((entry) => entry.rank)).toEqual([1, 2])
  })
})
