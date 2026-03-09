import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
	aggregateCollectedJuryOpinions,
	collectHumanJurorOpinionRecords,
	collectLlmJurorOpinionRecords,
	defaultInvokeLlmJuror,
	type ExecuteJuryRoundArgs,
	type HumanOpinionInput,
	type JuryRoundContext,
	type JuryRoundDeps,
	type PersistedJurorOpinionRecord,
	prepareJuryRoundContext,
} from "../../../workflow/jury-orchestrator/run-once";
import {
	decideVerifyPocStrictGate,
	decodeVerifyPocReportEnvelope,
} from "../../../workflow/verify-poc/main";
import {
	createOasisClient,
	type OasisReadRequest,
	type OasisResult,
	type OasisWriteRequest,
} from "../../../workflow/verify-poc/src/oasisClient";
import type {
	DemoAdjudicationOrchestratorAdapterConfig,
	DemoAdjudicationOrchestratorInputPayload,
	DemoPocstoreOpinionRecordInput,
} from "./adapter-types";
import type { EnvRecord } from "./env";
import {
	buildDefaultCreSimulatorTriggerConfigPath,
	loadCreSimulatorTriggerConfig,
} from "./triggers/config";
import {
	getProjectDeadlineSchedule,
	loadCreSimulatorTriggerStateStore,
	scheduleSubmissionRevealDeadlineJob,
} from "./triggers/stateStore";

const DEFAULT_DEMO_POCSTORE_PATH =
	"backend/cre-simulator/.demo-adjudication-pocstore.json";

type DemoRuntimeConfig = {
	workflowConfig: unknown;
	rosterSelection: ExecuteJuryRoundArgs["rosterSelection"];
	oasisPointer: ExecuteJuryRoundArgs["oasisPointer"];
	llm?: {
		apiUrl?: string;
		apiKeyEnvVar?: string;
	};
};

type StoredPendingRound = {
	roundKey: string;
	submissionId: string;
	projectId: string;
	juryRoundId: string;
	verifiedReport: unknown;
	llmSealedOpinions: Array<Record<string, unknown>>;
};

type DemoPocstoreState = {
	humanOpinions: Array<
		DemoPocstoreOpinionRecordInput & {
			createdAtMs: number;
		}
	>;
	pendingRounds: StoredPendingRound[];
};

type DemoAdjudicationDeps = {
	nowMs?: () => number;
	collectLlmOpinions?: (
		args: ExecuteJuryRoundArgs,
		context: JuryRoundContext,
	) => Promise<PersistedJurorOpinionRecord[]>;
	collectHumanOpinions?: (
		args: ExecuteJuryRoundArgs,
		context: JuryRoundContext,
		humanOpinions: HumanOpinionInput[],
	) => Promise<PersistedJurorOpinionRecord[]>;
	aggregateOpinions?: (
		args: ExecuteJuryRoundArgs,
		context: JuryRoundContext,
		sealedOpinions: PersistedJurorOpinionRecord[],
	) => Promise<{
		finalReportType: string;
		encodedContractReport?: `0x${string}`;
		submissionTxHash?: `0x${string}`;
		totalSealedOpinions?: number;
	}>;
	invokeLlmJuror?: JuryRoundDeps["invokeLlmJuror"];
	oasisWrite?: (payload: OasisWriteRequest) => Promise<
		OasisResult<{
			ok: true;
			pointer: { chain: string; contract: string; slotId: string };
		}>
	>;
	oasisRead?: (
		payload: OasisReadRequest,
	) => Promise<OasisResult<{ ok: true; ciphertext: string; iv: string }>>;
};

function ensureParentDirectory(filePath: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
}

function normalizeRelativePath(value: string, label: string): string {
	if (value.startsWith("/") || value.includes("..")) {
		throw new Error(`${label} must stay within repoRoot`);
	}
	return value;
}

function normalizePositiveBigIntLike(value: unknown, label: string): bigint {
	const normalized = BigInt(value as bigint | number | string);
	if (normalized <= 0n) {
		throw new Error(`${label} must be positive`);
	}
	return normalized;
}

function resolveRuntimeEnvVar(env: EnvRecord, key: string): string | undefined {
	const explicit = env[key]?.trim();
	if (explicit) {
		return explicit;
	}

	const processValue = process.env[key]?.trim();
	return processValue && processValue.length > 0 ? processValue : undefined;
}

function loadRuntimeConfig(
	repoRoot: string,
	configPath: string,
): DemoRuntimeConfig {
	const resolvedConfigPath = resolve(
		repoRoot,
		normalizeRelativePath(configPath, "configPath"),
	);
	return JSON.parse(
		readFileSync(resolvedConfigPath, "utf8"),
	) as DemoRuntimeConfig;
}

function resolvePocstorePath(
	repoRoot: string,
	config: DemoAdjudicationOrchestratorAdapterConfig,
): string {
	return resolve(
		repoRoot,
		normalizeRelativePath(
			config.pocstorePath ?? DEFAULT_DEMO_POCSTORE_PATH,
			"pocstorePath",
		),
	);
}

function loadPocstoreState(filePath: string): DemoPocstoreState {
	if (!existsSync(filePath)) {
		return { humanOpinions: [], pendingRounds: [] };
	}

	const parsed = JSON.parse(
		readFileSync(filePath, "utf8"),
	) as DemoPocstoreState;
	return {
		humanOpinions: Array.isArray(parsed.humanOpinions)
			? parsed.humanOpinions
			: [],
		pendingRounds: Array.isArray(parsed.pendingRounds)
			? parsed.pendingRounds
			: [],
	};
}

function savePocstoreState(filePath: string, state: DemoPocstoreState): void {
	ensureParentDirectory(filePath);
	writeFileSync(
		filePath,
		`${JSON.stringify(state, (_key, value) =>
			typeof value === "bigint" ? value.toString() : value,
		)}\n`,
		"utf8",
	);
}

function parseInputPayload(
	value: unknown,
): DemoAdjudicationOrchestratorInputPayload {
	if (typeof value !== "object" || value === null) {
		throw new Error(
			"demo-adjudication-orchestrator requires inputPayload object",
		);
	}

	const payload = value as Record<string, unknown>;
	if (
		payload.phase !== "store-human-opinion" &&
		payload.phase !== "commit-deadline" &&
		payload.phase !== "reveal-deadline"
	) {
		throw new Error(
			"demo-adjudication-orchestrator inputPayload.phase must be store-human-opinion, commit-deadline, or reveal-deadline",
		);
	}

	return payload as DemoAdjudicationOrchestratorInputPayload;
}

function parseStoredPersistedOpinionRecord(
	value: Record<string, unknown>,
): PersistedJurorOpinionRecord {
	return {
		slotIndex: Number(value.slotIndex),
		cohort: value.cohort === "HUMAN" ? "HUMAN" : "LLM",
		jurorId: String(value.jurorId),
		finalValidity:
			value.finalValidity === "MEDIUM"
				? "MEDIUM"
				: value.finalValidity === "INVALID"
					? "INVALID"
					: "HIGH",
		rationaleDigest: String(value.rationaleDigest) as `0x${string}`,
		testimonyDigest: String(value.testimonyDigest) as `0x${string}`,
		ingestTimestampSec: BigInt(value.ingestTimestampSec as string | number),
	};
}

function buildRoundKey(submissionId: bigint, juryRoundId: bigint): string {
	return `${submissionId.toString()}:${juryRoundId.toString()}`;
}

function buildRoundArgs(args: {
	runtimeConfig: DemoRuntimeConfig;
	verifiedReport: ExecuteJuryRoundArgs["verifiedReport"];
	juryRoundId: bigint;
}): ExecuteJuryRoundArgs {
	return {
		workflowConfig: args.runtimeConfig.workflowConfig,
		verifiedReport: args.verifiedReport,
		juryRoundId: args.juryRoundId,
		rosterSelection: args.runtimeConfig.rosterSelection,
		humanOpinions: [],
		oasisPointer: args.runtimeConfig.oasisPointer,
	};
}

function buildRuntimePhaseDeps(
	runtimeConfig: DemoRuntimeConfig,
	env: EnvRecord,
	deps: DemoAdjudicationDeps,
): {
	collectLlmOpinions: NonNullable<DemoAdjudicationDeps["collectLlmOpinions"]>;
	collectHumanOpinions: NonNullable<
		DemoAdjudicationDeps["collectHumanOpinions"]
	>;
	aggregateOpinions: NonNullable<DemoAdjudicationDeps["aggregateOpinions"]>;
} {
	let oasisClient: ReturnType<typeof createOasisClient> | undefined;
	const getOasisClient = () => {
		const oasisApiUrl = resolveRuntimeEnvVar(env, "OASIS_API_URL");
		if (!oasisApiUrl) {
			throw new Error("Missing required environment variable: OASIS_API_URL");
		}
		oasisClient ??= createOasisClient({ baseUrl: oasisApiUrl });
		return oasisClient;
	};
	const requireOasisWrite = () => {
		if (deps.oasisWrite) {
			return deps.oasisWrite;
		}
		return (payload: OasisWriteRequest) => getOasisClient().write(payload);
	};
	const requireOasisRead = () => {
		if (deps.oasisRead) {
			return deps.oasisRead;
		}
		return (payload: OasisReadRequest) => getOasisClient().read(payload);
	};
	const llmApiUrl =
		runtimeConfig.llm?.apiUrl ??
		"https://openrouter.ai/api/v1/chat/completions";
	const llmApiKeyEnvVar =
		runtimeConfig.llm?.apiKeyEnvVar ?? "CRE_SIM_LLM_API_KEY";
	const llmApiKey = resolveRuntimeEnvVar(env, llmApiKeyEnvVar);

	const collectLlmOpinions = deps.collectLlmOpinions
		? deps.collectLlmOpinions
		: async (roundArgs, context) => {
				if (!llmApiKey && !deps.invokeLlmJuror) {
					throw new Error(
						`Missing required environment variable: ${llmApiKeyEnvVar}`,
					);
				}

				return await collectLlmJurorOpinionRecords(roundArgs, context, {
					invokeLlmJuror:
						deps.invokeLlmJuror ??
						((input) =>
							defaultInvokeLlmJuror({
								...input,
								apiUrl: llmApiUrl,
								apiKey: llmApiKey ?? "",
							})),
					oasisWrite: requireOasisWrite(),
					oasisRead: requireOasisRead(),
				});
			};

	const collectHumanOpinions = deps.collectHumanOpinions
		? deps.collectHumanOpinions
		: async (roundArgs, context, humanOpinions) =>
				await collectHumanJurorOpinionRecords(
					roundArgs,
					context,
					humanOpinions,
					{
						oasisWrite: requireOasisWrite(),
						oasisRead: requireOasisRead(),
					},
				);

	const aggregateOpinions = deps.aggregateOpinions
		? deps.aggregateOpinions
		: async (roundArgs, context, sealedOpinions) => {
				const result = await aggregateCollectedJuryOpinions(
					roundArgs,
					context,
					sealedOpinions,
				);
				return {
					finalReportType: result.finalResult.reportType,
					encodedContractReport: result.encodedContractReport,
					submissionTxHash: result.reportSubmission?.txHash,
					totalSealedOpinions: sealedOpinions.length,
				};
			};

	return {
		collectLlmOpinions,
		collectHumanOpinions,
		aggregateOpinions,
	};
}

function storeHumanOpinion(args: {
	state: DemoPocstoreState;
	opinion: DemoPocstoreOpinionRecordInput;
	createdAtMs: number;
}): DemoPocstoreState {
	return {
		...args.state,
		humanOpinions: [
			...args.state.humanOpinions,
			{ ...args.opinion, createdAtMs: args.createdAtMs },
		],
	};
}

function replacePendingRound(
	state: DemoPocstoreState,
	record: StoredPendingRound,
): DemoPocstoreState {
	return {
		...state,
		pendingRounds: [
			...state.pendingRounds.filter(
				(entry) => entry.roundKey !== record.roundKey,
			),
			record,
		],
	};
}

function scheduleRevealDeadlineJobForPendingRound(args: {
	repoRoot: string;
	projectId: bigint;
	submissionId: bigint;
	juryRoundId: bigint;
	nowMs: number;
}): number | undefined {
	const configPath = buildDefaultCreSimulatorTriggerConfigPath(args.repoRoot);
	const config = loadCreSimulatorTriggerConfig(configPath, args.repoRoot);
	const binding = {
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
	};
	const store = loadCreSimulatorTriggerStateStore(
		config.stateFilePath,
		binding,
		args.nowMs,
	);
	const schedule = getProjectDeadlineSchedule(store, args.projectId);
	if (!schedule) {
		return undefined;
	}

	scheduleSubmissionRevealDeadlineJob(store, {
		projectId: args.projectId,
		submissionId: args.submissionId,
		juryRoundId: args.juryRoundId,
		dueAtMs: schedule.revealDeadlineMs,
	});
	return schedule.revealDeadlineMs;
}

export async function executeDemoAdjudicationAdapter(
	args: {
		repoRoot: string;
		env: EnvRecord;
		adapterConfig: DemoAdjudicationOrchestratorAdapterConfig;
		inputPayload?: unknown;
	},
	deps: DemoAdjudicationDeps = {},
) {
	const payload = parseInputPayload(args.inputPayload);
	const pocstorePath = resolvePocstorePath(args.repoRoot, args.adapterConfig);
	const nowMs = deps.nowMs?.() ?? Date.now();
	const state = loadPocstoreState(pocstorePath);

	if (payload.phase === "store-human-opinion") {
		const nextState = storeHumanOpinion({
			state,
			opinion: payload.opinion,
			createdAtMs: nowMs,
		});
		savePocstoreState(pocstorePath, nextState);
		return {
			mode: "demo-adjudication-orchestrator" as const,
			phase: payload.phase,
			storedOpinionCount: nextState.humanOpinions.length,
			submissionId: String(payload.opinion.submissionId),
		};
	}

	if (payload.phase === "commit-deadline") {
		const verifyPocReport = decodeVerifyPocReportEnvelope(
			payload.verifyPocReport,
		);
		const strictGate = decideVerifyPocStrictGate({
			isValid: verifyPocReport.payload.isValid,
			reasonCode:
				verifyPocReport.reportType === "verified-report/v3"
					? verifyPocReport.adjudication.reasonCode
					: undefined,
		});
		if (strictGate.outcome !== "EMIT_EVIDENCE") {
			return {
				mode: "demo-adjudication-orchestrator" as const,
				phase: payload.phase,
				strictGateOutcome: strictGate.outcome,
				juryTriggered: false,
			};
		}
		if (verifyPocReport.reportType !== "verified-report/v3") {
			throw new Error(
				"commit-deadline demo requires a verified-report/v3 strict-fail evidence envelope",
			);
		}

		const runtimeConfig = loadRuntimeConfig(
			args.repoRoot,
			args.adapterConfig.configPath,
		);
		const juryRoundId = payload.juryRoundId
			? normalizePositiveBigIntLike(payload.juryRoundId, "juryRoundId")
			: 1n;
		const roundArgs = buildRoundArgs({
			runtimeConfig,
			verifiedReport: verifyPocReport,
			juryRoundId,
		});
		const context = prepareJuryRoundContext(roundArgs);
		const runtimeDeps = buildRuntimePhaseDeps(runtimeConfig, args.env, deps);
		const llmSealedOpinions = await runtimeDeps.collectLlmOpinions(
			roundArgs,
			context,
		);
		const roundKey = buildRoundKey(
			verifyPocReport.payload.submissionId,
			juryRoundId,
		);
		const nextState = replacePendingRound(state, {
			roundKey,
			submissionId: verifyPocReport.payload.submissionId.toString(),
			projectId: verifyPocReport.payload.projectId.toString(),
			juryRoundId: juryRoundId.toString(),
			verifiedReport: verifyPocReport,
			llmSealedOpinions,
		});
		savePocstoreState(pocstorePath, nextState);
		const scheduledRevealDeadlineAtMs =
			scheduleRevealDeadlineJobForPendingRound({
				repoRoot: args.repoRoot,
				projectId: verifyPocReport.payload.projectId,
				submissionId: verifyPocReport.payload.submissionId,
				juryRoundId,
				nowMs,
			});
		return {
			mode: "demo-adjudication-orchestrator" as const,
			phase: payload.phase,
			strictGateOutcome: strictGate.outcome,
			juryTriggered: true,
			storedLlmOpinionCount: llmSealedOpinions.length,
			roundKey,
			...(scheduledRevealDeadlineAtMs !== undefined
				? { scheduledRevealDeadlineAtMs }
				: {}),
		};
	}

	const submissionId = normalizePositiveBigIntLike(
		payload.submissionId,
		"submissionId",
	);
	const juryRoundId = payload.juryRoundId
		? normalizePositiveBigIntLike(payload.juryRoundId, "juryRoundId")
		: 1n;
	const roundKey = buildRoundKey(submissionId, juryRoundId);
	const round = state.pendingRounds.find(
		(entry) => entry.roundKey === roundKey,
	);
	if (!round) {
		throw new Error(`No pending LLM jury round stored for ${roundKey}`);
	}

	const runtimeConfig = loadRuntimeConfig(
		args.repoRoot,
		args.adapterConfig.configPath,
	);
	const verifiedReport = decodeVerifyPocReportEnvelope(round.verifiedReport);
	if (verifiedReport.reportType !== "verified-report/v3") {
		throw new Error(
			"reveal-deadline demo requires a verified-report/v3 strict-fail evidence envelope",
		);
	}
	const roundArgs = buildRoundArgs({
		runtimeConfig,
		verifiedReport,
		juryRoundId,
	});
	const context = prepareJuryRoundContext(roundArgs);
	const matchingHumanOpinions = state.humanOpinions
		.filter(
			(entry) => BigInt(entry.submissionId as string | number) === submissionId,
		)
		.sort((left, right) => left.createdAtMs - right.createdAtMs)
		.slice(0, context.humanSlots.length);
	if (matchingHumanOpinions.length < context.humanSlots.length) {
		throw new Error(
			"reveal-deadline demo requires at least 5 stored human opinions",
		);
	}

	const selectedHumanOpinionAuthors = matchingHumanOpinions.map((entry) =>
		entry.author?.trim().length ? entry.author : "anonymous",
	);
	const mappedHumanOpinions: HumanOpinionInput[] = matchingHumanOpinions.map(
		(opinion, index) => ({
			jurorId: context.humanSlots[index]?.jurorId ?? `human:${index}`,
			finalValidity: opinion.finalValidity,
			rationale: opinion.rationale,
			testimony: opinion.testimony,
		}),
	);
	const runtimeDeps = buildRuntimePhaseDeps(runtimeConfig, args.env, deps);
	const persistedHumanOpinions = await runtimeDeps.collectHumanOpinions(
		roundArgs,
		context,
		mappedHumanOpinions,
	);
	const llmSealedOpinions = round.llmSealedOpinions.map((entry) =>
		parseStoredPersistedOpinionRecord(entry),
	);
	const aggregation = await runtimeDeps.aggregateOpinions(roundArgs, context, [
		...llmSealedOpinions,
		...persistedHumanOpinions,
	]);
	return {
		mode: "demo-adjudication-orchestrator" as const,
		phase: payload.phase,
		strictGateOutcome: "EMIT_EVIDENCE" as const,
		selectedHumanOpinionAuthors,
		sourcedHumanOpinionCount: matchingHumanOpinions.length,
		finalReportType: aggregation.finalReportType,
		encodedContractReport: aggregation.encodedContractReport,
		submissionTxHash: aggregation.submissionTxHash,
		totalSealedOpinions:
			aggregation.totalSealedOpinions ??
			llmSealedOpinions.length + persistedHumanOpinions.length,
	};
}
