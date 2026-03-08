import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export const DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION =
  "anti-soon.demo-operator.state-store.v1" as const

export const DEMO_OPERATOR_STAGE_NAMES = [
  "register",
  "submit",
  "reveal",
  "verify",
] as const

export type DemoOperatorStageName = (typeof DEMO_OPERATOR_STAGE_NAMES)[number]

export type DemoOperatorStageStatus =
  | "pending"
  | "processing"
  | "completed"
  | "quarantined"

export type DemoOperatorStageState = {
  stageName: DemoOperatorStageName
  status: DemoOperatorStageStatus
  updatedAtMs: number
  lastError?: string
}

export type DemoOperatorStageClaimDecision = {
  shouldProcess: boolean
  reason: "claimed" | "already-processing" | "already-completed" | "quarantined"
}

export type DemoOperatorStateBinding = {
  scenarioId: string
  scenarioPath: string
  evidenceDir: string
}

type PersistedStageStateRecord = {
  status: DemoOperatorStageStatus
  updatedAtMs: number
  lastError?: string
}

export type DemoOperatorStateStoreFile = {
  schemaVersion: typeof DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION
  binding: DemoOperatorStateBinding | null
  stageStateByName: Record<DemoOperatorStageName, PersistedStageStateRecord>
}

export type DemoOperatorStateStore = {
  filePath: string
  binding: DemoOperatorStateBinding | null
  stageStateByName: Map<DemoOperatorStageName, DemoOperatorStageState>
  recoveredProcessingCount: number
  quarantinedStageCount: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function ensureParentDirectory(filePath: string): void {
  const parent = dirname(filePath)
  if (parent.length > 0 && parent !== ".") {
    mkdirSync(parent, { recursive: true })
  }
}

function buildEmptyStageState(stageName: DemoOperatorStageName): DemoOperatorStageState {
  return {
    stageName,
    status: "pending",
    updatedAtMs: 0,
  }
}

function buildEmptyStore(filePath: string): DemoOperatorStateStore {
  const stageStateByName = new Map<DemoOperatorStageName, DemoOperatorStageState>()
  for (const stageName of DEMO_OPERATOR_STAGE_NAMES) {
    stageStateByName.set(stageName, buildEmptyStageState(stageName))
  }

  return {
    filePath,
    binding: null,
    stageStateByName,
    recoveredProcessingCount: 0,
    quarantinedStageCount: 0,
  }
}

function recomputeQuarantinedStageCount(store: DemoOperatorStateStore): void {
  let count = 0
  for (const state of store.stageStateByName.values()) {
    if (state.status === "quarantined") {
      count += 1
    }
  }

  store.quarantinedStageCount = count
}

function persistDemoOperatorStateStore(store: DemoOperatorStateStore): void {
  const stageStateByName = {} as Record<
    DemoOperatorStageName,
    PersistedStageStateRecord
  >

  for (const stageName of DEMO_OPERATOR_STAGE_NAMES) {
    const state = getStageState(store, stageName)
    stageStateByName[stageName] = {
      status: state.status,
      updatedAtMs: state.updatedAtMs,
      ...(state.lastError ? { lastError: state.lastError } : {}),
    }
  }

  const payload: DemoOperatorStateStoreFile = {
    schemaVersion: DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION,
    binding: store.binding,
    stageStateByName,
  }

  ensureParentDirectory(store.filePath)
  const tempPath = `${store.filePath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
  renameSync(tempPath, store.filePath)
}

function parseBinding(value: unknown): DemoOperatorStateBinding | null {
  if (value === null) {
    return null
  }
  if (!isObject(value)) {
    throw new Error("Invalid demo-operator state binding")
  }

  if (
    typeof value.scenarioId !== "string"
    || typeof value.scenarioPath !== "string"
    || typeof value.evidenceDir !== "string"
  ) {
    throw new Error("Invalid demo-operator state binding")
  }

  return {
    scenarioId: value.scenarioId,
    scenarioPath: value.scenarioPath,
    evidenceDir: value.evidenceDir,
  }
}

function parsePersistedStore(filePath: string): DemoOperatorStateStoreFile {
  const raw = readFileSync(filePath, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!isObject(parsed)) {
    throw new Error("Invalid demo-operator state store payload")
  }

  if (parsed.schemaVersion !== DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported demo-operator state store schema: ${String(parsed.schemaVersion)}`,
    )
  }

  if (!isObject(parsed.stageStateByName)) {
    throw new Error("Invalid demo-operator state store structure")
  }

  const stageKeys = Object.keys(parsed.stageStateByName)
  if (stageKeys.length !== DEMO_OPERATOR_STAGE_NAMES.length) {
    throw new Error("Invalid demo-operator stage state structure")
  }

  for (const stageName of DEMO_OPERATOR_STAGE_NAMES) {
    if (!Object.hasOwn(parsed.stageStateByName, stageName)) {
      throw new Error(`Missing demo-operator stage state for stage=${stageName}`)
    }
  }

  for (const stageKey of stageKeys) {
    if (!(DEMO_OPERATOR_STAGE_NAMES as readonly string[]).includes(stageKey)) {
      throw new Error(`Unknown demo-operator stage state key: ${stageKey}`)
    }
  }

  return {
    schemaVersion: DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION,
    binding: parseBinding(parsed.binding ?? null),
    stageStateByName: parsed.stageStateByName as DemoOperatorStateStoreFile["stageStateByName"],
  }
}

function validateStageStatus(
  value: unknown,
  stageName: DemoOperatorStageName,
): DemoOperatorStageStatus {
  if (
    value === "pending"
    || value === "processing"
    || value === "completed"
    || value === "quarantined"
  ) {
    return value
  }

  throw new Error(`Invalid demo-operator stage status for stage=${stageName}: ${String(value)}`)
}

function getStageState(
  store: DemoOperatorStateStore,
  stageName: DemoOperatorStageName,
): DemoOperatorStageState {
  const state = store.stageStateByName.get(stageName)
  if (!state) {
    throw new Error(`Missing demo-operator stage state for stage=${stageName}`)
  }

  return state
}

export function loadDemoOperatorStateStore(
  filePath: string,
  nowMs: number = Date.now(),
): DemoOperatorStateStore {
  const store = buildEmptyStore(filePath)

  if (!existsSync(filePath)) {
    persistDemoOperatorStateStore(store)
    return store
  }

  const persisted = parsePersistedStore(filePath)
  store.binding = persisted.binding

  let recoveredProcessingCount = 0
  for (const stageName of DEMO_OPERATOR_STAGE_NAMES) {
    const record = persisted.stageStateByName[stageName] as unknown
    if (!isObject(record)) {
      throw new Error(`Invalid demo-operator stage record for stage=${stageName}`)
    }
    if (typeof record.updatedAtMs !== "number") {
      throw new Error(`Invalid demo-operator stage timestamp for stage=${stageName}`)
    }
    if (record.lastError !== undefined && typeof record.lastError !== "string") {
      throw new Error(`Invalid demo-operator stage error for stage=${stageName}`)
    }

    const status = validateStageStatus(record.status, stageName)
    const nextState: DemoOperatorStageState = {
      stageName,
      status,
      updatedAtMs: record.updatedAtMs,
      ...(typeof record.lastError === "string" ? { lastError: record.lastError } : {}),
    }

    if (status === "processing") {
      recoveredProcessingCount += 1
      nextState.status = "quarantined"
      nextState.updatedAtMs = nowMs
      nextState.lastError = `Recovered in-flight stage ${stageName} on startup; operator must inspect before rerun`
    }

    store.stageStateByName.set(stageName, nextState)
  }

  store.recoveredProcessingCount = recoveredProcessingCount
  recomputeQuarantinedStageCount(store)
  if (recoveredProcessingCount > 0) {
    persistDemoOperatorStateStore(store)
  }

  return store
}

export function readDemoOperatorStateStoreFile(
  filePath: string,
): DemoOperatorStateStoreFile {
  return parsePersistedStore(filePath)
}

export function assertDemoOperatorStateBindingStable(
  store: DemoOperatorStateStore,
  binding: DemoOperatorStateBinding,
  _nowMs: number = Date.now(),
): DemoOperatorStateBinding {
  if (store.binding === null) {
    store.binding = binding
    persistDemoOperatorStateStore(store)
    return binding
  }

  if (store.binding.scenarioId !== binding.scenarioId) {
    throw new Error(
      `Demo operator state binding mismatch for scenarioId: expected ${store.binding.scenarioId} received ${binding.scenarioId}`,
    )
  }
  if (store.binding.scenarioPath !== binding.scenarioPath) {
    throw new Error(
      `Demo operator state binding mismatch for scenarioPath: expected ${store.binding.scenarioPath} received ${binding.scenarioPath}`,
    )
  }
  if (store.binding.evidenceDir !== binding.evidenceDir) {
    throw new Error(
      `Demo operator state binding mismatch for evidenceDir: expected ${store.binding.evidenceDir} received ${binding.evidenceDir}`,
    )
  }

  return store.binding
}

export function claimDurableDemoOperatorStage(
  store: DemoOperatorStateStore,
  stageName: DemoOperatorStageName,
  nowMs: number = Date.now(),
): DemoOperatorStageClaimDecision {
  const state = getStageState(store, stageName)

  if (state.status === "completed") {
    return {
      shouldProcess: false,
      reason: "already-completed",
    }
  }

  if (state.status === "processing") {
    return {
      shouldProcess: false,
      reason: "already-processing",
    }
  }

  if (state.status === "quarantined") {
    return {
      shouldProcess: false,
      reason: "quarantined",
    }
  }

  state.status = "processing"
  state.updatedAtMs = nowMs
  delete state.lastError
  persistDemoOperatorStateStore(store)

  return {
    shouldProcess: true,
    reason: "claimed",
  }
}

export function markDurableDemoOperatorStageCompleted(
  store: DemoOperatorStateStore,
  stageName: DemoOperatorStageName,
  nowMs: number = Date.now(),
): void {
  const state = getStageState(store, stageName)
  state.status = "completed"
  state.updatedAtMs = nowMs
  delete state.lastError
  recomputeQuarantinedStageCount(store)
  persistDemoOperatorStateStore(store)
}

export function markDurableDemoOperatorStageQuarantined(
  store: DemoOperatorStateStore,
  stageName: DemoOperatorStageName,
  lastError: string,
  nowMs: number = Date.now(),
): void {
  if (lastError.trim().length === 0) {
    throw new Error("Demo operator quarantined stage must include a non-empty error message")
  }

  const state = getStageState(store, stageName)
  state.status = "quarantined"
  state.updatedAtMs = nowMs
  state.lastError = lastError
  recomputeQuarantinedStageCount(store)
  persistDemoOperatorStateStore(store)
}

export function listDemoOperatorStageStates(
  store: DemoOperatorStateStore,
): DemoOperatorStageState[] {
  return DEMO_OPERATOR_STAGE_NAMES.map((stageName) => ({
    ...getStageState(store, stageName),
  }))
}

export function assertDemoOperatorStateStoreHealthy(
  store: DemoOperatorStateStore,
): void {
  if (store.recoveredProcessingCount > 0) {
    throw new Error(
      `Recovered ${store.recoveredProcessingCount} in-flight stage(s) to quarantined state; fail closed until operator intervention`,
    )
  }

  if (store.quarantinedStageCount > 0) {
    throw new Error(
      `State store contains ${store.quarantinedStageCount} quarantined stage(s); fail closed until operator intervention`,
    )
  }
}
