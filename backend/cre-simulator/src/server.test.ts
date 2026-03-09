import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

import { createCreSimulatorHttpHandler } from "./server";

const REPO_ROOT = resolve(import.meta.dir, "../../..");

describe("cre-simulator server", () => {
	it("serves health checks", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT });
		const response = await handler(new Request("http://localhost/health"));

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			ok: true,
			service: "cre-simulator",
		});
	});

	it("maps GET status to the shared command service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeStatus: async () => {
				return {
					command: "status",
					result: { mode: "live-only" },
				};
			},
		});

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/status"),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toMatchObject({
			ok: true,
			command: "status",
			result: { mode: "live-only" },
		});
	});

	it("exposes trigger status through the shared trigger service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeTriggerStatus: async () => ({
				healthy: true,
				configPath: "/repo/backend/cre-simulator/triggers.json",
				stateFilePath: "/repo/backend/cre-simulator/.trigger-state.json",
				recoveredProcessingCount: 0,
				quarantinedExecutionCount: 0,
				httpTriggers: [
					{ triggerName: "manual-reveal", adapter: "auto-reveal-relayer" },
				],
				cronTriggers: [],
				evmLogTriggers: [],
			}),
		});

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/triggers/status"),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			ok: true,
			healthy: true,
			httpTriggers: [
				{ triggerName: "manual-reveal", adapter: "auto-reveal-relayer" },
			],
		});
	});

	it("maps POST adapter routes to the shared adapter service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeAdapter: async (request) => {
				expect(request.adapter).toBe("cre-workflow-simulate");
				expect(request.evmTxHash).toBe(
					"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				);
				expect(request.evmEventIndex).toBe(7);
				return {
					adapter: "cre-workflow-simulate",
					result: { submissionId: "12" },
				};
			},
		});

		const response = await handler(
			new Request(
				"http://localhost/api/cre-simulator/adapters/cre-workflow-simulate",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						adapterConfig: {
							workflowPath: "workflow/verify-poc",
							target: "staging-settings",
							triggerIndex: 0,
							evmInput: "event-coordinates",
						},
						evmTxHash:
							"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
						evmEventIndex: 7,
					}),
				},
			),
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload).toMatchObject({
			ok: true,
			adapter: "cre-workflow-simulate",
			result: { submissionId: "12" },
		});
	});

	it("rejects unsupported adapter routes", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
		});

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/adapters/not-real", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ ok: false, error: "Not found" });
	});

	it("maps POST trigger routes to the shared trigger service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeTrigger: async (request) => {
				expect(request.triggerName).toBe("manual-jury");
				expect(request.inputPayload).toEqual({
					verifiedReport: { reportType: "verified-report/v3" },
					humanOpinions: [{ jurorId: "human:alice" }],
					juryRoundId: 7,
				});
				return {
					triggerType: "http",
					triggerName: "manual-jury",
					adapter: "jury-orchestrator-run-once",
					executionKey: "http:manual-jury:1",
					deduped: false,
					result: {
						adapter: "jury-orchestrator-run-once",
						result: { finalReportType: "adjudication-final/v1" },
					},
				};
			},
		});

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/triggers/manual-jury", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					inputPayload: {
						verifiedReport: { reportType: "verified-report/v3" },
						humanOpinions: [{ jurorId: "human:alice" }],
						juryRoundId: 7,
					},
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			ok: true,
			triggerType: "http",
			triggerName: "manual-jury",
			adapter: "jury-orchestrator-run-once",
		});
	});

	it("rejects malformed JSON bodies on the adapter route cleanly", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT });
		const response = await handler(
			new Request(
				"http://localhost/api/cre-simulator/adapters/auto-reveal-relayer",
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(["bad"]),
				},
			),
		);

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			ok: false,
			error: "Request body must be a JSON object",
		});
	});

	it("rejects unknown trigger routes cleanly", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT });
		const response = await handler(
			new Request("http://localhost/api/cre-simulator/triggers/not-a-trigger", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ ok: false, error: "Not found" });
	});

	it("rejects unsupported routes cleanly", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT });
		const response = await handler(
			new Request("http://localhost/api/cre-simulator/nope"),
		);

		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({
			ok: false,
			error: "Not found",
		});
	});

	it("rejects no-longer-supported scenario overrides with a client error", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT });
		const response = await handler(
			new Request(
				"http://localhost/api/cre-simulator/status?scenarioPath=/tmp/outside.json",
			),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			ok: false,
			error: "scenarioPath is not supported in live-only mode",
		});
	});
});
