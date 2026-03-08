import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { dispatchCreSimulatorTrigger } from "./dispatch"
import {
	claimCreSimulatorTriggerExecution,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionQuarantined,
} from "./stateStore"

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
	const tempDir = mkdtempSync(join(tmpdir(), "cre-sim-trigger-dispatch-"))
	return Promise.resolve()
		.then(() => run(tempDir))
		.finally(() => rmSync(tempDir, { recursive: true, force: true }))
}

const CONFIG_SCHEMA_VERSION = "anti-soon.cre-simulator.trigger-config.v1"

describe("cre-simulator trigger dispatch", () => {
	it("dispatches a normalized trigger envelope to the configured backend command", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: { "manual-run": { command: "run" } },
						cronTriggers: {},
						evmLogTriggers: {},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const result = await dispatchCreSimulatorTrigger(
				{
					repoRoot: tempDir,
					configPath,
					triggerName: "manual-run",
					triggerType: "http",
				},
				{},
				{
					executeCommand: async (request) => {
						expect(request.command).toBe("run")
						return {
							command: "run",
							scenarioPath: join(tempDir, "demo-data/operator/multi-fast-happy-path.json"),
							result: { command: "run", stages: { register: { projectId: "77" } } },
						}
					},
					nowMs: () => 5000,
				},
			)

			expect(result).toMatchObject({
				triggerType: "http",
				triggerName: "manual-run",
				command: "run",
				result: { result: { command: "run" } },
			})
		})
	})

	it("fails closed for manual triggers when trigger state is unhealthy", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: { "manual-run": { command: "run" } },
						cronTriggers: {},
						evmLogTriggers: {},
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
			claimCreSimulatorTriggerExecution(store, "http:manual-run:previous", {
				triggerName: "manual-run",
				triggerType: "http",
			}, 1000)
			markCreSimulatorTriggerExecutionQuarantined(store, "http:manual-run:previous", "boom", 1001)

			await expect(
				dispatchCreSimulatorTrigger(
					{
						repoRoot: tempDir,
						configPath,
						triggerName: "manual-run",
						triggerType: "http",
					},
					{},
					{
						executeCommand: async () => {
							throw new Error("should not dispatch while unhealthy")
						},
					},
				),
			).rejects.toThrow("Cre-simulator trigger state store is not healthy")
		})
	})
})
