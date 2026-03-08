import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import {
	buildDefaultCreSimulatorTriggerConfigPath,
	loadCreSimulatorTriggerConfig,
	TRIGGER_CONFIG_SCHEMA_VERSION,
} from "./config"

function withTempDir(run: (tempDir: string) => void): void {
	const tempDir = mkdtempSync(join(tmpdir(), "cre-sim-trigger-config-"))
	try {
		run(tempDir)
	} finally {
		rmSync(tempDir, { recursive: true, force: true })
	}
}

describe("cre-simulator trigger config", () => {
	it("defaults to a checked-in backend-owned trigger config path", () => {
		expect(buildDefaultCreSimulatorTriggerConfigPath("/repo")).toBe(
			"/repo/backend/cre-simulator/triggers.json",
		)
	})

	it("loads HTTP, CRON, and EVM-log trigger mappings", () => {
		withTempDir((tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: TRIGGER_CONFIG_SCHEMA_VERSION,
						stateFilePath: "backend/cre-simulator/.trigger-state.json",
						httpTriggers: {
							"manual-reveal": { adapter: "auto-reveal-relayer" },
							"manual-verify": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/verify-poc",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
							},
						},
						cronTriggers: {
							"reveal-relay": { intervalMs: 60000, adapter: "auto-reveal-relayer" },
						},
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
								contractAddress: "0x1111111111111111111111111111111111111111",
								topic0:
									"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
							},
						},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			const config = loadCreSimulatorTriggerConfig(configPath, tempDir)

			expect(config.httpTriggers[0]).toMatchObject({
				triggerName: "manual-reveal",
				adapter: "auto-reveal-relayer",
			})
			expect(config.httpTriggers[1]).toMatchObject({
				triggerName: "manual-verify",
				adapter: "cre-workflow-simulate",
			})
			expect(config.cronTriggers[0]).toMatchObject({
				triggerName: "reveal-relay",
				intervalMs: 60000,
				adapter: "auto-reveal-relayer",
			})
				expect(config.evmLogTriggers[0]).toMatchObject({
					triggerName: "poc-revealed",
					adapter: "cre-workflow-simulate",
					wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
				})
		})
	})

	it("rejects repo-escaping override paths and malformed trigger entries", () => {
		withTempDir((tempDir) => {
			const configPath = join(tempDir, "triggers.json")
			writeFileSync(
				configPath,
				`${JSON.stringify(
					{
						schemaVersion: TRIGGER_CONFIG_SCHEMA_VERSION,
						stateFilePath: "../outside.json",
						httpTriggers: {
							invalid: { adapter: "not-real" },
						},
						cronTriggers: {},
						evmLogTriggers: {},
					},
					null,
					2,
				)}\n`,
				"utf8",
			)

			expect(() => loadCreSimulatorTriggerConfig(configPath, tempDir)).toThrow(
				"stateFilePath must stay within repoRoot",
			)
		})
	})
})
