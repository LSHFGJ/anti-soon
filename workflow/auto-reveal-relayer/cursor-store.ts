import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import {
  advanceDurableAutoRevealCursor,
  assertAutoRevealCursorStoreHealthy,
  claimDurableAutoRevealQueueItem,
  createAutoRevealCursorStore,
  hasDurableCompletedAutoRevealSubmission,
  listDurablePendingAutoRevealCommittedCandidates,
  listDurablePendingAutoRevealQueueItems,
  markDurableAutoRevealQueueItemCompleted,
  markDurableAutoRevealQueueItemQuarantined,
  removeDurablePendingAutoRevealCommittedCandidate,
  removeDurablePendingAutoRevealQueueItem,
  upsertDurablePendingAutoRevealCommittedCandidate,
  upsertDurablePendingAutoRevealQueueItem,
  type AutoRevealCursorStore,
  type AutoRevealPendingCommittedCandidate,
  type AutoRevealPendingQueueItem,
} from "./cursor-state"

export const AUTO_REVEAL_CURSOR_STORE_SCHEMA_VERSION =
  "anti-soon.auto-reveal.cursor-store.v1" as const

type PersistedCursorRecord = {
  lastFinalizedBlock: string
  updatedAtMs: number
}

type PersistedQueueItemRecord = {
  status: "processing" | "completed" | "quarantined"
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

function parseAutoRevealCursorStore(filePath: string): AutoRevealCursorStoreFile {
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
  const store = createAutoRevealCursorStore({
    filePath,
    persist: persistAutoRevealCursorStore,
  })

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
  let quarantinedItemCount = 0

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
    if (status === "quarantined") {
      quarantinedItemCount += 1
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
  store.quarantinedItemCount = quarantinedItemCount

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

export type {
  AutoRevealCursorStore,
  AutoRevealPendingCommittedCandidate,
  AutoRevealPendingQueueItem,
}

export {
  advanceDurableAutoRevealCursor,
  assertAutoRevealCursorStoreHealthy,
  claimDurableAutoRevealQueueItem,
  hasDurableCompletedAutoRevealSubmission,
  listDurablePendingAutoRevealCommittedCandidates,
  listDurablePendingAutoRevealQueueItems,
  markDurableAutoRevealQueueItemCompleted,
  markDurableAutoRevealQueueItemQuarantined,
  removeDurablePendingAutoRevealCommittedCandidate,
  removeDurablePendingAutoRevealQueueItem,
  upsertDurablePendingAutoRevealCommittedCandidate,
  upsertDurablePendingAutoRevealQueueItem,
}
