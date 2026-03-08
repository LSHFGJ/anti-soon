import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type {
	MultiDeadlineRuntime,
	MultiProjectSnapshot,
	MultiQueuedRevealLog,
	MultiQueuedRevealSnapshot,
	MultiSubmissionSnapshot,
} from "../../../../../workflow/auto-reveal-relayer/multi-deadline";
import {
	type EnvRecord as AutoRevealEnvRecord,
	loadRunOnceConfig,
	type RunOnceConfig,
	type RunOnceExecutionResult,
	runAutoRevealRelayerCycle,
} from "../../../../../workflow/auto-reveal-relayer/run-once";
import type {
	UniqueCandidateRuntime,
	UniqueCommittedLog,
	UniqueProjectSnapshot,
	UniqueRevealStateSnapshot,
	UniqueSubmissionSnapshot,
} from "../../../../../workflow/auto-reveal-relayer/unique-orchestration";
import {
	type AddressString,
	type BountyHubEventLog,
	type BountyHubTransport,
	createBountyHubClient,
	type HexString,
	type RevealWorkflowTrigger,
} from "../bountyHubClient";
import type { DemoOperatorConfig, EnvRecord } from "../config";
import {
	assertDemoOperatorStateBindingStable,
	assertDemoOperatorStateStoreHealthy,
	claimDurableDemoOperatorStage,
	loadDemoOperatorStateStore,
	markDurableDemoOperatorStageCompleted,
	markDurableDemoOperatorStageQuarantined,
} from "../stateStore";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const PRIVATE_KEY_REGEX = /^0x[a-fA-F0-9]{64}$/;
const RELAYER_CONFIG_PATH = "workflow/auto-reveal-relayer/config.staging.json";
const BOUNTY_HUB_REVEAL_ABI = [
	{
		name: "projects",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_projectId", type: "uint256" }],
		outputs: [
			{
				name: "project",
				type: "tuple",
				components: [
					{ name: "owner", type: "address" },
					{ name: "bountyPool", type: "uint256" },
					{ name: "maxPayoutPerBug", type: "uint256" },
					{ name: "targetContract", type: "address" },
					{ name: "forkBlock", type: "uint256" },
					{ name: "active", type: "bool" },
					{ name: "mode", type: "uint8" },
					{ name: "commitDeadline", type: "uint256" },
					{ name: "revealDeadline", type: "uint256" },
					{ name: "disputeWindow", type: "uint256" },
					{ name: "rulesHash", type: "bytes32" },
					{ name: "vnetStatus", type: "uint8" },
					{ name: "vnetRpcUrl", type: "string" },
					{ name: "baseSnapshotId", type: "bytes32" },
					{ name: "vnetCreatedAt", type: "uint256" },
					{ name: "repoUrl", type: "string" },
				],
			},
		],
	},
	{
		name: "submissions",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [
			{
				name: "submission",
				type: "tuple",
				components: [
					{ name: "auditor", type: "address" },
					{ name: "projectId", type: "uint256" },
					{ name: "commitHash", type: "bytes32" },
					{ name: "cipherURI", type: "string" },
					{ name: "salt", type: "bytes32" },
					{ name: "commitTimestamp", type: "uint256" },
					{ name: "revealTimestamp", type: "uint256" },
					{ name: "status", type: "uint8" },
					{ name: "drainAmountWei", type: "uint256" },
					{ name: "severity", type: "uint8" },
					{ name: "payoutAmount", type: "uint256" },
					{ name: "disputeDeadline", type: "uint256" },
					{ name: "challenged", type: "bool" },
					{ name: "challenger", type: "address" },
					{ name: "challengeBond", type: "uint256" },
				],
			},
		],
	},
	{
		name: "queuedReveals",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [
			{ name: "auditor", type: "address" },
			{ name: "salt", type: "bytes32" },
			{ name: "deadline", type: "uint256" },
			{ name: "queued", type: "bool" },
		],
	},
	{
		name: "uniqueRevealStateByProject",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "_projectId", type: "uint256" }],
		outputs: [
			{ name: "hasCandidate", type: "bool" },
			{ name: "candidateSubmissionId", type: "uint256" },
			{ name: "winnerLocked", type: "bool" },
			{ name: "winnerSubmissionId", type: "uint256" },
		],
	},
	{
		name: "executeQueuedReveal",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [{ name: "_submissionId", type: "uint256" }],
		outputs: [],
	},
	{
		name: "PoCCommitted",
		type: "event",
		anonymous: false,
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "projectId", type: "uint256", indexed: true },
			{ name: "auditor", type: "address", indexed: true },
			{ name: "commitHash", type: "bytes32", indexed: false },
		],
	},
	{
		name: "RevealQueued",
		type: "event",
		anonymous: false,
		inputs: [
			{ name: "submissionId", type: "uint256", indexed: true },
			{ name: "auditor", type: "address", indexed: true },
			{ name: "deadline", type: "uint256", indexed: false },
		],
	},
	{
		name: "PoCRevealed",
		type: "event",
		anonymous: false,
		inputs: [{ name: "submissionId", type: "uint256", indexed: true }],
	},
] as const;

type PersistedDemoOperatorStateFile = {
	stageData?: {
		register?: unknown;
		submit?: unknown;
		reveal?: unknown;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

type AutoRevealWorkflowConfig = {
	bountyHubAddress: AddressString;
};

type SubmissionStatusCode = 0 | 1 | 2 | 3 | 4 | 5;

type NormalizedContractEventLog = {
	eventName: "PoCCommitted" | "RevealQueued" | "PoCRevealed";
	args: Record<string, unknown>;
	transactionHash?: HexString;
	blockNumber?: bigint | number | string;
	logIndex?: bigint | number | string;
};

export type RevealStageProjectSnapshot = {
	mode: "UNIQUE" | "MULTI";
	commitDeadline: bigint;
	revealDeadline: bigint;
};

export type RevealStageResult = {
	submissionId: string;
	revealTxHash: `0x${string}`;
	revealEventIndex: number;
};

export type RevealStageRuntimeBundle = {
	getCurrentTimestampSec: () => Promise<bigint> | bigint;
	readProject: (
		projectId: bigint,
	) => Promise<RevealStageProjectSnapshot> | RevealStageProjectSnapshot;
	runRelayerCycle: () =>
		| Promise<RunOnceExecutionResult>
		| RunOnceExecutionResult;
	findRevealWorkflowTrigger: (
		submissionId: bigint,
	) => Promise<RevealWorkflowTrigger> | RevealWorkflowTrigger;
};

export type RevealStageDependencies = {
	nowMs?: number;
	createRuntimeBundle?: (args: {
		config: DemoOperatorConfig;
		env: EnvRecord;
		runOnceConfig: RunOnceConfig;
	}) => Promise<RevealStageRuntimeBundle> | RevealStageRuntimeBundle;
};

function buildRevealStageResult(
	submissionId: bigint,
	trigger: RevealWorkflowTrigger,
): RevealStageResult {
	if (trigger.submissionId !== submissionId) {
		throw new Error(
			`Reveal trigger submission mismatch: expected ${submissionId.toString()} received ${trigger.submissionId.toString()}`,
		);
	}

	return {
		submissionId: submissionId.toString(),
		revealTxHash: trigger.txHash,
		revealEventIndex: trigger.eventIndex,
	};
}

function isMissingRevealTriggerError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("Missing PoCRevealed event");
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function requiredEnv(env: EnvRecord, key: string): string {
	const value = env[key];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${key}`);
	}

	return value.trim();
}

function ensureParentDirectory(filePath: string): void {
	mkdirSync(dirname(filePath), { recursive: true });
}

function normalizeAddress(value: string, label: string): AddressString {
	if (!ADDRESS_REGEX.test(value)) {
		throw new Error(`${label} must be a valid EVM address`);
	}

	return value.toLowerCase() as AddressString;
}

function normalizeHash(value: string, label: string): HexString {
	if (!HASH_REGEX.test(value)) {
		throw new Error(`${label} must be a 32-byte hex string`);
	}

	return value.toLowerCase() as HexString;
}

function normalizePrivateKey(value: string, label: string): HexString {
	if (!PRIVATE_KEY_REGEX.test(value)) {
		throw new Error(`${label} must be a 32-byte hex private key`);
	}

	return value.toLowerCase() as HexString;
}

function toBigInt(value: unknown, label: string): bigint {
	if (typeof value === "bigint") {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isInteger(value) || value < 0) {
			throw new Error(`${label} must be a non-negative integer`);
		}
		return BigInt(value);
	}
	if (typeof value === "string" && value.length > 0) {
		return BigInt(value);
	}

	throw new Error(`${label} is required`);
}

function toBoolean(value: unknown, label: string): boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${label} must be a boolean`);
	}

	return value;
}

function toNumber(value: unknown, label: string): number {
	const normalized = toBigInt(value, label);
	if (normalized > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER`);
	}

	return Number(normalized);
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		throw new Error(`${label} must contain valid JSON`);
	}

	if (!isObject(parsed)) {
		throw new Error(`${label} must contain a JSON object`);
	}

	return parsed;
}

function readPersistedStateFile(
	filePath: string,
): PersistedDemoOperatorStateFile {
	return parseJsonObject(
		readFileSync(filePath, "utf8"),
		"demo-operator state store",
	);
}

function parsePersistedRegisterProjectId(value: unknown): bigint {
	if (!isObject(value)) {
		throw new Error("Persisted register stage projectId is invalid");
	}

	const projectId = String(value.projectId ?? "");
	if (!/^[0-9]+$/.test(projectId)) {
		throw new Error("Persisted register stage projectId is invalid");
	}

	return BigInt(projectId);
}

function readPersistedRegisterProjectId(filePath: string): bigint {
	if (!existsSync(filePath)) {
		throw new Error("Persisted register stage projectId is invalid");
	}

	const persisted = readPersistedStateFile(filePath);
	return parsePersistedRegisterProjectId(persisted.stageData?.register);
}

function parsePersistedSubmitSubmissionId(value: unknown): bigint {
	if (!isObject(value)) {
		throw new Error("Persisted submit stage data is missing or invalid");
	}

	const submissionId = String(value.submissionId ?? "");
	if (!/^[0-9]+$/.test(submissionId)) {
		throw new Error("Persisted submit stage data is missing or invalid");
	}

	return BigInt(submissionId);
}

function readPersistedSubmitSubmissionId(filePath: string): bigint {
	if (!existsSync(filePath)) {
		throw new Error("Persisted submit stage data is missing or invalid");
	}

	const persisted = readPersistedStateFile(filePath);
	return parsePersistedSubmitSubmissionId(persisted.stageData?.submit);
}

function parsePersistedRevealResult(value: unknown): RevealStageResult {
	if (!isObject(value)) {
		throw new Error("Persisted reveal stage data is missing or invalid");
	}

	const submissionId = String(value.submissionId ?? "");
	if (!/^[0-9]+$/.test(submissionId)) {
		throw new Error("Persisted reveal stage data is missing or invalid");
	}

	const revealEventIndex = Number(value.revealEventIndex);
	if (!Number.isInteger(revealEventIndex) || revealEventIndex < 0) {
		throw new Error("Persisted reveal stage revealEventIndex is invalid");
	}

	return {
		submissionId,
		revealTxHash: normalizeHash(
			String(value.revealTxHash ?? ""),
			"Persisted reveal stage revealTxHash",
		),
		revealEventIndex,
	};
}

function readPersistedRevealResult(filePath: string): RevealStageResult | null {
	if (!existsSync(filePath)) {
		return null;
	}

	const persisted = readPersistedStateFile(filePath);
	return persisted.stageData?.reveal
		? parsePersistedRevealResult(persisted.stageData.reveal)
		: null;
}

function persistRevealResult(
	filePath: string,
	result: RevealStageResult,
): void {
	const persisted = readPersistedStateFile(filePath);
	const nextPayload: PersistedDemoOperatorStateFile = {
		...persisted,
		stageData: {
			...(isObject(persisted.stageData) ? persisted.stageData : {}),
			reveal: result,
		},
	};

	ensureParentDirectory(filePath);
	const tempPath = `${filePath}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
	renameSync(tempPath, filePath);
}

function readAutoRevealWorkflowConfig(
	config: DemoOperatorConfig,
): AutoRevealWorkflowConfig {
	const configPath = resolve(config.repoRoot, RELAYER_CONFIG_PATH);
	const parsed = parseJsonObject(
		readFileSync(configPath, "utf8"),
		RELAYER_CONFIG_PATH,
	);

	return {
		bountyHubAddress: normalizeAddress(
			String(parsed.bountyHubAddress ?? ""),
			`${RELAYER_CONFIG_PATH} bountyHubAddress`,
		),
	};
}

function buildRevealRelayerEnv(
	config: DemoOperatorConfig,
	env: EnvRecord,
	workflowConfig: AutoRevealWorkflowConfig,
): AutoRevealEnvRecord {
	return {
		...env,
		AUTO_REVEAL_PUBLIC_RPC_URL: requiredEnv(
			env,
			"DEMO_OPERATOR_PUBLIC_RPC_URL",
		),
		AUTO_REVEAL_ADMIN_RPC_URL: requiredEnv(env, "DEMO_OPERATOR_ADMIN_RPC_URL"),
		AUTO_REVEAL_PRIVATE_KEY: requiredEnv(
			env,
			config.scenario.identities.operator.privateKeyEnvVar,
		),
		AUTO_REVEAL_BOUNTY_HUB_ADDRESS: workflowConfig.bountyHubAddress,
		AUTO_REVEAL_CHAIN_ID: env.AUTO_REVEAL_CHAIN_ID,
		AUTO_REVEAL_LOOKBACK_BLOCKS: String(
			config.scenario.commandDefaults.reveal.lookbackBlocks,
		),
		AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS: String(
			config.scenario.commandDefaults.reveal.replayOverlapBlocks,
		),
		AUTO_REVEAL_LOG_CHUNK_BLOCKS: String(
			config.scenario.commandDefaults.reveal.logChunkBlocks,
		),
		AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE: String(
			config.scenario.commandDefaults.reveal.maxExecutionBatchSize,
		),
		AUTO_REVEAL_CURSOR_FILE: resolve(
			config.repoRoot,
			config.scenario.commandDefaults.reveal.cursorFilePath,
		),
	};
}

function parseProjectMode(value: unknown, label: string): "UNIQUE" | "MULTI" {
	const mode = toNumber(value, label);
	if (mode === 0) {
		return "UNIQUE";
	}
	if (mode === 1) {
		return "MULTI";
	}

	throw new Error(`${label} must be 0 or 1`);
}

function parseSubmissionStatusCode(
	value: unknown,
	label: string,
): SubmissionStatusCode {
	const status = toNumber(value, label);
	if (status >= 0 && status <= 5) {
		return status as SubmissionStatusCode;
	}

	throw new Error(`${label} must be between 0 and 5`);
}

function parseProjectRecord(
	value: unknown,
	label: string,
): RevealStageProjectSnapshot {
	if (!isObject(value)) {
		throw new Error(`${label} is invalid`);
	}

	return {
		mode: parseProjectMode(value.mode, `${label}.mode`),
		commitDeadline: toBigInt(value.commitDeadline, `${label}.commitDeadline`),
		revealDeadline: toBigInt(value.revealDeadline, `${label}.revealDeadline`),
	};
}

function parseUniqueProjectRecord(
	value: unknown,
	projectId: bigint,
): UniqueProjectSnapshot {
	const project = parseProjectRecord(value, "projects");
	return {
		projectId,
		mode: project.mode,
	};
}

function parseMultiProjectRecord(
	value: unknown,
	projectId: bigint,
): MultiProjectSnapshot {
	const project = parseProjectRecord(value, "projects");
	return {
		projectId,
		mode: project.mode,
		commitDeadline: project.commitDeadline,
		revealDeadline: project.revealDeadline,
	};
}

function parseUniqueSubmissionStatus(
	value: unknown,
): UniqueSubmissionSnapshot["status"] {
	switch (parseSubmissionStatusCode(value, "submissions.status")) {
		case 0:
			return "Committed";
		case 1:
			return "Revealed";
		case 2:
		case 3:
			return "Verified";
		case 4:
			return "Finalized";
		case 5:
			return "Invalid";
	}
}

function parseMultiSubmissionStatus(
	value: unknown,
): MultiSubmissionSnapshot["status"] {
	switch (parseSubmissionStatusCode(value, "submissions.status")) {
		case 0:
			return "Committed";
		case 1:
			return "Revealed";
		case 2:
		case 3:
		case 4:
			return "Verified";
		case 5:
			return "Invalid";
	}
}

function parseUniqueSubmissionRecord(
	value: unknown,
	submissionId: bigint,
): UniqueSubmissionSnapshot {
	if (!isObject(value)) {
		throw new Error("submissions is invalid");
	}

	return {
		submissionId,
		projectId: toBigInt(value.projectId, "submissions.projectId"),
		status: parseUniqueSubmissionStatus(value.status),
	};
}

function parseMultiSubmissionRecord(
	value: unknown,
	submissionId: bigint,
): MultiSubmissionSnapshot {
	if (!isObject(value)) {
		throw new Error("submissions is invalid");
	}

	return {
		submissionId,
		projectId: toBigInt(value.projectId, "submissions.projectId"),
		status: parseMultiSubmissionStatus(value.status),
	};
}

function parseQueuedRevealRecord(
	value: unknown,
	submissionId: bigint,
): MultiQueuedRevealSnapshot {
	if (!isObject(value)) {
		throw new Error("queuedReveals is invalid");
	}

	return {
		submissionId,
		auditor: normalizeAddress(
			String(value.auditor ?? "0x0000000000000000000000000000000000000000"),
			"queuedReveals.auditor",
		),
		salt: normalizeHash(String(value.salt ?? "0x"), "queuedReveals.salt"),
		deadline: toBigInt(value.deadline, "queuedReveals.deadline"),
		queued: toBoolean(value.queued, "queuedReveals.queued"),
	};
}

function parseUniqueRevealStateRecord(
	value: unknown,
): UniqueRevealStateSnapshot {
	if (!isObject(value)) {
		throw new Error("uniqueRevealStateByProject is invalid");
	}

	return {
		hasCandidate: toBoolean(
			value.hasCandidate,
			"uniqueRevealStateByProject.hasCandidate",
		),
		candidateSubmissionId: toBigInt(
			value.candidateSubmissionId,
			"uniqueRevealStateByProject.candidateSubmissionId",
		),
		winnerLocked: toBoolean(
			value.winnerLocked,
			"uniqueRevealStateByProject.winnerLocked",
		),
		winnerSubmissionId: toBigInt(
			value.winnerSubmissionId,
			"uniqueRevealStateByProject.winnerSubmissionId",
		),
	};
}

function normalizeEventLog(
	eventName: "PoCCommitted" | "RevealQueued" | "PoCRevealed",
	log: {
		args: Record<string, unknown>;
		transactionHash?: string;
		blockNumber?: bigint | number | string;
		logIndex?: bigint | number | string;
	},
): NormalizedContractEventLog {
	return {
		eventName,
		args: log.args,
		transactionHash: log.transactionHash
			? normalizeHash(log.transactionHash, `${eventName}.transactionHash`)
			: undefined,
		blockNumber: log.blockNumber,
		logIndex: log.logIndex,
	};
}

async function createDefaultRuntimeBundle(args: {
	config: DemoOperatorConfig;
	env: EnvRecord;
	runOnceConfig: RunOnceConfig;
}): Promise<RevealStageRuntimeBundle> {
	const viem = await import("viem");
	const accounts = await import("viem/accounts");

	const account = accounts.privateKeyToAccount(
		normalizePrivateKey(
			requiredEnv(
				args.env,
				args.config.scenario.identities.operator.privateKeyEnvVar,
			),
			args.config.scenario.identities.operator.privateKeyEnvVar,
		),
	);
	const publicClient = viem.createPublicClient({
		transport: viem.http(args.runOnceConfig.publicRpcUrl),
	});
	const walletClient = viem.createWalletClient({
		account,
		transport: viem.http(args.runOnceConfig.adminRpcUrl),
	});
	const bountyHubAddress = args.runOnceConfig.bountyHubAddress;
	const revealWorkflowTriggerTransport: BountyHubTransport = {
		readContract: async () => {
			throw new Error(
				"Reveal-stage bounty hub transport only supports findRevealWorkflowTrigger",
			);
		},
		writeContract: async () => {
			throw new Error(
				"Reveal-stage bounty hub transport only supports findRevealWorkflowTrigger",
			);
		},
		waitForTransactionReceipt: async () => {
			throw new Error(
				"Reveal-stage bounty hub transport only supports findRevealWorkflowTrigger",
			);
		},
		getEvents: async (query) => {
			if (query.eventName !== "PoCRevealed") {
				throw new Error(
					`Reveal-stage bounty hub transport does not support event ${query.eventName}`,
				);
			}

			const logs = await publicClient.getContractEvents({
				address: query.address,
				abi: BOUNTY_HUB_REVEAL_ABI,
				eventName: "PoCRevealed",
				args: query.args as never,
				fromBlock: query.fromBlock,
				toBlock: query.toBlock,
				strict: false,
			});

			return logs.map((log) =>
				normalizeEventLog("PoCRevealed", log as never),
			) as readonly BountyHubEventLog<"PoCRevealed">[];
		},
	};
	const bountyHubClient = createBountyHubClient({
		address: bountyHubAddress,
		transport: revealWorkflowTriggerTransport,
	});

	const readProjectRecord = async (projectId: bigint) =>
		parseProjectRecord(
			await publicClient.readContract({
				address: bountyHubAddress,
				abi: BOUNTY_HUB_REVEAL_ABI,
				functionName: "projects",
				args: [projectId],
			}),
			"projects",
		);

	const readSubmissionRecord = async (submissionId: bigint) =>
		await publicClient.readContract({
			address: bountyHubAddress,
			abi: BOUNTY_HUB_REVEAL_ABI,
			functionName: "submissions",
			args: [submissionId],
		});

	const uniqueRuntime: UniqueCandidateRuntime = {
		getCommittedLogs: async ({ fromBlock, toBlock }) => {
			const logs = await publicClient.getContractEvents({
				address: bountyHubAddress,
				abi: BOUNTY_HUB_REVEAL_ABI,
				eventName: "PoCCommitted",
				fromBlock,
				toBlock,
				strict: false,
			});

			return logs.map((log) => {
				const normalized = normalizeEventLog("PoCCommitted", log as never);
				return {
					submissionId: toBigInt(
						normalized.args.submissionId,
						"PoCCommitted.submissionId",
					),
					projectId: toBigInt(
						normalized.args.projectId,
						"PoCCommitted.projectId",
					),
					auditor: normalizeAddress(
						String(normalized.args.auditor ?? ""),
						"PoCCommitted.auditor",
					),
					commitHash: normalizeHash(
						String(normalized.args.commitHash ?? ""),
						"PoCCommitted.commitHash",
					),
					blockNumber: toBigInt(
						normalized.blockNumber,
						"PoCCommitted.blockNumber",
					),
					transactionHash: normalizeHash(
						String(normalized.transactionHash ?? ""),
						"PoCCommitted.transactionHash",
					),
					logIndex: toBigInt(normalized.logIndex, "PoCCommitted.logIndex"),
				} satisfies UniqueCommittedLog;
			});
		},
		readSubmission: async (submissionId) =>
			parseUniqueSubmissionRecord(
				await readSubmissionRecord(submissionId),
				submissionId,
			),
		readProject: async (projectId) =>
			parseUniqueProjectRecord(
				await publicClient.readContract({
					address: bountyHubAddress,
					abi: BOUNTY_HUB_REVEAL_ABI,
					functionName: "projects",
					args: [projectId],
				}),
				projectId,
			),
		readUniqueRevealState: async (projectId) =>
			parseUniqueRevealStateRecord(
				await publicClient.readContract({
					address: bountyHubAddress,
					abi: BOUNTY_HUB_REVEAL_ABI,
					functionName: "uniqueRevealStateByProject",
					args: [projectId],
				}),
			),
	};

	const multiRuntime: MultiDeadlineRuntime = {
		getNowTimestampSec: async () => {
			const block = await publicClient.getBlock({ blockTag: "latest" });
			return toBigInt(block.timestamp, "latest block timestamp");
		},
		getQueuedRevealLogs: async ({ fromBlock, toBlock }) => {
			const logs = await publicClient.getContractEvents({
				address: bountyHubAddress,
				abi: BOUNTY_HUB_REVEAL_ABI,
				eventName: "RevealQueued",
				fromBlock,
				toBlock,
				strict: false,
			});

			return logs.map((log) => {
				const normalized = normalizeEventLog("RevealQueued", log as never);
				return {
					submissionId: toBigInt(
						normalized.args.submissionId,
						"RevealQueued.submissionId",
					),
					blockNumber: toBigInt(
						normalized.blockNumber,
						"RevealQueued.blockNumber",
					),
					transactionHash: normalizeHash(
						String(normalized.transactionHash ?? ""),
						"RevealQueued.transactionHash",
					),
					logIndex: toBigInt(normalized.logIndex, "RevealQueued.logIndex"),
				} satisfies MultiQueuedRevealLog;
			});
		},
		readSubmission: async (submissionId) =>
			parseMultiSubmissionRecord(
				await readSubmissionRecord(submissionId),
				submissionId,
			),
		readProject: async (projectId) =>
			parseMultiProjectRecord(
				await publicClient.readContract({
					address: bountyHubAddress,
					abi: BOUNTY_HUB_REVEAL_ABI,
					functionName: "projects",
					args: [projectId],
				}),
				projectId,
			),
		readQueuedReveal: async (submissionId) =>
			parseQueuedRevealRecord(
				await publicClient.readContract({
					address: bountyHubAddress,
					abi: BOUNTY_HUB_REVEAL_ABI,
					functionName: "queuedReveals",
					args: [submissionId],
				}),
				submissionId,
			),
		executeQueuedReveal: async (submissionId) => {
			const simulation = await publicClient.simulateContract({
				account,
				address: bountyHubAddress,
				abi: BOUNTY_HUB_REVEAL_ABI,
				functionName: "executeQueuedReveal",
				args: [submissionId],
			});
			const txHash = await walletClient.writeContract(simulation.request);
			await publicClient.waitForTransactionReceipt({ hash: txHash });
			return { txHash: normalizeHash(txHash, "executeQueuedReveal tx hash") };
		},
	};

	return {
		getCurrentTimestampSec: multiRuntime.getNowTimestampSec,
		readProject: readProjectRecord,
		runRelayerCycle: () =>
			runAutoRevealRelayerCycle(args.runOnceConfig, {
				uniqueRuntime,
				multiRuntime,
			}),
		findRevealWorkflowTrigger: (submissionId) =>
			bountyHubClient.findRevealWorkflowTrigger(submissionId),
	};
}

export async function runRevealStage(args: {
	config: DemoOperatorConfig;
	env: EnvRecord;
	deps?: RevealStageDependencies;
}): Promise<RevealStageResult> {
	const nowMs = args.deps?.nowMs ?? Date.now();
	const store = loadDemoOperatorStateStore(args.config.stateFilePath, nowMs);

	assertDemoOperatorStateBindingStable(
		store,
		{
			scenarioId: args.config.scenario.scenarioId,
			scenarioPath: args.config.scenarioPath,
			evidenceDir: args.config.evidenceDir,
		},
		nowMs,
	);
	const projectId = readPersistedRegisterProjectId(args.config.stateFilePath);
	const submissionId = readPersistedSubmitSubmissionId(
		args.config.stateFilePath,
	);
	const revealState = store.stageStateByName.get("reveal");
	if (!revealState) {
		throw new Error("Missing demo-operator reveal stage state");
	}

	let runtimeBundlePromise: Promise<RevealStageRuntimeBundle> | undefined;
	const loadRuntimeBundle = async (): Promise<RevealStageRuntimeBundle> => {
		if (!runtimeBundlePromise) {
			const workflowConfig = readAutoRevealWorkflowConfig(args.config);
			const runOnceConfig = loadRunOnceConfig(
				buildRevealRelayerEnv(args.config, args.env, workflowConfig),
			);
			runtimeBundlePromise = Promise.resolve(
				(args.deps?.createRuntimeBundle ?? createDefaultRuntimeBundle)({
					config: args.config,
					env: args.env,
					runOnceConfig,
				}),
			);
		}

		return runtimeBundlePromise;
	};

	const recoverRevealResult = async (): Promise<RevealStageResult | null> => {
		const persistedResult = readPersistedRevealResult(args.config.stateFilePath);
		if (persistedResult) {
			markDurableDemoOperatorStageCompleted(store, "reveal", nowMs);
			return persistedResult;
		}

		try {
			const runtimeBundle = await loadRuntimeBundle();
			const trigger = await runtimeBundle.findRevealWorkflowTrigger(submissionId);
			const recoveredResult = buildRevealStageResult(submissionId, trigger);
			markDurableDemoOperatorStageCompleted(store, "reveal", nowMs);
			persistRevealResult(args.config.stateFilePath, recoveredResult);
			return recoveredResult;
		} catch (error) {
			if (isMissingRevealTriggerError(error)) {
				return null;
			}

			throw error;
		}
	};

	if (revealState.status === "completed") {
		const recoveredResult = await recoverRevealResult();
		if (recoveredResult) {
			return recoveredResult;
		}

		throw new Error(
			"Reveal stage is marked completed but persisted reveal data is missing",
		);
	}

	if (
		revealState.status === "quarantined" &&
		store.quarantinedStageCount === 1
	) {
		const recoveredResult = await recoverRevealResult();
		if (recoveredResult) {
			return recoveredResult;
		}
	}

	assertDemoOperatorStateStoreHealthy(store);
	
	if (
		revealState.status === "processing" ||
		revealState.status === "quarantined"
	) {
		throw new Error(
			`Reveal stage is not runnable because it is ${revealState.status}`,
		);
	}
	const runtimeBundle = await loadRuntimeBundle();
	const project = await runtimeBundle.readProject(projectId);
	const currentTimestampSec = await runtimeBundle.getCurrentTimestampSec();

	if (project.mode !== "MULTI") {
		throw new Error(
			`Reveal stage requires a MULTI project but project ${projectId.toString()} is ${project.mode}`,
		);
	}

	if (
		project.commitDeadline === 0n ||
		currentTimestampSec <= project.commitDeadline
	) {
		throw new Error(
			`Reveal stage blocked until the project commit deadline has passed (now=${currentTimestampSec.toString()} commitDeadline=${project.commitDeadline.toString()})`,
		);
	}

	const claimDecision = claimDurableDemoOperatorStage(store, "reveal", nowMs);
	if (!claimDecision.shouldProcess) {
		if (claimDecision.reason === "already-completed") {
			const persistedResult = readPersistedRevealResult(
				args.config.stateFilePath,
			);
			if (persistedResult) {
				return persistedResult;
			}

			throw new Error(
				"Reveal stage is marked completed but persisted reveal data is missing",
			);
		}

		throw new Error(
			`Reveal stage is not runnable because it is ${claimDecision.reason}`,
		);
	}

	try {
		await runtimeBundle.runRelayerCycle();
		const trigger = await runtimeBundle.findRevealWorkflowTrigger(submissionId);
		const result = buildRevealStageResult(submissionId, trigger);
		markDurableDemoOperatorStageCompleted(store, "reveal", nowMs);
		persistRevealResult(args.config.stateFilePath, result);
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		markDurableDemoOperatorStageQuarantined(store, "reveal", message, nowMs);
		throw error;
	}
}
