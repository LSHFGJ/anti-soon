import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  claimAutoRevealIdempotencySlot,
  markAutoRevealQueueItemCompleted,
  markAutoRevealQueueItemQuarantined,
} from "./idempotency"
import type {
  AutoRevealIdempotencyDecision,
  AutoRevealIdempotencyStatus,
} from "./idempotency"

export const AUTO_REVEAL_CURSOR_STORE_SCHEMA_VERSION =
  "anti-soon.auto-reveal.cursor-store.v1" as const

type PersistedCursorRecord = {
  lastFinalizedBlock: string
  updatedAtMs: number
}

type PersistedQueueItemRecord = {
  status: AutoRevealIdempotencyStatus
  blockNumber: string
  updatedAtMs: number
  submissionId?: string
  projectId?: string
}

type PersistedPendingQueueItemRecord = {
  submissionId: string
  projectId: string
  queuedBlockNumber: string
  queueTxHash: `0x${string}`
  queueLogIndex: string
  firstSeenAtMs: number
  lastEvaluatedAtMs: number
}

type PersistedPendingCommittedCandidateRecord = {
  submissionId: string
  projectId: string
  commitBlockNumber: string
  commitTxHash: `0x${string}`
  commitLogIndex: string
  firstSeenAtMs: number
  lastEvaluatedAtMs: number
}

type AutoRevealCursorStoreFile = {
  schemaVersion: typeof AUTO_REVEAL_CURSOR_STORE_SCHEMA_VERSION
  cursor: PersistedCursorRecord
  queueItemStatusByIdempotencyKey: Record<string, PersistedQueueItemRecord>
  pendingQueueItemsByIdempotencyKey?: Record<string, PersistedPendingQueueItemRecord>
  pendingCommittedCandidatesByIdempotencyKey?: Record<
    string,
    PersistedPendingCommittedCandidateRecord
  >
}

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
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty bigint string`)
  }
  try {
    return BigInt(value)
  } catch {
    throw new Error(`${label} must be a valid bigint string`)
  }
}

function toSortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function ensureParentDirectory(filePath: string): void {
  const parent = dirname(filePath)
  if (parent.length > 0 && parent !== ".") {
    mkdirSync(parent, { recursive: true })
  }
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

function persistAutoRevealCursorStore(store: AutoRevealCursorStore): void {
  const queueItemStatusByIdempotencyKey: Record<string, PersistedQueueItemRecord> = {}
  for (const [idempotencyKey, status] of toSortedEntries(
    store.queueItemStatusByIdempotencyKey,
  )) {
    queueItemStatusByIdempotencyKey[idempotencyKey] = {
      status,
      blockNumber: (
        store.queueItemBlockNumberByIdempotencyKey.get(idempotencyKey) ?? 0n
      ).toString(),
      updatedAtMs:
        store.queueItemUpdatedAtMsByIdempotencyKey.get(idempotencyKey) ?? 0,
      submissionId: store.queueItemSubmissionIdByIdempotencyKey
        .get(idempotencyKey)
        ?.toString(),
      projectId: store.queueItemProjectIdByIdempotencyKey
        .get(idempotencyKey)
        ?.toString(),
    }
  }

  const pendingQueueItemsByIdempotencyKey: Record<
    string,
    PersistedPendingQueueItemRecord
  > = {}
  for (const [idempotencyKey, item] of toSortedEntries(
    store.pendingQueueItemsByIdempotencyKey,
  )) {
    pendingQueueItemsByIdempotencyKey[idempotencyKey] = {
      submissionId: item.submissionId.toString(),
      projectId: item.projectId.toString(),
      queuedBlockNumber: item.queuedBlockNumber.toString(),
      queueTxHash: item.queueTxHash,
      queueLogIndex: item.queueLogIndex.toString(),
      firstSeenAtMs: item.firstSeenAtMs,
      lastEvaluatedAtMs: item.lastEvaluatedAtMs,
    }
  }

  const pendingCommittedCandidatesByIdempotencyKey: Record<
    string,
    PersistedPendingCommittedCandidateRecord
  > = {}
  for (const [idempotencyKey, item] of toSortedEntries(
    store.pendingCommittedCandidatesByIdempotencyKey,
  )) {
    pendingCommittedCandidatesByIdempotencyKey[idempotencyKey] = {
      submissionId: item.submissionId.toString(),
      projectId: item.projectId.toString(),
      commitBlockNumber: item.commitBlockNumber.toString(),
      commitTxHash: item.commitTxHash,
      commitLogIndex: item.commitLogIndex.toString(),
      firstSeenAtMs: item.firstSeenAtMs,
      lastEvaluatedAtMs: item.lastEvaluatedAtMs,
    }
  }

  const payload: AutoRevealCursorStoreFile = {
    schemaVersion: AUTO_REVEAL_CURSOR_STORE_SCHEMA_VERSION,
    cursor: {
      lastFinalizedBlock: store.cursorLastFinalizedBlock.toString(),
      updatedAtMs: store.cursorUpdatedAtMs,
    },
    queueItemStatusByIdempotencyKey,
    pendingQueueItemsByIdempotencyKey,
    pendingCommittedCandidatesByIdempotencyKey,
  }

  ensureParentDirectory(store.filePath)
  const tempPath = `${store.filePath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  renameSync(tempPath, store.filePath)
}

function buildEmptyStore(filePath: string): AutoRevealCursorStore {
  return {
    filePath,
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
  }
}

function parseAutoRevealCursorStore(
  filePath: string,
): AutoRevealCursorStoreFile {
  const raw = readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw) as unknown

  if (!isObject(parsed)) {
    throw new Error("Invalid auto-reveal cursor store payload")
  }
  if (parsed.schemaVersion !== AUTO_REVEAL_CURSOR_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported auto-reveal cursor store schema: ${String(parsed.schemaVersion)}`,
    )
  }
  if (!isObject(parsed.cursor) || !isObject(parsed.queueItemStatusByIdempotencyKey)) {
    throw new Error("Invalid auto-reveal cursor store structure")
  }

  return parsed as AutoRevealCursorStoreFile
}

export function loadAutoRevealCursorStore(
  filePath: string,
  nowMs: number = Date.now(),
): AutoRevealCursorStore {
  const store = buildEmptyStore(filePath)

  if (!existsSync(filePath)) {
    store.cursorUpdatedAtMs = nowMs
    persistAutoRevealCursorStore(store)
    return store
  }

  const persisted = parseAutoRevealCursorStore(filePath)
  store.cursorLastFinalizedBlock = toBigInt(
    persisted.cursor.lastFinalizedBlock,
    "cursor.lastFinalizedBlock",
  )
  store.cursorUpdatedAtMs =
    typeof persisted.cursor.updatedAtMs === "number"
      ? persisted.cursor.updatedAtMs
      : nowMs

  let recoveredProcessingCount = 0

  for (const [idempotencyKey, record] of Object.entries(
    persisted.queueItemStatusByIdempotencyKey,
  )) {
    if (
      !isObject(record)
      || typeof record.status !== "string"
      || typeof record.blockNumber !== "string"
    ) {
      throw new Error(
        `Invalid auto-reveal queue item record for idempotencyKey=${idempotencyKey}`,
      )
    }

    if (
      record.status !== "processing"
      && record.status !== "completed"
      && record.status !== "quarantined"
    ) {
      throw new Error(
        `Invalid auto-reveal queue item status for idempotencyKey=${idempotencyKey}: ${record.status}`,
      )
    }

    const status =
      record.status === "processing" ? "quarantined" : record.status
    if (record.status === "processing") {
      recoveredProcessingCount += 1
    }

    store.queueItemStatusByIdempotencyKey.set(idempotencyKey, status)
    store.queueItemBlockNumberByIdempotencyKey.set(
      idempotencyKey,
      toBigInt(record.blockNumber, `queueItem.${idempotencyKey}.blockNumber`),
    )
    store.queueItemUpdatedAtMsByIdempotencyKey.set(
      idempotencyKey,
      record.status === "processing"
        ? nowMs
        : typeof record.updatedAtMs === "number"
          ? record.updatedAtMs
          : nowMs,
    )
    if (typeof record.submissionId === "string") {
      store.queueItemSubmissionIdByIdempotencyKey.set(
        idempotencyKey,
        toBigInt(record.submissionId, `queueItem.${idempotencyKey}.submissionId`),
      )
    }
    if (typeof record.projectId === "string") {
      store.queueItemProjectIdByIdempotencyKey.set(
        idempotencyKey,
        toBigInt(record.projectId, `queueItem.${idempotencyKey}.projectId`),
      )
    }
  }

  for (const [idempotencyKey, record] of Object.entries(
    persisted.pendingQueueItemsByIdempotencyKey ?? {},
  )) {
    if (
      !isObject(record)
      || typeof record.submissionId !== "string"
      || typeof record.projectId !== "string"
      || typeof record.queuedBlockNumber !== "string"
      || typeof record.queueTxHash !== "string"
      || typeof record.queueLogIndex !== "string"
    ) {
      throw new Error(
        `Invalid auto-reveal pending queue item record for idempotencyKey=${idempotencyKey}`,
      )
    }

    store.pendingQueueItemsByIdempotencyKey.set(idempotencyKey, {
      idempotencyKey,
      submissionId: toBigInt(
        record.submissionId,
        `pendingQueueItem.${idempotencyKey}.submissionId`,
      ),
      projectId: toBigInt(
        record.projectId,
        `pendingQueueItem.${idempotencyKey}.projectId`,
      ),
      queuedBlockNumber: toBigInt(
        record.queuedBlockNumber,
        `pendingQueueItem.${idempotencyKey}.queuedBlockNumber`,
      ),
      queueTxHash: record.queueTxHash as `0x${string}`,
      queueLogIndex: toBigInt(
        record.queueLogIndex,
        `pendingQueueItem.${idempotencyKey}.queueLogIndex`,
      ),
      firstSeenAtMs:
        typeof record.firstSeenAtMs === "number" ? record.firstSeenAtMs : nowMs,
      lastEvaluatedAtMs:
        typeof record.lastEvaluatedAtMs === "number"
          ? record.lastEvaluatedAtMs
          : nowMs,
    })
  }

  for (const [idempotencyKey, record] of Object.entries(
    persisted.pendingCommittedCandidatesByIdempotencyKey ?? {},
  )) {
    if (
      !isObject(record)
      || typeof record.submissionId !== "string"
      || typeof record.projectId !== "string"
      || typeof record.commitBlockNumber !== "string"
      || typeof record.commitTxHash !== "string"
      || typeof record.commitLogIndex !== "string"
    ) {
      throw new Error(
        `Invalid auto-reveal pending committed candidate record for idempotencyKey=${idempotencyKey}`,
      )
    }

    store.pendingCommittedCandidatesByIdempotencyKey.set(idempotencyKey, {
      idempotencyKey,
      submissionId: toBigInt(
        record.submissionId,
        `pendingCommittedCandidate.${idempotencyKey}.submissionId`,
      ),
      projectId: toBigInt(
        record.projectId,
        `pendingCommittedCandidate.${idempotencyKey}.projectId`,
      ),
      commitBlockNumber: toBigInt(
        record.commitBlockNumber,
        `pendingCommittedCandidate.${idempotencyKey}.commitBlockNumber`,
      ),
      commitTxHash: record.commitTxHash as `0x${string}`,
      commitLogIndex: toBigInt(
        record.commitLogIndex,
        `pendingCommittedCandidate.${idempotencyKey}.commitLogIndex`,
      ),
      firstSeenAtMs:
        typeof record.firstSeenAtMs === "number" ? record.firstSeenAtMs : nowMs,
      lastEvaluatedAtMs:
        typeof record.lastEvaluatedAtMs === "number"
          ? record.lastEvaluatedAtMs
          : nowMs,
    })
  }

  store.recoveredProcessingCount = recoveredProcessingCount
  recomputeQuarantinedCount(store)

  if (recoveredProcessingCount > 0) {
    persistAutoRevealCursorStore(store)
  }

  return store
}

export function readAutoRevealCursorStoreFile(
  filePath: string,
): AutoRevealCursorStoreFile {
  return parseAutoRevealCursorStore(filePath)
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
    persistAutoRevealCursorStore(store)
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
    persistAutoRevealCursorStore(store)
    return nextItem
  }

  const nextItem: AutoRevealPendingQueueItem = {
    ...item,
    firstSeenAtMs: existing?.firstSeenAtMs ?? nowMs,
    lastEvaluatedAtMs: nowMs,
  }

  store.pendingQueueItemsByIdempotencyKey.set(item.idempotencyKey, nextItem)
  persistAutoRevealCursorStore(store)
  return nextItem
}

export function removeDurablePendingAutoRevealQueueItem(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
): void {
  if (store.pendingQueueItemsByIdempotencyKey.delete(idempotencyKey)) {
    persistAutoRevealCursorStore(store)
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
    persistAutoRevealCursorStore(store)
    return nextItem
  }

  const nextItem: AutoRevealPendingCommittedCandidate = {
    ...item,
    firstSeenAtMs: existing?.firstSeenAtMs ?? nowMs,
    lastEvaluatedAtMs: nowMs,
  }

  store.pendingCommittedCandidatesByIdempotencyKey.set(item.idempotencyKey, nextItem)
  persistAutoRevealCursorStore(store)
  return nextItem
}

export function removeDurablePendingAutoRevealCommittedCandidate(
  store: AutoRevealCursorStore,
  idempotencyKey: string,
): void {
  if (store.pendingCommittedCandidatesByIdempotencyKey.delete(idempotencyKey)) {
    persistAutoRevealCursorStore(store)
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
  persistAutoRevealCursorStore(store)
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
  persistAutoRevealCursorStore(store)
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
  persistAutoRevealCursorStore(store)
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
