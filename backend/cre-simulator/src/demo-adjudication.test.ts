import { describe, expect, it } from "bun:test";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";

import {
	buildVerifyPocStrictFailEvidenceEnvelope,
	buildVerifyPocStrictPassReportEnvelope,
} from "../../../workflow/verify-poc/main";
import { executeDemoAdjudicationAdapter } from "./demo-adjudication";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const POCSTORE_PATH = "backend/cre-simulator/.demo-pocstore.test.json";

function cleanupPocstore(): void {
	rmSync(join(REPO_ROOT, POCSTORE_PATH), { force: true });
}

describe("demo adjudication adapter", () => {
	it("skips jury orchestration when strict verification passes", async () => {
		cleanupPocstore();
		let llmCalled = false;

		try {
			const result = await executeDemoAdjudicationAdapter(
				{
					repoRoot: REPO_ROOT,
					env: {},
					adapterConfig: {
						configPath: "workflow/jury-orchestrator/run-once.example.json",
						pocstorePath: POCSTORE_PATH,
					},
					inputPayload: {
						phase: "commit-deadline",
						verifyPocReport: buildVerifyPocStrictPassReportEnvelope({
							submissionId: 9n,
							projectId: 3n,
							verifyResult: { isValid: true, drainAmountWei: 1n },
						}),
					},
				},
				{
					collectLlmOpinions: async () => {
						llmCalled = true;
						return [];
					},
				},
			);

			expect(result).toMatchObject({
				mode: "demo-adjudication-orchestrator",
				phase: "commit-deadline",
				strictGateOutcome: "WRITE_REPORT",
				juryTriggered: false,
			});
			expect(llmCalled).toBe(false);
		} finally {
			cleanupPocstore();
		}
	});

	it("uses the earliest five pocstore human opinions at reveal deadline", async () => {
		cleanupPocstore();

		const verifyPocReport = buildVerifyPocStrictFailEvidenceEnvelope({
			submissionId: 9n,
			projectId: 3n,
			cipherURI:
				"oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			severity: 2,
			juryWindow: 3600n,
			adjudicationWindow: 7200n,
			commitTimestampSec: 1700000000n,
			revealTimestampSec: 1700000060n,
			syncId:
				"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
			oasisReference: {
				pointer: {
					chain: "oasis-sapphire-testnet",
					contract: "0x1111111111111111111111111111111111111111",
					slotId: "slot-42",
				},
				envelopeHash:
					"0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			},
			sourceEventKey:
				"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
			idempotencyKey:
				"0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			mappingFingerprint:
				"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
			verifyResult: {
				isValid: false,
				drainAmountWei: 0n,
				reasonCode: "BINDING_MISMATCH",
				sapphireWriteTimestampSec: 1700000005n,
			},
			chainSelectorName: "ethereum-testnet-sepolia",
			bountyHubAddress: "0x3fbd5ab0f3fd234a40923ae7986f45acb9d4a3cf",
		});

		try {
			await executeDemoAdjudicationAdapter(
				{
					repoRoot: REPO_ROOT,
					env: {},
					adapterConfig: {
						configPath: "workflow/jury-orchestrator/run-once.example.json",
						pocstorePath: POCSTORE_PATH,
					},
					inputPayload: {
						phase: "commit-deadline",
						verifyPocReport,
						juryRoundId: 7,
					},
				},
				{
					nowMs: () => 1,
					collectLlmOpinions: async () =>
						[0, 1, 2, 3, 4].map((slotIndex) => ({
							slotIndex,
							cohort: "LLM" as const,
							jurorId: `llm:${slotIndex}`,
							finalValidity: "HIGH" as const,
							rationaleDigest:
								"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
							testimonyDigest:
								"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							ingestTimestampSec: 1700003000n,
						})),
				},
			);

			for (const [index, author] of ["a", "b", "c", "d", "e", "f"].entries()) {
				await executeDemoAdjudicationAdapter(
					{
						repoRoot: REPO_ROOT,
						env: {},
						adapterConfig: {
							configPath: "workflow/jury-orchestrator/run-once.example.json",
							pocstorePath: POCSTORE_PATH,
						},
						inputPayload: {
							phase: "store-human-opinion",
							opinion: {
								submissionId: 9,
								projectId: 3,
								author,
								finalValidity: "HIGH",
								rationale: `rationale-${author}`,
								testimony: `testimony-${author}`,
							},
						},
					},
					{ nowMs: () => index + 10 },
				);
			}

			const result = await executeDemoAdjudicationAdapter(
				{
					repoRoot: REPO_ROOT,
					env: {},
					adapterConfig: {
						configPath: "workflow/jury-orchestrator/run-once.example.json",
						pocstorePath: POCSTORE_PATH,
					},
					inputPayload: {
						phase: "reveal-deadline",
						submissionId: 9,
						juryRoundId: 7,
					},
				},
				{
					nowMs: () => 99,
					collectHumanOpinions: async (_args, _context, humanOpinions) =>
						humanOpinions.map((opinion, slotIndex) => ({
							slotIndex,
							cohort: "HUMAN" as const,
							jurorId: opinion.jurorId,
							finalValidity: "HIGH" as const,
							rationaleDigest:
								"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
							testimonyDigest:
								"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							ingestTimestampSec: 1700003500n + BigInt(slotIndex),
						})),
					aggregateOpinions: async (_args, _context, sealedOpinions) => ({
						finalReportType: "adjudication-final/v1",
						totalSealedOpinions: sealedOpinions.length,
					}),
				},
			);

			expect(result).toMatchObject({
				mode: "demo-adjudication-orchestrator",
				phase: "reveal-deadline",
				finalReportType: "adjudication-final/v1",
				sourcedHumanOpinionCount: 5,
				totalSealedOpinions: 10,
				selectedHumanOpinionAuthors: ["a", "b", "c", "d", "e"],
			});
		} finally {
			cleanupPocstore();
		}
	});
});
