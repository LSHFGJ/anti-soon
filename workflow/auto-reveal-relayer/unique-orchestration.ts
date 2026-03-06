import {
  advanceDurableAutoRevealCursor,
  listDurablePendingAutoRevealCommittedCandidates,
  removeDurablePendingAutoRevealCommittedCandidate,
  type AutoRevealCursorStore,
  type AutoRevealPendingCommittedCandidate,
  upsertDurablePendingAutoRevealCommittedCandidate,
} from "./cursor-store"
import { deriveAutoRevealCommittedCandidateIdempotencyKey } from "./idempotency"
import type { RunOnceConfig, RunOncePlan } from "./run-once"

export type UniqueCommittedLog = {
  submissionId: bigint
  projectId: bigint
  auditor: `0x${string}`
  commitHash: `0x${string}`
  blockNumber: bigint
  transactionHash: `0x${string}`
  logIndex: bigint
}

export type UniqueSubmissionSnapshot = {
  submissionId: bigint
  projectId: bigint
  status: "Committed" | "Revealed" | "Verified" | "Invalid" | "Finalized"
}

export type UniqueProjectSnapshot = {
  projectId: bigint
  mode: "UNIQUE" | "MULTI"
}

export type UniqueRevealStateSnapshot = {
  hasCandidate: boolean
  candidateSubmissionId: bigint
  winnerLocked: boolean
  winnerSubmissionId: bigint
}

export type UniqueCandidateSkipReason =
  | "NOT_UNIQUE"
  | "CANDIDATE_PENDING"
  | "EARLIER_COMMIT_PENDING"
  | "WINNER_LOCKED"
  | "POC_REVEALED_HANDOFF"
  | "SUBMISSION_NOT_COMMITTED"

export type UniqueCandidateSkipRecord = {
  submissionId: bigint
  reason: UniqueCandidateSkipReason
  terminal: boolean
}

export type UniqueCandidateScannerResult = {
  scannedLogCount: number
  selectedCandidateSubmissionIds: bigint[]
  skipped: UniqueCandidateSkipRecord[]
  pendingCommittedCandidates: AutoRevealPendingCommittedCandidate[]
  cursorAdvancedToBlock: bigint
}

export type UniqueCandidateRuntime = {
  getCommittedLogs: (args: {
    fromBlock: bigint
    toBlock: bigint
  }) => Promise<UniqueCommittedLog[]> | UniqueCommittedLog[]
  readSubmission: (
    submissionId: bigint,
  ) => Promise<UniqueSubmissionSnapshot> | UniqueSubmissionSnapshot
  readProject: (projectId: bigint) => Promise<UniqueProjectSnapshot> | UniqueProjectSnapshot
  readUniqueRevealState: (
    projectId: bigint,
  ) => Promise<UniqueRevealStateSnapshot> | UniqueRevealStateSnapshot
}

function buildLogScanRanges(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: number,
): Array<{ fromBlock: bigint; toBlock: bigint }> {
  const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = []
  const step = BigInt(chunkSize)
  let cursor = fromBlock

  while (cursor <= toBlock) {
    const rangeEnd = cursor + step - 1n <= toBlock ? cursor + step - 1n : toBlock
    ranges.push({ fromBlock: cursor, toBlock: rangeEnd })
    cursor = rangeEnd + 1n
  }

  return ranges
}

function sortLogs(logs: UniqueCommittedLog[]): UniqueCommittedLog[] {
  return [...logs].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) {
      return left.blockNumber < right.blockNumber ? -1 : 1
    }
    if (left.logIndex !== right.logIndex) {
      return left.logIndex < right.logIndex ? -1 : 1
    }
    return left.transactionHash.localeCompare(right.transactionHash)
  })
}

export async function runUniqueCommittedCandidateScanner(args: {
  config: RunOnceConfig
  plan: RunOncePlan
  store: AutoRevealCursorStore
  runtime: UniqueCandidateRuntime
  nowMs?: number
}): Promise<UniqueCandidateScannerResult> {
  const nowMs = args.nowMs ?? Date.now()
  const scannedLogs: UniqueCommittedLog[] = []

  for (const range of buildLogScanRanges(
    args.plan.fromBlock,
    args.plan.toBlock,
    args.plan.logChunkBlocks,
  )) {
    const logs = await args.runtime.getCommittedLogs(range)
    for (const log of sortLogs(logs)) {
      if (log.blockNumber < args.plan.fromBlock || log.blockNumber > args.plan.toBlock) {
        continue
      }

      const idempotencyKey = deriveAutoRevealCommittedCandidateIdempotencyKey({
        chainId: args.config.chainId,
        bountyHubAddress: args.config.bountyHubAddress,
        commitTxHash: log.transactionHash,
        commitLogIndex: log.logIndex,
        commitBlockNumber: log.blockNumber,
        projectId: log.projectId,
        submissionId: log.submissionId,
      })

      upsertDurablePendingAutoRevealCommittedCandidate(
        args.store,
        {
          idempotencyKey,
          submissionId: log.submissionId,
          projectId: log.projectId,
          commitBlockNumber: log.blockNumber,
          commitTxHash: log.transactionHash,
          commitLogIndex: log.logIndex,
        },
        nowMs,
      )
      scannedLogs.push(log)
    }
  }

  const skipped: UniqueCandidateSkipRecord[] = []
  const selectedCandidateSubmissionIds: bigint[] = []
  const selectedProjectIds = new Set<string>()

  for (const item of listDurablePendingAutoRevealCommittedCandidates(args.store)) {
    const submission = await args.runtime.readSubmission(item.submissionId)
    const project = await args.runtime.readProject(submission.projectId)
    const uniqueState = await args.runtime.readUniqueRevealState(submission.projectId)

    if (project.mode !== "UNIQUE") {
      skipped.push({
        submissionId: item.submissionId,
        reason: "NOT_UNIQUE",
        terminal: true,
      })
      removeDurablePendingAutoRevealCommittedCandidate(args.store, item.idempotencyKey)
      continue
    }

    if (uniqueState.winnerLocked) {
      skipped.push({
        submissionId: item.submissionId,
        reason: "WINNER_LOCKED",
        terminal: true,
      })
      removeDurablePendingAutoRevealCommittedCandidate(args.store, item.idempotencyKey)
      continue
    }

    if (submission.status === "Revealed") {
      skipped.push({
        submissionId: item.submissionId,
        reason: "POC_REVEALED_HANDOFF",
        terminal: true,
      })
      removeDurablePendingAutoRevealCommittedCandidate(args.store, item.idempotencyKey)
      continue
    }

    if (submission.status !== "Committed") {
      skipped.push({
        submissionId: item.submissionId,
        reason: "SUBMISSION_NOT_COMMITTED",
        terminal: true,
      })
      removeDurablePendingAutoRevealCommittedCandidate(args.store, item.idempotencyKey)
      continue
    }

    if (uniqueState.hasCandidate) {
      skipped.push({
        submissionId: item.submissionId,
        reason: "CANDIDATE_PENDING",
        terminal: false,
      })
      continue
    }

    const projectKey = submission.projectId.toString()
    if (selectedProjectIds.has(projectKey)) {
      skipped.push({
        submissionId: item.submissionId,
        reason: "EARLIER_COMMIT_PENDING",
        terminal: false,
      })
      continue
    }

    selectedProjectIds.add(projectKey)
    selectedCandidateSubmissionIds.push(item.submissionId)
  }

  const cursorAdvancedToBlock = advanceDurableAutoRevealCursor(
    args.store,
    args.plan.toBlock,
    nowMs,
  )

  return {
    scannedLogCount: scannedLogs.length,
    selectedCandidateSubmissionIds,
    skipped,
    pendingCommittedCandidates: listDurablePendingAutoRevealCommittedCandidates(
      args.store,
    ),
    cursorAdvancedToBlock,
  }
}
