import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	buildDefaultCreSimulatorTriggerConfigPath,
	loadCreSimulatorTriggerConfig,
	TRIGGER_CONFIG_SCHEMA_VERSION,
} from "./config";

function withTempDir(run: (tempDir: string) => void): void {
	const tempDir = mkdtempSync(join(tmpdir(), "cre-sim-trigger-config-"));
	try {
		run(tempDir);
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

describe("cre-simulator trigger config", () => {
	it("defaults to a checked-in backend-owned trigger config path", () => {
		expect(buildDefaultCreSimulatorTriggerConfigPath("/repo")).toBe(
			"/repo/backend/cre-simulator/triggers.json",
		);
	});

	it("includes the checked-in project registration listener alongside the reveal listener", () => {
		const repoRoot = join(import.meta.dir, "../../../..");
		const config = loadCreSimulatorTriggerConfig(
			buildDefaultCreSimulatorTriggerConfigPath(repoRoot),
			repoRoot,
		);

		expect(config.evmLogTriggers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					triggerName: "project-registered",
					adapter: "cre-workflow-simulate",
				}),
				expect.objectContaining({
					triggerName: "poc-revealed",
					adapter: "cre-workflow-simulate",
				}),
			]),
		);
	});

	it("loads HTTP, CRON, and EVM-log trigger mappings", () => {
		withTempDir((tempDir) => {
			const configPath = join(tempDir, "triggers.json");
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
							"manual-jury": {
								adapter: "jury-orchestrator-run-once",
								adapterConfig: {
									configPath:
										"workflow/jury-orchestrator/run-once.example.json",
								},
							},
							"manual-commit-deadline": {
								adapter: "demo-adjudication-orchestrator",
								adapterConfig: {
									configPath:
										"workflow/jury-orchestrator/run-once.example.json",
								},
							},
						},
						cronTriggers: {
							"reveal-relay": {
								intervalMs: 60000,
								adapter: "auto-reveal-relayer",
							},
						},
						evmLogTriggers: {
							"project-registered": {
								adapter: "cre-workflow-simulate",
								adapterConfig: {
									workflowPath: "workflow/vnet-init",
									target: "staging-settings",
									triggerIndex: 0,
									evmInput: "event-coordinates",
								},
								wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
								contractAddress: "0x1111111111111111111111111111111111111111",
								topic0:
									"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							},
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
			);

			const config = loadCreSimulatorTriggerConfig(configPath, tempDir);

			expect(config.httpTriggers[0]).toMatchObject({
				triggerName: "manual-reveal",
				adapter: "auto-reveal-relayer",
			});
			expect(config.httpTriggers[1]).toMatchObject({
				triggerName: "manual-verify",
				adapter: "cre-workflow-simulate",
			});
				expect(config.httpTriggers[2]).toMatchObject({
					triggerName: "manual-jury",
					adapter: "jury-orchestrator-run-once",
				});
				expect(config.httpTriggers[3]).toMatchObject({
					triggerName: "manual-commit-deadline",
					adapter: "demo-adjudication-orchestrator",
				});
			expect(config.cronTriggers[0]).toMatchObject({
				triggerName: "reveal-relay",
				intervalMs: 60000,
				adapter: "auto-reveal-relayer",
			});
				expect(config.evmLogTriggers[0]).toMatchObject({
					triggerName: "project-registered",
					adapter: "cre-workflow-simulate",
					wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
				});
				expect(config.evmLogTriggers[1]).toMatchObject({
					triggerName: "poc-revealed",
					adapter: "cre-workflow-simulate",
					wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
			});
		});
	});

	it("rejects repo-escaping override paths and malformed trigger entries", () => {
		withTempDir((tempDir) => {
			const configPath = join(tempDir, "triggers.json");
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
			);

			expect(() => loadCreSimulatorTriggerConfig(configPath, tempDir)).toThrow(
				"stateFilePath must stay within repoRoot",
			);
		});
	});
});
