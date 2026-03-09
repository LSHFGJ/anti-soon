import { describe, expect, it } from "bun:test"
import { rmSync } from "node:fs"
import { join, resolve } from "node:path"

import { buildVerifyPocStrictFailEvidenceEnvelope, encodeVerifyPocTypedReportEnvelope } from "../../../workflow/verify-poc/main"
import { executeCreWorkflowSimulateAdapter } from "./live-verify"

const REPO_ROOT = resolve(import.meta.dir, "../../..")

describe("cre-workflow-simulate adapter", () => {
	it("captures the workflow result emitted on stdout", async () => {
		const evidenceDir = "backend/cre-simulator/.live-verify.test-evidence"
		rmSync(join(REPO_ROOT, evidenceDir), { recursive: true, force: true })

		const workflowResult = encodeVerifyPocTypedReportEnvelope(
			buildVerifyPocStrictFailEvidenceEnvelope({
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
			}),
		)

		try {
			const result = await executeCreWorkflowSimulateAdapter({
				repoRoot: REPO_ROOT,
				env: {},
				adapterConfig: {
					workflowPath: "workflow/verify-poc",
					target: "staging-settings",
					triggerIndex: 0,
					evmInput: "event-coordinates",
				},
				evmTxHash:
					"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				evmEventIndex: 4,
				evidenceDir,
				runCommand: async () => ({
					exitCode: 0,
					stdout: `${JSON.stringify(workflowResult)}\n`,
					stderr: "",
				}),
			})

			expect(result).toMatchObject({
				mode: "cre-workflow-simulate",
				workflowResult,
			})
		} finally {
			rmSync(join(REPO_ROOT, evidenceDir), { recursive: true, force: true })
		}
	})
})
