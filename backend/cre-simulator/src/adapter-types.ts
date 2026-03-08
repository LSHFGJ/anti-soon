import type { EnvRecord } from "./env"

export type CreSimulatorAdapterKey = "auto-reveal-relayer" | "cre-workflow-simulate"

export type CreWorkflowSimulateAdapterConfig = {
	workflowPath: string
	target: string
	triggerIndex: number
	evmInput?: "event-coordinates"
	idempotencyStorePath?: string
}

export type AutoRevealRelayerAdapterConfig = {
	configPath?: string
}

export type CreSimulatorAdapterBinding = {
	adapter: CreSimulatorAdapterKey
	adapterConfig?: CreWorkflowSimulateAdapterConfig | AutoRevealRelayerAdapterConfig
	evidenceDir?: string
}

export type CreSimulatorAdapterRequest = CreSimulatorAdapterBinding & {
	repoRoot?: string
	cwd?: string
	scenarioPath?: string
	stateFilePath?: string
	evmTxHash?: `0x${string}`
	evmEventIndex?: number
}

export type CreSimulatorAdapterResult = {
	adapter: CreSimulatorAdapterKey
	result: unknown
}

export type CreSimulatorAdapterExecutor = (args: {
	repoRoot: string
	env: EnvRecord
	evidenceDir?: string
	adapterConfig?: CreWorkflowSimulateAdapterConfig | AutoRevealRelayerAdapterConfig
	evmTxHash?: `0x${string}`
	evmEventIndex?: number
}) => Promise<unknown>
