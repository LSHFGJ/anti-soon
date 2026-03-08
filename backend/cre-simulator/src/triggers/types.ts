import type { CreSimulatorCommand, CreSimulatorCommandResult } from "../types"

export const TRIGGER_CONFIG_SCHEMA_VERSION =
	"anti-soon.cre-simulator.trigger-config.v1" as const

export type CreSimulatorTriggerType = "http" | "cron" | "evm-log"

export type CreSimulatorTriggerBinding = {
	configPath: string
	stateFilePath: string
}

export type CreSimulatorTriggerExecutionStatus =
	| "pending"
	| "processing"
	| "completed"
	| "quarantined"

export type CreSimulatorTriggerExecutionIdentity = {
	triggerName: string
	triggerType: CreSimulatorTriggerType
}

export type CreSimulatorTriggerExecutionState = CreSimulatorTriggerExecutionIdentity & {
	status: CreSimulatorTriggerExecutionStatus
	updatedAtMs: number
	lastError?: string
}

export type CreSimulatorSchedulerCursor = {
	lastRunAtMs: number
}

export type CreSimulatorListenerCursor = {
	lastSeenBlockNumber?: bigint
	lastEventKey?: string
}

export type CreSimulatorTriggerCommandMapping = {
	command: CreSimulatorCommand
	scenarioPath?: string
	stateFilePath?: string
	evidenceDir?: string
}

export type CreSimulatorHttpTriggerConfig = CreSimulatorTriggerCommandMapping & {
	triggerName: string
}

export type CreSimulatorCronTriggerConfig = CreSimulatorTriggerCommandMapping & {
	triggerName: string
	intervalMs: number
}

export type CreSimulatorEvmLogTriggerConfig = CreSimulatorTriggerCommandMapping & {
	triggerName: string
	wsRpcUrlEnvVar: string
	contractAddress: `0x${string}`
	topic0: `0x${string}`
}

export type CreSimulatorTriggerConfig = {
	schemaVersion: typeof TRIGGER_CONFIG_SCHEMA_VERSION
	configPath: string
	stateFilePath: string
	httpTriggers: CreSimulatorHttpTriggerConfig[]
	cronTriggers: CreSimulatorCronTriggerConfig[]
	evmLogTriggers: CreSimulatorEvmLogTriggerConfig[]
}

export type CreSimulatorTriggerRequest = {
	triggerName: string
	triggerType?: CreSimulatorTriggerType
	repoRoot?: string
	configPath?: string
	cwd?: string
	scenarioPath?: string
	stateFilePath?: string
	evidenceDir?: string
	metadata?: Record<string, unknown>
}

export type CreSimulatorTriggerDispatchResult = {
	triggerType: CreSimulatorTriggerType
	triggerName: string
	command: CreSimulatorCommand
	executionKey: string
	deduped: boolean
	result: CreSimulatorCommandResult
}

export type CreSimulatorTriggerStatusPayload = {
	healthy: boolean
	configPath: string
	stateFilePath: string
	recoveredProcessingCount: number
	quarantinedExecutionCount: number
	httpTriggers: Array<{
		triggerName: string
		command: CreSimulatorCommand
	}>
	cronTriggers: Array<{
		triggerName: string
		command: CreSimulatorCommand
		intervalMs: number
		lastRunAtMs?: number
	}>
	evmLogTriggers: Array<{
		triggerName: string
		command: CreSimulatorCommand
		contractAddress: `0x${string}`
		topic0: `0x${string}`
		lastSeenBlockNumber?: string
		lastEventKey?: string
	}>
}

export type CreSimulatorEvmLogEvent = {
	address: `0x${string}`
	topic0: `0x${string}`
	txHash: `0x${string}`
	logIndex: number
	blockNumber: bigint
}
