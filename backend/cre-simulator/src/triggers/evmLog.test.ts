import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { dispatchEvmLogTriggerEvent } from "./evmLog"
import {
	claimCreSimulatorTriggerExecution,
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
const TOPIC0 = "0xc3c91f25332a5a28defde601c6ccdf9ba0eeb99c94ef7a6cc5fb5a7e7737643f"
const BOUNTY_HUB_ADDRESS = "0x3fbd5ab0f3fd234a40923ae7986f45acb9d4a3cf"
const ACTUAL_REPO_ROOT = join(import.meta.dir, "../../../..")

describe("cre-simulator EVM-log triggers", () => {
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
