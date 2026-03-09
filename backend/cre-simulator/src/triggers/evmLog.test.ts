import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildVerifyPocStrictFailEvidenceEnvelope, encodeVerifyPocTypedReportEnvelope } from "../../../../workflow/verify-poc/main"
import { dispatchEvmLogTriggerEvent } from "./evmLog"
import {
	claimCreSimulatorTriggerExecution,
	getProjectDeadlineSchedule,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionQuarantined,
} from "./stateStore"

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
	const tempDir = mkdtempSync(join(tmpdir(), "cre-sim-trigger-evm-"))
	return Promise.resolve()
		.then(() => run(tempDir))
		.finally(() => rmSync(tempDir, { recursive: true, force: true }))
}

const CONFIG_SCHEMA_VERSION = "anti-soon.cre-simulator.trigger-config.v1"
const PROJECT_REGISTERED_TOPIC0 =
	"0x13bbb3164af432cb24bde885d40a3049f565bcfb8f24033d57c7953fbbf33606"
const TOPIC0 = "0xc3c91f25332a5a28defde601c6ccdf9ba0eeb99c94ef7a6cc5fb5a7e7737643f"
const BOUNTY_HUB_ADDRESS = "0x3fbd5ab0f3fd234a40923ae7986f45acb9d4a3cf"
const ACTUAL_REPO_ROOT = join(import.meta.dir, "../../../..")

describe("cre-simulator EVM-log triggers", () => {
	it("dispatches project registration logs into the vnet-init workflow adapter", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {},
						cronTriggers: {},
						evmLogTriggers: {
							"project-registered": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/vnet-init",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: BOUNTY_HUB_ADDRESS,
								topic0: PROJECT_REGISTERED_TOPIC0,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			let adapterRequest: Record<string, unknown> | null = null
			const result = await dispatchEvmLogTriggerEvent(
				{
					repoRoot: tempDir,
					configPath,
					triggerName: "project-registered",
					event: {
						address: BOUNTY_HUB_ADDRESS,
						topics: [
							PROJECT_REGISTERED_TOPIC0,
							"0x0000000000000000000000000000000000000000000000000000000000000009",
						],
						topic0: PROJECT_REGISTERED_TOPIC0,
						txHash:
							"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
						logIndex: 0,
						blockNumber: 101n,
					},
				},
				{},
				{
					nowMs: () => 1000,
					readProject: async () => ({
						commitDeadline: 10n,
						revealDeadline: 20n,
					}),
					executeAdapter: async (request) => {
						adapterRequest = request as unknown as Record<string, unknown>
						return {
							adapter: "cre-workflow-simulate",
							result: { mode: "cre-workflow-simulate", workflowPath: "workflow/vnet-init" },
						}
					},
				},
			)

			expect(result.deduped).toBe(false)
			expect(adapterRequest).toMatchObject({
				adapter: "cre-workflow-simulate",
				adapterConfig: {
					workflowPath: "workflow/vnet-init",
					target: "staging-settings",
					triggerIndex: 0,
					evmInput: "event-coordinates",
				},
				evmTxHash:
					"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
				evmEventIndex: 0,
			})
		})
	})

	it("bootstraps project deadline schedule from project registration logs", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {},
						cronTriggers: {},
						evmLogTriggers: {
							"project-registered": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/vnet-init",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: BOUNTY_HUB_ADDRESS,
								topic0: PROJECT_REGISTERED_TOPIC0,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			await dispatchEvmLogTriggerEvent(
				{
					repoRoot: tempDir,
					configPath,
					triggerName: "project-registered",
					event: {
						address: BOUNTY_HUB_ADDRESS,
						topics: [
							PROJECT_REGISTERED_TOPIC0,
							"0x0000000000000000000000000000000000000000000000000000000000000009",
						],
						topic0: PROJECT_REGISTERED_TOPIC0,
						txHash:
							"0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
						logIndex: 0,
						blockNumber: 101n,
					},
				},
				{},
				{
					nowMs: () => 1000,
					readProject: async (projectId) => {
						expect(projectId).toBe(9n)
						return {
							commitDeadline: 10n,
							revealDeadline: 20n,
						}
					},
					executeAdapter: async (request) => ({
						adapter: request.adapter,
						result: { adapter: request.adapter },
					}),
				},
			)

			const binding = {
				configPath,
				stateFilePath: join(tempDir, ".trigger-state.json"),
			}
			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 2000)
			expect(getProjectDeadlineSchedule(store, 9n)).toEqual({
				projectId: "9",
				commitDeadlineMs: 10_000,
				revealDeadlineMs: 20_000,
			})
		})
	})

	it("auto-dispatches commit deadline when verify-poc emits strict-fail evidence", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {
							"manual-commit-deadline": {
								adapter: "demo-adjudication-orchestrator",
								adapterConfig: {
									configPath: "workflow/jury-orchestrator/run-once.example.json",
								},
							},
						},
						cronTriggers: {},
						evmLogTriggers: {
							"poc-revealed": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/verify-poc",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: BOUNTY_HUB_ADDRESS,
								topic0: TOPIC0,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const verifyPocReport = encodeVerifyPocTypedReportEnvelope(
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
					bountyHubAddress: BOUNTY_HUB_ADDRESS,
				}),
			)

			const requests: Array<Record<string, unknown>> = []
			await dispatchEvmLogTriggerEvent(
				{
					repoRoot: tempDir,
					configPath,
					triggerName: "poc-revealed",
					event: {
						address: BOUNTY_HUB_ADDRESS,
						topic0: TOPIC0,
						txHash:
							"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
						logIndex: 4,
						blockNumber: 88n,
					},
				},
				{},
				{
					nowMs: () => 1_000,
					executeAdapter: async (request) => {
						requests.push(request as unknown as Record<string, unknown>)
						if (request.adapter === "cre-workflow-simulate") {
							return {
								adapter: request.adapter,
								result: {
									mode: "cre-workflow-simulate",
									workflowPath: "workflow/verify-poc",
									workflowResult: verifyPocReport,
								},
							}
						}

						return {
							adapter: request.adapter,
							result: { phase: "commit-deadline", juryTriggered: true },
						}
					},
				},
			)

			expect(requests).toHaveLength(2)
			expect(requests[1]).toMatchObject({
				adapter: "demo-adjudication-orchestrator",
				inputPayload: {
					phase: "commit-deadline",
					verifyPocReport,
				},
			})
		})
	})

	it("dispatches a matching log event once and ignores duplicates after persistence", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {},
						cronTriggers: {},
						evmLogTriggers: {
							"poc-revealed": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/verify-poc",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: BOUNTY_HUB_ADDRESS,
								topic0: TOPIC0,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			let callCount = 0
			const request = {
				repoRoot: tempDir,
				configPath,
					triggerName: "poc-revealed",
					event: {
						address: BOUNTY_HUB_ADDRESS,
					topic0: TOPIC0,
					txHash:
						"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					logIndex: 1,
					blockNumber: 88n,
				},
			}

			const first = await dispatchEvmLogTriggerEvent(request, {}, {
				nowMs: () => 1000,
						executeAdapter: async () => {
							callCount += 1
							return {
								adapter: "cre-workflow-simulate",
								result: { submissionId: "12" },
							}
						},
			})

			const second = await dispatchEvmLogTriggerEvent(request, {}, {
				nowMs: () => 2000,
				executeAdapter: async () => {
					throw new Error("duplicate should not dispatch")
				},
			})

			expect(callCount).toBe(1)
			expect(first.deduped).toBe(false)
			expect(second.deduped).toBe(true)
		})
	})

	it("quarantines failed dispatches without advancing the listener cursor", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {},
						cronTriggers: {},
						evmLogTriggers: {
							"poc-revealed": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/verify-poc",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: BOUNTY_HUB_ADDRESS,
								topic0: TOPIC0,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			await expect(
				dispatchEvmLogTriggerEvent(
					{
						repoRoot: tempDir,
						configPath,
						triggerName: "poc-revealed",
						event: {
							address: BOUNTY_HUB_ADDRESS,
							topic0: TOPIC0,
							txHash:
								"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							logIndex: 1,
							blockNumber: 88n,
						},
					},
					{},
					{
						nowMs: () => 1000,
						executeAdapter: async () => {
							throw new Error("verify failed")
						},
					},
				),
			).rejects.toThrow("verify failed")

			const state = await Bun.file(join(tempDir, ".trigger-state.json")).json() as {
				listenerCursorByName: Record<string, unknown>
				executionStateByKey: Record<string, { status: string }>
			}
			expect(state.listenerCursorByName["poc-revealed"]).toBeUndefined()
			expect(Object.values(state.executionStateByKey)[0]).toMatchObject({ status: "quarantined" })
		})
	})

	it("fails closed before dispatch when trigger state is unhealthy", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {},
						cronTriggers: {},
						evmLogTriggers: {
							"poc-revealed": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/verify-poc",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: BOUNTY_HUB_ADDRESS,
								topic0: TOPIC0,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const binding = {
				configPath,
				stateFilePath: join(tempDir, ".trigger-state.json"),
			}
			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 1000)
			claimCreSimulatorTriggerExecution(store, "evm-log:poc-revealed:bad", {
				triggerName: "poc-revealed",
				triggerType: "evm-log",
			}, 1000)
			markCreSimulatorTriggerExecutionQuarantined(store, "evm-log:poc-revealed:bad", "boom", 1001)

			await expect(
				dispatchEvmLogTriggerEvent(
					{
						repoRoot: tempDir,
						configPath,
						triggerName: "poc-revealed",
						event: {
							address: BOUNTY_HUB_ADDRESS,
							topic0: TOPIC0,
							txHash:
								"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							logIndex: 1,
							blockNumber: 88n,
						},
					},
					{},
					{
						nowMs: () => 2000,
						executeAdapter: async () => {
							throw new Error("should not dispatch")
						},
					},
				),
			).rejects.toThrow("Cre-simulator trigger state store is not healthy")
		})
	})

	it("loads the checked-in listener config when no repoRoot override is provided", async () => {
		const configPath = join(
			ACTUAL_REPO_ROOT,
			"backend/cre-simulator/.evm-default-config.test.json",
		)
		writeFileSync(
			configPath,
			`${JSON.stringify(
				{
					schemaVersion: CONFIG_SCHEMA_VERSION,
					stateFilePath: "backend/cre-simulator/.evm-default-state.test.json",
					httpTriggers: {},
					cronTriggers: {},
					evmLogTriggers: {
						"poc-revealed": {
							adapter: "cre-workflow-simulate",
							adapterConfig: {
								workflowPath: "workflow/verify-poc",
								target: "staging-settings",
								triggerIndex: 0,
								evmInput: "event-coordinates",
							},
							wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
							contractAddress: BOUNTY_HUB_ADDRESS,
							topic0: TOPIC0,
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		)

		try {
			const result = await dispatchEvmLogTriggerEvent(
				{
					triggerName: "poc-revealed",
					configPath: "backend/cre-simulator/.evm-default-config.test.json",
					event: {
						address: BOUNTY_HUB_ADDRESS,
						topic0: TOPIC0,
						txHash:
							"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
						logIndex: 2,
						blockNumber: 99n,
					},
				},
				{},
				{
						nowMs: () => 20_000,
						executeAdapter: async (request) => ({
							adapter: request.adapter,
							result: { adapter: request.adapter },
						}),
					},
			)

			expect(result.adapter).toBe("cre-workflow-simulate")
			expect(result.deduped).toBe(false)
		} finally {
			rmSync(configPath, { force: true })
			rmSync(
				join(ACTUAL_REPO_ROOT, "backend/cre-simulator/.evm-default-state.test.json"),
				{ force: true },
			)
		}
	})
})
