import {
  claimAutoRevealIdempotencySlot,
  markAutoRevealQueueItemCompleted,
  markAutoRevealQueueItemQuarantined,
} from "./idempotency"
import type {
  AutoRevealIdempotencyDecision,
  AutoRevealIdempotencyStatus,
} from "./idempotency"

export type AutoRevealPendingQueueItem = {
  idempotencyKey: string
  submissionId: bigint
  projectId: bigint
  queuedBlockNumber: bigint
  queueTxHash: `0x${string}`
  queueLogIndex: bigint
  firstSeenAtMs: number
  lastEvaluatedAtMs: number
}

export type AutoRevealPendingCommittedCandidate = {
  idempotencyKey: string
  submissionId: bigint
  projectId: bigint
  commitBlockNumber: bigint
  commitTxHash: `0x${string}`
  commitLogIndex: bigint
  firstSeenAtMs: number
  lastEvaluatedAtMs: number
}

export type AutoRevealCursorStore = {
  filePath: string
  cursorLastFinalizedBlock: bigint
  cursorUpdatedAtMs: number
  queueItemStatusByIdempotencyKey: Map<string, AutoRevealIdempotencyStatus>
  queueItemBlockNumberByIdempotencyKey: Map<string, bigint>
  queueItemUpdatedAtMsByIdempotencyKey: Map<string, number>
  queueItemSubmissionIdByIdempotencyKey: Map<string, bigint>
  queueItemProjectIdByIdempotencyKey: Map<string, bigint>
  pendingQueueItemsByIdempotencyKey: Map<string, AutoRevealPendingQueueItem>
  pendingCommittedCandidatesByIdempotencyKey: Map<
    string,
    AutoRevealPendingCommittedCandidate
  >
  recoveredProcessingCount: number
  quarantinedItemCount: number
  persist?: (store: AutoRevealCursorStore) => void
}

function recomputeQuarantinedCount(store: AutoRevealCursorStore): void {
  let count = 0
  for (const status of store.queueItemStatusByIdempotencyKey.values()) {
    if (status === "quarantined") {
      count += 1
    }
  }
  store.quarantinedItemCount = count
}

function persistStore(store: AutoRevealCursorStore): void {
  store.persist?.(store)
}

export function createAutoRevealCursorStore(args: {
  filePath?: string
  persist?: (store: AutoRevealCursorStore) => void
} = {}): AutoRevealCursorStore {
  return {
    filePath: args.filePath ?? ":memory:",
    cursorLastFinalizedBlock: 0n,
    cursorUpdatedAtMs: 0,
    queueItemStatusByIdempotencyKey: new Map<string, AutoRevealIdempotencyStatus>(),
    queueItemBlockNumberByIdempotencyKey: new Map<string, bigint>(),
    queueItemUpdatedAtMsByIdempotencyKey: new Map<string, number>(),
    queueItemSubmissionIdByIdempotencyKey: new Map<string, bigint>(),
    queueItemProjectIdByIdempotencyKey: new Map<string, bigint>(),
    pendingQueueItemsByIdempotencyKey: new Map<string, AutoRevealPendingQueueItem>(),
    pendingCommittedCandidatesByIdempotencyKey: new Map<
      string,
      AutoRevealPendingCommittedCandidate
    >(),
    recoveredProcessingCount: 0,
    quarantinedItemCount: 0,
    persist: args.persist,
  }
}

export function createInMemoryAutoRevealCursorStore(): AutoRevealCursorStore {
  return createAutoRevealCursorStore({ filePath: ":memory:" })
}

export function claimDurableAutoRevealQueueItem(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
  blockNumber: bigint,
  nowMs: number = Date.now(),
  identity?: { submissionId: bigint; projectId: bigint },
): AutoRevealIdempotencyDecision {
  const decision = claimAutoRevealIdempotencySlot(
    store.queueItemStatusByIdempotencyKey,
    idempotencyKey,
  )

  if (decision.shouldProcess) {
    store.queueItemBlockNumberByIdempotencyKey.set(idempotencyKey, blockNumber)
    store.queueItemUpdatedAtMsByIdempotencyKey.set(idempotencyKey, nowMs)
    if (identity) {
      store.queueItemSubmissionIdByIdempotencyKey.set(
        idempotencyKey,
        identity.submissionId,
      )
      store.queueItemProjectIdByIdempotencyKey.set(
        idempotencyKey,
        identity.projectId,
      )
    }
    recomputeQuarantinedCount(store)
    persistStore(store)
  }

  return decision
}

export function upsertDurablePendingAutoRevealQueueItem(
  store: AutoRevealCursorStore,
  item: Omit<AutoRevealPendingQueueItem, "firstSeenAtMs" | "lastEvaluatedAtMs">,
  nowMs: number = Date.now(),
): AutoRevealPendingQueueItem {
  const existing = store.pendingQueueItemsByIdempotencyKey.get(item.idempotencyKey)
    ?? [...store.pendingQueueItemsByIdempotencyKey.values()].find(
      (candidate) =>
        candidate.submissionId === item.submissionId
        && candidate.projectId === item.projectId,
    )

  if (existing && existing.idempotencyKey !== item.idempotencyKey) {
    const nextItem: AutoRevealPendingQueueItem = {
      ...existing,
      lastEvaluatedAtMs: nowMs,
    }
    store.pendingQueueItemsByIdempotencyKey.set(existing.idempotencyKey, nextItem)
    persistStore(store)
    return nextItem
  }

  const nextItem: AutoRevealPendingQueueItem = {
    ...item,
    firstSeenAtMs: existing?.firstSeenAtMs ?? nowMs,
    lastEvaluatedAtMs: nowMs,
  }

  store.pendingQueueItemsByIdempotencyKey.set(item.idempotencyKey, nextItem)
  persistStore(store)
  return nextItem
}

export function removeDurablePendingAutoRevealQueueItem(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
): void {
  if (store.pendingQueueItemsByIdempotencyKey.delete(idempotencyKey)) {
    persistStore(store)
  }
}

export function listDurablePendingAutoRevealQueueItems(
  store: AutoRevealCursorStore,
): AutoRevealPendingQueueItem[] {
  return [...store.pendingQueueItemsByIdempotencyKey.values()].sort((left, right) => {
    if (left.queuedBlockNumber !== right.queuedBlockNumber) {
      return left.queuedBlockNumber < right.queuedBlockNumber ? -1 : 1
    }
    if (left.queueLogIndex !== right.queueLogIndex) {
      return left.queueLogIndex < right.queueLogIndex ? -1 : 1
    }
    return left.idempotencyKey.localeCompare(right.idempotencyKey)
  })
}

export function upsertDurablePendingAutoRevealCommittedCandidate(
  store: AutoRevealCursorStore,
  item: Omit<
    AutoRevealPendingCommittedCandidate,
    "firstSeenAtMs" | "lastEvaluatedAtMs"
  >,
  nowMs: number = Date.now(),
): AutoRevealPendingCommittedCandidate {
  const existing = store.pendingCommittedCandidatesByIdempotencyKey.get(
    item.idempotencyKey,
  ) ?? [...store.pendingCommittedCandidatesByIdempotencyKey.values()].find(
    (candidate) =>
      candidate.submissionId === item.submissionId
      && candidate.projectId === item.projectId,
  )

  if (existing && existing.idempotencyKey !== item.idempotencyKey) {
    const nextItem: AutoRevealPendingCommittedCandidate = {
      ...existing,
      lastEvaluatedAtMs: nowMs,
    }
    store.pendingCommittedCandidatesByIdempotencyKey.set(
      existing.idempotencyKey,
      nextItem,
    )
    persistStore(store)
    return nextItem
  }

  const nextItem: AutoRevealPendingCommittedCandidate = {
    ...item,
    firstSeenAtMs: existing?.firstSeenAtMs ?? nowMs,
    lastEvaluatedAtMs: nowMs,
  }

  store.pendingCommittedCandidatesByIdempotencyKey.set(item.idempotencyKey, nextItem)
  persistStore(store)
  return nextItem
}

export function removeDurablePendingAutoRevealCommittedCandidate(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
): void {
  if (store.pendingCommittedCandidatesByIdempotencyKey.delete(idempotencyKey)) {
    persistStore(store)
  }
}

export function listDurablePendingAutoRevealCommittedCandidates(
  store: AutoRevealCursorStore,
): AutoRevealPendingCommittedCandidate[] {
  return [...store.pendingCommittedCandidatesByIdempotencyKey.values()].sort(
    (left, right) => {
      if (left.commitBlockNumber !== right.commitBlockNumber) {
        return left.commitBlockNumber < right.commitBlockNumber ? -1 : 1
      }
      if (left.commitLogIndex !== right.commitLogIndex) {
        return left.commitLogIndex < right.commitLogIndex ? -1 : 1
      }
      return left.idempotencyKey.localeCompare(right.idempotencyKey)
    },
  )
}

export function hasDurableCompletedAutoRevealSubmission(
  store: AutoRevealCursorStore,
  submissionId: bigint,
  projectId: bigint,
): boolean {
  for (const [idempotencyKey, status] of store.queueItemStatusByIdempotencyKey.entries()) {
    if (status !== "completed") {
      continue
    }
    if (
      store.queueItemSubmissionIdByIdempotencyKey.get(idempotencyKey) === submissionId
      && store.queueItemProjectIdByIdempotencyKey.get(idempotencyKey) === projectId
    ) {
      return true
    }
  }

  return false
}

export function markDurableAutoRevealQueueItemCompleted(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
  nowMs: number = Date.now(),
): void {
  markAutoRevealQueueItemCompleted(
    store.queueItemStatusByIdempotencyKey,
    idempotencyKey,
  )
  store.queueItemUpdatedAtMsByIdempotencyKey.set(idempotencyKey, nowMs)
  recomputeQuarantinedCount(store)
  persistStore(store)
}

export function markDurableAutoRevealQueueItemQuarantined(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
  nowMs: number = Date.now(),
): void {
  markAutoRevealQueueItemQuarantined(
    store.queueItemStatusByIdempotencyKey,
    idempotencyKey,
  )
  store.queueItemUpdatedAtMsByIdempotencyKey.set(idempotencyKey, nowMs)
  recomputeQuarantinedCount(store)
  persistStore(store)
}

export function advanceDurableAutoRevealCursor(
  store: AutoRevealCursorStore,
  nextLastFinalizedBlock: bigint,
  nowMs: number = Date.now(),
): bigint {
  if (nextLastFinalizedBlock < store.cursorLastFinalizedBlock) {
    throw new Error(
      `auto-reveal cursor cannot move backwards: current=${store.cursorLastFinalizedBlock} next=${nextLastFinalizedBlock}`,
    )
  }

  const blockingKey = [...store.queueItemStatusByIdempotencyKey.entries()].find(
    ([idempotencyKey, status]) => {
      if (status === "completed") {
        return false
      }
      const blockNumber =
        store.queueItemBlockNumberByIdempotencyKey.get(idempotencyKey) ?? 0n
      return blockNumber <= nextLastFinalizedBlock
    },
  )

  if (blockingKey) {
    throw new Error(
      `auto-reveal cursor cannot advance past unresolved queue item ${blockingKey[0]} while status=${blockingKey[1]}`,
    )
  }

  store.cursorLastFinalizedBlock = nextLastFinalizedBlock
  store.cursorUpdatedAtMs = nowMs
  persistStore(store)
  return store.cursorLastFinalizedBlock
}

export function assertAutoRevealCursorStoreHealthy(
  store: AutoRevealCursorStore,
): void {
  if (store.recoveredProcessingCount > 0) {
    throw new Error(
      `Recovered ${store.recoveredProcessingCount} in-flight queue item(s) to quarantined state; fail closed until operator intervention`,
    )
  }
  if (store.quarantinedItemCount > 0) {
    throw new Error(
      `Cursor store contains ${store.quarantinedItemCount} quarantined queue item(s); fail closed until operator intervention`,
    )
  }
}
