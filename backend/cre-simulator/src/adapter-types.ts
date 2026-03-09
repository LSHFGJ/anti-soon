import type { EnvRecord } from "./env";

export type CreSimulatorAdapterKey =
	| "auto-reveal-relayer"
	| "cre-workflow-simulate"
	| "jury-orchestrator-run-once"
	| "demo-adjudication-orchestrator";

export type CreWorkflowSimulateAdapterConfig = {
	workflowPath: string;
	target: string;
	triggerIndex: number;
	evmInput?: "event-coordinates";
	idempotencyStorePath?: string;
};

export type JuryOrchestratorRunOnceAdapterConfig = {
	configPath: string;
};

export type JuryOrchestratorRunOnceInputPayload = {
	verifiedReport: unknown;
	humanOpinions: unknown;
	juryRoundId?: unknown;
};

export type DemoPocstoreOpinionRecordInput = {
	submissionId: unknown;
	projectId: unknown;
	author?: string;
	finalValidity: "HIGH" | "MEDIUM" | "INVALID";
	rationale: string;
	testimony: string;
};

export type DemoAdjudicationOrchestratorInputPayload =
	| {
			phase: "store-human-opinion";
			opinion: DemoPocstoreOpinionRecordInput;
	  }
	| {
			phase: "commit-deadline";
			verifyPocReport: unknown;
			juryRoundId?: unknown;
	  }
	| {
			phase: "reveal-deadline";
			submissionId: unknown;
			juryRoundId?: unknown;
	  };

export type DemoAdjudicationOrchestratorAdapterConfig = {
	configPath: string;
	pocstorePath?: string;
};

export type AutoRevealRelayerAdapterConfig = {
	configPath?: string;
};

export type CreSimulatorAdapterBinding = {
	adapter: CreSimulatorAdapterKey;
	adapterConfig?:
		| CreWorkflowSimulateAdapterConfig
		| AutoRevealRelayerAdapterConfig
		| JuryOrchestratorRunOnceAdapterConfig
		| DemoAdjudicationOrchestratorAdapterConfig;
	evidenceDir?: string;
};

export type CreSimulatorAdapterRequest = CreSimulatorAdapterBinding & {
	repoRoot?: string;
	cwd?: string;
	scenarioPath?: string;
	stateFilePath?: string;
	evmTxHash?: `0x${string}`;
	evmEventIndex?: number;
	inputPayload?:
		| JuryOrchestratorRunOnceInputPayload
		| DemoAdjudicationOrchestratorInputPayload;
};

export type CreSimulatorAdapterResult = {
	adapter: CreSimulatorAdapterKey;
	result: unknown;
};

export type CreSimulatorAdapterExecutor = (args: {
	repoRoot: string;
	env: EnvRecord;
	evidenceDir?: string;
	adapterConfig?:
		| CreWorkflowSimulateAdapterConfig
		| AutoRevealRelayerAdapterConfig
		| JuryOrchestratorRunOnceAdapterConfig
		| DemoAdjudicationOrchestratorAdapterConfig;
	evmTxHash?: `0x${string}`;
	evmEventIndex?: number;
	inputPayload?:
		| JuryOrchestratorRunOnceInputPayload
		| DemoAdjudicationOrchestratorInputPayload;
}) => Promise<unknown>;
