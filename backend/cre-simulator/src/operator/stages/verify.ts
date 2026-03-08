import { spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { DemoOperatorConfig, EnvRecord } from "../config";
import {
	assertCreWorkflowSecretsAvailable,
	prepareCreWorkflowExecution,
} from "../creWorkflowRuntime";
import {
	BOUNTY_HUB_SUBMISSION_STATUS,
	type AddressString,
	type BountyHubAuditorStats,
	type BountyHubSubmission,
	type HexString,
	type TerminalPayoutEvidence,
} from "../bountyHubClient";
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
const VERIFY_WORKFLOW_CONFIG_PATH = "workflow/verify-poc/config.staging.json";
const VERIFY_IDEMPOTENCY_STORE_FILENAME = "verify-poc-idempotency-store.json";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as AddressString;
const ZERO_HASH =
	"0x0000000000000000000000000000000000000000000000000000000000000000" as HexString;
const GET_AUDITOR_STATS_SELECTOR = "0x680b19d7";
const POC_VERIFIED_TOPIC =
	"0x8ca29c5b8c9a03411724f63ee4afcc6aa2da39768f4034ad1bbc92dea35b7d21";
const BOUNTY_PAID_TOPIC =
	"0x07e339a02227d9329089b11d9cdeea1af6caea87244864b70935aca91d7dc7fd";
const BOUNTY_FINALIZED_TOPIC =
	"0xa971cb2445df8cf3f569d40414eebb7e4608c21404b60b6072cf1f2bd3a0dd6e";

type PersistedDemoOperatorStateFile = {
	stageData?: {
		register?: unknown;
		submit?: unknown;
		reveal?: unknown;
		verify?: unknown;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

type VerifyWorkflowConfig = {
	bountyHubAddress: AddressString;
};

export type VerifyStageTerminalSubmission = {
	auditor: AddressString;
	status: "Finalized";
	drainAmountWei: string;
	severity: number;
	payoutAmount: string;
};

export type VerifyStagePayoutEvidence = {
	payoutTxHash: HexString;
	payoutEventIndex: number;
	finalizedTxHash: HexString;
	finalizedEventIndex: number;
	payoutAmount: string;
};

export type VerifyStageAuditorStatsSnapshot = {
	paidCount: string;
	totalPaidWei: string;
};

export type VerifyStageResult = {
	submissionId: string;
	simulateCommand: string[];
	outputPath: string;
	resultPath: string;
	terminalSubmission: VerifyStageTerminalSubmission;
	payoutEvidence: VerifyStagePayoutEvidence;
	auditorStats: VerifyStageAuditorStatsSnapshot;
};

export type VerifyStageCommandSpec = {
	command: string;
	args: string[];
	cwd: string;
	env: EnvRecord;
};

export type VerifyStageCommandResult = {
	exitCode: number;
	stdout: string;
	stderr: string;
};

export type VerifyStageClient = {
	readSubmission: (submissionId: bigint) => Promise<BountyHubSubmission>;
	readAuditorStats: (auditor: AddressString) => Promise<BountyHubAuditorStats>;
	readTerminalPayoutEvidence: (args: {
		submissionId: bigint;
		auditor: AddressString;
		auditorStats?: BountyHubAuditorStats;
	}) => Promise<TerminalPayoutEvidence>;
};

export type VerifyStageDependencies = {
	nowMs?: number;
	createClient?: (args: {
		config: DemoOperatorConfig;
		env: EnvRecord;
		workflowConfig: VerifyWorkflowConfig;
	}) => Promise<VerifyStageClient>;
	runCommand?: (
		spec: VerifyStageCommandSpec,
	) => Promise<VerifyStageCommandResult>;
};

type RpcLog = {
	transactionHash?: string;
	blockNumber?: bigint | number | string;
	logIndex?: bigint | number | string;
	data?: string;
	topics?: unknown;
};

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

function parseUrl(value: string, label: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${label} must be a valid URL`);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`${label} must use http or https`);
	}

	return parsed.toString();
}

function normalizeHexData(value: string, label: string): `0x${string}` {
	if (!/^0x([a-fA-F0-9]{2})*$/.test(value)) {
		throw new Error(`${label} must be even-length hex data`);
	}

	return value.toLowerCase() as `0x${string}`;
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

function toNumber(value: unknown, label: string): number {
	const normalized = toBigInt(value, label);
	if (normalized > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER`);
	}

	return Number(normalized);
}

function compareAddress(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}

function stripHexPrefix(value: string, label: string): string {
	if (!value.startsWith("0x")) {
		throw new Error(`${label} must be 0x-prefixed hex data`);
	}

	return value.slice(2);
}

function encodeUint256Word(value: bigint, label: string): string {
	if (value < 0n) {
		throw new Error(`${label} must be non-negative`);
	}

	const hex = value.toString(16);
	if (hex.length > 64) {
		throw new Error(`${label} exceeds uint256`);
	}

	return hex.padStart(64, "0");
}

function encodeAddressWord(address: AddressString, label: string): string {
	return stripHexPrefix(normalizeAddress(address, label), label).padStart(64, "0");
}

function readHexWord(data: `0x${string}`, index: number, label: string): string {
	const hex = stripHexPrefix(data, label);
	const start = index * 64;
	const end = start + 64;
	if (hex.length < end) {
		throw new Error(`${label} is missing word ${index}`);
	}

	return hex.slice(start, end);
}

function readWordBigInt(data: `0x${string}`, index: number, label: string): bigint {
	return BigInt(`0x${readHexWord(data, index, label)}`);
}

function readWordBoolean(data: `0x${string}`, index: number, label: string): boolean {
	const raw = readWordBigInt(data, index, label);
	if (raw === 0n) {
		return false;
	}
	if (raw === 1n) {
		return true;
	}

	throw new Error(`${label} word ${index} must be a boolean`);
}

function readTopics(log: RpcLog, label: string): readonly string[] {
	if (!Array.isArray(log.topics)) {
		throw new Error(`${label} topics are missing or invalid`);
	}

	return log.topics.map((topic) => String(topic));
}

function readTopicHash(log: RpcLog, index: number, label: string): HexString {
	const topics = readTopics(log, label);
	return normalizeHash(String(topics[index] ?? ""), `${label} topic ${index}`);
}

function readTopicAddress(log: RpcLog, index: number, label: string): AddressString {
	const topic = stripHexPrefix(readTopicHash(log, index, label), `${label} topic ${index}`);
	return normalizeAddress(`0x${topic.slice(24)}`, `${label} topic ${index}`);
}

function readLogData(log: RpcLog, label: string): `0x${string}` {
	return normalizeHexData(String(log.data ?? "0x"), `${label} data`);
}

function compareRpcLogs(left: RpcLog, right: RpcLog): number {
	const blockComparison = compareBigInt(
		toBigInt(left.blockNumber ?? 0n, "left.blockNumber"),
		toBigInt(right.blockNumber ?? 0n, "right.blockNumber"),
	);
	if (blockComparison !== 0) {
		return blockComparison;
	}

	const logIndexComparison = compareBigInt(
		toBigInt(left.logIndex ?? 0n, "left.logIndex"),
		toBigInt(right.logIndex ?? 0n, "right.logIndex"),
	);
	if (logIndexComparison !== 0) {
		return logIndexComparison;
	}

	return String(left.transactionHash ?? "").localeCompare(
		String(right.transactionHash ?? ""),
	);
}

function getLatestRpcLog(logs: readonly RpcLog[], label: string): RpcLog {
	if (logs.length === 0) {
		throw new Error(`Missing ${label} event`);
	}

	return logs.slice().sort(compareRpcLogs).at(-1) as RpcLog;
}

function parsePoCVerifiedLog(log: RpcLog) {
	const data = readLogData(log, "PoCVerified");
	return {
		isValid: readWordBoolean(data, 0, "PoCVerified"),
		drainAmountWei: readWordBigInt(data, 1, "PoCVerified"),
		severity: toNumber(readWordBigInt(data, 2, "PoCVerified.severity"), "PoCVerified.severity"),
	};
}

function parseBountyPaidLog(log: RpcLog) {
	const txHash = normalizeHash(
		String(log.transactionHash ?? ""),
		"BountyPaid transaction hash",
	);
	return {
		auditor: readTopicAddress(log, 2, "BountyPaid"),
		payoutAmount: readWordBigInt(readLogData(log, "BountyPaid"), 0, "BountyPaid.amount"),
		payoutTxHash: txHash,
		payoutEventIndex: toNumber(log.logIndex ?? 0n, "BountyPaid.logIndex"),
	};
}

function parseBountyFinalizedLog(log: RpcLog) {
	return {
		finalizedTxHash: normalizeHash(
			String(log.transactionHash ?? ""),
			"BountyFinalized transaction hash",
		),
		finalizedEventIndex: toNumber(log.logIndex ?? 0n, "BountyFinalized.logIndex"),
	};
}

function parseAuditorStatsCallResult(data: `0x${string}`): BountyHubAuditorStats {
	return {
		paidCount: readWordBigInt(data, 3, "getAuditorStats"),
		totalPaidWei: readWordBigInt(data, 6, "getAuditorStats"),
	};
}

async function readJsonRpc<T>(args: {
	rpcUrl: string;
	method: string;
	params: unknown[];
}): Promise<T> {
	const response = await fetch(args.rpcUrl, {
		method: "POST",
		headers: {
			"content-type": "application/json",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: args.method,
			params: args.params,
		}),
	});

	if (!response.ok) {
		throw new Error(`JSON-RPC ${args.method} failed with HTTP ${response.status}`);
	}

	const payload = (await response.json()) as {
		result?: T;
		error?: { code?: number; message?: string };
	};
	if (payload.error) {
		throw new Error(
			`JSON-RPC ${args.method} failed: ${payload.error.message ?? "unknown error"}`,
		);
	}
	if (!("result" in payload)) {
		throw new Error(`JSON-RPC ${args.method} returned no result`);
	}

	return payload.result as T;
}

async function readContractLogs(args: {
	rpcUrl: string;
	bountyHubAddress: AddressString;
	topic0: HexString;
	submissionId: bigint;
}): Promise<readonly RpcLog[]> {
	return await readJsonRpc<readonly RpcLog[]>({
		rpcUrl: args.rpcUrl,
		method: "eth_getLogs",
		params: [
			{
				address: args.bountyHubAddress,
				topics: [
					args.topic0,
					`0x${encodeUint256Word(args.submissionId, "submissionId")}`,
				],
			},
		],
	});
}

async function readAuditorStatsViaRpc(args: {
	rpcUrl: string;
	bountyHubAddress: AddressString;
	auditor: AddressString;
}): Promise<BountyHubAuditorStats> {
	const result = await readJsonRpc<string>({
		rpcUrl: args.rpcUrl,
		method: "eth_call",
		params: [
			{
				to: args.bountyHubAddress,
				data: `${GET_AUDITOR_STATS_SELECTOR}${encodeAddressWord(args.auditor, "auditor")}`,
			},
			"latest",
		],
	});

	return parseAuditorStatsCallResult(
		normalizeHexData(String(result), "getAuditorStats response"),
	);
}

function validateBroadcastPrerequisites(
	config: DemoOperatorConfig,
	env: EnvRecord,
): void {
	if (config.scenario.commandDefaults.creTarget !== "staging-settings") {
		throw new Error(
			"Missing broadcast prerequisite: verify adapter expects creTarget=staging-settings",
		);
	}
	if (!config.scenario.commandDefaults.nonInteractive) {
		throw new Error(
			"Missing broadcast prerequisite: verify adapter requires nonInteractive=true",
		);
	}
	if (!config.scenario.commandDefaults.broadcast) {
		throw new Error(
			"Missing broadcast prerequisite: verify adapter requires broadcast=true",
		);
	}

	parseUrl(
		requiredEnv(env, "DEMO_OPERATOR_PUBLIC_RPC_URL"),
		"DEMO_OPERATOR_PUBLIC_RPC_URL",
	);
	normalizePrivateKey(
		String(env.CRE_ETH_PRIVATE_KEY ?? ""),
		"Missing broadcast prerequisite: CRE_ETH_PRIVATE_KEY",
	);
	normalizeAddress(
		requiredEnv(env, config.scenario.identities.auditor.addressEnvVar),
		config.scenario.identities.auditor.addressEnvVar,
	);
	assertCreWorkflowSecretsAvailable({
		repoRoot: config.repoRoot,
		workflowPath: config.scenario.commandDefaults.verify.workflowPath,
		env,
	});
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

function readPersistedStateFile(filePath: string): PersistedDemoOperatorStateFile {
	return parseJsonObject(readFileSync(filePath, "utf8"), "demo-operator state store");
}

function parsePersistedVerifyResult(value: unknown): VerifyStageResult {
	if (!isObject(value)) {
		throw new Error("Persisted verify stage data is missing or invalid");
	}

	const submissionId = String(value.submissionId ?? "");
	if (!/^[0-9]+$/.test(submissionId)) {
		throw new Error("Persisted verify stage data is missing or invalid");
	}

	const simulateCommand = Array.isArray(value.simulateCommand)
		? value.simulateCommand.map((entry) => String(entry))
		: null;
	if (!simulateCommand || simulateCommand.length === 0) {
		throw new Error("Persisted verify stage simulateCommand is invalid");
	}

	const outputPath = String(value.outputPath ?? "");
	const resultPath = String(value.resultPath ?? "");
	if (outputPath.trim().length === 0 || resultPath.trim().length === 0) {
		throw new Error("Persisted verify stage evidence paths are invalid");
	}

	const terminalSubmission = value.terminalSubmission;
	const payoutEvidence = value.payoutEvidence;
	const auditorStats = value.auditorStats;
	if (!isObject(terminalSubmission) || !isObject(payoutEvidence) || !isObject(auditorStats)) {
		throw new Error("Persisted verify stage result payload is invalid");
	}

	return {
		submissionId,
		simulateCommand,
		outputPath,
		resultPath,
		terminalSubmission: {
			auditor: normalizeAddress(
				String(terminalSubmission.auditor ?? ""),
				"Persisted verify stage terminalSubmission.auditor",
			),
			status: terminalSubmission.status === "Finalized"
				? "Finalized"
				: (() => {
					throw new Error(
						"Persisted verify stage terminalSubmission.status must be Finalized",
					);
				})(),
			drainAmountWei: String(terminalSubmission.drainAmountWei ?? ""),
			severity: toNumber(
				terminalSubmission.severity,
				"Persisted verify stage terminalSubmission.severity",
			),
			payoutAmount: String(terminalSubmission.payoutAmount ?? ""),
		},
		payoutEvidence: {
			payoutTxHash: normalizeHash(
				String(payoutEvidence.payoutTxHash ?? ""),
				"Persisted verify stage payoutEvidence.payoutTxHash",
			),
			payoutEventIndex: toNumber(
				payoutEvidence.payoutEventIndex,
				"Persisted verify stage payoutEvidence.payoutEventIndex",
			),
			finalizedTxHash: normalizeHash(
				String(payoutEvidence.finalizedTxHash ?? ""),
				"Persisted verify stage payoutEvidence.finalizedTxHash",
			),
			finalizedEventIndex: toNumber(
				payoutEvidence.finalizedEventIndex,
				"Persisted verify stage payoutEvidence.finalizedEventIndex",
			),
			payoutAmount: String(payoutEvidence.payoutAmount ?? ""),
		},
		auditorStats: {
			paidCount: String(auditorStats.paidCount ?? ""),
			totalPaidWei: String(auditorStats.totalPaidWei ?? ""),
		},
	};
}

function readPersistedVerifyResult(filePath: string): VerifyStageResult | null {
	if (!existsSync(filePath)) {
		return null;
	}

	const persisted = readPersistedStateFile(filePath);
	return persisted.stageData?.verify
		? parsePersistedVerifyResult(persisted.stageData.verify)
		: null;
}

function persistVerifyResult(filePath: string, result: VerifyStageResult): void {
	const persisted = readPersistedStateFile(filePath);
	const nextPayload: PersistedDemoOperatorStateFile = {
		...persisted,
		stageData: {
			...(isObject(persisted.stageData) ? persisted.stageData : {}),
			verify: result,
		},
	};

	ensureParentDirectory(filePath);
	const tempPath = `${filePath}.tmp`;
	writeFileSync(tempPath, `${JSON.stringify(nextPayload, null, 2)}\n`, "utf8");
	renameSync(tempPath, filePath);
}

function parsePersistedRevealResult(value: unknown): {
	submissionId: string;
	revealTxHash: HexString;
	revealEventIndex: number;
} {
	if (!isObject(value)) {
		throw new Error("Persisted reveal stage data is missing or invalid");
	}

	const submissionId = String(value.submissionId ?? "");
	if (!/^[0-9]+$/.test(submissionId)) {
		throw new Error("Persisted reveal stage data is missing or invalid");
	}

	return {
		submissionId,
		revealTxHash: normalizeHash(
			String(value.revealTxHash ?? ""),
			"Persisted reveal stage revealTxHash",
		),
		revealEventIndex: toNumber(
			value.revealEventIndex,
			"Persisted reveal stage revealEventIndex",
		),
	};
}

function readPersistedRevealResult(filePath: string) {
	if (!existsSync(filePath)) {
		throw new Error("Persisted reveal stage data is missing or invalid");
	}

	const persisted = readPersistedStateFile(filePath);
	if (!persisted.stageData?.reveal) {
		throw new Error("Persisted reveal stage data is missing or invalid");
	}

	return parsePersistedRevealResult(persisted.stageData.reveal);
}

function readVerifyWorkflowConfig(config: DemoOperatorConfig): VerifyWorkflowConfig {
	const configPath = resolve(config.repoRoot, VERIFY_WORKFLOW_CONFIG_PATH);
	const parsed = parseJsonObject(
		readFileSync(configPath, "utf8"),
		VERIFY_WORKFLOW_CONFIG_PATH,
	);

	return {
		bountyHubAddress: normalizeAddress(
			String(parsed.bountyHubAddress ?? ""),
			`${VERIFY_WORKFLOW_CONFIG_PATH} bountyHubAddress`,
		),
	};
}

function buildVerifyCommand(
	config: DemoOperatorConfig,
	revealResult: { revealTxHash: HexString; revealEventIndex: number },
	workflowPath: string = config.scenario.commandDefaults.verify.workflowPath,
): VerifyStageCommandSpec {
	const args = [
		"workflow",
		"simulate",
		workflowPath,
		"--target",
		config.scenario.commandDefaults.creTarget,
		"--non-interactive",
		"--trigger-index",
		String(config.scenario.commandDefaults.verify.triggerIndex),
		"--evm-tx-hash",
		revealResult.revealTxHash,
		"--evm-event-index",
		String(revealResult.revealEventIndex),
	];

	if (config.scenario.commandDefaults.broadcast) {
		args.push("--broadcast");
	}

	return {
		command: "cre",
		args,
		cwd: config.repoRoot,
		env: {
			VERIFY_POC_IDEMPOTENCY_STORE_PATH: join(
				config.evidenceDir,
				VERIFY_IDEMPOTENCY_STORE_FILENAME,
			),
		},
	};
}

async function runLocalCommand(
	spec: VerifyStageCommandSpec,
): Promise<VerifyStageCommandResult> {
	return await new Promise((resolvePromise, rejectPromise) => {
		const runtime = globalThis as {
			process?: {
				env?: Record<string, string | undefined>;
			};
		};
		const subprocess = spawn(spec.command, spec.args, {
			cwd: spec.cwd,
			env: {
				...(runtime.process?.env ?? {}),
				...spec.env,
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		subprocess.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		subprocess.stderr.on("data", (chunk) => {
			stderr += String(chunk);
		});
		subprocess.on("error", (error) => {
			rejectPromise(
				new Error(`Failed to execute ${spec.command}: ${error.message}`),
			);
		});
		subprocess.on("close", (code) => {
			resolvePromise({
				exitCode: code ?? 1,
				stdout,
				stderr,
			});
		});
	});
}

function writeVerifyEvidenceFiles(args: {
	config: DemoOperatorConfig;
	commandSpec: VerifyStageCommandSpec;
	commandResult: VerifyStageCommandResult;
	verifyResult: VerifyStageResult;
}): void {
	ensureParentDirectory(args.verifyResult.outputPath);
	writeFileSync(
		args.verifyResult.outputPath,
		[
			`$ ${args.commandSpec.command} ${args.commandSpec.args.join(" ")}`,
			"",
			"STDOUT:",
			args.commandResult.stdout,
			"",
			"STDERR:",
			args.commandResult.stderr,
		].join("\n"),
		"utf8",
	);
	ensureParentDirectory(args.verifyResult.resultPath);
	writeFileSync(
		args.verifyResult.resultPath,
		`${JSON.stringify(args.verifyResult, null, 2)}\n`,
		"utf8",
	);
}

async function createDefaultClient(args: {
	env: EnvRecord;
	workflowConfig: VerifyWorkflowConfig;
}): Promise<VerifyStageClient> {
	const rpcUrl = requiredEnv(args.env, "DEMO_OPERATOR_PUBLIC_RPC_URL");
	const bountyHubAddress = args.workflowConfig.bountyHubAddress;

	return {
		async readSubmission(submissionId) {
			const [verifiedLogs, payoutLogs, finalizedLogs] = await Promise.all([
				readContractLogs({
					rpcUrl,
					bountyHubAddress,
					topic0: POC_VERIFIED_TOPIC,
					submissionId,
				}),
				readContractLogs({
					rpcUrl,
					bountyHubAddress,
					topic0: BOUNTY_PAID_TOPIC,
					submissionId,
				}),
				readContractLogs({
					rpcUrl,
					bountyHubAddress,
					topic0: BOUNTY_FINALIZED_TOPIC,
					submissionId,
				}),
			]);

			const verified = parsePoCVerifiedLog(
				getLatestRpcLog(verifiedLogs, "PoCVerified"),
			);
			if (!verified.isValid) {
				throw new Error(
					`Submission ${submissionId.toString()} verification result is not valid`,
				);
			}
			const payout = parseBountyPaidLog(getLatestRpcLog(payoutLogs, "BountyPaid"));
			getLatestRpcLog(finalizedLogs, "BountyFinalized");

			return {
				auditor: payout.auditor,
				projectId: 0n,
				commitHash: ZERO_HASH,
				cipherURI: "",
				salt: ZERO_HASH,
				commitTimestamp: 0n,
				revealTimestamp: 0n,
				status: BOUNTY_HUB_SUBMISSION_STATUS.Finalized,
				drainAmountWei: verified.drainAmountWei,
				severity: verified.severity,
				payoutAmount: payout.payoutAmount,
				disputeDeadline: 0n,
				challenged: false,
				challenger: ZERO_ADDRESS,
				challengeBond: 0n,
			};
		},
		readAuditorStats(auditor) {
			return readAuditorStatsViaRpc({
				rpcUrl,
				bountyHubAddress,
				auditor,
			});
		},
		async readTerminalPayoutEvidence(input) {
			const [payoutLogs, finalizedLogs] = await Promise.all([
				readContractLogs({
					rpcUrl,
					bountyHubAddress,
					topic0: BOUNTY_PAID_TOPIC,
					submissionId: input.submissionId,
				}),
				readContractLogs({
					rpcUrl,
					bountyHubAddress,
					topic0: BOUNTY_FINALIZED_TOPIC,
					submissionId: input.submissionId,
				}),
			]);

			const payout = parseBountyPaidLog(getLatestRpcLog(payoutLogs, "BountyPaid"));
			const finalized = parseBountyFinalizedLog(
				getLatestRpcLog(finalizedLogs, "BountyFinalized"),
			);
			if (!compareAddress(payout.auditor, input.auditor)) {
				throw new Error(
					`BountyPaid auditor mismatch for submission ${input.submissionId.toString()}`,
				);
			}

			return {
				submissionId: input.submissionId,
				auditor: payout.auditor,
				payoutAmount: payout.payoutAmount,
				payoutTxHash: payout.payoutTxHash,
				payoutEventIndex: payout.payoutEventIndex,
				finalizedTxHash: finalized.finalizedTxHash,
				finalizedEventIndex: finalized.finalizedEventIndex,
			};
		},
	};
}

function assertScenarioTerminalAssertions(args: {
	config: DemoOperatorConfig;
	auditorStats: BountyHubAuditorStats;
	terminalSubmission: VerifyStageTerminalSubmission;
}): void {
	if (
		args.terminalSubmission.status !==
		args.config.scenario.terminalAssertions.submissionStatus
	) {
		throw new Error(
			`Terminal submission status mismatch: expected ${args.config.scenario.terminalAssertions.submissionStatus} received ${args.terminalSubmission.status}`,
		);
	}

	if (
		args.auditorStats.paidCount <
		BigInt(args.config.scenario.terminalAssertions.auditorStatsPaidCountDeltaAtLeast)
	) {
		throw new Error(
			`Auditor stats paidCount must be >= ${args.config.scenario.terminalAssertions.auditorStatsPaidCountDeltaAtLeast}`,
		);
	}

	if (
		args.auditorStats.totalPaidWei <=
		BigInt(args.config.scenario.terminalAssertions.auditorStatsTotalPaidWeiGreaterThan)
	) {
		throw new Error(
			`Auditor stats totalPaidWei must be > ${args.config.scenario.terminalAssertions.auditorStatsTotalPaidWeiGreaterThan}`,
		);
	}
}

export async function runVerifyStage(args: {
	config: DemoOperatorConfig;
	env: EnvRecord;
	deps?: VerifyStageDependencies;
}): Promise<VerifyStageResult> {
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
	assertDemoOperatorStateStoreHealthy(store);

	const revealResult = readPersistedRevealResult(args.config.stateFilePath);
	const verifyState = store.stageStateByName.get("verify");
	if (!verifyState) {
		throw new Error("Missing demo-operator verify stage state");
	}

	if (verifyState.status === "completed") {
		const persistedResult = readPersistedVerifyResult(args.config.stateFilePath);
		if (persistedResult) {
			return persistedResult;
		}

		throw new Error(
			"Verify stage is marked completed but persisted verify data is missing",
		);
	}

	if (
		verifyState.status === "processing" ||
		verifyState.status === "quarantined"
	) {
		throw new Error(
			`Verify stage is not runnable because it is ${verifyState.status}`,
		);
	}

	const workflowConfig = readVerifyWorkflowConfig(args.config);
	validateBroadcastPrerequisites(args.config, args.env);
	const claimDecision = claimDurableDemoOperatorStage(store, "verify", nowMs);
	if (!claimDecision.shouldProcess) {
		if (claimDecision.reason === "already-completed") {
			const persistedResult = readPersistedVerifyResult(args.config.stateFilePath);
			if (persistedResult) {
				return persistedResult;
			}

			throw new Error(
				"Verify stage is marked completed but persisted verify data is missing",
			);
		}

		throw new Error(
			`Verify stage is not runnable because it is ${claimDecision.reason}`,
		);
	}

	try {
		const client = args.deps?.createClient
			? await args.deps.createClient({
					config: args.config,
					env: args.env,
					workflowConfig,
				})
			: await createDefaultClient({
					env: args.env,
					workflowConfig,
				});
		const workflowRuntime = prepareCreWorkflowExecution({
			repoRoot: args.config.repoRoot,
			workflowPath: args.config.scenario.commandDefaults.verify.workflowPath,
			env: args.env,
		});
		const displayCommandSpec = buildVerifyCommand(args.config, revealResult);
		const commandRunner = args.deps?.runCommand ?? runLocalCommand;
		const commandResult = await (async () => {
			try {
				const commandSpec = buildVerifyCommand(
					args.config,
					revealResult,
					workflowRuntime.workflowPath,
				);
				return await commandRunner(commandSpec);
			} finally {
				workflowRuntime.cleanup();
			}
		})();
		if (commandResult.exitCode !== 0) {
			throw new Error(
				`cre workflow simulate failed with exitCode=${commandResult.exitCode}: ${commandResult.stderr.trim() || commandResult.stdout.trim() || "no output"}`,
			);
		}

		const submissionId = BigInt(revealResult.submissionId);
		const submission = await client.readSubmission(submissionId);
		const auditor = normalizeAddress(
			requiredEnv(
				args.env,
				args.config.scenario.identities.auditor.addressEnvVar,
			),
			args.config.scenario.identities.auditor.addressEnvVar,
		);
		const auditorStats = await client.readAuditorStats(auditor);
		const payoutEvidence = await client.readTerminalPayoutEvidence({
			submissionId,
			auditor,
			auditorStats,
		});
		if (submission.status !== BOUNTY_HUB_SUBMISSION_STATUS.Finalized) {
			throw new Error(
				`Submission ${submissionId.toString()} is not finalized on-chain`,
			);
		}

		const terminalSubmission: VerifyStageTerminalSubmission = {
			auditor: normalizeAddress(submission.auditor, "submission.auditor"),
			status: "Finalized",
			drainAmountWei: submission.drainAmountWei.toString(),
			severity: submission.severity,
			payoutAmount: submission.payoutAmount.toString(),
		};
		assertScenarioTerminalAssertions({
			config: args.config,
			auditorStats,
			terminalSubmission,
		});

		const result: VerifyStageResult = {
			submissionId: submissionId.toString(),
			simulateCommand: [displayCommandSpec.command, ...displayCommandSpec.args],
			outputPath: join(args.config.evidenceDir, "output.txt"),
			resultPath: join(args.config.evidenceDir, "verify-result.json"),
			terminalSubmission,
			payoutEvidence: {
				payoutTxHash: payoutEvidence.payoutTxHash,
				payoutEventIndex: payoutEvidence.payoutEventIndex,
				finalizedTxHash: payoutEvidence.finalizedTxHash,
				finalizedEventIndex: payoutEvidence.finalizedEventIndex,
				payoutAmount: payoutEvidence.payoutAmount.toString(),
			},
			auditorStats: {
				paidCount: auditorStats.paidCount.toString(),
				totalPaidWei: auditorStats.totalPaidWei.toString(),
			},
		};

		markDurableDemoOperatorStageCompleted(store, "verify", nowMs);
		persistVerifyResult(args.config.stateFilePath, result);
		writeVerifyEvidenceFiles({
			config: args.config,
			commandSpec: displayCommandSpec,
			commandResult,
			verifyResult: result,
		});
		return result;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		markDurableDemoOperatorStageQuarantined(store, "verify", message, nowMs);
		throw error;
	}
}
