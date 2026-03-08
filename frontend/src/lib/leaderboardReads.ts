import type { Address } from 'viem'

import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import {
  buildIndexFallbackError,
  readLeaderboardAuditorsByScan,
  rethrowIndexError,
  shouldAttemptIndexFallback,
} from './contractIndexFallback'
import { readContractWithRpcFallback } from './publicClient'

const LEADERBOARD_PAGE_SIZE = 100n

type LeaderboardAuditorPage = readonly [auditors: Address[], nextCursor: bigint]

export type AuditorStatsTuple = readonly [
  totalSubmissions: bigint,
  activeValidCount: bigint,
  pendingCount: bigint,
  paidCount: bigint,
  highPaidCount: bigint,
  criticalPaidCount: bigint,
  totalEarnedWei: bigint,
  leaderboardIndex: bigint,
]

export async function readAllLeaderboardAuditors(): Promise<Address[]> {
  try {
    const auditors: Address[] = []
    let cursor = 0n

    while (true) {
      const [pageAuditors, nextCursor] = await readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'getLeaderboardAuditors',
        args: [cursor, LEADERBOARD_PAGE_SIZE],
      }) as LeaderboardAuditorPage

      auditors.push(...pageAuditors)

      if (nextCursor === 0n) {
        return auditors
      }

      cursor = nextCursor
    }
  } catch (indexError) {
    if (!shouldAttemptIndexFallback(indexError)) {
      rethrowIndexError(indexError)
    }

    console.warn('Leaderboard index unavailable, falling back to submission scan:', indexError)

    try {
      return await readLeaderboardAuditorsByScan()
    } catch (fallbackError) {
      throw buildIndexFallbackError('LEADERBOARD_INDEX_READ_FAILED', indexError, fallbackError)
    }
  }
}
