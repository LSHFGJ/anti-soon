import { readFileSync } from "node:fs";
import {
	createPublicClient,
	createWalletClient,
	http,
	keccak256,
	toBytes,
} from "../verify-poc/node_modules/viem";
import { privateKeyToAccount } from "../verify-poc/node_modules/viem/accounts";
import {
	createOasisClient,
	type OasisReadRequest,
	type OasisResult,
	type OasisWriteRequest,
} from "../verify-poc/src/oasisClient";
import {
	OASIS_ENVELOPE_VERSION,
	type OasisEnvelope,
} from "../verify-poc/src/oasisEnvelope";
import {
	type AdjudicationCaseEnvelope,
	type AdjudicationFinalPackageEnvelope,
	encodeJuryOrchestratorContractReport,
	type JuryConsensusEnvelope,
	type JuryRosterSelectionInput,
	type OwnerAdjudicationHandoffEnvelope,
	runJuryRecommendationPipeline,
	type VerifiedReportEnvelopeV3,
} from "./main";

type FinalValidity = "HIGH" | "MEDIUM" | "INVALID";

const JURY_ORCHESTRATOR_WORKFLOW_ID = keccak256(toBytes("jury-orchestrator"));
const DEFAULT_JURY_WORKFLOW_NAME_10 = "juryorc001";
const RECEIVER_ON_REPORT_ABI = [
	{
		type: "function",
		stateMutability: "nonpayable",
		name: "onReport",
		inputs: [
			{ name: "metadata", type: "bytes" },
			{ name: "report", type: "bytes" },
		],
		outputs: [],
	},
] as const;

export type JurorVerdict = {
	finalValidity: FinalValidity;
	rationale: string;
	testimony: string;
};

export type HumanOpinionInput = JurorVerdict & {
	jurorId: string;
};

export type ExecuteJuryRoundArgs = {
	workflowConfig: unknown;
	verifiedReport: VerifiedReportEnvelopeV3;
	juryRoundId: bigint | number | string;
	rosterSelection: JuryRosterSelectionInput;
	humanOpinions: HumanOpinionInput[];
	finalDrainAmountWei?: bigint | number | string;
	currentTimestampSec?: bigint | number | string;
	oasisPointer: {
		chain: string;
		contract: `0x${string}`;
		slotPrefix: string;
	};
};

export type JuryRoundResult = {
	casePackage: AdjudicationCaseEnvelope;
	opinionIngest: ReturnType<typeof runJuryRecommendationPipeline>;
	aggregation: JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope;
	finalResult:
		| AdjudicationFinalPackageEnvelope
		| OwnerAdjudicationHandoffEnvelope;
	encodedContractReport?: `0x${string}`;
	reportSubmission?: JuryReportSubmission;
};

export type JuryReportSubmission = {
	txHash: `0x${string}`;
};

export type PersistedJurorOpinionRecord = {
	slotIndex: number;
	cohort: "LLM" | "HUMAN";
	jurorId: string;
	finalValidity: FinalValidity;
	rationaleDigest: `0x${string}`;
	testimonyDigest: `0x${string}`;
	ingestTimestampSec: bigint;
};

export type JuryRoundContext = {
	casePackage: AdjudicationCaseEnvelope;
	llmSlots: AdjudicationCaseEnvelope["payload"]["rosterCommitment"]["slots"];
	humanSlots: AdjudicationCaseEnvelope["payload"]["rosterCommitment"]["slots"];
	currentTimestampSec: bigint;
	lateSafeTimestampSec: bigint;
};

export type JuryRoundDeps = {
	invokeLlmJuror?: (args: {
		jurorId: string;
		verifiedReport: VerifiedReportEnvelopeV3;
		casePackage: AdjudicationCaseEnvelope;
	}) => Promise<JurorVerdict>;
	oasisWrite?: (payload: OasisWriteRequest) => Promise<
		OasisResult<{
			ok: true;
			pointer: { chain: string; contract: string; slotId: string };
		}>
	>;
	oasisRead?: (
		payload: OasisReadRequest,
	) => Promise<OasisResult<{ ok: true; ciphertext: string; iv: string }>>;
	nowSec?: () => bigint;
	submitEncodedReport?: (
		encodedReport: `0x${string}`,
		finalReport: AdjudicationFinalPackageEnvelope,
	) => Promise<JuryReportSubmission | undefined>;
};

type OnchainReportTransport = {
	simulateContract: (args: {
		account: `0x${string}`;
		address: `0x${string}`;
		abi: typeof RECEIVER_ON_REPORT_ABI;
		functionName: "onReport";
		args: readonly [`0x${string}`, `0x${string}`];
		gas?: bigint;
	}) => Promise<{ request: unknown }>;
	writeContract: (request: unknown) => Promise<`0x${string}`>;
	waitForTransactionReceipt: (args: {
		hash: `0x${string}`;
	}) => Promise<{ status: string }>;
};

type SubmitJuryReportOnchainDeps = {
	transport?: OnchainReportTransport;
};

type RuntimeConfig = {
	workflowConfig: unknown;
	rosterSelection: JuryRosterSelectionInput;
	oasisPointer: ExecuteJuryRoundArgs["oasisPointer"];
	llm: {
		apiUrl?: string;
		apiKeyEnvVar?: string;
	};
	submission?: {
		enabled?: boolean;
		rpcUrlEnvVar?: string;
		privateKeyEnvVar?: string;
		receiverAddress?: `0x${string}`;
		workflowOwner?: `0x${string}`;
		workflowName10?: string;
	};
};

function normalizePositiveBigInt(
	value: bigint | number | string,
	label: string,
): bigint {
	if (typeof value === "bigint") {
		if (value <= 0n) {
			throw new Error(`${label} must be positive`);
		}
		return value;
	}
	const normalized = BigInt(value);
	if (normalized <= 0n) {
		throw new Error(`${label} must be positive`);
	}
	return normalized;
}

function utf8ToHex(value: string): `0x${string}` {
	return `0x${Buffer.from(value, "utf8").toString("hex")}` as `0x${string}`;
}

function normalizeHexAddress(value: string, label: string): `0x${string}` {
	if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
		throw new Error(`${label} must be a valid EVM address`);
	}
	return value.toLowerCase() as `0x${string}`;
}

function normalizePrivateKeyHex(value: string, label: string): `0x${string}` {
	if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
		throw new Error(`${label} must be a 32-byte hex private key`);
	}
	return value.toLowerCase() as `0x${string}`;
}

function encodeWorkflowName10(value: string): string {
	const bytes = Buffer.from(value, "utf8");
	if (bytes.length > 10) {
		throw new Error("workflowName10 must be at most 10 UTF-8 bytes");
	}
	return bytes.toString("hex").padEnd(20, "0");
}

function encodeWorkflowMetadata(args: {
	workflowId: `0x${string}`;
	workflowName10: string;
	workflowOwner: `0x${string}`;
}): `0x${string}` {
	return `${args.workflowId}${encodeWorkflowName10(args.workflowName10)}${args.workflowOwner.slice(2)}` as `0x${string}`;
}

function readWorkflowConfigField(
	workflowConfig: unknown,
	fieldName: string,
): string | undefined {
	if (
		typeof workflowConfig !== "object" ||
		workflowConfig === null ||
		!(fieldName in workflowConfig)
	) {
		return undefined;
	}
	const value = (workflowConfig as Record<string, unknown>)[fieldName];
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function hexToUtf8(value: string): string {
	if (!value.startsWith("0x")) {
		throw new Error("expected hex string");
	}
	return Buffer.from(value.slice(2), "hex").toString("utf8");
}

function hashUtf8(value: string): `0x${string}` {
	return keccak256(toBytes(value));
}

function createViemOnReportTransport(args: {
	rpcUrl: string;
	privateKey: `0x${string}`;
}): OnchainReportTransport {
	const account = privateKeyToAccount(args.privateKey);
	const publicClient = createPublicClient({
		transport: http(args.rpcUrl),
	});
	const walletClient = createWalletClient({
		account,
		transport: http(args.rpcUrl),
	});
	return {
		simulateContract: (request) => publicClient.simulateContract(request),
		writeContract: (request) => walletClient.writeContract(request),
		waitForTransactionReceipt: ({ hash }) =>
			publicClient.waitForTransactionReceipt({ hash }),
	};
}

export async function submitJuryReportOnchain(
	args: {
		receiverAddress: `0x${string}`;
		rpcUrl: string;
		privateKey: `0x${string}`;
		encodedReport: `0x${string}`;
		workflowOwner?: `0x${string}`;
		workflowName10?: string;
		gasLimit?: bigint | number | string;
	},
	deps: SubmitJuryReportOnchainDeps = {},
): Promise<JuryReportSubmission> {
	const privateKey = normalizePrivateKeyHex(args.privateKey, "privateKey");
	const account = privateKeyToAccount(privateKey);
	const workflowOwner = args.workflowOwner
		? normalizeHexAddress(args.workflowOwner, "workflowOwner")
		: normalizeHexAddress(account.address, "account.address");
	const metadata = encodeWorkflowMetadata({
		workflowId: JURY_ORCHESTRATOR_WORKFLOW_ID,
		workflowName10: args.workflowName10 ?? DEFAULT_JURY_WORKFLOW_NAME_10,
		workflowOwner,
	});
	const transport =
		deps.transport ??
		createViemOnReportTransport({
			rpcUrl: args.rpcUrl,
			privateKey,
		});
	const simulation = await transport.simulateContract({
		account: normalizeHexAddress(account.address, "account.address"),
		address: normalizeHexAddress(args.receiverAddress, "receiverAddress"),
		abi: RECEIVER_ON_REPORT_ABI,
		functionName: "onReport",
		args: [metadata, args.encodedReport],
		gas:
			args.gasLimit === undefined
				? undefined
				: normalizePositiveBigInt(args.gasLimit, "gasLimit"),
	});
	const txHash = await transport.writeContract(simulation.request);
	const receipt = await transport.waitForTransactionReceipt({ hash: txHash });
	if (receipt.status !== "success") {
		throw new Error(
			`jury report submission failed with status ${receipt.status}`,
		);
	}
	return { txHash };
}

function normalizeVerdict(value: string, fieldName: string): FinalValidity {
	if (value === "HIGH" || value === "MEDIUM" || value === "INVALID") {
		return value;
	}
	throw new Error(`${fieldName} must be HIGH, MEDIUM, or INVALID`);
}

export function parseJurorVerdictResponse(raw: string): JurorVerdict {
	const parsed = JSON.parse(raw) as Record<string, unknown>;
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("juror response must be a JSON object");
	}
	if (
		typeof parsed.rationale !== "string" ||
		parsed.rationale.trim().length === 0
	) {
		throw new Error("juror response rationale must be a non-empty string");
	}
	if (
		typeof parsed.testimony !== "string" ||
		parsed.testimony.trim().length === 0
	) {
		throw new Error("juror response testimony must be a non-empty string");
	}
	return {
		finalValidity: normalizeVerdict(
			String(parsed.finalValidity),
			"juror response finalValidity",
		),
		rationale: parsed.rationale.trim(),
		testimony: parsed.testimony.trim(),
	};
}

function deriveOasisOpinionPointer(args: {
	base: ExecuteJuryRoundArgs["oasisPointer"];
	casePackage: AdjudicationCaseEnvelope;
	slotIndex: number;
	jurorId: string;
}) {
	return {
		chain: args.base.chain,
		contract: args.base.contract.toLowerCase() as `0x${string}`,
		slotId: `${args.base.slotPrefix}/${args.casePackage.payload.submissionId.toString()}/${args.casePackage.payload.juryRoundId.toString()}/slot-${String(args.slotIndex).padStart(4, "0")}/${args.jurorId}`,
	};
}

function buildOasisEnvelope(
	pointer: {
		chain: string;
		contract: `0x${string}`;
		slotId: string;
	},
	ciphertext: `0x${string}`,
	iv: `0x${string}`,
): OasisEnvelope {
	return {
		version: OASIS_ENVELOPE_VERSION,
		pointer,
		ciphertext: {
			ciphertextHash: keccak256(ciphertext),
			ivHash: keccak256(iv),
		},
	};
}

function buildOpinionCiphertext(
	opinion: JurorVerdict & {
		jurorId: string;
		slotIndex: number;
		cohort: "LLM" | "HUMAN";
	},
): {
	ciphertext: `0x${string}`;
	iv: `0x${string}`;
	envelopePayload: Record<string, string | number>;
} {
	const envelopePayload = {
		jurorId: opinion.jurorId,
		slotIndex: opinion.slotIndex,
		cohort: opinion.cohort,
		finalValidity: opinion.finalValidity,
		rationale: opinion.rationale,
		testimony: opinion.testimony,
	};
	const ciphertext = utf8ToHex(JSON.stringify(envelopePayload));
	const iv = hashUtf8(
		`${opinion.jurorId}:${opinion.slotIndex}:${opinion.cohort}`,
	);
	return { ciphertext, iv, envelopePayload };
}

function assertOasisReadMatchesEnvelope(args: {
	envelope: OasisEnvelope;
	readCiphertext: `0x${string}`;
	readIv: `0x${string}`;
}): void {
	if (
		keccak256(args.readCiphertext) !== args.envelope.ciphertext.ciphertextHash
	) {
		throw new Error("oasis read ciphertext hash mismatch");
	}
	if (keccak256(args.readIv) !== args.envelope.ciphertext.ivHash) {
		throw new Error("oasis read iv hash mismatch");
	}
}

async function persistAndReadBackOpinion(args: {
	deps: Required<Pick<JuryRoundDeps, "oasisWrite" | "oasisRead">>;
	basePointer: ExecuteJuryRoundArgs["oasisPointer"];
	casePackage: AdjudicationCaseEnvelope;
	slotIndex: number;
	cohort: "LLM" | "HUMAN";
	jurorId: string;
	verdict: JurorVerdict;
	lateSafeTimestampSec: bigint;
}): Promise<PersistedJurorOpinionRecord> {
	const pointer = deriveOasisOpinionPointer({
		base: args.basePointer,
		casePackage: args.casePackage,
		slotIndex: args.slotIndex,
		jurorId: args.jurorId,
	});
	const serialized = buildOpinionCiphertext({
		cohort: args.cohort,
		jurorId: args.jurorId,
		slotIndex: args.slotIndex,
		...args.verdict,
	});
	const envelope = buildOasisEnvelope(
		pointer,
		serialized.ciphertext,
		serialized.iv,
	);
	const writeResult = await args.deps.oasisWrite({
		pointer,
		ciphertext: serialized.ciphertext,
		iv: serialized.iv,
	});
	if (!writeResult.ok) {
		throw new Error(`oasis opinion write failed: ${writeResult.error.message}`);
	}
	const readResult = await args.deps.oasisRead({ pointer });
	if (!readResult.ok) {
		throw new Error(`oasis opinion read failed: ${readResult.error.message}`);
	}
	assertOasisReadMatchesEnvelope({
		envelope,
		readCiphertext: readResult.data.ciphertext as `0x${string}`,
		readIv: readResult.data.iv as `0x${string}`,
	});
	const roundTrip = JSON.parse(hexToUtf8(readResult.data.ciphertext)) as Record<
		string,
		unknown
	>;
	return {
		slotIndex: args.slotIndex,
		cohort: args.cohort,
		jurorId: args.jurorId,
		finalValidity: normalizeVerdict(
			String(roundTrip.finalValidity),
			"round-trip finalValidity",
		),
		rationaleDigest: hashUtf8(String(roundTrip.rationale ?? "")),
		testimonyDigest: hashUtf8(String(roundTrip.testimony ?? "")),
		ingestTimestampSec: args.lateSafeTimestampSec,
	};
}

export async function defaultInvokeLlmJuror(args: {
	jurorId: string;
	verifiedReport: VerifiedReportEnvelopeV3;
	casePackage: AdjudicationCaseEnvelope;
	apiUrl: string;
	apiKey: string;
}): Promise<JurorVerdict> {
	const model = args.jurorId.startsWith("llm:")
		? args.jurorId.slice(4)
		: args.jurorId;
	const response = await fetch(args.apiUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${args.apiKey}`,
		},
		body: JSON.stringify({
			model,
			response_format: { type: "json_object" },
			messages: [
				{
					role: "system",
					content:
						"You are one juror in AntiSoon. Return strict JSON with finalValidity, rationale, testimony. finalValidity must be HIGH, MEDIUM, or INVALID.",
				},
				{
					role: "user",
					content: JSON.stringify({
						jurorId: args.jurorId,
						submissionId: args.verifiedReport.payload.submissionId.toString(),
						projectId: args.verifiedReport.payload.projectId.toString(),
						drainAmountWei:
							args.verifiedReport.payload.drainAmountWei.toString(),
						severity: args.verifiedReport.adjudication.severity,
						cipherURI: args.verifiedReport.adjudication.cipherURI,
						juryRoundId: args.casePackage.payload.juryRoundId.toString(),
					}),
				},
			],
		}),
	});
	if (!response.ok) {
		throw new Error(`llm request failed with status ${response.status}`);
	}
	const parsed = (await response.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	const content = parsed.choices?.[0]?.message?.content;
	if (typeof content !== "string" || content.trim().length === 0) {
		throw new Error("llm response did not contain a message content string");
	}
	return parseJurorVerdictResponse(content);
}

function requireOpinionPersistenceDeps(
	deps: JuryRoundDeps,
): Required<Pick<JuryRoundDeps, "oasisWrite" | "oasisRead">> {
	if (!deps.oasisWrite || !deps.oasisRead) {
		throw new Error(
			"executeJuryRound requires oasisWrite and oasisRead dependencies",
		);
	}

	return { oasisWrite: deps.oasisWrite, oasisRead: deps.oasisRead };
}

export function prepareJuryRoundContext(
	args: ExecuteJuryRoundArgs,
): JuryRoundContext {
	const casePackage = runJuryRecommendationPipeline({
		mode: "case-initialization",
		config: args.workflowConfig,
		verifiedReport: args.verifiedReport,
		juryRoundId: args.juryRoundId,
		rosterSelection: args.rosterSelection,
	}) as AdjudicationCaseEnvelope;

	const activeSlots = casePackage.payload.rosterCommitment.slots;
	const llmSlots = activeSlots.filter((slot) => slot.cohort === "LLM");
	const humanSlots = activeSlots.filter((slot) => slot.cohort === "HUMAN");
	if (llmSlots.length !== 5 || humanSlots.length !== 5) {
		throw new Error("jury round expects exactly 5 LLM slots and 5 HUMAN slots");
	}

	const currentTimestampSec =
		args.currentTimestampSec === undefined
			? casePackage.payload.juryDeadlineTimestampSec + 1n
			: normalizePositiveBigInt(args.currentTimestampSec, "currentTimestampSec");
	const lateSafeTimestampSec =
		casePackage.payload.juryDeadlineTimestampSec > 1n
			? casePackage.payload.juryDeadlineTimestampSec - 1n
			: 1n;

	return {
		casePackage,
		llmSlots,
		humanSlots,
		currentTimestampSec,
		lateSafeTimestampSec,
	};
}

export async function collectLlmJurorOpinionRecords(
	args: ExecuteJuryRoundArgs,
	context: JuryRoundContext,
	deps: JuryRoundDeps,
): Promise<PersistedJurorOpinionRecord[]> {
	const opinionDeps = requireOpinionPersistenceDeps(deps);

	return await Promise.all(
		context.llmSlots.map(async (slot) => {
			if (!deps.invokeLlmJuror) {
				throw new Error("executeJuryRound requires invokeLlmJuror dependency");
			}
			const verdict = await deps.invokeLlmJuror({
				jurorId: slot.jurorId,
				verifiedReport: args.verifiedReport,
				casePackage: context.casePackage,
			});
			return await persistAndReadBackOpinion({
				deps: opinionDeps,
				basePointer: args.oasisPointer,
				casePackage: context.casePackage,
				slotIndex: slot.slotIndex,
				cohort: "LLM",
				jurorId: slot.jurorId,
				verdict,
				lateSafeTimestampSec: context.lateSafeTimestampSec,
			});
		}),
	);
}

export async function collectHumanJurorOpinionRecords(
	args: ExecuteJuryRoundArgs,
	context: JuryRoundContext,
	humanOpinions: HumanOpinionInput[],
	deps: JuryRoundDeps,
): Promise<PersistedJurorOpinionRecord[]> {
	const opinionDeps = requireOpinionPersistenceDeps(deps);
	if (humanOpinions.length !== context.humanSlots.length) {
		throw new Error(
			"humanOpinions must match the active human juror slot count",
		);
	}

	const humanOpinionById = new Map(
		humanOpinions.map((opinion) => [opinion.jurorId, opinion]),
	);
	return await Promise.all(
		context.humanSlots.map(async (slot) => {
			const opinion = humanOpinionById.get(slot.jurorId);
			if (!opinion) {
				throw new Error(`missing human opinion for ${slot.jurorId}`);
			}

			return await persistAndReadBackOpinion({
				deps: opinionDeps,
				basePointer: args.oasisPointer,
				casePackage: context.casePackage,
				slotIndex: slot.slotIndex,
				cohort: "HUMAN",
				jurorId: slot.jurorId,
				verdict: opinion,
				lateSafeTimestampSec: context.lateSafeTimestampSec,
			});
		}),
	);
}

export async function aggregateCollectedJuryOpinions(
	args: ExecuteJuryRoundArgs,
	context: JuryRoundContext,
	sealedOpinions: PersistedJurorOpinionRecord[],
	deps: JuryRoundDeps = {},
): Promise<JuryRoundResult> {
	const opinionIngest = runJuryRecommendationPipeline({
		mode: "opinion-ingest",
		config: args.workflowConfig,
		casePackage: context.casePackage,
		sealedOpinions,
	});

	const aggregation = runJuryRecommendationPipeline({
		mode: "aggregate-opinions",
		config: args.workflowConfig,
		casePackage: context.casePackage,
		opinionIngest,
		currentTimestampSec: context.currentTimestampSec,
	}) as JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope;

	if (aggregation.reportType === "jury-consensus/v1") {
		const finalDrainAmountWei =
			aggregation.payload.finalValidity === "INVALID"
				? 0n
				: normalizePositiveBigInt(
						args.finalDrainAmountWei ?? args.verifiedReport.payload.drainAmountWei,
						"finalDrainAmountWei",
					);
		const finalResult = runJuryRecommendationPipeline({
			mode: "final-package",
			config: args.workflowConfig,
			casePackage: context.casePackage,
			finalVerdict: {
				consensus: aggregation,
				opinionIngest,
				drainAmountWei: finalDrainAmountWei,
			},
		}) as AdjudicationFinalPackageEnvelope;
		const encodedContractReport = encodeJuryOrchestratorContractReport(finalResult);
		const reportSubmission = deps.submitEncodedReport
			? await deps.submitEncodedReport(encodedContractReport, finalResult)
			: undefined;
		return {
			casePackage: context.casePackage,
			opinionIngest,
			aggregation,
			finalResult,
			encodedContractReport,
			reportSubmission,
		};
	}

	return {
		casePackage: context.casePackage,
		opinionIngest,
		aggregation,
		finalResult: aggregation,
	};
}

export async function executeJuryRound(
	args: ExecuteJuryRoundArgs,
	deps: JuryRoundDeps = {},
): Promise<JuryRoundResult> {
	void (deps.nowSec?.() ?? 0n);
	const context = prepareJuryRoundContext(args);
	const persistedLlmOpinions = await collectLlmJurorOpinionRecords(
		args,
		context,
		deps,
	);
	const persistedHumanOpinions = await collectHumanJurorOpinionRecords(
		args,
		context,
		args.humanOpinions,
		deps,
	);

	return await aggregateCollectedJuryOpinions(
		args,
		context,
		[...persistedLlmOpinions, ...persistedHumanOpinions],
		deps,
	);
}

function parseArgs(argv: string[]): {
	configPath: string;
	verifiedReportPath: string;
	humanOpinionsPath: string;
	juryRoundId: string;
} {
	let configPath = "";
	let verifiedReportPath = "";
	let humanOpinionsPath = "";
	let juryRoundId = "1";
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		const next = argv[index + 1];
		if (
			(token === "--config" ||
				token === "--verified-report" ||
				token === "--human-opinions" ||
				token === "--jury-round-id") &&
			(!next || next.startsWith("--"))
		) {
			throw new Error(`Missing value for ${token}`);
		}
		if (token === "--config") {
			configPath = next;
			index += 1;
			continue;
		}
		if (token === "--verified-report") {
			verifiedReportPath = next;
			index += 1;
			continue;
		}
		if (token === "--human-opinions") {
			humanOpinionsPath = next;
			index += 1;
			continue;
		}
		if (token === "--jury-round-id") {
			juryRoundId = next;
			index += 1;
			continue;
		}
		throw new Error(`Unknown option: ${token}`);
	}
	if (!configPath || !verifiedReportPath || !humanOpinionsPath) {
		throw new Error(
			"Usage: bun run-once.ts --config <file> --verified-report <file> --human-opinions <file> [--jury-round-id <n>]",
		);
	}
	return { configPath, verifiedReportPath, humanOpinionsPath, juryRoundId };
}

async function mainCli(argv: string[]): Promise<void> {
	const args = parseArgs(argv);
	const runtimeConfig = JSON.parse(
		readFileSync(args.configPath, "utf8"),
	) as RuntimeConfig;
	const verifiedReport = JSON.parse(
		readFileSync(args.verifiedReportPath, "utf8"),
	) as VerifiedReportEnvelopeV3;
	const humanOpinions = JSON.parse(
		readFileSync(args.humanOpinionsPath, "utf8"),
	) as HumanOpinionInput[];
	const apiUrl =
		runtimeConfig.llm.apiUrl ?? "https://openrouter.ai/api/v1/chat/completions";
	const apiKeyEnvVar = runtimeConfig.llm.apiKeyEnvVar ?? "LLM_API_KEY_VALUE";
	const apiKey = process.env[apiKeyEnvVar]?.trim();
	if (!apiKey) {
		throw new Error(`Missing required environment variable: ${apiKeyEnvVar}`);
	}
	const oasisApiUrl = process.env.OASIS_API_URL?.trim();
	if (!oasisApiUrl) {
		throw new Error("Missing required environment variable: OASIS_API_URL");
	}
	const oasisClient = createOasisClient({ baseUrl: oasisApiUrl });
	const bountyHubAddress = normalizeHexAddress(
		runtimeConfig.submission?.receiverAddress ??
			readWorkflowConfigField(
				runtimeConfig.workflowConfig,
				"bountyHubAddress",
			) ??
			"",
		"submission receiverAddress",
	);
	const gasLimit = readWorkflowConfigField(
		runtimeConfig.workflowConfig,
		"gasLimit",
	);
	const submissionConfig = runtimeConfig.submission;
	let submitEncodedReport: JuryRoundDeps["submitEncodedReport"];
	if (submissionConfig && submissionConfig.enabled !== false) {
		const rpcUrlEnvVar =
			submissionConfig.rpcUrlEnvVar ?? "CRE_SIM_ADMIN_RPC_URL";
		const privateKeyEnvVar =
			submissionConfig.privateKeyEnvVar ?? "CRE_SIM_PRIVATE_KEY";
		const rpcUrl = process.env[rpcUrlEnvVar]?.trim();
		if (!rpcUrl) {
			throw new Error(`Missing required environment variable: ${rpcUrlEnvVar}`);
		}
		const privateKey = process.env[privateKeyEnvVar]?.trim();
		if (!privateKey) {
			throw new Error(
				`Missing required environment variable: ${privateKeyEnvVar}`,
			);
		}
		submitEncodedReport = (encodedReport) =>
			submitJuryReportOnchain({
				receiverAddress: bountyHubAddress,
				rpcUrl,
				privateKey: normalizePrivateKeyHex(privateKey, privateKeyEnvVar),
				encodedReport,
				workflowOwner: submissionConfig.workflowOwner,
				workflowName10: submissionConfig.workflowName10,
				gasLimit,
			});
	}
	const result = await executeJuryRound(
		{
			workflowConfig: runtimeConfig.workflowConfig,
			verifiedReport,
			juryRoundId: args.juryRoundId,
			rosterSelection: runtimeConfig.rosterSelection,
			humanOpinions,
			oasisPointer: runtimeConfig.oasisPointer,
		},
		{
			invokeLlmJuror: (input) =>
				defaultInvokeLlmJuror({
					...input,
					apiUrl,
					apiKey,
				}),
			oasisWrite: (payload) => oasisClient.write(payload),
			oasisRead: (payload) => oasisClient.read(payload),
			submitEncodedReport,
		},
	);
	console.log(
		JSON.stringify(
			{
				caseReportType: result.casePackage.reportType,
				aggregationReportType: result.aggregation.reportType,
				finalReportType: result.finalResult.reportType,
				encodedContractReport: result.encodedContractReport,
				submissionTxHash: result.reportSubmission?.txHash,
			},
			null,
			2,
		),
	);
}

if (import.meta.main) {
	await mainCli(process.argv.slice(2));
}
