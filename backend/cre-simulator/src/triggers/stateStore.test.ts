import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { CreSimulatorTriggerStateBinding } from "./stateStore"
import {
	TRIGGER_STATE_STORE_SCHEMA_VERSION,
	assertCreSimulatorTriggerStateStoreHealthy,
	deleteCreSimulatorDeadlineJob,
	getProjectDeadlineSchedule,
	listDueCreSimulatorDeadlineJobs,
	loadCreSimulatorTriggerStateStore,
	recordCronTriggerRun,
	recordEvmLogTriggerCursor,
	recordProjectDeadlineSchedule,
	scheduleSubmissionRevealDeadlineJob,
} from "./stateStore"

function withTempDir(run: (tempDir: string) => void): void {
	const tempDir = mkdtempSync(join(tmpdir(), "cre-sim-trigger-state-"))
	try {
		run(tempDir)
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

function buildBinding(tempDir: string): CreSimulatorTriggerStateBinding {
	return {
		configPath: join(tempDir, "triggers.json"),
		stateFilePath: join(tempDir, ".trigger-state.json"),
	}
}

describe("cre-simulator trigger state store", () => {
	it("initializes deterministically when the state file is missing", () => {
		withTempDir((tempDir) => {
			const binding = buildBinding(tempDir)
			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 123)

			expect(store.binding).toEqual(binding)
			expect(store.recoveredProcessingCount).toBe(0)
			expect(store.quarantinedExecutionCount).toBe(0)
			expect(store.schedulerCursorByName.size).toBe(0)
			expect(store.listenerCursorByName.size).toBe(0)
			expect(store.executionStateByKey.size).toBe(0)

			const payload = Bun.file(binding.stateFilePath).json() as Promise<{ schemaVersion: string }>
			return expect(payload).resolves.toMatchObject({
				schemaVersion: TRIGGER_STATE_STORE_SCHEMA_VERSION,
			})
		})
	})

	it("recovers processing executions fail-closed on load", async () => {
		await withTempDir(async (tempDir) => {
			const binding = buildBinding(tempDir)
			writeFileSync(
				binding.stateFilePath,
				`${JSON.stringify(
					{
						schemaVersion: TRIGGER_STATE_STORE_SCHEMA_VERSION,
						binding,
						schedulerCursorByName: {},
						listenerCursorByName: {},
						executionStateByKey: {
							"cron:reveal-relay:1000": {
								triggerName: "reveal-relay",
								triggerType: "cron",
								status: "processing",
								updatedAtMs: 1000,
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 2000)
			const execution = store.executionStateByKey.get("cron:reveal-relay:1000")

			expect(store.recoveredProcessingCount).toBe(1)
			expect(store.quarantinedExecutionCount).toBe(1)
			expect(execution).toMatchObject({
				status: "quarantined",
				lastError: "Recovered processing trigger execution after restart",
				updatedAtMs: 2000,
			})
			await expect(async () => assertCreSimulatorTriggerStateStoreHealthy(store)).toThrow(
				"Cre-simulator trigger state store is not healthy",
			)
		})
	})

	it("persists scheduler and EVM listener cursors", () => {
		withTempDir((tempDir) => {
			const binding = buildBinding(tempDir)
			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 123)

			recordCronTriggerRun(store, "minute-run", 5000)
			recordEvmLogTriggerCursor(store, "poc-revealed", {
				lastSeenBlockNumber: 77n,
				lastEventKey: "0xabc:1",
			}, 5000)

			const reloaded = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 6000)
			expect(reloaded.schedulerCursorByName.get("minute-run")).toEqual({ lastRunAtMs: 5000 })
			expect(reloaded.listenerCursorByName.get("poc-revealed")).toEqual({
				lastSeenBlockNumber: 77n,
				lastEventKey: "0xabc:1",
			})
		})
	})

	it("persists project deadline schedules and due reveal jobs", () => {
		withTempDir((tempDir) => {
			const binding = buildBinding(tempDir)
			const store = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 123)

			recordProjectDeadlineSchedule(store, {
				projectId: 9n,
				commitDeadlineMs: 10_000,
				revealDeadlineMs: 20_000,
			})
			scheduleSubmissionRevealDeadlineJob(store, {
				projectId: 9n,
				submissionId: 77n,
				juryRoundId: 3n,
				dueAtMs: 20_000,
			})

			const reloaded = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 30_000)
			expect(getProjectDeadlineSchedule(reloaded, 9n)).toEqual({
				projectId: "9",
				commitDeadlineMs: 10_000,
				revealDeadlineMs: 20_000,
			})
			expect(listDueCreSimulatorDeadlineJobs(reloaded, 19_999)).toEqual([
				expect.objectContaining({
					jobKey: "project-commit-deadline:9",
					jobType: "project-commit-deadline",
					projectId: "9",
					dueAtMs: 10_000,
				}),
			])
			expect(listDueCreSimulatorDeadlineJobs(reloaded, 20_000)).toEqual([
				expect.objectContaining({
					jobKey: "project-commit-deadline:9",
					jobType: "project-commit-deadline",
					projectId: "9",
					dueAtMs: 10_000,
				}),
				expect.objectContaining({
					jobKey: "submission-reveal-deadline:77:3",
					jobType: "submission-reveal-deadline",
					projectId: "9",
					submissionId: "77",
					juryRoundId: "3",
					dueAtMs: 20_000,
				}),
			])
			deleteCreSimulatorDeadlineJob(reloaded, "project-commit-deadline:9")

			deleteCreSimulatorDeadlineJob(reloaded, "submission-reveal-deadline:77:3")
			const finalStore = loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 30_001)
			expect(listDueCreSimulatorDeadlineJobs(finalStore, 30_001)).toEqual([])
		})
	})

	it("rejects malformed schema or unstable bindings", () => {
		withTempDir((tempDir) => {
			const binding = buildBinding(tempDir)
			writeFileSync(
				binding.stateFilePath,
				`${JSON.stringify(
					{
						schemaVersion: "bad-schema",
						binding,
						schedulerCursorByName: {},
						listenerCursorByName: {},
						executionStateByKey: {},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			expect(() => loadCreSimulatorTriggerStateStore(binding.stateFilePath, binding, 0)).toThrow(
				"Unsupported cre-simulator trigger state store schema",
			)
		})
	})
})
