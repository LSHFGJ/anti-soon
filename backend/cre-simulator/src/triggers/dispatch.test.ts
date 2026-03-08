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
const ACTUAL_REPO_ROOT = join(import.meta.dir, "../../../..")

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
							scenarioPath: join(tempDir, "backend/cre-simulator/default-scenario.json"),
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

	it("uses the repo-root default trigger config path when no overrides are provided", async () => {
		const configPath = join(
			ACTUAL_REPO_ROOT,
			"backend/cre-simulator/.dispatch-default-config.test.json",
		)
		writeFileSync(
			configPath,
			`${JSON.stringify(
				{
					schemaVersion: CONFIG_SCHEMA_VERSION,
					stateFilePath: "backend/cre-simulator/.dispatch-default-state.test.json",
					httpTriggers: { "manual-run": { command: "run" } },
					cronTriggers: {},
					evmLogTriggers: {},
				},
				null,
				2,
			)}\n`,
			"utf8",
		)

		try {
			const result = await dispatchCreSimulatorTrigger(
				{
					triggerName: "manual-run",
					triggerType: "http",
					configPath: "backend/cre-simulator/.dispatch-default-config.test.json",
				},
				{},
				{
					executeCommand: async (request) => {
						expect(request.repoRoot).toBe(ACTUAL_REPO_ROOT)
						expect(request.command).toBe("run")
						return {
							command: "run",
							scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
							result: { command: "run" },
						}
					},
					nowMs: () => 10_000,
				},
			)

			expect(result.command).toBe("run")
			expect(result.triggerName).toBe("manual-run")
		} finally {
			rmSync(configPath, { force: true })
			rmSync(
				join(
					ACTUAL_REPO_ROOT,
					"backend/cre-simulator/.dispatch-default-state.test.json",
				),
				{ force: true },
			)
		}
	})
})
