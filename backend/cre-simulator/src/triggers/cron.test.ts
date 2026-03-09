import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadCreSimulatorTriggerConfig } from "./config"
import { runCronTriggerTick } from "./cron"
import {
	claimCreSimulatorTriggerExecution,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionQuarantined,
	recordProjectDeadlineSchedule,
	scheduleSubmissionRevealDeadlineJob,
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
						cronTriggers: { "reveal-relay": { intervalMs: 1000, adapter: "auto-reveal-relayer" } },
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
										executeAdapter: async () => ({
										adapter: "auto-reveal-relayer",
										result: { adapter: "auto-reveal-relayer" },
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
			expect(second.skipped).toEqual(["reveal-relay"])
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
						cronTriggers: { "reveal-relay": { intervalMs: 1000, adapter: "auto-reveal-relayer" } },
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
			claimCreSimulatorTriggerExecution(store, "cron:reveal-relay:1000", {
				triggerName: "reveal-relay",
				triggerType: "cron",
			}, 1000)
			markCreSimulatorTriggerExecutionQuarantined(store, "cron:reveal-relay:1000", "boom", 1001)

			await expect(
				runCronTriggerTick(
					{ repoRoot: tempDir, configPath },
					{},
					{
						nowMs: () => 5000,
						executeAdapter: async () => {
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
					cronTriggers: { "reveal-relay": { intervalMs: 1000, adapter: "auto-reveal-relayer" } },
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
						executeAdapter: async (request) => ({
							adapter: request.adapter,
							result: { adapter: request.adapter },
						}),
					},
				)

			expect(result.executed).toEqual([{ triggerName: "reveal-relay", adapter: "auto-reveal-relayer" }])
		} finally {
			rmSync(configPath, { force: true })
			rmSync(
				join(ACTUAL_REPO_ROOT, "backend/cre-simulator/.cron-default-state.test.json"),
				{ force: true },
			)
		}
	})

	it("dispatches due project commit and submission reveal deadline jobs", async () => {
		await withTempDir(async (tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: CONFIG_SCHEMA_VERSION,
						stateFilePath: ".trigger-state.json",
						httpTriggers: {
							"manual-reveal-deadline": {
								adapter: "demo-adjudication-orchestrator",
								adapterConfig: {
									configPath: "workflow/jury-orchestrator/run-once.example.json",
								},
							},
						},
						cronTriggers: {
							"reveal-relay": {
								intervalMs: 60_000,
								adapter: "auto-reveal-relayer",
							},
						},
						evmLogTriggers: {},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const loadedConfig = loadCreSimulatorTriggerConfig(configPath, tempDir)
			const binding = {
				configPath: loadedConfig.configPath,
				stateFilePath: loadedConfig.stateFilePath,
			}
			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 1_000)
			recordProjectDeadlineSchedule(store, {
				projectId: 9n,
				commitDeadlineMs: 1_000,
				revealDeadlineMs: 2_000,
			})
			scheduleSubmissionRevealDeadlineJob(store, {
				projectId: 9n,
				submissionId: 77n,
				juryRoundId: 5n,
				dueAtMs: 2_000,
			})

			const requests: Array<Record<string, unknown>> = []
			const result = await runCronTriggerTick(
				{ repoRoot: tempDir, configPath },
				{},
				{
					nowMs: () => 2_000,
					executeAdapter: async (request) => {
						requests.push(request as unknown as Record<string, unknown>)
						return {
							adapter: request.adapter,
							result: { adapter: request.adapter },
						}
					},
				},
			)

			expect(result.executed).toEqual(
				expect.arrayContaining([
					{ triggerName: "reveal-relay", adapter: "auto-reveal-relayer" },
					{
						triggerName: "submission-reveal-deadline:77:5",
						adapter: "demo-adjudication-orchestrator",
					},
				]),
			)
			expect(requests).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						adapter: "auto-reveal-relayer",
					}),
					expect.objectContaining({
						adapter: "demo-adjudication-orchestrator",
						inputPayload: {
							phase: "reveal-deadline",
							submissionId: "77",
							juryRoundId: "5",
						},
					}),
				]),
			)
		})
	})
})
