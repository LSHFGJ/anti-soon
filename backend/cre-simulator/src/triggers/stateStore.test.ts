import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import {
	assertCreSimulatorTriggerStateStoreHealthy,
	loadCreSimulatorTriggerStateStore,
	recordCronTriggerRun,
	recordEvmLogTriggerCursor,
	TRIGGER_STATE_STORE_SCHEMA_VERSION,
	type CreSimulatorTriggerStateBinding,
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
