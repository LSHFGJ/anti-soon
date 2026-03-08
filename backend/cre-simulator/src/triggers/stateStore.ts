import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

import type {
	CreSimulatorListenerCursor,
	CreSimulatorSchedulerCursor,
	CreSimulatorTriggerBinding,
	CreSimulatorTriggerExecutionIdentity,
	CreSimulatorTriggerExecutionState,
	CreSimulatorTriggerExecutionStatus,
} from "./types"

export const TRIGGER_STATE_STORE_SCHEMA_VERSION =
	"anti-soon.cre-simulator.trigger-state.v1" as const

type PersistedSchedulerCursor = {
	lastRunAtMs: number
}

type PersistedListenerCursor = {
	lastSeenBlockNumber?: string
	lastEventKey?: string
}

type PersistedExecutionState = CreSimulatorTriggerExecutionIdentity & {
	status: CreSimulatorTriggerExecutionStatus
	updatedAtMs: number
	lastError?: string
}

type CreSimulatorTriggerStateStoreFile = {
	schemaVersion: typeof TRIGGER_STATE_STORE_SCHEMA_VERSION
	binding: CreSimulatorTriggerBinding
	schedulerCursorByName: Record<string, PersistedSchedulerCursor>
	listenerCursorByName: Record<string, PersistedListenerCursor>
	executionStateByKey: Record<string, PersistedExecutionState>
}

export type CreSimulatorTriggerStateStore = {
	filePath: string
	binding: CreSimulatorTriggerBinding
	schedulerCursorByName: Map<string, CreSimulatorSchedulerCursor>
	listenerCursorByName: Map<string, CreSimulatorListenerCursor>
	executionStateByKey: Map<string, CreSimulatorTriggerExecutionState>
	recoveredProcessingCount: number
	quarantinedExecutionCount: number
}

export type CreSimulatorTriggerClaimDecision = {
	shouldProcess: boolean
	reason: "claimed" | "already-processing" | "already-completed" | "quarantined"
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

function normalizeExecutionStatus(value: unknown): CreSimulatorTriggerExecutionStatus {
	if (
		value === "pending"
		|| value === "processing"
		|| value === "completed"
		|| value === "quarantined"
	) {
		return value
	}

	throw new Error(`Invalid cre-simulator trigger execution status: ${String(value)}`)
}

function parseBinding(value: unknown): CreSimulatorTriggerBinding {
	if (!isObject(value) || typeof value.configPath !== "string" || typeof value.stateFilePath !== "string") {
		throw new Error("Invalid cre-simulator trigger state binding")
	}

	return {
		configPath: value.configPath,
		stateFilePath: value.stateFilePath,
	}
}

function recomputeQuarantinedExecutionCount(store: CreSimulatorTriggerStateStore): void {
	let count = 0
	for (const state of store.executionStateByKey.values()) {
		if (state.status === "quarantined") {
			count += 1
		}
	}
	store.quarantinedExecutionCount = count
}

function persistCreSimulatorTriggerStateStore(store: CreSimulatorTriggerStateStore): void {
	const schedulerCursorByName = Object.fromEntries(store.schedulerCursorByName)
	const listenerCursorByName = Object.fromEntries(
		Array.from(store.listenerCursorByName.entries()).map(([name, value]) => [
			name,
			{
				...(value.lastSeenBlockNumber !== undefined
					? { lastSeenBlockNumber: value.lastSeenBlockNumber.toString() }
					: {}),
				...(value.lastEventKey ? { lastEventKey: value.lastEventKey } : {}),
			},
		]),
	)
	const executionStateByKey = Object.fromEntries(store.executionStateByKey)

	const payload: CreSimulatorTriggerStateStoreFile = {
		schemaVersion: TRIGGER_STATE_STORE_SCHEMA_VERSION,
		binding: store.binding,
		schedulerCursorByName,
		listenerCursorByName,
		executionStateByKey,
	}

	ensureParentDirectory(store.filePath)
	const tempPath = `${store.filePath}.tmp`
	writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
	renameSync(tempPath, store.filePath)
}

function buildEmptyStore(
	filePath: string,
	binding: CreSimulatorTriggerBinding,
): CreSimulatorTriggerStateStore {
	return {
		filePath,
		binding,
		schedulerCursorByName: new Map(),
		listenerCursorByName: new Map(),
		executionStateByKey: new Map(),
		recoveredProcessingCount: 0,
		quarantinedExecutionCount: 0,
	}
}

export function loadCreSimulatorTriggerStateStore(
	filePath: string,
	binding: CreSimulatorTriggerBinding,
	nowMs: number = Date.now(),
): CreSimulatorTriggerStateStore {
	const store = buildEmptyStore(filePath, binding)

	if (!existsSync(filePath)) {
		persistCreSimulatorTriggerStateStore(store)
		return store
	}

	const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown
	if (!isObject(parsed)) {
		throw new Error("Invalid cre-simulator trigger state store payload")
	}
	if (parsed.schemaVersion !== TRIGGER_STATE_STORE_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported cre-simulator trigger state store schema: ${String(parsed.schemaVersion)}`,
		)
	}

	store.binding = parseBinding(parsed.binding)
	assertCreSimulatorTriggerStateBindingStable(store, binding)

	if (!isObject(parsed.schedulerCursorByName) || !isObject(parsed.listenerCursorByName) || !isObject(parsed.executionStateByKey)) {
		throw new Error("Invalid cre-simulator trigger state store structure")
	}

	for (const [name, cursor] of Object.entries(parsed.schedulerCursorByName)) {
		if (!isObject(cursor) || typeof cursor.lastRunAtMs !== "number") {
			throw new Error(`Invalid cre-simulator scheduler cursor for trigger=${name}`)
		}
		store.schedulerCursorByName.set(name, { lastRunAtMs: cursor.lastRunAtMs })
	}

	for (const [name, cursor] of Object.entries(parsed.listenerCursorByName)) {
		if (!isObject(cursor)) {
			throw new Error(`Invalid cre-simulator listener cursor for trigger=${name}`)
		}
		store.listenerCursorByName.set(name, {
			...(typeof cursor.lastSeenBlockNumber === "string"
				? { lastSeenBlockNumber: BigInt(cursor.lastSeenBlockNumber) }
				: {}),
			...(typeof cursor.lastEventKey === "string" ? { lastEventKey: cursor.lastEventKey } : {}),
		})
	}

	let recoveredProcessingCount = 0
	for (const [key, record] of Object.entries(parsed.executionStateByKey)) {
		if (!isObject(record) || typeof record.triggerName !== "string" || typeof record.triggerType !== "string" || typeof record.updatedAtMs !== "number") {
			throw new Error(`Invalid cre-simulator trigger execution record for key=${key}`)
		}
		const status = normalizeExecutionStatus(record.status)
		const nextState: CreSimulatorTriggerExecutionState = {
			triggerName: record.triggerName,
			triggerType: record.triggerType as CreSimulatorTriggerExecutionIdentity["triggerType"],
			status,
			updatedAtMs: record.updatedAtMs,
			...(typeof record.lastError === "string" ? { lastError: record.lastError } : {}),
		}
		if (status === "processing") {
			recoveredProcessingCount += 1
			nextState.status = "quarantined"
			nextState.updatedAtMs = nowMs
			nextState.lastError = "Recovered processing trigger execution after restart"
		}
		store.executionStateByKey.set(key, nextState)
	}

	store.recoveredProcessingCount = recoveredProcessingCount
	recomputeQuarantinedExecutionCount(store)
	if (recoveredProcessingCount > 0) {
		persistCreSimulatorTriggerStateStore(store)
	}

	return store
}

export function assertCreSimulatorTriggerStateBindingStable(
	store: CreSimulatorTriggerStateStore,
	expectedBinding: CreSimulatorTriggerBinding,
): void {
	if (
		store.binding.configPath !== expectedBinding.configPath
		|| store.binding.stateFilePath !== expectedBinding.stateFilePath
	) {
		throw new Error("Cre-simulator trigger state binding mismatch")
	}
}

export function assertCreSimulatorTriggerStateStoreHealthy(
	store: CreSimulatorTriggerStateStore,
): void {
	if (store.recoveredProcessingCount > 0 || store.quarantinedExecutionCount > 0) {
		throw new Error("Cre-simulator trigger state store is not healthy")
	}
}

export function claimCreSimulatorTriggerExecution(
	store: CreSimulatorTriggerStateStore,
	executionKey: string,
	identity: CreSimulatorTriggerExecutionIdentity,
	nowMs: number,
): CreSimulatorTriggerClaimDecision {
	const existing = store.executionStateByKey.get(executionKey)
	if (existing) {
		if (existing.status === "processing") {
			return { shouldProcess: false, reason: "already-processing" }
		}
		if (existing.status === "completed") {
			return { shouldProcess: false, reason: "already-completed" }
		}
		if (existing.status === "quarantined") {
			return { shouldProcess: false, reason: "quarantined" }
		}
	}

	store.executionStateByKey.set(executionKey, {
		...identity,
		status: "processing",
		updatedAtMs: nowMs,
	})
	persistCreSimulatorTriggerStateStore(store)
	return { shouldProcess: true, reason: "claimed" }
}

export function markCreSimulatorTriggerExecutionCompleted(
	store: CreSimulatorTriggerStateStore,
	executionKey: string,
	nowMs: number,
): void {
	const state = store.executionStateByKey.get(executionKey)
	if (!state) {
		throw new Error(`Missing cre-simulator trigger execution for key=${executionKey}`)
	}
	state.status = "completed"
	state.updatedAtMs = nowMs
	delete state.lastError
	persistCreSimulatorTriggerStateStore(store)
}

export function markCreSimulatorTriggerExecutionQuarantined(
	store: CreSimulatorTriggerStateStore,
	executionKey: string,
	message: string,
	nowMs: number,
): void {
	const state = store.executionStateByKey.get(executionKey)
	if (!state) {
		throw new Error(`Missing cre-simulator trigger execution for key=${executionKey}`)
	}
	state.status = "quarantined"
	state.updatedAtMs = nowMs
	state.lastError = message
	recomputeQuarantinedExecutionCount(store)
	persistCreSimulatorTriggerStateStore(store)
}

export function recordCronTriggerRun(
	store: CreSimulatorTriggerStateStore,
	triggerName: string,
	lastRunAtMs: number,
): void {
	store.schedulerCursorByName.set(triggerName, { lastRunAtMs })
	persistCreSimulatorTriggerStateStore(store)
}

export function recordEvmLogTriggerCursor(
	store: CreSimulatorTriggerStateStore,
	triggerName: string,
	cursor: CreSimulatorListenerCursor,
	nowMs: number,
): void {
	store.listenerCursorByName.set(triggerName, cursor)
	persistCreSimulatorTriggerStateStore(store)
	void nowMs
}
