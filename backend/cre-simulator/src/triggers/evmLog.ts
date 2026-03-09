import { resolve } from "node:path";
import {
	decideVerifyPocStrictGate,
	decodeVerifyPocReportEnvelope,
} from "../../../../workflow/verify-poc/main";
import type { CreSimulatorAdapterResult } from "../adapter-types";
import type { EnvRecord } from "../env";
import type { BountyHubProject } from "../operator/bountyHubClient";
import { executeCreSimulatorAdapter } from "../service";
import type {
	CreSimulatorExecuteAdapter,
	CreSimulatorExecuteStatus,
} from "../types";
import { loadCreSimulatorTriggerConfig } from "./config";
import {
	assertCreSimulatorTriggerStateStoreHealthy,
	claimCreSimulatorTriggerExecution,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionCompleted,
	markCreSimulatorTriggerExecutionQuarantined,
	recordEvmLogTriggerCursor,
	recordProjectDeadlineSchedule,
} from "./stateStore";
import type {
	CreSimulatorEvmLogEvent,
	CreSimulatorEvmLogTriggerConfig,
} from "./types";

type DispatchEvmLogTriggerEventDeps = {
	executeAdapter?: CreSimulatorExecuteAdapter;
	executeStatus?: CreSimulatorExecuteStatus;
	nowMs?: () => number;
	readProject?: (
		projectId: bigint,
	) => Promise<Pick<BountyHubProject, "commitDeadline" | "revealDeadline">>;
};

const PROJECT_READ_SELECTOR = "0x107046bd";

function ensureRepoScopedPath(
	repoRoot: string,
	rawPath: string,
	label: string,
): string {
	const resolved = new URL(
		`file://${rawPath.startsWith("/") ? rawPath : `${repoRoot}/${rawPath}`}`,
	).pathname;
	if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
		return resolved;
	}
	throw new Error(`${label} must stay within repoRoot`);
}

function toEventKey(event: CreSimulatorEvmLogEvent): string {
	return `${event.txHash.toLowerCase()}:${event.logIndex}`;
}

function toPaddedHexWord(value: bigint): string {
	return value.toString(16).padStart(64, "0");
}

function normalizeProjectReadResult(hexResult: string): `0x${string}` {
	const normalized = hexResult.startsWith("0x")
		? hexResult.toLowerCase()
		: `0x${hexResult.toLowerCase()}`;
	if (normalized.length < 66) {
		throw new Error("Invalid project read result: too short");
	}

	const headWord = BigInt(`0x${normalized.slice(2, 66)}`);
	if (headWord === 32n) {
		return `0x${normalized.slice(66)}` as `0x${string}`;
	}

	return normalized as `0x${string}`;
}

function readAbiWord(hexResult: `0x${string}`, wordIndex: number): bigint {
	const start = 2 + wordIndex * 64;
	const end = start + 64;
	if (hexResult.length < end) {
		throw new Error(
			`Invalid project read result: missing word index ${wordIndex}`,
		);
	}
	return BigInt(`0x${hexResult.slice(start, end)}`);
}

function toDeadlineMs(value: bigint, label: string): number {
	const milliseconds = value * 1000n;
	if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) {
		throw new Error(`${label} exceeds Number.MAX_SAFE_INTEGER milliseconds`);
	}
	return Number(milliseconds);
}

function getIndexedProjectId(
	event: CreSimulatorEvmLogEvent,
): bigint | undefined {
	if (!event.topics || event.topics.length < 2) {
		return undefined;
	}

	return BigInt(event.topics[1]);
}

async function readProjectDeadlinesFromRpc(args: {
	rpcUrl: string;
	contractAddress: `0x${string}`;
	projectId: bigint;
}): Promise<Pick<BountyHubProject, "commitDeadline" | "revealDeadline">> {
	const response = await fetch(args.rpcUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "eth_call",
			params: [
				{
					to: args.contractAddress,
					data: `${PROJECT_READ_SELECTOR}${toPaddedHexWord(args.projectId)}`,
				},
				"latest",
			],
		}),
	});
	if (!response.ok) {
		throw new Error(`Project read RPC failed with status ${response.status}`);
	}

	const payload = (await response.json()) as {
		result?: string;
		error?: { message?: string };
	};
	if (payload.error) {
		throw new Error(
			payload.error.message ?? "Project read RPC returned an error",
		);
	}
	if (typeof payload.result !== "string") {
		throw new Error("Project read RPC did not return a hex result");
	}

	const projectResult = normalizeProjectReadResult(payload.result);
	return {
		commitDeadline: readAbiWord(projectResult, 7),
		revealDeadline: readAbiWord(projectResult, 8),
	};
}

async function bootstrapProjectDeadlineSchedule(args: {
	binding: { configPath: string; stateFilePath: string };
	env: EnvRecord;
	nowMs: number;
	trigger: CreSimulatorEvmLogTriggerConfig;
	event: CreSimulatorEvmLogEvent;
	readProject?: DispatchEvmLogTriggerEventDeps["readProject"];
}): Promise<void> {
	if (args.trigger.triggerName !== "project-registered") {
		return;
	}

	const projectId = getIndexedProjectId(args.event);
	if (projectId === undefined) {
		throw new Error("project-registered trigger requires topics[1] projectId");
	}

	const readProject =
		args.readProject ??
		(async (nextProjectId: bigint) => {
			const rpcUrl = args.env.CRE_SIM_SEPOLIA_RPC_URL?.trim();
			if (!rpcUrl) {
				throw new Error(
					"Missing required environment variable: CRE_SIM_SEPOLIA_RPC_URL",
				);
			}
			return await readProjectDeadlinesFromRpc({
				rpcUrl,
				contractAddress: args.trigger.contractAddress,
				projectId: nextProjectId,
			});
		});

	const project = await readProject(projectId);
	const freshStore = loadCreSimulatorTriggerStateStore(
		args.binding.stateFilePath,
		args.binding,
		args.nowMs,
	);
	recordProjectDeadlineSchedule(freshStore, {
		projectId,
		commitDeadlineMs: toDeadlineMs(
			project.commitDeadline,
			"project.commitDeadline",
		),
		revealDeadlineMs: toDeadlineMs(
			project.revealDeadline,
			"project.revealDeadline",
		),
	});
}

function getVerifyPocReportForAutomaticCommitDeadline(
	triggerName: string,
	adapterResult: CreSimulatorAdapterResult,
): unknown | undefined {
	if (triggerName !== "poc-revealed") {
		return undefined;
	}

	const candidate = (
		adapterResult.result as { workflowResult?: unknown } | undefined
	)?.workflowResult;
	if (candidate === undefined) {
		return undefined;
	}

	try {
		const decoded = decodeVerifyPocReportEnvelope(candidate);
		const strictGate = decideVerifyPocStrictGate({
			isValid: decoded.payload.isValid,
			reasonCode:
				decoded.reportType === "verified-report/v3"
					? decoded.adjudication.reasonCode
					: undefined,
		});
		if (
			strictGate.outcome === "EMIT_EVIDENCE" &&
			decoded.reportType === "verified-report/v3"
		) {
			return candidate;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

async function dispatchAutomaticCommitDeadline(args: {
	repoRoot: string;
	configPath: string;
	env: EnvRecord;
	executeAdapter: (request: {
		adapter: string;
		adapterConfig?: unknown;
		repoRoot: string;
		inputPayload: { phase: "commit-deadline"; verifyPocReport: unknown };
	}) => Promise<CreSimulatorAdapterResult>;
	verifyPocReport: unknown;
}): Promise<void> {
	const config = loadCreSimulatorTriggerConfig(args.configPath, args.repoRoot);
	const trigger = config.httpTriggers.find(
		(entry) => entry.triggerName === "manual-commit-deadline",
	);
	if (!trigger) {
		throw new Error("Unknown cre-simulator trigger: manual-commit-deadline");
	}

	await args.executeAdapter({
		adapter: trigger.adapter,
		...(trigger.adapterConfig ? { adapterConfig: trigger.adapterConfig } : {}),
		repoRoot: args.repoRoot,
		inputPayload: {
			phase: "commit-deadline",
			verifyPocReport: args.verifyPocReport,
		},
	});
}

function getTrigger(
	configPath: string,
	repoRoot: string,
	triggerName: string,
): {
	config: ReturnType<typeof loadCreSimulatorTriggerConfig>;
	trigger: CreSimulatorEvmLogTriggerConfig;
} {
	const config = loadCreSimulatorTriggerConfig(configPath, repoRoot);
	const trigger = config.evmLogTriggers.find(
		(entry) => entry.triggerName === triggerName,
	);
	if (!trigger) {
		throw new Error(`Unknown cre-simulator trigger: ${triggerName}`);
	}
	return { config, trigger };
}

export async function dispatchEvmLogTriggerEvent(
	request: {
		triggerName: string;
		repoRoot?: string;
		configPath?: string;
		event: CreSimulatorEvmLogEvent;
	},
	env: EnvRecord,
	deps: DispatchEvmLogTriggerEventDeps = {},
): Promise<{
	triggerType: "evm-log";
	triggerName: string;
	adapter: string;
	deduped: boolean;
	result?:
		| Awaited<ReturnType<typeof dispatchCreSimulatorTrigger>>["result"]
		| CreSimulatorAdapterResult;
}> {
	const repoRoot = request.repoRoot ?? resolve(import.meta.dir, "../../../..");
	const configPath = request.configPath
		? ensureRepoScopedPath(repoRoot, request.configPath, "configPath")
		: `${repoRoot}/backend/cre-simulator/triggers.json`;
	const { config, trigger } = getTrigger(
		configPath,
		repoRoot,
		request.triggerName,
	);
	const binding = {
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
	};
	const nowMs = deps.nowMs?.() ?? Date.now();
	const store = loadCreSimulatorTriggerStateStore(
		config.stateFilePath,
		binding,
		nowMs,
	);
	assertCreSimulatorTriggerStateStoreHealthy(store);

	if (
		request.event.address.toLowerCase() !==
		trigger.contractAddress.toLowerCase()
	) {
		throw new Error(
			`EVM log trigger ${trigger.triggerName} received an unexpected contract address`,
		);
	}
	if (request.event.topic0.toLowerCase() !== trigger.topic0.toLowerCase()) {
		throw new Error(
			`EVM log trigger ${trigger.triggerName} received an unexpected topic0`,
		);
	}

	const eventKey = toEventKey(request.event);
	const listenerCursor = store.listenerCursorByName.get(trigger.triggerName);
	if (listenerCursor?.lastEventKey === eventKey) {
		return {
			triggerType: "evm-log",
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			deduped: true,
		};
	}

	const executionKey = `evm-log:${trigger.triggerName}:${eventKey}`;
	const claimDecision = claimCreSimulatorTriggerExecution(
		store,
		executionKey,
		{ triggerName: trigger.triggerName, triggerType: "evm-log" },
		nowMs,
	);
	if (!claimDecision.shouldProcess) {
		return {
			triggerType: "evm-log",
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			deduped: claimDecision.reason === "already-completed",
		};
	}

	const executeAdapter =
		deps.executeAdapter ??
		((adapterRequest) => executeCreSimulatorAdapter(adapterRequest, env));
	try {
		const result = await executeAdapter({
			adapter: trigger.adapter,
			...(trigger.adapterConfig
				? { adapterConfig: trigger.adapterConfig }
				: {}),
			repoRoot,
			...(trigger.evidenceDir ? { evidenceDir: trigger.evidenceDir } : {}),
			evmTxHash: request.event.txHash,
			evmEventIndex: request.event.logIndex,
		});
		const automaticCommitDeadlineVerifyPocReport =
			getVerifyPocReportForAutomaticCommitDeadline(trigger.triggerName, result);
		if (automaticCommitDeadlineVerifyPocReport !== undefined) {
			await dispatchAutomaticCommitDeadline({
				repoRoot,
				configPath: config.configPath,
				executeAdapter,
				verifyPocReport: automaticCommitDeadlineVerifyPocReport,
			});
		}
		await bootstrapProjectDeadlineSchedule({
			binding,
			env,
			nowMs,
			trigger,
			event: request.event,
			readProject: deps.readProject,
		});
		const freshStore = loadCreSimulatorTriggerStateStore(
			config.stateFilePath,
			binding,
			nowMs,
		);
		markCreSimulatorTriggerExecutionCompleted(freshStore, executionKey, nowMs);
		recordEvmLogTriggerCursor(
			freshStore,
			trigger.triggerName,
			{
				lastSeenBlockNumber: request.event.blockNumber,
				lastEventKey: eventKey,
			},
			nowMs,
		);
		return {
			triggerType: "evm-log",
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			deduped: false,
			result,
		};
	} catch (error) {
		const freshStore = loadCreSimulatorTriggerStateStore(
			config.stateFilePath,
			binding,
			nowMs,
		);
		markCreSimulatorTriggerExecutionQuarantined(
			freshStore,
			executionKey,
			error instanceof Error ? error.message : String(error),
			nowMs,
		);
		throw error;
	}
}
