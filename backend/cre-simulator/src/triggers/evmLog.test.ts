import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

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
const TOPIC0 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

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
								command: "verify",
								wsRpcUrlEnvVar: "DEMO_OPERATOR_WS_RPC_URL",
								contractAddress: "0x1111111111111111111111111111111111111111",
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
					address: "0x1111111111111111111111111111111111111111",
					topic0: TOPIC0,
					txHash:
						"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
					logIndex: 1,
					blockNumber: 88n,
				},
			}

			const first = await dispatchEvmLogTriggerEvent(request, {}, {
				nowMs: () => 1000,
				executeCommand: async () => {
					callCount += 1
					return {
						command: "verify",
						scenarioPath: join(tempDir, "scenario.json"),
						result: { submissionId: "12" },
					}
				},
			})

			const second = await dispatchEvmLogTriggerEvent(request, {}, {
				nowMs: () => 2000,
				executeCommand: async () => {
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
								command: "verify",
								wsRpcUrlEnvVar: "DEMO_OPERATOR_WS_RPC_URL",
								contractAddress: "0x1111111111111111111111111111111111111111",
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
							address: "0x1111111111111111111111111111111111111111",
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
						executeCommand: async () => {
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
								command: "verify",
								wsRpcUrlEnvVar: "DEMO_OPERATOR_WS_RPC_URL",
								contractAddress: "0x1111111111111111111111111111111111111111",
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
							address: "0x1111111111111111111111111111111111111111",
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
						executeCommand: async () => {
							throw new Error("should not dispatch")
						},
					},
				),
			).rejects.toThrow("Cre-simulator trigger state store is not healthy")
		})
	})
})
