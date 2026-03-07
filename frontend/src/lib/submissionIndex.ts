import type { Address } from 'viem'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import { readContractWithRpcFallback } from './publicClient'

const SUBMISSION_PAGE_SIZE = 100n

type SubmissionIdPage = readonly [ids: bigint[], nextCursor: bigint]

async function readAllSubmissionIds(
  fetchPage: (cursor: bigint) => Promise<SubmissionIdPage>,
): Promise<bigint[]> {
  const collected: bigint[] = []
  let cursor = 0n

  while (true) {
    const [pageIds, nextCursor] = await fetchPage(cursor)
    collected.push(...pageIds)

    if (nextCursor === 0n) {
      return collected
    }

    cursor = nextCursor
  }
}

export function readAllAuditorSubmissionIds(auditor: Address): Promise<bigint[]> {
  return readAllSubmissionIds(async (cursor) => readContractWithRpcFallback({
    address: BOUNTY_HUB_ADDRESS,
    abi: BOUNTY_HUB_V2_ABI,
    functionName: 'getAuditorSubmissionIds',
    args: [auditor, cursor, SUBMISSION_PAGE_SIZE],
  }) as Promise<SubmissionIdPage>)
}

export function readAllProjectSubmissionIds(projectId: bigint): Promise<bigint[]> {
  return readAllSubmissionIds(async (cursor) => readContractWithRpcFallback({
    address: BOUNTY_HUB_ADDRESS,
    abi: BOUNTY_HUB_V2_ABI,
    functionName: 'getProjectSubmissionIds',
    args: [projectId, cursor, SUBMISSION_PAGE_SIZE],
  }) as Promise<SubmissionIdPage>)
}
