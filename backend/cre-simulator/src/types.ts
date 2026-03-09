import type {
	AutoRevealRelayerAdapterConfig,
	CreSimulatorAdapterExecutor,
	CreSimulatorAdapterKey,
	CreSimulatorAdapterRequest,
	CreSimulatorAdapterResult,
	CreWorkflowSimulateAdapterConfig,
	DemoAdjudicationOrchestratorAdapterConfig,
	JuryOrchestratorRunOnceAdapterConfig,
} from "./adapter-types";
import type {
	CreSimulatorTriggerDispatchResult,
	CreSimulatorTriggerRequest,
	CreSimulatorTriggerStatusPayload,
} from "./triggers/types";

export type CreSimulatorStatusRequest = {
	repoRoot?: string;
	cwd?: string;
	scenarioPath?: string;
	stateFilePath?: string;
	evidenceDir?: string;
	configPath?: string;
};

export type CreSimulatorStatusResult = {
	command: "status";
	result: unknown;
};

export type CreSimulatorExecuteStatus = (
	request: CreSimulatorStatusRequest,
) => Promise<CreSimulatorStatusResult>;

export type CreSimulatorTriggerResult = CreSimulatorTriggerDispatchResult;

export type CreSimulatorTriggerStatusResult = CreSimulatorTriggerStatusPayload;

export type CreSimulatorServiceDependencies = {
	adapterExecutors?: Partial<
		Record<CreSimulatorAdapterKey, CreSimulatorAdapterExecutor>
	>;
	executeAdapter?: CreSimulatorExecuteAdapter;
	executeStatus?: CreSimulatorExecuteStatus;
};

export type CreSimulatorExecuteAdapter = (
	request: CreSimulatorAdapterRequest,
) => Promise<CreSimulatorAdapterResult>;

export type CreSimulatorExecuteTrigger = (
	request: CreSimulatorTriggerRequest,
) => Promise<CreSimulatorTriggerResult>;

export type CreSimulatorGetTriggerStatus = (request: {
	repoRoot?: string;
	configPath?: string;
}) => Promise<CreSimulatorTriggerStatusResult>;

export type {
	AutoRevealRelayerAdapterConfig,
	CreSimulatorAdapterKey,
	CreSimulatorAdapterRequest,
	CreSimulatorAdapterResult,
	CreWorkflowSimulateAdapterConfig,
	DemoAdjudicationOrchestratorAdapterConfig,
	JuryOrchestratorRunOnceAdapterConfig,
};
