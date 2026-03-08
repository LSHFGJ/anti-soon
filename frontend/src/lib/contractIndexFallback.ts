import type { Address } from 'viem'
import { zeroAddress } from 'viem'

import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import { readContractWithRpcFallback } from './publicClient'

const PROJECT_SCAN_PAGE_SIZE = 100n
const SUBMISSION_SCAN_PAGE_SIZE = 50n

type SubmissionIdentityTuple = readonly [
  auditor: Address,
  projectId: bigint,
  ...rest: readonly unknown[],
]

type SubmissionIdentity = {
  id: bigint
  auditor: Address
  projectId: bigint
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function buildDescendingIds(startInclusive: bigint, endExclusive: bigint): bigint[] {
  const ids: bigint[] = []

  for (let id = endExclusive; id > startInclusive; id -= 1n) {
    ids.push(id - 1n)
  }

  return ids
}

function getPageStart(cursorExclusive: bigint, pageSize: bigint): bigint {
  return cursorExclusive > pageSize ? cursorExclusive - pageSize : 0n
}

async function readSubmissionIdentitiesByScan(): Promise<SubmissionIdentity[]> {
  const nextSubmissionId = await readContractWithRpcFallback({
    address: BOUNTY_HUB_ADDRESS,
    abi: BOUNTY_HUB_V2_ABI,
    functionName: 'nextSubmissionId',
  }) as bigint

  const collected: SubmissionIdentity[] = []

  for (let cursor = nextSubmissionId; cursor > 0n;) {
    const pageStart = getPageStart(cursor, SUBMISSION_SCAN_PAGE_SIZE)
    const pageIds = buildDescendingIds(pageStart, cursor)

    const pageSubmissions = await Promise.all(pageIds.map(async (submissionId) => {
      const submission = await readContractWithRpcFallback({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'submissions',
        args: [submissionId],
      }) as SubmissionIdentityTuple

      return {
        id: submissionId,
        auditor: submission[0],
        projectId: submission[1],
      }
    }))

    collected.push(...pageSubmissions)
    cursor = pageStart
  }

  return collected
}

export function buildIndexFallbackError(
  label: string,
  indexError: unknown,
  fallbackError: unknown,
): Error {
  return new Error(
    `${label}: ${getErrorMessage(indexError)} | FALLBACK_FAILED: ${getErrorMessage(fallbackError)}`,
  )
}

export function shouldAttemptIndexFallback(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  const hasContractFailure =
    message.includes('the contract function')
    || message.includes('contract call:')
    || message.includes(' reverted')

  const hasTransportFailure =
    message.includes('all_rpc_reads_failed')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('networkerror')
    || message.includes('network error')
    || message.includes('failed to fetch')
    || message.includes('http request failed')
    || message.includes('socket hang up')

  if (hasContractFailure) {
    return true
  }

  if (hasTransportFailure) {
    return false
  }

  return true
}

export function rethrowIndexError(error: unknown): never {
  throw toError(error)
}

export async function readProjectIdsByScan(): Promise<bigint[]> {
  const nextProjectId = await readContractWithRpcFallback({
    address: BOUNTY_HUB_ADDRESS,
    abi: BOUNTY_HUB_V2_ABI,
    functionName: 'nextProjectId',
  }) as bigint

  const collected: bigint[] = []

  for (let cursor = nextProjectId; cursor > 0n;) {
    const pageStart = getPageStart(cursor, PROJECT_SCAN_PAGE_SIZE)
    collected.push(...buildDescendingIds(pageStart, cursor))
    cursor = pageStart
  }

  return collected
}

export async function readAuditorSubmissionIdsByScan(auditor: Address): Promise<bigint[]> {
  const normalizedAuditor = auditor.toLowerCase()
  const submissions = await readSubmissionIdentitiesByScan()

  return submissions
    .filter((submission) => submission.auditor.toLowerCase() === normalizedAuditor)
    .map((submission) => submission.id)
}

export async function readProjectSubmissionIdsByScan(projectId: bigint): Promise<bigint[]> {
  const submissions = await readSubmissionIdentitiesByScan()

  return submissions
    .filter((submission) => submission.projectId === projectId)
    .map((submission) => submission.id)
}

export async function readLeaderboardAuditorsByScan(): Promise<Address[]> {
  const seenAuditors = new Set<string>()
  const auditors: Address[] = []
  const submissions = await readSubmissionIdentitiesByScan()

  for (const submission of submissions) {
    if (submission.auditor === zeroAddress) {
      continue
    }

    const normalizedAuditor = submission.auditor.toLowerCase()
    if (seenAuditors.has(normalizedAuditor)) {
      continue
    }

    seenAuditors.add(normalizedAuditor)
    auditors.push(submission.auditor)
  }

  return auditors
}
