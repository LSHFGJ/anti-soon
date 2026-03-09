import { describe, expect, it } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
	buildDefaultCreSimulatorTriggerConfigPath,
	executeCreSimulatorAdapter,
	executeCreSimulatorStatus,
	executeCreSimulatorTrigger,
	getCreSimulatorTriggerStatus,
} from "./service";

const REPO_ROOT = resolve(import.meta.dir, "../../..");
const STAGING_BOUNTY_HUB_ADDRESS = "0x3fbd5ab0f3fd234a40923ae7986f45acb9d4a3cf";
const PROJECT_REGISTERED_TOPIC0 =
	"0x13bbb3164af432cb24bde885d40a3049f565bcfb8f24033d57c7953fbbf33606";
const POC_REVEALED_TOPIC0 =
	"0xc3c91f25332a5a28defde601c6ccdf9ba0eeb99c94ef7a6cc5fb5a7e7737643f";

function withTempTriggerConfig(
	run: (configPath: string) => Promise<void> | void,
): Promise<void> {
	const configPath = join(
		REPO_ROOT,
		"backend/cre-simulator/.service-trigger-config.test.json",
	);
	const stateFilePath =
		"backend/cre-simulator/.service-trigger-state.test.json";
	writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				schemaVersion: "anti-soon.cre-simulator.trigger-config.v1",
				stateFilePath,
				httpTriggers: {
					"manual-reveal": { adapter: "auto-reveal-relayer" },
					"manual-verify": {
						adapter: "cre-workflow-simulate",
						adapterConfig: {
							workflowPath: "workflow/verify-poc",
							target: "staging-settings",
							triggerIndex: 0,
							evmInput: "event-coordinates",
							idempotencyStorePath:
								"workflow/verify-poc/.verify-poc-idempotency-store.json",
						},
					},
					"manual-jury": {
						adapter: "jury-orchestrator-run-once",
						adapterConfig: {
							configPath: "workflow/jury-orchestrator/run-once.example.json",
						},
					},
					"manual-commit-deadline": {
						adapter: "demo-adjudication-orchestrator",
						adapterConfig: {
							configPath: "workflow/jury-orchestrator/run-once.example.json",
						},
					},
					"manual-reveal-deadline": {
						adapter: "demo-adjudication-orchestrator",
						adapterConfig: {
							configPath: "workflow/jury-orchestrator/run-once.example.json",
						},
					},
					"manual-pocstore-opinion": {
						adapter: "demo-adjudication-orchestrator",
						adapterConfig: {
							configPath: "workflow/jury-orchestrator/run-once.example.json",
						},
					},
				},
				cronTriggers: {
					"reveal-relay": { intervalMs: 60000, adapter: "auto-reveal-relayer" },
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
							contractAddress: STAGING_BOUNTY_HUB_ADDRESS,
							topic0: PROJECT_REGISTERED_TOPIC0,
						},
						"poc-revealed": {
							adapter: "cre-workflow-simulate",
						adapterConfig: {
							workflowPath: "workflow/verify-poc",
							target: "staging-settings",
							triggerIndex: 0,
							evmInput: "event-coordinates",
							idempotencyStorePath:
								"workflow/verify-poc/.verify-poc-idempotency-store.json",
						},
						wsRpcUrlEnvVar: "CRE_SIM_WS_RPC_URL",
						contractAddress: STAGING_BOUNTY_HUB_ADDRESS,
						topic0: POC_REVEALED_TOPIC0,
					},
				},
			},
			null,
			2,
		)}\n`,
		"utf8",
	);

	return Promise.resolve()
		.then(() => run(configPath))
		.finally(() => {
			rmSync(configPath, { force: true });
			rmSync(join(REPO_ROOT, stateFilePath), { force: true });
		});
}

describe("cre-simulator service", () => {
	it("defaults to the checked-in backend trigger config path", () => {
		expect(buildDefaultCreSimulatorTriggerConfigPath(REPO_ROOT)).toBe(
			join(REPO_ROOT, "backend/cre-simulator/triggers.json"),
		);
	});

	it("returns a live-only status payload", async () => {
		const result = await executeCreSimulatorStatus(
			{
				repoRoot: REPO_ROOT,
			},
			{},
		);

		expect(result).toEqual({
			command: "status",
			result: expect.objectContaining({
				mode: "live-only",
				runtimeEnv: {
					required: [
						"CRE_SIM_TENDERLY_API_KEY",
						"CRE_SIM_PRIVATE_KEY",
						"CRE_SIM_SEPOLIA_RPC_URL",
						"CRE_SIM_ADMIN_RPC_URL",
						"CRE_SIM_BOUNTY_HUB_ADDRESS",
						"CRE_SIM_OASIS_STORAGE_CONTRACT",
					],
					evmLogRequired: ["CRE_SIM_WS_RPC_URL"],
				},
			}),
		});
	});

	it("delegates generic cre-workflow-simulate execution to the adapter runtime", async () => {
		const result = await executeCreSimulatorAdapter(
			{
				adapter: "cre-workflow-simulate",
				adapterConfig: {
					workflowPath: "workflow/verify-poc",
					target: "staging-settings",
					triggerIndex: 0,
					evmInput: "event-coordinates",
				},
				repoRoot: REPO_ROOT,
				evmTxHash:
					"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				evmEventIndex: 3,
			},
			{},
			{
				adapterExecutors: {
					"cre-workflow-simulate": async ({ evmTxHash, evmEventIndex }) => {
						expect(evmTxHash).toBe(
							"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
						);
						expect(evmEventIndex).toBe(3);
						return { submissionId: "12" };
					},
				},
			},
		);

		expect(result).toEqual({
			adapter: "cre-workflow-simulate",
			result: { submissionId: "12" },
		});
	});

	it("delegates jury-orchestrator run-once execution with inline payloads", async () => {
		const result = await executeCreSimulatorAdapter(
			{
				adapter: "jury-orchestrator-run-once",
				adapterConfig: {
					configPath: "workflow/jury-orchestrator/run-once.example.json",
				},
				inputPayload: {
					verifiedReport: { reportType: "verified-report/v3" },
					humanOpinions: [{ jurorId: "human:alice" }],
					juryRoundId: 7,
				},
				repoRoot: REPO_ROOT,
			},
			{},
			{
				adapterExecutors: {
					"jury-orchestrator-run-once": async ({
						inputPayload,
						adapterConfig,
					}) => {
						expect(inputPayload).toEqual({
							verifiedReport: { reportType: "verified-report/v3" },
							humanOpinions: [{ jurorId: "human:alice" }],
							juryRoundId: 7,
						});
						expect(adapterConfig).toEqual({
							configPath: "workflow/jury-orchestrator/run-once.example.json",
						});
						return { finalReportType: "adjudication-final/v1" };
					},
				},
			},
		);

		expect(result).toEqual({
			adapter: "jury-orchestrator-run-once",
			result: { finalReportType: "adjudication-final/v1" },
		});
	});

	it("delegates demo adjudication orchestration execution with phase payloads", async () => {
		const result = await executeCreSimulatorAdapter(
			{
				adapter: "demo-adjudication-orchestrator",
				adapterConfig: {
					configPath: "workflow/jury-orchestrator/run-once.example.json",
				},
				inputPayload: {
					phase: "commit-deadline",
					verifyPocReport: { reportType: "verified-report/v3" },
					juryRoundId: 7,
				},
				repoRoot: REPO_ROOT,
			},
			{},
			{
				adapterExecutors: {
					"demo-adjudication-orchestrator": async ({
						inputPayload,
						adapterConfig,
					}) => {
						expect(inputPayload).toEqual({
							phase: "commit-deadline",
							verifyPocReport: { reportType: "verified-report/v3" },
							juryRoundId: 7,
						});
						expect(adapterConfig).toEqual({
							configPath: "workflow/jury-orchestrator/run-once.example.json",
						});
						return {
							phase: "commit-deadline",
							strictGateOutcome: "EMIT_EVIDENCE",
						};
					},
				},
			},
		);

		expect(result).toEqual({
			adapter: "demo-adjudication-orchestrator",
			result: {
				phase: "commit-deadline",
				strictGateOutcome: "EMIT_EVIDENCE",
			},
		});
	});

	it("requires EVM coordinates for generic workflow adapters that expect event input", async () => {
		await expect(
			executeCreSimulatorAdapter(
				{
					adapter: "cre-workflow-simulate",
					adapterConfig: {
						workflowPath: "workflow/verify-poc",
						target: "staging-settings",
						triggerIndex: 0,
						evmInput: "event-coordinates",
					},
					repoRoot: REPO_ROOT,
				},
				{},
			),
		).rejects.toThrow(
			"cre-workflow-simulate requires evmTxHash and evmEventIndex",
		);
	});

	it("rejects unsupported adapters", async () => {
		await expect(
			executeCreSimulatorAdapter(
				{
					adapter: "not-real" as never,
					repoRoot: REPO_ROOT,
				},
				{},
			),
		).rejects.toThrow("Unsupported live-only adapter: not-real");
	});

	it("dispatches configured manual triggers through the live backend service", async () => {
		await withTempTriggerConfig(async (configPath) => {
			const result = await executeCreSimulatorTrigger(
				{
					triggerName: "manual-reveal",
					repoRoot: REPO_ROOT,
					configPath,
				},
				{},
				{
					executeAdapter: async (request) => {
						expect(request.adapter).toBe("auto-reveal-relayer");
						return {
							adapter: "auto-reveal-relayer",
							result: { mode: "run-once" },
						};
					},
				},
			);

			expect(result).toMatchObject({
				triggerType: "http",
				triggerName: "manual-reveal",
				adapter: "auto-reveal-relayer",
			});
		});
	});

	it("builds trigger status through the shared backend service layer", async () => {
		await withTempTriggerConfig(async (configPath) => {
			const result = await getCreSimulatorTriggerStatus(
				{
					repoRoot: REPO_ROOT,
					configPath,
				},
				{},
			);

			expect(result.healthy).toBe(true);
			expect(result.configPath).toBe(configPath);
				expect(result.httpTriggers).toEqual(
					expect.arrayContaining([
						{ triggerName: "manual-reveal", adapter: "auto-reveal-relayer" },
						{ triggerName: "manual-verify", adapter: "cre-workflow-simulate" },
						{ triggerName: "manual-jury", adapter: "jury-orchestrator-run-once" },
						{
							triggerName: "manual-commit-deadline",
							adapter: "demo-adjudication-orchestrator",
						},
					]),
				);
			expect(result.cronTriggers).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						triggerName: "reveal-relay",
						adapter: "auto-reveal-relayer",
					}),
				]),
			);
				expect(result.evmLogTriggers).toEqual(
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
	});

	it("rejects no-longer-supported scenario override paths", async () => {
		await expect(
			executeCreSimulatorStatus(
				{
					repoRoot: REPO_ROOT,
					scenarioPath: "/tmp/outside.json",
				},
				{},
			),
		).rejects.toThrow("scenarioPath is not supported in live-only mode");
	});

	it("keeps only the live helper modules under backend operator utilities", async () => {
		expect(
			existsSync(
				join(
					REPO_ROOT,
					"backend/cre-simulator/src/operator/bountyHubClient.ts",
				),
			),
		).toBe(true);
		expect(
			existsSync(
				join(
					REPO_ROOT,
					"backend/cre-simulator/src/operator/creWorkflowRuntime.ts",
				),
			),
		).toBe(true);
		expect(
			existsSync(
				join(REPO_ROOT, "backend/cre-simulator/src/operator/service.ts"),
			),
		).toBe(false);

		const serviceSource = await Bun.file(
			join(REPO_ROOT, "backend/cre-simulator/src/service.ts"),
		).text();
		const typesSource = await Bun.file(
			join(REPO_ROOT, "backend/cre-simulator/src/types.ts"),
		).text();

		expect(serviceSource).not.toContain("workflow/demo-operator");
		expect(typesSource).not.toContain("workflow/demo-operator");
	});

	it("removes the legacy workflow demo-operator path from checked-in defaults", async () => {
		expect(
			existsSync(
				join(REPO_ROOT, "backend/cre-simulator/default-scenario.json"),
			),
		).toBe(false);
		expect(
			existsSync(
				join(REPO_ROOT, "backend/cre-simulator/.demo-operator-state.json"),
			),
		).toBe(false);
	});
});
