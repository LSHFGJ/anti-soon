import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import {
  buildIndexFallbackError,
  readProjectIdsByScan,
  rethrowIndexError,
  shouldAttemptIndexFallback,
} from './contractIndexFallback'
import { readContractWithRpcFallback } from './publicClient'

const PROJECT_PAGE_SIZE = 100n

type ProjectIdPage = readonly [ids: bigint[], nextCursor: bigint]

export async function readAllProjectIds(): Promise<bigint[]> {
  try {
    const collected: bigint[] = []
    let cursor = 0n

    while (true) {
      const [pageIds, nextCursor] = await readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'getProjectIds',
        args: [cursor, PROJECT_PAGE_SIZE],
      }) as ProjectIdPage

      collected.push(...pageIds)

      if (nextCursor === 0n) {
        return collected
      }

      cursor = nextCursor
    }
  } catch (indexError) {
    if (!shouldAttemptIndexFallback(indexError)) {
      rethrowIndexError(indexError)
    }

    console.warn('Project index unavailable, falling back to nextProjectId scan:', indexError)

    try {
      return await readProjectIdsByScan()
    } catch (fallbackError) {
      throw buildIndexFallbackError('PROJECT_INDEX_READ_FAILED', indexError, fallbackError)
    }
  }
}
