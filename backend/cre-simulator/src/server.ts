import type {
	CreSimulatorAdapterKey,
	CreSimulatorAdapterRequest,
} from "./adapter-types";
import type { EnvRecord } from "./env";
import { resolveCreSimulatorRuntimeEnv } from "./runtime-env";

import {
	CreSimulatorRequestError,
	executeCreSimulatorAdapter,
	executeCreSimulatorStatus,
	executeCreSimulatorTrigger,
	getCreSimulatorTriggerStatus,
} from "./service";
import type {
	CreSimulatorExecuteAdapter,
	CreSimulatorExecuteStatus,
	CreSimulatorExecuteTrigger,
	CreSimulatorGetTriggerStatus,
	CreSimulatorStatusRequest,
} from "./types";

const CRE_SIMULATOR_ADAPTERS = [
	"auto-reveal-relayer",
	"cre-workflow-simulate",
	"jury-orchestrator-run-once",
	"demo-adjudication-orchestrator",
] as const satisfies readonly CreSimulatorAdapterKey[];

type CreateCreSimulatorHttpHandlerArgs = {
	repoRoot: string;
	env?: EnvRecord;
	executeAdapter?: CreSimulatorExecuteAdapter;
	executeStatus?: CreSimulatorExecuteStatus;
	executeTrigger?: CreSimulatorExecuteTrigger;
	executeTriggerStatus?: CreSimulatorGetTriggerStatus;
};

function jsonResponse(status: number, payload: unknown): Response {
	return new Response(JSON.stringify(payload, null, 2), {
		status,
		headers: {
			"content-type": "application/json",
		},
	});
}

function isCreSimulatorAdapter(value: string): value is CreSimulatorAdapterKey {
	return (CRE_SIMULATOR_ADAPTERS as readonly string[]).includes(value);
}

function toErrorStatus(error: unknown): number {
	return error instanceof CreSimulatorRequestError ? 400 : 500;
}

async function readJsonBody(
	request: Request,
): Promise<Record<string, unknown>> {
	if (!request.headers.get("content-type")?.includes("application/json")) {
		return {};
	}

	const payload = (await request.json()) as unknown;
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error("Request body must be a JSON object");
	}

	return payload as Record<string, unknown>;
}

function buildRequestFromQuery(
	repoRoot: string,
	url: URL,
): CreSimulatorStatusRequest {
	if (url.searchParams.get("scenarioPath")) {
		throw new CreSimulatorRequestError(
			"scenarioPath is not supported in live-only mode",
		);
	}
	if (url.searchParams.get("stateFilePath")) {
		throw new CreSimulatorRequestError(
			"stateFilePath is not supported in live-only mode",
		);
	}
	return {
		repoRoot,
		...(url.searchParams.get("configPath")
			? { configPath: String(url.searchParams.get("configPath")) }
			: {}),
		...(url.searchParams.get("evidenceDir")
			? { evidenceDir: String(url.searchParams.get("evidenceDir")) }
			: {}),
		...(url.searchParams.get("evmTxHash")
			? {
					evmTxHash: String(url.searchParams.get("evmTxHash")) as `0x${string}`,
				}
			: {}),
		...(url.searchParams.get("evmEventIndex")
			? { evmEventIndex: Number(url.searchParams.get("evmEventIndex")) }
			: {}),
	};
}

function buildAdapterRequestFromBody(
	adapter: CreSimulatorAdapterKey,
	body: Record<string, unknown>,
	repoRoot: string,
): CreSimulatorAdapterRequest {
	if (typeof body.scenarioPath === "string") {
		throw new CreSimulatorRequestError(
			"scenarioPath is not supported in live-only mode",
		);
	}
	if (typeof body.stateFilePath === "string") {
		throw new CreSimulatorRequestError(
			"stateFilePath is not supported in live-only mode",
		);
	}
	return {
		adapter,
		repoRoot,
		...(typeof body.evidenceDir === "string"
			? { evidenceDir: body.evidenceDir }
			: {}),
		...(typeof body.evmTxHash === "string"
			? { evmTxHash: body.evmTxHash as `0x${string}` }
			: {}),
		...(typeof body.evmEventIndex === "number"
			? { evmEventIndex: body.evmEventIndex }
			: {}),
		...(body.adapterConfig &&
		typeof body.adapterConfig === "object" &&
		!Array.isArray(body.adapterConfig)
			? {
					adapterConfig:
						body.adapterConfig as CreSimulatorAdapterRequest["adapterConfig"],
				}
			: {}),
		...(body.inputPayload &&
		typeof body.inputPayload === "object" &&
		!Array.isArray(body.inputPayload)
			? {
					inputPayload:
						body.inputPayload as CreSimulatorAdapterRequest["inputPayload"],
				}
			: {}),
	};
}

export function createCreSimulatorHttpHandler(
	args: CreateCreSimulatorHttpHandlerArgs,
): (request: Request) => Promise<Response> {
	const env = resolveCreSimulatorRuntimeEnv({
		repoRoot: args.repoRoot,
		env: args.env ?? (process.env as EnvRecord),
	});
	const executeAdapter =
		args.executeAdapter ??
		((request: CreSimulatorAdapterRequest) =>
			executeCreSimulatorAdapter(request, env));
	const executeStatus =
		args.executeStatus ??
		((request: CreSimulatorStatusRequest) =>
			executeCreSimulatorStatus(request, env));
	const executeTrigger =
		args.executeTrigger ??
		((request) => executeCreSimulatorTrigger(request, env));
	const executeTriggerStatus =
		args.executeTriggerStatus ??
		((request) => getCreSimulatorTriggerStatus(request, env));

	return async (request: Request): Promise<Response> => {
		const url = new URL(request.url);

		if (request.method === "GET" && url.pathname === "/health") {
			return jsonResponse(200, { ok: true, service: "cre-simulator" });
		}

		if (
			request.method === "GET" &&
			url.pathname === "/api/cre-simulator/status"
		) {
			try {
				const result = await executeStatus(
					buildRequestFromQuery(args.repoRoot, url),
				);
				return jsonResponse(200, { ok: true, ...result });
			} catch (error) {
				return jsonResponse(toErrorStatus(error), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (
			request.method === "GET" &&
			url.pathname === "/api/cre-simulator/triggers/status"
		) {
			try {
				const result = await executeTriggerStatus({
					repoRoot: args.repoRoot,
					...(url.searchParams.get("configPath")
						? { configPath: String(url.searchParams.get("configPath")) }
						: {}),
				});
				return jsonResponse(200, { ok: true, ...result });
			} catch (error) {
				return jsonResponse(toErrorStatus(error), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		if (
			request.method === "POST" &&
			url.pathname.startsWith("/api/cre-simulator/triggers/")
		) {
			const triggerName = url.pathname.split("/").at(-1);
			if (!triggerName) {
				return jsonResponse(404, { ok: false, error: "Not found" });
			}

			try {
				const body = await readJsonBody(request);
				const result = await executeTrigger({
					triggerType: "http",
					triggerName,
					repoRoot: args.repoRoot,
					...(typeof body.configPath === "string"
						? { configPath: body.configPath }
						: {}),
					...(typeof body.evidenceDir === "string"
						? { evidenceDir: body.evidenceDir }
						: {}),
					...(typeof body.evmTxHash === "string"
						? { evmTxHash: body.evmTxHash as `0x${string}` }
						: {}),
					...(typeof body.evmEventIndex === "number"
						? { evmEventIndex: body.evmEventIndex }
						: {}),
					...(body.inputPayload &&
					typeof body.inputPayload === "object" &&
					!Array.isArray(body.inputPayload)
						? {
								inputPayload:
									body.inputPayload as CreSimulatorAdapterRequest["inputPayload"],
							}
						: {}),
				});
				return jsonResponse(200, { ok: true, ...result });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return jsonResponse(
					message.startsWith("Unknown cre-simulator trigger")
						? 404
						: toErrorStatus(error),
					{
						ok: false,
						error: message.startsWith("Unknown cre-simulator trigger")
							? "Not found"
							: message,
					},
				);
			}
		}

		if (
			request.method === "POST" &&
			url.pathname.startsWith("/api/cre-simulator/adapters/")
		) {
			const adapter = url.pathname.split("/").at(-1);
			if (!adapter || !isCreSimulatorAdapter(adapter)) {
				return jsonResponse(404, { ok: false, error: "Not found" });
			}

			try {
				const body = await readJsonBody(request);
				const result = await executeAdapter(
					buildAdapterRequestFromBody(adapter, body, args.repoRoot),
				);
				return jsonResponse(200, { ok: true, ...result });
			} catch (error) {
				return jsonResponse(toErrorStatus(error), {
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return jsonResponse(404, { ok: false, error: "Not found" });
	};
}
