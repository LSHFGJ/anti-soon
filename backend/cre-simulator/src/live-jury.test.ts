import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { executeJuryOrchestratorRunOnceAdapter } from "./live-jury";

function withTempDir(
	run: (tempDir: string) => Promise<void> | void,
): Promise<void> {
	const tempDir = mkdtempSync(join(tmpdir(), "jury-run-once-"));
	return Promise.resolve(run(tempDir)).finally(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});
}

describe("jury-orchestrator run-once adapter", () => {
	it("builds a run-once command from human input payload and parses the summary", async () => {
		await withTempDir(async (repoRoot) => {
			let capturedCommand:
				| {
						command: string;
						args: string[];
						cwd: string;
						env: Record<string, string | undefined>;
				  }
				| undefined;

			const result = await executeJuryOrchestratorRunOnceAdapter({
				repoRoot,
				env: {
					CRE_SIM_LLM_API_KEY: "test-key",
					OASIS_API_URL: "https://oasis.invalid",
				},
				adapterConfig: {
					configPath: "workflow/jury-orchestrator/run-once.example.json",
				},
				inputPayload: {
					verifiedReport: {
						magic: "ASRP",
						reportType: "verified-report/v3",
						payload: {
							submissionId: "9",
							projectId: "2",
							isValid: false,
							drainAmountWei: "1300000000000000000",
							observedCalldata: ["0xdeadbeef"],
						},
						juryCommitment: {
							commitmentVersion: "anti-soon.verify-poc.jury-commitment.v1",
							juryLedgerDigest:
								"0x1111111111111111111111111111111111111111111111111111111111111111",
							sourceEventKey:
								"0x2222222222222222222222222222222222222222222222222222222222222222",
							mappingFingerprint:
								"0x3333333333333333333333333333333333333333333333333333333333333333",
						},
						adjudication: {
							adjudicationVersion: "anti-soon.verify-poc.adjudication.v1",
							syncId:
								"0x4444444444444444444444444444444444444444444444444444444444444444",
							idempotencyKey:
								"0x5555555555555555555555555555555555555555555555555555555555555555",
							cipherURI: "ipfs://cipher",
							severity: 3,
							juryWindow: "3600",
							adjudicationWindow: "7200",
							commitTimestampSec: "100",
							revealTimestampSec: "200",
							chainSelectorName: "ethereum-testnet-sepolia",
							bountyHubAddress: "0x3fBd5ab0F3FD234A40923ae7986f45acB9d4A3cf",
							oasis: {
								chain: "oasis-sapphire-testnet",
								contract: "0x1111111111111111111111111111111111111111",
								slotId: "slot-1",
								envelopeHash:
									"0x6666666666666666666666666666666666666666666666666666666666666666",
							},
						},
					},
					humanOpinions: [
						{
							jurorId: "human:alice",
							finalValidity: "HIGH",
							rationale: "alice rationale",
							testimony: "alice testimony",
						},
					],
					juryRoundId: 7,
				},
				runCommand: async (spec) => {
					capturedCommand = spec;
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							caseReportType: "adjudication-case/v1",
							aggregationReportType: "jury-consensus/v1",
							finalReportType: "adjudication-final/v1",
							submissionTxHash:
								"0x7777777777777777777777777777777777777777777777777777777777777777",
						}),
						stderr: "",
					};
				},
			});

			expect(capturedCommand?.command).toBe("bun");
			expect(capturedCommand?.args).toEqual([
				"workflow/jury-orchestrator/run-once.ts",
				"--config",
				"workflow/jury-orchestrator/run-once.example.json",
				"--verified-report",
				expect.stringContaining("verified-report.json"),
				"--human-opinions",
				expect.stringContaining("human-opinions.json"),
				"--jury-round-id",
				"7",
			]);
			expect(capturedCommand?.env.CRE_SIM_LLM_API_KEY).toBe("test-key");
			expect(capturedCommand?.env.OASIS_API_URL).toBe("https://oasis.invalid");
			expect(readFileSync(capturedCommand?.args[4] ?? "", "utf8")).toContain(
				'"reportType": "verified-report/v3"',
			);
			expect(readFileSync(capturedCommand?.args[6] ?? "", "utf8")).toContain(
				'"jurorId": "human:alice"',
			);
			expect(result.summary).toEqual({
				caseReportType: "adjudication-case/v1",
				aggregationReportType: "jury-consensus/v1",
				finalReportType: "adjudication-final/v1",
				submissionTxHash:
					"0x7777777777777777777777777777777777777777777777777777777777777777",
			});
		});
	});
});
