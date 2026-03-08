import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs"
import { dirname } from "path"
import {
  assertVerifyPocIdempotencyMappingStable,
  claimVerifyPocIdempotencySlot,
  deriveVerifyPocSourceEventKey,
  markVerifyPocIdempotencyCompleted,
  markVerifyPocIdempotencyQuarantined,
  markVerifyPocIdempotencyStrictFailed,
  type VerifyPocIdempotencyDecision,
  type VerifyPocIdempotencyInput,
  type VerifyPocIdempotencyMappingState,
  type VerifyPocIdempotencyStatus,
} from "./idempotency"

export const VERIFY_POC_IDEMPOTENCY_STORE_SCHEMA_VERSION =
  "anti-soon.verify-poc.idempotency-store.v1" as const

type VerifyPocPersistedSyncRecord = {
  status: VerifyPocIdempotencyStatus
  updatedAtMs: number
}

type VerifyPocPersistedMappingRecord = {
  mappingFingerprint: `0x${string}`
  idempotencyKey: `0x${string}`
  updatedAtMs: number
}

type VerifyPocIdempotencyStoreFile = {
  schemaVersion: typeof VERIFY_POC_IDEMPOTENCY_STORE_SCHEMA_VERSION
  syncStatusBySyncId: Record<string, VerifyPocPersistedSyncRecord>
  sourceEventMappingByFingerprint: Record<string, VerifyPocPersistedMappingRecord>
}

export type VerifyPocIdempotencyStore = {
  filePath: string
  fileOps: VerifyPocIdempotencyStoreFileOps
  syncStatusBySyncId: Map<string, VerifyPocIdempotencyStatus>
  syncStatusUpdatedAtMsBySyncId: Map<string, number>
  sourceEventMappingByFingerprint: Map<string, VerifyPocIdempotencyMappingState>
  sourceEventMappingUpdatedAtMsByFingerprint: Map<string, number>
  recoveredProcessingCount: number
}

export type VerifyPocIdempotencyStoreFileOps = {
  existsSync?: typeof existsSync
  mkdirSync?: typeof mkdirSync
  readFileSync?: typeof readFileSync
  renameSync?: typeof renameSync
  writeFileSync?: typeof writeFileSync
}

const defaultFileOps: VerifyPocIdempotencyStoreFileOps = {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
}

function hasUsableFileOps(
  fileOps: VerifyPocIdempotencyStoreFileOps,
): fileOps is Required<VerifyPocIdempotencyStoreFileOps> {
  return (
    typeof fileOps.existsSync === "function" &&
    typeof fileOps.mkdirSync === "function" &&
    typeof fileOps.readFileSync === "function" &&
    typeof fileOps.renameSync === "function" &&
    typeof fileOps.writeFileSync === "function"
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toSortedEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function ensureParentDirectory(
  filePath: string,
  fileOps: Required<VerifyPocIdempotencyStoreFileOps>,
): void {
  const parent = dirname(filePath)
  if (parent.length > 0 && parent !== ".") {
    fileOps.mkdirSync(parent, { recursive: true })
  }
}

function persistVerifyPocIdempotencyStore(store: VerifyPocIdempotencyStore): void {
  if (!hasUsableFileOps(store.fileOps)) {
    return
  }

  const syncStatusBySyncId: Record<string, VerifyPocPersistedSyncRecord> = {}
  for (const [syncId, status] of toSortedEntries(store.syncStatusBySyncId)) {
    syncStatusBySyncId[syncId] = {
      status,
      updatedAtMs: store.syncStatusUpdatedAtMsBySyncId.get(syncId) ?? 0,
    }
  }

  const sourceEventMappingByFingerprint: Record<string, VerifyPocPersistedMappingRecord> = {}
  for (const [sourceEventFingerprint, state] of toSortedEntries(
    store.sourceEventMappingByFingerprint,
  )) {
    sourceEventMappingByFingerprint[sourceEventFingerprint] = {
      mappingFingerprint: state.mappingFingerprint,
      idempotencyKey: state.idempotencyKey,
      updatedAtMs:
        store.sourceEventMappingUpdatedAtMsByFingerprint.get(
          sourceEventFingerprint,
        ) ?? 0,
    }
  }

  const payload: VerifyPocIdempotencyStoreFile = {
    schemaVersion: VERIFY_POC_IDEMPOTENCY_STORE_SCHEMA_VERSION,
    syncStatusBySyncId,
    sourceEventMappingByFingerprint,
  }

  ensureParentDirectory(store.filePath, store.fileOps)
  const tempPath = `${store.filePath}.tmp`
  store.fileOps.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  store.fileOps.renameSync(tempPath, store.filePath)
}

function parsePersistedStore(
  filePath: string,
  fileOps: Required<VerifyPocIdempotencyStoreFileOps>,
): VerifyPocIdempotencyStoreFile {
  const raw = fileOps.readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!isObject(parsed)) {
    throw new Error("Invalid verify-poc idempotency store payload")
  }

  if (parsed.schemaVersion !== VERIFY_POC_IDEMPOTENCY_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported verify-poc idempotency store schema: ${String(parsed.schemaVersion)}`,
    )
  }

  if (
    !isObject(parsed.syncStatusBySyncId) ||
    !isObject(parsed.sourceEventMappingByFingerprint)
  ) {
    throw new Error("Invalid verify-poc idempotency store structure")
  }

  return parsed as VerifyPocIdempotencyStoreFile
}

function buildEmptyStore(
  filePath: string,
  fileOps: VerifyPocIdempotencyStoreFileOps,
): VerifyPocIdempotencyStore {
  return {
    filePath,
    fileOps,
    syncStatusBySyncId: new Map<string, VerifyPocIdempotencyStatus>(),
    syncStatusUpdatedAtMsBySyncId: new Map<string, number>(),
    sourceEventMappingByFingerprint: new Map<
      string,
      VerifyPocIdempotencyMappingState
    >(),
    sourceEventMappingUpdatedAtMsByFingerprint: new Map<string, number>(),
    recoveredProcessingCount: 0,
  }
}

export function loadVerifyPocIdempotencyStore(
  filePath: string,
  nowMs: number = Date.now(),
  fileOps: VerifyPocIdempotencyStoreFileOps = defaultFileOps,
): VerifyPocIdempotencyStore {
  const store = buildEmptyStore(filePath, fileOps)

  if (!hasUsableFileOps(fileOps)) {
    return store
  }

  if (!fileOps.existsSync(filePath)) {
    persistVerifyPocIdempotencyStore(store)
    return store
  }

  const persisted = parsePersistedStore(filePath, fileOps)
  let recoveredProcessingCount = 0
  const recoveredSyncIds = new Set<string>()

  for (const [syncId, record] of Object.entries(persisted.syncStatusBySyncId)) {
    if (!isObject(record) || typeof record.status !== "string") {
      throw new Error(`Invalid verify-poc idempotency sync record for syncId=${syncId}`)
    }

    if (
      record.status !== "processing" &&
      record.status !== "completed" &&
      record.status !== "quarantined" &&
      record.status !== "strict_failed"
    ) {
      throw new Error(
        `Invalid verify-poc idempotency status for syncId=${syncId}: ${record.status}`,
      )
    }

    const status =
      record.status === "processing" ? "quarantined" : record.status
    if (record.status === "processing") {
      recoveredProcessingCount += 1
      recoveredSyncIds.add(syncId)
    }

    store.syncStatusBySyncId.set(syncId, status)
    store.syncStatusUpdatedAtMsBySyncId.set(
      syncId,
      typeof record.updatedAtMs === "number" ? record.updatedAtMs : nowMs,
    )
  }

  for (const [sourceEventFingerprint, record] of Object.entries(
    persisted.sourceEventMappingByFingerprint,
  )) {
    if (
      !isObject(record) ||
      typeof record.mappingFingerprint !== "string" ||
      typeof record.idempotencyKey !== "string"
    ) {
      throw new Error(
        `Invalid verify-poc idempotency mapping record for fingerprint=${sourceEventFingerprint}`,
      )
    }

    store.sourceEventMappingByFingerprint.set(sourceEventFingerprint, {
      mappingFingerprint: record.mappingFingerprint as `0x${string}`,
      idempotencyKey: record.idempotencyKey as `0x${string}`,
    })
    store.sourceEventMappingUpdatedAtMsByFingerprint.set(
      sourceEventFingerprint,
      typeof record.updatedAtMs === "number" ? record.updatedAtMs : nowMs,
    )
  }

  if (recoveredProcessingCount > 0) {
    for (const syncId of recoveredSyncIds) {
      store.syncStatusUpdatedAtMsBySyncId.set(syncId, nowMs)
    }
    persistVerifyPocIdempotencyStore(store)
  }

  store.recoveredProcessingCount = recoveredProcessingCount
  return store
}

export function readVerifyPocIdempotencyStoreFile(
  filePath: string,
  fileOps: VerifyPocIdempotencyStoreFileOps = defaultFileOps,
): VerifyPocIdempotencyStoreFile {
  if (!hasUsableFileOps(fileOps)) {
    throw new Error("File-backed idempotency store is unavailable")
  }

  return parsePersistedStore(filePath, fileOps)
}

export function assertDurableVerifyPocIdempotencyMappingStable(
  store: VerifyPocIdempotencyStore,
  input: VerifyPocIdempotencyInput,
  nowMs: number = Date.now(),
): {
  sourceEventKey: `0x${string}`
  idempotencyKey: `0x${string}`
  mappingFingerprint: `0x${string}`
} {
  const sourceEventKey = deriveSourceEventFingerprint(input)
  const hasExistingMapping = store.sourceEventMappingByFingerprint.has(
    sourceEventKey,
  )

  const mapped = assertVerifyPocIdempotencyMappingStable(
    store.sourceEventMappingByFingerprint,
    input,
  )

  if (!hasExistingMapping) {
    store.sourceEventMappingUpdatedAtMsByFingerprint.set(sourceEventKey, nowMs)
    persistVerifyPocIdempotencyStore(store)
  }

  return mapped
}

export function claimDurableVerifyPocIdempotencySlot(
  store: VerifyPocIdempotencyStore,
  syncId: string,
  nowMs: number = Date.now(),
): VerifyPocIdempotencyDecision {
  const decision = claimVerifyPocIdempotencySlot(store.syncStatusBySyncId, syncId)
  if (decision.shouldProcess) {
    store.syncStatusUpdatedAtMsBySyncId.set(syncId, nowMs)
    persistVerifyPocIdempotencyStore(store)
  }
  return decision
}

export function markDurableVerifyPocIdempotencyCompleted(
  store: VerifyPocIdempotencyStore,
  syncId: string,
  nowMs: number = Date.now(),
): void {
  markVerifyPocIdempotencyCompleted(store.syncStatusBySyncId, syncId)
  store.syncStatusUpdatedAtMsBySyncId.set(syncId, nowMs)
  persistVerifyPocIdempotencyStore(store)
}

export function markDurableVerifyPocIdempotencyQuarantined(
  store: VerifyPocIdempotencyStore,
  syncId: string,
  nowMs: number = Date.now(),
): void {
  markVerifyPocIdempotencyQuarantined(store.syncStatusBySyncId, syncId)
  store.syncStatusUpdatedAtMsBySyncId.set(syncId, nowMs)
  persistVerifyPocIdempotencyStore(store)
}

export function markDurableVerifyPocIdempotencyStrictFailed(
  store: VerifyPocIdempotencyStore,
  syncId: string,
  nowMs: number = Date.now(),
): void {
  markVerifyPocIdempotencyStrictFailed(store.syncStatusBySyncId, syncId)
  store.syncStatusUpdatedAtMsBySyncId.set(syncId, nowMs)
  persistVerifyPocIdempotencyStore(store)
}

function deriveSourceEventFingerprint(
  input: VerifyPocIdempotencyInput,
): `0x${string}` {
  return deriveVerifyPocSourceEventKey(input)
}
