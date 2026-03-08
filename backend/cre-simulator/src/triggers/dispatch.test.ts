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
						httpTriggers: { "manual-reveal": { adapter: "auto-reveal-relayer" } },
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
					triggerName: "manual-reveal",
					triggerType: "http",
				},
				{},
				{
					executeAdapter: async (request) => {
						expect(request.adapter).toBe("auto-reveal-relayer")
						return {
							adapter: "auto-reveal-relayer",
							result: { mode: "run-once" },
						}
					},
					nowMs: () => 5000,
				},
			)

			expect(result).toMatchObject({
				triggerType: "http",
				triggerName: "manual-reveal",
				adapter: "auto-reveal-relayer",
				result: { result: { mode: "run-once" } },
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
						httpTriggers: { "manual-reveal": { adapter: "auto-reveal-relayer" } },
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
			claimCreSimulatorTriggerExecution(store, "http:manual-reveal:previous", {
				triggerName: "manual-reveal",
				triggerType: "http",
			}, 1000)
			markCreSimulatorTriggerExecutionQuarantined(store, "http:manual-reveal:previous", "boom", 1001)

			await expect(
				dispatchCreSimulatorTrigger(
					{
						repoRoot: tempDir,
						configPath,
						triggerName: "manual-reveal",
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
						httpTriggers: { "manual-reveal": { adapter: "auto-reveal-relayer" } },
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
					triggerName: "manual-reveal",
					triggerType: "http",
					configPath: "backend/cre-simulator/.dispatch-default-config.test.json",
				},
				{},
				{
					executeAdapter: async (request) => {
						expect(request.repoRoot).toBe(ACTUAL_REPO_ROOT)
						expect(request.adapter).toBe("auto-reveal-relayer")
						return {
							adapter: "auto-reveal-relayer",
							result: { mode: "run-once" },
						}
					},
					nowMs: () => 10_000,
				},
			)

			expect(result.adapter).toBe("auto-reveal-relayer")
			expect(result.triggerName).toBe("manual-reveal")
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
