import { describe, expect, it } from "bun:test"
import { resolve } from "node:path"

import { createCreSimulatorHttpHandler } from "./server"

const REPO_ROOT = resolve(import.meta.dir, "../../..")

describe("cre-simulator server", () => {
	it("serves health checks", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT })
		const response = await handler(new Request("http://localhost/health"))

		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({
			ok: true,
			service: "cre-simulator",
		})
	})

	it("maps GET status to the shared command service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeCommand: async (request) => {
				expect(request.command).toBe("status")
				return {
					command: "status",
					scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
					result: { healthy: true },
				}
			},
		})

		const response = await handler(new Request("http://localhost/api/cre-simulator/status"))
		const payload = await response.json()

		expect(response.status).toBe(200)
		expect(payload).toMatchObject({
			ok: true,
			command: "status",
			result: { healthy: true },
		})
	})

	it("exposes trigger status through the shared trigger service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeTriggerStatus: async () => ({
				healthy: true,
				configPath: "/repo/backend/cre-simulator/triggers.json",
				stateFilePath: "/repo/backend/cre-simulator/.trigger-state.json",
				recoveredProcessingCount: 0,
				quarantinedExecutionCount: 0,
				httpTriggers: [{ triggerName: "manual-run", command: "run" }],
				cronTriggers: [],
				evmLogTriggers: [],
			}),
		})

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/triggers/status"),
		)

		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			healthy: true,
			httpTriggers: [{ triggerName: "manual-run", command: "run" }],
		})
	})

	it("maps POST command routes to the shared command service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeCommand: async (request) => {
				expect(request.command).toBe("verify")
				expect(request.stateFilePath).toBe("/tmp/state.json")
				return {
					command: "verify",
					scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
					result: { submissionId: "12" },
				}
			},
		})

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/commands/verify", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ stateFilePath: "/tmp/state.json" }),
			}),
		)
		const payload = await response.json()

		expect(response.status).toBe(200)
		expect(payload).toMatchObject({
			ok: true,
			command: "verify",
			result: { submissionId: "12" },
		})
	})

	it("maps POST run routes to the orchestrated backend command", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeCommand: async (request) => {
				expect(request.command).toBe("run")
				return {
					command: "run",
					scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
					result: { stages: { register: { projectId: "77" } } },
				}
			},
		})

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/commands/run", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		)
		const payload = await response.json()

		expect(response.status).toBe(200)
		expect(payload).toMatchObject({
			ok: true,
			command: "run",
			result: { stages: { register: { projectId: "77" } } },
		})
	})

	it("maps POST trigger routes to the shared trigger service", async () => {
		const handler = createCreSimulatorHttpHandler({
			repoRoot: REPO_ROOT,
			executeTrigger: async (request) => {
				expect(request.triggerName).toBe("manual-run")
				return {
					triggerType: "http",
					triggerName: "manual-run",
					command: "run",
					result: {
						command: "run",
						scenarioPath: "/repo/backend/cre-simulator/default-scenario.json",
						result: { command: "run" },
					},
				}
			},
		})

		const response = await handler(
			new Request("http://localhost/api/cre-simulator/triggers/manual-run", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		)

		expect(response.status).toBe(200)
		expect(await response.json()).toMatchObject({
			ok: true,
			triggerType: "http",
			triggerName: "manual-run",
			command: "run",
		})
	})

	it("rejects malformed JSON bodies on the run route cleanly", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT })
		const response = await handler(
			new Request("http://localhost/api/cre-simulator/commands/run", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(["bad"]),
			}),
		)

		expect(response.status).toBe(500)
		expect(await response.json()).toEqual({
			ok: false,
			error: "Request body must be a JSON object",
		})
	})

	it("rejects unknown trigger routes cleanly", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT })
		const response = await handler(
			new Request("http://localhost/api/cre-simulator/triggers/not-a-trigger", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({}),
			}),
		)

		expect(response.status).toBe(404)
		expect(await response.json()).toEqual({ ok: false, error: "Not found" })
	})

	it("rejects unsupported routes cleanly", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT })
		const response = await handler(new Request("http://localhost/api/cre-simulator/nope"))

		expect(response.status).toBe(404)
		expect(await response.json()).toEqual({
			ok: false,
			error: "Not found",
		})
	})

	it("rejects invalid override paths with a client error", async () => {
		const handler = createCreSimulatorHttpHandler({ repoRoot: REPO_ROOT })
		const response = await handler(
			new Request(
				"http://localhost/api/cre-simulator/status?scenarioPath=/tmp/outside.json",
			),
		)

		expect(response.status).toBe(400)
		expect(await response.json()).toEqual({
			ok: false,
			error: "scenarioPath must stay within repoRoot",
		})
	})
})
