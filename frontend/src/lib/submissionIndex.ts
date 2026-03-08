import type { Address } from 'viem'

import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import {
  buildIndexFallbackError,
  readAuditorSubmissionIdsByScan,
  readProjectSubmissionIdsByScan,
  rethrowIndexError,
  shouldAttemptIndexFallback,
} from './contractIndexFallback'
import { readContractWithRpcFallback } from './publicClient'

const SUBMISSION_PAGE_SIZE = 100n

type SubmissionIdPage = readonly [ids: bigint[], nextCursor: bigint]

async function readAllSubmissionIds(
  fetchIndexedIds: (cursor: bigint) => Promise<SubmissionIdPage>,
): Promise<bigint[]> {
  const collected: bigint[] = []
  let cursor = 0n

  while (true) {
    const [pageIds, nextCursor] = await fetchIndexedIds(cursor)
    collected.push(...pageIds)

    if (nextCursor === 0n) {
      return collected
    }

    cursor = nextCursor
  }
}

export async function readAllAuditorSubmissionIds(auditor: Address): Promise<bigint[]> {
  try {
    return await readAllSubmissionIds(async (cursor) => readContractWithRpcFallback({
      address: BOUNTY_HUB_ADDRESS,
      abi: BOUNTY_HUB_V2_ABI,
      functionName: 'getAuditorSubmissionIds',
      args: [auditor, cursor, SUBMISSION_PAGE_SIZE],
    }) as Promise<SubmissionIdPage>)
  } catch (indexError) {
    if (!shouldAttemptIndexFallback(indexError)) {
      rethrowIndexError(indexError)
    }

    console.warn('Auditor submission index unavailable, falling back to submission scan:', indexError)

    try {
      return await readAuditorSubmissionIdsByScan(auditor)
    } catch (fallbackError) {
      throw buildIndexFallbackError('AUDITOR_SUBMISSION_INDEX_READ_FAILED', indexError, fallbackError)
    }
  }
}

export async function readAllProjectSubmissionIds(projectId: bigint): Promise<bigint[]> {
  try {
    return await readAllSubmissionIds(async (cursor) => readContractWithRpcFallback({
      address: BOUNTY_HUB_ADDRESS,
      abi: BOUNTY_HUB_V2_ABI,
      functionName: 'getProjectSubmissionIds',
      args: [projectId, cursor, SUBMISSION_PAGE_SIZE],
    }) as Promise<SubmissionIdPage>)
  } catch (indexError) {
    if (!shouldAttemptIndexFallback(indexError)) {
      rethrowIndexError(indexError)
    }

    console.warn('Project submission index unavailable, falling back to submission scan:', indexError)

    try {
      return await readProjectSubmissionIdsByScan(projectId)
    } catch (fallbackError) {
      throw buildIndexFallbackError('PROJECT_SUBMISSION_INDEX_READ_FAILED', indexError, fallbackError)
    }
  }
}
