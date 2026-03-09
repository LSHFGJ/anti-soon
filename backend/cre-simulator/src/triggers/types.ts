import type {
	CreSimulatorAdapterBinding,
	CreSimulatorAdapterKey,
	CreSimulatorAdapterRequest,
	CreSimulatorAdapterResult,
} from "../adapter-types";

export const TRIGGER_CONFIG_SCHEMA_VERSION =
	"anti-soon.cre-simulator.trigger-config.v1" as const;

export type CreSimulatorTriggerType = "http" | "cron" | "evm-log";

export type CreSimulatorTriggerBinding = {
	configPath: string;
	stateFilePath: string;
};

export type CreSimulatorTriggerExecutionStatus =
	| "pending"
	| "processing"
	| "completed"
	| "quarantined";

export type CreSimulatorTriggerExecutionIdentity = {
	triggerName: string;
	triggerType: CreSimulatorTriggerType;
};

export type CreSimulatorTriggerExecutionState =
	CreSimulatorTriggerExecutionIdentity & {
		status: CreSimulatorTriggerExecutionStatus;
		updatedAtMs: number;
		lastError?: string;
	};

export type CreSimulatorSchedulerCursor = {
	lastRunAtMs: number;
};

export type CreSimulatorListenerCursor = {
	lastSeenBlockNumber?: bigint;
	lastEventKey?: string;
};

export type CreSimulatorProjectDeadlineSchedule = {
	projectId: string;
	commitDeadlineMs: number;
	revealDeadlineMs: number;
};

export type CreSimulatorDeadlineJobType =
	| "project-commit-deadline"
	| "submission-reveal-deadline";

export type CreSimulatorDeadlineJob = {
	jobKey: string;
	jobType: CreSimulatorDeadlineJobType;
	projectId: string;
	dueAtMs: number;
	submissionId?: string;
	juryRoundId?: string;
};

export type CreSimulatorTriggerAdapterBinding = CreSimulatorAdapterBinding;

export type CreSimulatorHttpTriggerConfig =
	CreSimulatorTriggerAdapterBinding & {
		triggerName: string;
	};

export type CreSimulatorCronTriggerConfig =
	CreSimulatorTriggerAdapterBinding & {
		triggerName: string;
		intervalMs: number;
	};

export type CreSimulatorEvmLogTriggerConfig =
	CreSimulatorTriggerAdapterBinding & {
		triggerName: string;
		wsRpcUrlEnvVar: string;
		contractAddress: `0x${string}`;
		topic0: `0x${string}`;
	};

export type CreSimulatorTriggerConfig = {
	schemaVersion: typeof TRIGGER_CONFIG_SCHEMA_VERSION;
	configPath: string;
	stateFilePath: string;
	httpTriggers: CreSimulatorHttpTriggerConfig[];
	cronTriggers: CreSimulatorCronTriggerConfig[];
	evmLogTriggers: CreSimulatorEvmLogTriggerConfig[];
};

export type CreSimulatorTriggerRequest = {
	triggerName: string;
	triggerType?: CreSimulatorTriggerType;
	repoRoot?: string;
	configPath?: string;
	cwd?: string;
	evidenceDir?: string;
	evmTxHash?: `0x${string}`;
	evmEventIndex?: number;
	adapterConfig?: CreSimulatorAdapterRequest["adapterConfig"];
	inputPayload?: CreSimulatorAdapterRequest["inputPayload"];
	metadata?: Record<string, unknown>;
};

export type CreSimulatorTriggerDispatchResult = {
	triggerType: CreSimulatorTriggerType;
	triggerName: string;
	adapter: CreSimulatorAdapterKey;
	executionKey: string;
	deduped: boolean;
	result: CreSimulatorAdapterResult | { command: "status"; result: unknown };
};

export type CreSimulatorTriggerStatusPayload = {
	healthy: boolean;
	configPath: string;
	stateFilePath: string;
	recoveredProcessingCount: number;
	quarantinedExecutionCount: number;
	httpTriggers: Array<{
		triggerName: string;
		adapter: CreSimulatorAdapterKey;
	}>;
	cronTriggers: Array<{
		triggerName: string;
		adapter: CreSimulatorAdapterKey;
		intervalMs: number;
		lastRunAtMs?: number;
	}>;
	evmLogTriggers: Array<{
		triggerName: string;
		adapter: CreSimulatorAdapterKey;
		contractAddress: `0x${string}`;
		topic0: `0x${string}`;
		lastSeenBlockNumber?: string;
		lastEventKey?: string;
	}>;
};

export type CreSimulatorEvmLogEvent = {
	address: `0x${string}`;
	topics?: readonly `0x${string}`[];
	topic0: `0x${string}`;
	txHash: `0x${string}`;
	logIndex: number;
	blockNumber: bigint;
};
