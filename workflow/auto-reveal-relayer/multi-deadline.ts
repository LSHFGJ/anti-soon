import {
  advanceDurableAutoRevealCursor,
  claimDurableAutoRevealQueueItem,
  hasDurableCompletedAutoRevealSubmission,
  listDurablePendingAutoRevealQueueItems,
  markDurableAutoRevealQueueItemCompleted,
  markDurableAutoRevealQueueItemQuarantined,
  removeDurablePendingAutoRevealQueueItem,
  upsertDurablePendingAutoRevealQueueItem,
} from "./cursor-store"
import { deriveAutoRevealQueueItemIdempotencyKey } from "./idempotency"
import {
  runAutoRevealWithRetry,
  type AutoRevealFailureMetricEvent,
  type AutoRevealRetryPolicy,
} from "./retry-policy"
import type {
  AutoRevealCursorStore,
  AutoRevealPendingQueueItem,
} from "./cursor-store"
import type { RunOnceConfig, RunOncePlan } from "./run-once"

export type MultiQueuedRevealLog = {
  submissionId: bigint
  blockNumber: bigint
  transactionHash: `0x${string}`
  logIndex: bigint
}

export type MultiSubmissionSnapshot = {
  submissionId: bigint
  projectId: bigint
  status: "Committed" | "Revealed" | "Verified" | "Invalid"
}

export type MultiProjectSnapshot = {
  projectId: bigint
  mode: "UNIQUE" | "MULTI"
  commitDeadline: bigint
  revealDeadline: bigint
}

export type MultiQueuedRevealSnapshot = {
  submissionId: bigint
  auditor: `0x${string}`
  salt: `0x${string}`
  deadline: bigint
  queued: boolean
}

export type MultiDeadlineSkipReason =
  | "NOT_MULTI"
  | "COMMIT_DEADLINE_NOT_REACHED"
  | "REVEAL_DEADLINE_PASSED"
  | "SIGNATURE_EXPIRED"
  | "QUEUE_MISSING"
  | "SUBMISSION_NOT_COMMITTED"
  | "ALREADY_COMPLETED"
  | "IN_FLIGHT"
  | "QUARANTINED"
  | "BATCH_LIMIT_REACHED"

export type MultiDeadlineSkipRecord = {
  submissionId: bigint
  reason: MultiDeadlineSkipReason
  terminal: boolean
}

export type MultiDeadlineScannerResult = {
  scannedLogCount: number
  executedCount: number
  executedSubmissionIds: bigint[]
  skipped: MultiDeadlineSkipRecord[]
  pendingQueueItems: AutoRevealPendingQueueItem[]
  failureMetrics: AutoRevealFailureMetricEvent[]
  cursorAdvancedToBlock: bigint
}

export type MultiDeadlineRuntime = {
  getNowTimestampSec: () => Promise<bigint> | bigint
  getQueuedRevealLogs: (args: {
    fromBlock: bigint
    toBlock: bigint
  }) => Promise<MultiQueuedRevealLog[]> | MultiQueuedRevealLog[]
  readSubmission: (
    submissionId: bigint,
  ) => Promise<MultiSubmissionSnapshot> | MultiSubmissionSnapshot
  readProject: (projectId: bigint) => Promise<MultiProjectSnapshot> | MultiProjectSnapshot
  readQueuedReveal: (
    submissionId: bigint,
  ) => Promise<MultiQueuedRevealSnapshot> | MultiQueuedRevealSnapshot
  executeQueuedReveal: (
    submissionId: bigint,
  ) => Promise<{ txHash: `0x${string}` }> | { txHash: `0x${string}` }
}

function sortLogs(logs: MultiQueuedRevealLog[]): MultiQueuedRevealLog[] {
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

function claimReasonToSkipReason(
  reason: "in_flight" | "already_completed" | "quarantined",
): MultiDeadlineSkipReason {
  if (reason === "in_flight") {
    return "IN_FLIGHT"
  }
  if (reason === "quarantined") {
    return "QUARANTINED"
  }
  return "ALREADY_COMPLETED"
}

type EvaluateArgs = {
  currentTimestampSec: bigint
  submission: MultiSubmissionSnapshot
  project: MultiProjectSnapshot
  queuedReveal: MultiQueuedRevealSnapshot
}

function evaluatePendingQueueItem(args: EvaluateArgs): {
  eligible: boolean
  reason?: MultiDeadlineSkipReason
  terminal?: boolean
} {
  if (args.submission.status !== "Committed") {
    return { eligible: false, reason: "SUBMISSION_NOT_COMMITTED", terminal: true }
  }
  if (args.project.mode !== "MULTI") {
    return { eligible: false, reason: "NOT_MULTI", terminal: true }
  }
  if (args.project.commitDeadline === 0n || args.currentTimestampSec <= args.project.commitDeadline) {
    return { eligible: false, reason: "COMMIT_DEADLINE_NOT_REACHED", terminal: false }
  }
  if (!args.queuedReveal.queued) {
    return { eligible: false, reason: "QUEUE_MISSING", terminal: true }
  }
  if (args.currentTimestampSec > args.queuedReveal.deadline) {
    return { eligible: false, reason: "SIGNATURE_EXPIRED", terminal: true }
  }
  if (
    args.project.revealDeadline > 0n
    && args.currentTimestampSec > args.project.revealDeadline
  ) {
    return { eligible: false, reason: "REVEAL_DEADLINE_PASSED", terminal: true }
  }

  return { eligible: true }
}

export async function runMultiDeadlineScanner(args: {
  config: RunOnceConfig
  plan: RunOncePlan
  store: AutoRevealCursorStore
  runtime: MultiDeadlineRuntime
  nowMs?: number
  retryPolicy?: AutoRevealRetryPolicy
  sleep?: (ms: number) => Promise<void> | void
  recordMetric?: (event: AutoRevealFailureMetricEvent) => void
}): Promise<MultiDeadlineScannerResult> {
  const nowMs = args.nowMs ?? Date.now()
  const currentTimestampSec = await args.runtime.getNowTimestampSec()
  const scannedLogs: MultiQueuedRevealLog[] = []

  for (const range of buildLogScanRanges(
    args.plan.fromBlock,
    args.plan.toBlock,
    args.plan.logChunkBlocks,
  )) {
    const logs = await args.runtime.getQueuedRevealLogs(range)
    for (const log of sortLogs(logs)) {
      if (log.blockNumber < args.plan.fromBlock || log.blockNumber > args.plan.toBlock) {
        continue
      }

      const submission = await args.runtime.readSubmission(log.submissionId)
      const idempotencyKey = deriveAutoRevealQueueItemIdempotencyKey({
        chainId: args.config.chainId,
        bountyHubAddress: args.config.bountyHubAddress,
        queueTxHash: log.transactionHash,
        queueLogIndex: log.logIndex,
        queuedBlockNumber: log.blockNumber,
        projectId: submission.projectId,
        submissionId: submission.submissionId,
      })

      upsertDurablePendingAutoRevealQueueItem(
        args.store,
        {
          idempotencyKey,
          submissionId: submission.submissionId,
          projectId: submission.projectId,
          queuedBlockNumber: log.blockNumber,
          queueTxHash: log.transactionHash,
          queueLogIndex: log.logIndex,
        },
        nowMs,
      )
      scannedLogs.push(log)
    }
  }

  const skipped: MultiDeadlineSkipRecord[] = []
  const executedSubmissionIds: bigint[] = []
  const failureMetrics: AutoRevealFailureMetricEvent[] = []
  let executedCount = 0

  for (const item of listDurablePendingAutoRevealQueueItems(args.store)) {
    if (executedCount >= args.config.maxExecutionBatchSize) {
      skipped.push({
        submissionId: item.submissionId,
        reason: "BATCH_LIMIT_REACHED",
        terminal: false,
      })
      continue
    }

    const submission = await args.runtime.readSubmission(item.submissionId)
    const project = await args.runtime.readProject(submission.projectId)
    const queuedReveal = await args.runtime.readQueuedReveal(item.submissionId)
    const evaluation = evaluatePendingQueueItem({
      currentTimestampSec,
      submission,
      project,
      queuedReveal,
    })

    if (
      hasDurableCompletedAutoRevealSubmission(
        args.store,
        submission.submissionId,
        submission.projectId,
      )
    ) {
      skipped.push({
        submissionId: item.submissionId,
        reason: "ALREADY_COMPLETED",
        terminal: true,
      })
      removeDurablePendingAutoRevealQueueItem(args.store, item.idempotencyKey)
      continue
    }

    if (!evaluation.eligible) {
      skipped.push({
        submissionId: item.submissionId,
        reason: evaluation.reason as MultiDeadlineSkipReason,
        terminal: evaluation.terminal === true,
      })
      if (evaluation.terminal) {
        removeDurablePendingAutoRevealQueueItem(args.store, item.idempotencyKey)
      }
      continue
    }

    const claim = claimDurableAutoRevealQueueItem(
      args.store,
      item.idempotencyKey,
      item.queuedBlockNumber,
      nowMs,
      {
        submissionId: submission.submissionId,
        projectId: submission.projectId,
      },
    )
    if (!claim.shouldProcess) {
      if (claim.reason === "first_seen") {
        throw new Error(
          `Invariant violation: claim returned first_seen while shouldProcess=false for submissionId=${item.submissionId.toString()}`,
        )
      }

      const reason = claimReasonToSkipReason(claim.reason)
      skipped.push({
        submissionId: item.submissionId,
        reason,
        terminal: reason === "ALREADY_COMPLETED" || reason === "QUARANTINED",
      })
      if (reason === "ALREADY_COMPLETED") {
        removeDurablePendingAutoRevealQueueItem(args.store, item.idempotencyKey)
      }
      continue
    }

    try {
      await runAutoRevealWithRetry({
        operation: "executeQueuedReveal",
        idempotencyKey: item.idempotencyKey,
        retryPolicy: args.retryPolicy,
        sleep: args.sleep,
        onMetric: (event) => {
          failureMetrics.push(event)
          args.recordMetric?.(event)
        },
        execute: async () => args.runtime.executeQueuedReveal(item.submissionId),
      })
      markDurableAutoRevealQueueItemCompleted(args.store, item.idempotencyKey, nowMs)
      removeDurablePendingAutoRevealQueueItem(args.store, item.idempotencyKey)
      executedSubmissionIds.push(item.submissionId)
      executedCount += 1
    } catch (error) {
      const refreshedSubmission = await Promise.resolve(
        args.runtime.readSubmission(item.submissionId),
      ).catch(() => null)
      const refreshedQueuedReveal = await Promise.resolve(
        args.runtime.readQueuedReveal(item.submissionId),
      ).catch(() => null)

      if (
        refreshedSubmission?.status !== undefined
        && refreshedSubmission.status !== "Committed"
      ) {
        markDurableAutoRevealQueueItemCompleted(args.store, item.idempotencyKey, nowMs)
        removeDurablePendingAutoRevealQueueItem(args.store, item.idempotencyKey)
        skipped.push({
          submissionId: item.submissionId,
          reason: "ALREADY_COMPLETED",
          terminal: true,
        })
        continue
      }

      if (refreshedQueuedReveal?.queued === false) {
        markDurableAutoRevealQueueItemCompleted(args.store, item.idempotencyKey, nowMs)
        removeDurablePendingAutoRevealQueueItem(args.store, item.idempotencyKey)
        skipped.push({
          submissionId: item.submissionId,
          reason: "ALREADY_COMPLETED",
          terminal: true,
        })
        continue
      }

      markDurableAutoRevealQueueItemQuarantined(args.store, item.idempotencyKey, nowMs)
      throw error
    }
  }

  const cursorAdvancedToBlock = advanceDurableAutoRevealCursor(
    args.store,
    args.plan.toBlock,
    nowMs,
  )

  return {
    scannedLogCount: scannedLogs.length,
    executedCount,
    executedSubmissionIds,
    skipped,
    pendingQueueItems: listDurablePendingAutoRevealQueueItems(args.store),
    failureMetrics,
    cursorAdvancedToBlock,
  }
}
