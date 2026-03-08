import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { runCronTriggerTick } from "./cron"
import {
	claimCreSimulatorTriggerExecution,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionQuarantined,
} from "./stateStore"

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
	const tempDir = mkdtempSync(join(tmpdir(), "cre-sim-trigger-cron-"))
	return Promise.resolve()
		.then(() => run(tempDir))
		.finally(() => rmSync(tempDir, { recursive: true, force: true }))
}

const CONFIG_SCHEMA_VERSION = "anti-soon.cre-simulator.trigger-config.v1"
const ACTUAL_REPO_ROOT = join(import.meta.dir, "../../../..")

describe("cre-simulator cron triggers", () => {
	it("runs due jobs once and persists scheduler cursor state", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {},
						cronTriggers: { "minute-run": { intervalMs: 1000, command: "run" } },
						evmLogTriggers: {},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const first = await runCronTriggerTick(
				{ repoRoot: tempDir, configPath },
				{},
				{
					nowMs: () => 1000,
					executeCommand: async () => ({
						command: "run",
						scenarioPath: join(tempDir, "scenario.json"),
						result: { command: "run" },
					}),
				},
			)

			expect(first.executed).toHaveLength(1)
			expect(first.skipped).toHaveLength(0)

			const second = await runCronTriggerTick(
				{ repoRoot: tempDir, configPath },
				{},
				{
					nowMs: () => 1500,
					executeCommand: async () => {
						throw new Error("should not run while not due")
					},
				},
			)

			expect(second.executed).toHaveLength(0)
			expect(second.skipped).toEqual(["minute-run"])
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
						cronTriggers: { "minute-run": { intervalMs: 1000, command: "run" } },
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
			claimCreSimulatorTriggerExecution(store, "cron:minute-run:1000", {
				triggerName: "minute-run",
				triggerType: "cron",
			}, 1000)
			markCreSimulatorTriggerExecutionQuarantined(store, "cron:minute-run:1000", "boom", 1001)

			await expect(
				runCronTriggerTick(
					{ repoRoot: tempDir, configPath },
					{},
					{
						nowMs: () => 5000,
						executeCommand: async () => {
							throw new Error("should not dispatch while unhealthy")
						},
					},
				),
			).rejects.toThrow("Cre-simulator trigger state store is not healthy")
		})
	})

	it("loads the checked-in trigger config when no repoRoot override is provided", async () => {
		const configPath = join(
			ACTUAL_REPO_ROOT,
			"backend/cre-simulator/.cron-default-config.test.json",
		)
		writeFileSync(
			configPath,
			`${JSON.stringify(
				{
					schemaVersion: CONFIG_SCHEMA_VERSION,
					stateFilePath: "backend/cre-simulator/.cron-default-state.test.json",
					httpTriggers: {},
					cronTriggers: { "demo-run": { intervalMs: 1000, command: "run" } },
					evmLogTriggers: {},
				},
				null,
				2,
			)}\n`,
			"utf8",
		)

		try {
			const result = await runCronTriggerTick(
				{ configPath: "backend/cre-simulator/.cron-default-config.test.json" },
				{},
				{
					nowMs: () => 60_000,
					executeCommand: async (request) => ({
						command: request.command,
						scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
						result: { command: request.command },
					}),
				},
			)

			expect(result.executed).toEqual([{ triggerName: "demo-run", command: "run" }])
		} finally {
			rmSync(configPath, { force: true })
			rmSync(
				join(ACTUAL_REPO_ROOT, "backend/cre-simulator/.cron-default-state.test.json"),
				{ force: true },
			)
		}
	})
})
