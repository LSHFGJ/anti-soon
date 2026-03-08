import type { EnvRecord } from "./operator/config"

import {
	CreSimulatorRequestError,
	executeCreSimulatorCommand,
	executeCreSimulatorTrigger,
	getCreSimulatorTriggerStatus,
} from "./service"
import type {
	CreSimulatorCommand,
	CreSimulatorCommandRequest,
	CreSimulatorExecuteCommand,
	CreSimulatorExecuteTrigger,
	CreSimulatorGetTriggerStatus,
} from "./types"

const CRE_SIMULATOR_COMMANDS = [
	"register",
	"run",
	"submit",
	"reveal",
	"verify",
	"status",
] as const satisfies readonly CreSimulatorCommand[]

type CreateCreSimulatorHttpHandlerArgs = {
	repoRoot: string
	env?: EnvRecord
	executeCommand?: CreSimulatorExecuteCommand
	executeTrigger?: CreSimulatorExecuteTrigger
	executeTriggerStatus?: CreSimulatorGetTriggerStatus
}

function jsonResponse(status: number, payload: unknown): Response {
	return new Response(JSON.stringify(payload, null, 2), {
		status,
		headers: {
			"content-type": "application/json",
		},
	})
}

function isCreSimulatorCommand(value: string): value is CreSimulatorCommand {
	return (CRE_SIMULATOR_COMMANDS as readonly string[]).includes(value)
}

function toErrorStatus(error: unknown): number {
	return error instanceof CreSimulatorRequestError ? 400 : 500
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return {}
	}

	const payload = (await request.json()) as unknown
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("Request body must be a JSON object")
	}

	return payload as Record<string, unknown>
}

function buildRequestFromQuery(
	command: CreSimulatorCommand,
	url: URL,
	repoRoot: string,
): CreSimulatorCommandRequest {
	return {
		command,
		repoRoot,
		...(url.searchParams.get("scenarioPath")
			? { scenarioPath: String(url.searchParams.get("scenarioPath")) }
			: {}),
		...(url.searchParams.get("stateFilePath")
			? { stateFilePath: String(url.searchParams.get("stateFilePath")) }
			: {}),
		...(url.searchParams.get("evidenceDir")
			? { evidenceDir: String(url.searchParams.get("evidenceDir")) }
			: {}),
	}
}

function buildRequestFromBody(
	command: CreSimulatorCommand,
	body: Record<string, unknown>,
	repoRoot: string,
): CreSimulatorCommandRequest {
	return {
		command,
		repoRoot,
		...(typeof body.scenarioPath === "string" ? { scenarioPath: body.scenarioPath } : {}),
		...(typeof body.stateFilePath === "string"
			? { stateFilePath: body.stateFilePath }
			: {}),
		...(typeof body.evidenceDir === "string" ? { evidenceDir: body.evidenceDir } : {}),
	}
}

export function createCreSimulatorHttpHandler(
	args: CreateCreSimulatorHttpHandlerArgs,
): (request: Request) => Promise<Response> {
	const env = args.env ?? (process.env as EnvRecord)
	const executeCommand =
		args.executeCommand ??
		((request: CreSimulatorCommandRequest) =>
			executeCreSimulatorCommand(request, env))
	const executeTrigger =
		args.executeTrigger ??
		((request) => executeCreSimulatorTrigger(request, env))
	const executeTriggerStatus =
		args.executeTriggerStatus ??
		((request) => getCreSimulatorTriggerStatus(request, env))

	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url)

		if (request.method === "GET" && url.pathname === "/health") {
			return jsonResponse(200, { ok: true, service: "cre-simulator" })
		}

		if (request.method === "GET" && url.pathname === "/api/cre-simulator/status") {
			try {
				const result = await executeCommand(
					buildRequestFromQuery("status", url, args.repoRoot),
				)
				return jsonResponse(200, { ok: true, ...result })
			} catch (error) {
				return jsonResponse(toErrorStatus(error), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}

		if (request.method === "GET" && url.pathname === "/api/cre-simulator/triggers/status") {
			try {
				const result = await executeTriggerStatus({
					repoRoot: args.repoRoot,
					...(url.searchParams.get("configPath")
						? { configPath: String(url.searchParams.get("configPath")) }
						: {}),
				})
				return jsonResponse(200, { ok: true, ...result })
			} catch (error) {
				return jsonResponse(toErrorStatus(error), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}

		if (
			request.method === "POST" &&
			url.pathname.startsWith("/api/cre-simulator/triggers/")
		) {
			const triggerName = url.pathname.split("/").at(-1)
			if (!triggerName) {
				return jsonResponse(404, { ok: false, error: "Not found" })
			}

			try {
				const body = await readJsonBody(request)
				const result = await executeTrigger({
					triggerType: "http",
					triggerName,
					repoRoot: args.repoRoot,
					...(typeof body.configPath === "string" ? { configPath: body.configPath } : {}),
					...(typeof body.scenarioPath === "string" ? { scenarioPath: body.scenarioPath } : {}),
					...(typeof body.stateFilePath === "string" ? { stateFilePath: body.stateFilePath } : {}),
					...(typeof body.evidenceDir === "string" ? { evidenceDir: body.evidenceDir } : {}),
				})
				return jsonResponse(200, { ok: true, ...result })
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error)
				return jsonResponse(message.startsWith("Unknown cre-simulator trigger") ? 404 : toErrorStatus(error), {
					ok: false,
					error: message.startsWith("Unknown cre-simulator trigger") ? "Not found" : message,
				})
			}
		}

		if (
			request.method === "POST" &&
			url.pathname.startsWith("/api/cre-simulator/commands/")
		) {
			const command = url.pathname.split("/").at(-1)
			if (!command || !isCreSimulatorCommand(command)) {
				return jsonResponse(404, { ok: false, error: "Not found" })
			}

			try {
				const body = await readJsonBody(request)
				const result = await executeCommand(
					buildRequestFromBody(command, body, args.repoRoot),
				)
				return jsonResponse(200, { ok: true, ...result })
			} catch (error) {
				return jsonResponse(toErrorStatus(error), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				})
			}
		}

		return jsonResponse(404, { ok: false, error: "Not found" })
	}
}
