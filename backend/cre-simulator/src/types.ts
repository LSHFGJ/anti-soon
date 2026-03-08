import type { EnvRecord } from "./operator/config"
import type {
	DemoOperatorServiceDependencies,
	DemoOperatorServiceRequest,
} from "./operator/service"
import type {
	CreSimulatorTriggerDispatchResult,
	CreSimulatorTriggerRequest,
	CreSimulatorTriggerStatusPayload,
} from "./triggers/types"

export type CreSimulatorCommand = DemoOperatorServiceRequest["command"]

export type CreSimulatorCommandRequest = {
	command: CreSimulatorCommand
	repoRoot?: string
	cwd?: string
	scenarioPath?: string
	stateFilePath?: string
	evidenceDir?: string
}

export type CreSimulatorCommandResult = {
	command: CreSimulatorCommand
	scenarioPath: string
	result: unknown
}

export type CreSimulatorTriggerResult = CreSimulatorTriggerDispatchResult

export type CreSimulatorTriggerStatusResult = CreSimulatorTriggerStatusPayload

export type CreSimulatorServiceDependencies = {
	executeDemoOperator?: (args: {
		request: DemoOperatorServiceRequest
		env: EnvRecord
		cwd: string
	}) => Promise<unknown>
	demoOperatorDeps?: DemoOperatorServiceDependencies
	executeCommand?: CreSimulatorExecuteCommand
}

export type CreSimulatorExecuteCommand = (
	request: CreSimulatorCommandRequest,
) => Promise<CreSimulatorCommandResult>

export type CreSimulatorExecuteTrigger = (
	request: CreSimulatorTriggerRequest,
) => Promise<CreSimulatorTriggerResult>

export type CreSimulatorGetTriggerStatus = (request: {
	repoRoot?: string
	configPath?: string
}) => Promise<CreSimulatorTriggerStatusResult>
