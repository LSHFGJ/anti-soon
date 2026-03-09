import { describe, expect, it } from "bun:test";

import { keccak256, toBytes } from "../verify-poc/node_modules/viem";
import type {
	OasisReadRequest,
	OasisResult,
	OasisWriteRequest,
} from "../verify-poc/src/oasisClient";
import {
	OASIS_ENVELOPE_VERSION,
	type OasisEnvelope,
} from "../verify-poc/src/oasisEnvelope";
import type {
	AdjudicationFinalPackageEnvelope,
	OwnerAdjudicationHandoffEnvelope,
	VerifiedReportEnvelopeV3,
} from "./main";
import {
	type JuryRoundContext,
	collectLlmJurorOpinionRecords,
	type ExecuteJuryRoundArgs,
	executeJuryRound,
	prepareJuryRoundContext,
	type JuryRoundDeps,
	parseJurorVerdictResponse,
	submitJuryReportOnchain,
} from "./run-once";

function bytes32Hex(seed: string): `0x${string}` {
	const hex = seed.repeat(64).slice(0, 64);
	return `0x${hex}` as `0x${string}`;
}

function buildVerifiedReportV3(): VerifiedReportEnvelopeV3 {
	return {
		magic: "ASRP",
		reportType: "verified-report/v3",
		payload: {
			submissionId: 9n,
			projectId: 3n,
			isValid: false,
			drainAmountWei: 0n,
			observedCalldata: [],
		},
		juryCommitment: {
			commitmentVersion: "anti-soon.verify-poc.jury-commitment.v1",
			juryLedgerDigest: bytes32Hex("a"),
			sourceEventKey: bytes32Hex("b"),
			mappingFingerprint: bytes32Hex("c"),
		},
		adjudication: {
			adjudicationVersion: "anti-soon.verify-poc.adjudication.v1",
			syncId: bytes32Hex("d"),
			idempotencyKey: bytes32Hex("e"),
			cipherURI:
				"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			severity: 2,
			juryWindow: 3600n,
			adjudicationWindow: 7200n,
			commitTimestampSec: 1700000000n,
			revealTimestampSec: 1700000060n,
			chainSelectorName: "ethereum-testnet-sepolia",
			bountyHubAddress: "0x3fbd5ab0f3fd234a40923ae7986f45acb9d4a3cf",
			oasis: {
				chain: "oasis-sapphire-testnet",
				contract: "0x1111111111111111111111111111111111111111",
				slotId: "slot-42",
				envelopeHash: bytes32Hex("f"),
			},
		},
	};
}

function buildArgs(
	overrides?: Partial<ExecuteJuryRoundArgs>,
): ExecuteJuryRoundArgs {
	return {
		workflowConfig: {
			chainSelectorName: "ethereum-testnet-sepolia",
			bountyHubAddress: "0x3fbd5ab0f3fd234a40923ae7986f45acb9d4a3cf",
			gasLimit: "300000",
			juryPolicy: {
				allowDirectSettlement: false,
				requireOwnerResolution: true,
			},
		},
		verifiedReport: buildVerifiedReportV3(),
		juryRoundId: 1n,
		rosterSelection: {
			llmJurors: [
				{ jurorId: "llm:gpt-4.1" },
				{ jurorId: "llm:claude-3.7-sonnet" },
				{ jurorId: "llm:gemini-2.5-pro" },
				{ jurorId: "llm:llama-3.1-405b" },
				{ jurorId: "llm:qwen-2.5-72b" },
			],
			humanCandidates: [
				{ jurorId: "human:alice" },
				{ jurorId: "human:bob" },
				{ jurorId: "human:carol" },
				{ jurorId: "human:dora" },
				{ jurorId: "human:erin" },
			],
			humanSelection: {
				selectionVersion: "anti-soon.human-juror-selection.v1",
				randomnessDigest: bytes32Hex("1"),
				selectionSource: "manual-seeded-test",
				selectionNonce: bytes32Hex("2"),
			},
		},
		humanOpinions: [
			{
				jurorId: "human:alice",
				finalValidity: "HIGH",
				rationale: "human-a rationale",
				testimony: "human-a testimony",
			},
			{
				jurorId: "human:bob",
				finalValidity: "HIGH",
				rationale: "human-b rationale",
				testimony: "human-b testimony",
			},
			{
				jurorId: "human:carol",
				finalValidity: "HIGH",
				rationale: "human-c rationale",
				testimony: "human-c testimony",
			},
			{
				jurorId: "human:dora",
				finalValidity: "HIGH",
				rationale: "human-d rationale",
				testimony: "human-d testimony",
			},
			{
				jurorId: "human:erin",
				finalValidity: "HIGH",
				rationale: "human-e rationale",
				testimony: "human-e testimony",
			},
		],
		currentTimestampSec: 1700003661n,
		finalDrainAmountWei: 1_000000000000000000n,
		oasisPointer: {
			chain: "oasis-sapphire-testnet",
			contract: "0x1111111111111111111111111111111111111111",
			slotPrefix: "jury-round",
		},
		...overrides,
	};
}

function createInMemoryDeps(): JuryRoundDeps & { writes: OasisWriteRequest[] } {
	const stored = new Map<
		string,
		{ ciphertext: string; iv: string; envelope: OasisEnvelope }
	>();
	const writes: OasisWriteRequest[] = [];
	return {
		writes,
		invokeLlmJuror: async ({ jurorId }) => ({
			finalValidity: "HIGH",
			rationale: `${jurorId} rationale`,
			testimony: `${jurorId} testimony`,
		}),
		oasisWrite: async (
			payload,
		): Promise<
			OasisResult<{
				ok: true;
				pointer: { chain: string; contract: string; slotId: string };
			}>
		> => {
			writes.push(payload);
			stored.set(payload.pointer.slotId, {
				ciphertext: payload.ciphertext,
				iv: payload.iv,
				envelope: {
					version: OASIS_ENVELOPE_VERSION,
					pointer: payload.pointer,
					ciphertext: {
						ciphertextHash: bytes32Hex("9"),
						ivHash: bytes32Hex("8"),
					},
				},
			});
			return { ok: true, data: { ok: true, pointer: payload.pointer } };
		},
		oasisRead: async (payload: OasisReadRequest) => {
			const hit = stored.get(payload.pointer.slotId);
			if (!hit) {
				return {
					ok: false,
					error: { kind: "not_found", message: "missing", retriable: false },
				};
			}
			return {
				ok: true,
				data: {
					ok: true,
					ciphertext: hit.ciphertext,
					iv: hit.iv,
				},
			};
		},
		nowSec: () => 1700003661n,
	};
}

describe("jury run-once verdict parsing", () => {
	it("parses strict json verdict responses", () => {
		expect(
			parseJurorVerdictResponse(
				'{"finalValidity":"HIGH","rationale":"clear exploit path","testimony":"replay confirms impact"}',
			),
		).toEqual({
			finalValidity: "HIGH",
			rationale: "clear exploit path",
			testimony: "replay confirms impact",
		});
	});
});

describe("jury run-once executor", () => {
	it("submits encoded jury reports with workflow metadata through onReport", async () => {
		const receiverAddress =
			"0x9999999999999999999999999999999999999999" as const;
		const workflowOwner = "0x2222222222222222222222222222222222222222" as const;
		const encodedReport = "0x1234" as const;
		const simulateCalls: Array<Record<string, unknown>> = [];
		const writeCalls: Array<Record<string, unknown>> = [];

		const result = await submitJuryReportOnchain(
			{
				receiverAddress,
				rpcUrl: "http://127.0.0.1:8545",
				privateKey:
					"0x1111111111111111111111111111111111111111111111111111111111111111",
				encodedReport,
				workflowOwner,
				workflowName10: "juryorc001",
			},
			{
				transport: {
					simulateContract: async (request) => {
						simulateCalls.push(request as Record<string, unknown>);
						return { request };
					},
					writeContract: async (request) => {
						writeCalls.push(request as Record<string, unknown>);
						return bytes32Hex("a");
					},
					waitForTransactionReceipt: async ({ hash }) => ({
						hash,
						status: "success" as const,
					}),
				},
			},
		);

		expect(simulateCalls).toHaveLength(1);
		expect(writeCalls).toHaveLength(1);
		expect(result).toEqual({ txHash: bytes32Hex("a") });

		const simulateRequest = simulateCalls[0] as {
			address: string;
			functionName: string;
			args: readonly [string, string];
		};
		expect(simulateRequest.address).toBe(receiverAddress);
		expect(simulateRequest.functionName).toBe("onReport");
		expect(simulateRequest.args[1]).toBe(encodedReport);
		expect(simulateRequest.args[0]).toBe(
			`${keccak256(toBytes("jury-orchestrator"))}${Buffer.from("juryorc001", "utf8").toString("hex")}${workflowOwner.slice(2)}`,
		);
	});

	it("runs llm jurors, persists opinions through oasis, and emits a final package on consensus", async () => {
		const deps = createInMemoryDeps();
		const submitCalls: Array<{
			encodedReport: `0x${string}`;
			finalReport: AdjudicationFinalPackageEnvelope;
		}> = [];

		const result = await executeJuryRound(buildArgs(), {
			...deps,
			submitEncodedReport: async (encodedReport, finalReport) => {
				submitCalls.push({ encodedReport, finalReport });
				return { txHash: bytes32Hex("b") };
			},
		});

		expect(result.casePackage.reportType).toBe("adjudication-case/v1");
		expect(result.opinionIngest.reportType).toBe("jury-opinion-ingest/v1");
		expect(result.aggregation.reportType).toBe("jury-consensus/v1");
		expect(
			(result.finalResult as AdjudicationFinalPackageEnvelope).reportType,
		).toBe("adjudication-final/v1");
		expect(result.encodedContractReport?.startsWith("0x")).toBe(true);
		expect(result.reportSubmission).toEqual({ txHash: bytes32Hex("b") });
		expect(deps.writes).toHaveLength(10);
		expect(submitCalls).toHaveLength(1);
		expect(submitCalls[0]?.encodedReport).toBe(result.encodedContractReport);
	});

	it("collects llm opinions before any human opinions are available", async () => {
		const deps = createInMemoryDeps();
		const args = buildArgs();
		const context: JuryRoundContext = prepareJuryRoundContext(args);

		const llmOpinions = await collectLlmJurorOpinionRecords(args, context, deps);

		expect(llmOpinions).toHaveLength(5);
		expect(llmOpinions.every((opinion) => opinion.cohort === "LLM")).toBe(true);
		expect(deps.writes).toHaveLength(5);
	});

	it("returns owner handoff when jury support stays below consensus threshold", async () => {
		const deps = createInMemoryDeps();
		deps.invokeLlmJuror = async ({ jurorId }) => ({
			finalValidity: jurorId.endsWith("1") ? "INVALID" : "HIGH",
			rationale: `${jurorId} rationale`,
			testimony: `${jurorId} testimony`,
		});

		const result = await executeJuryRound(
			buildArgs({
				humanOpinions: [
					{
						jurorId: "human:alice",
						finalValidity: "HIGH",
						rationale: "human-a rationale",
						testimony: "human-a testimony",
					},
					{
						jurorId: "human:bob",
						finalValidity: "HIGH",
						rationale: "human-b rationale",
						testimony: "human-b testimony",
					},
					{
						jurorId: "human:carol",
						finalValidity: "INVALID",
						rationale: "human-c rationale",
						testimony: "human-c testimony",
					},
					{
						jurorId: "human:dora",
						finalValidity: "INVALID",
						rationale: "human-d rationale",
						testimony: "human-d testimony",
					},
					{
						jurorId: "human:erin",
						finalValidity: "INVALID",
						rationale: "human-e rationale",
						testimony: "human-e testimony",
					},
				],
			}),
			deps,
		);

		expect(
			(result.aggregation as OwnerAdjudicationHandoffEnvelope).reportType,
		).toBe("owner-adjudication-handoff/v1");
		expect(result.encodedContractReport).toBeUndefined();
	});
});
