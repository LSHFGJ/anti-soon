import { resolve } from "node:path"

import type {
	CreSimulatorAdapterBinding,
	CreSimulatorAdapterExecutor,
	CreSimulatorAdapterKey,
	CreSimulatorAdapterRequest,
	CreSimulatorAdapterResult,
} from "./adapter-types"
import type { EnvRecord } from "./env"
import { executeAutoRevealRelayerAdapter } from "./live-reveal"
import { executeCreWorkflowSimulateAdapter } from "./live-verify"
import { buildDefaultCreSimulatorTriggerConfigPath, loadCreSimulatorTriggerConfig } from "./triggers/config"
import { runCronTriggerTick } from "./triggers/cron"
import { dispatchCreSimulatorTrigger } from "./triggers/dispatch"
import { dispatchEvmLogTriggerEvent } from "./triggers/evmLog"
import {
	assertCreSimulatorTriggerStateStoreHealthy,
	loadCreSimulatorTriggerStateStore,
} from "./triggers/stateStore"
import type { CreSimulatorEvmLogEvent, CreSimulatorTriggerStatusPayload } from "./triggers/types"
import type {
	CreSimulatorServiceDependencies,
	CreSimulatorStatusRequest,
	CreSimulatorStatusResult,
	CreSimulatorTriggerResult,
} from "./types"

export class CreSimulatorRequestError extends Error {}

function resolveRepoRoot(repoRoot: string | undefined): string {
	return repoRoot ? resolve(repoRoot) : resolve(import.meta.dir, "../../..")
}

function ensureRepoScopedPath(
	repoRoot: string,
	rawPath: string,
	label: string,
): string {
	const resolved = resolve(rawPath)
	if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
		return resolved
	}

	throw new CreSimulatorRequestError(`${label} must stay within repoRoot`)
}

export { buildDefaultCreSimulatorTriggerConfigPath }

function assertNoDemoOverrides(request: {
	scenarioPath?: string
	stateFilePath?: string
}): void {
	if (request.scenarioPath) {
		throw new CreSimulatorRequestError("scenarioPath is not supported in live-only mode")
	}
	if (request.stateFilePath) {
		throw new CreSimulatorRequestError("stateFilePath is not supported in live-only mode")
	}
}

function buildAdapterRegistry(
	overrides: CreSimulatorServiceDependencies["adapterExecutors"] = {},
): Record<CreSimulatorAdapterKey, CreSimulatorAdapterExecutor> {
	return {
		"auto-reveal-relayer": async ({ repoRoot, env, adapterConfig }) =>
			await executeAutoRevealRelayerAdapter({
				repoRoot,
				env,
				adapterConfig: adapterConfig as CreSimulatorAdapterBinding["adapterConfig"],
			}),
		"cre-workflow-simulate": async ({
			repoRoot,
			env,
			adapterConfig,
			evmTxHash,
			evmEventIndex,
			evidenceDir,
		}) =>
			await executeCreWorkflowSimulateAdapter({
				repoRoot,
				env,
				adapterConfig: adapterConfig as NonNullable<CreSimulatorAdapterBinding["adapterConfig"]>,
				evmTxHash,
				evmEventIndex,
				evidenceDir,
			}),
		...overrides,
	}
}

function buildLiveStatus(args: {
	repoRoot: string
	configPath?: string
}): {
	mode: "live-only"
	adapters: readonly ["auto-reveal-relayer", "cre-workflow-simulate"]
	runtimeEnv: {
		required: readonly [
			"CRE_SIM_TENDERLY_API_KEY",
			"CRE_SIM_PRIVATE_KEY",
			"CRE_SIM_SEPOLIA_RPC_URL",
			"CRE_SIM_ADMIN_RPC_URL",
			"CRE_SIM_BOUNTY_HUB_ADDRESS",
			"CRE_SIM_OASIS_STORAGE_CONTRACT",
		]
		evmLogRequired: readonly ["CRE_SIM_WS_RPC_URL"]
	}
	triggerConfigPath: string
	triggerStateFilePath: string
} {
	const triggerConfigPath = args.configPath
		? ensureRepoScopedPath(args.repoRoot, args.configPath, "configPath")
		: buildDefaultCreSimulatorTriggerConfigPath(args.repoRoot)
	const triggerConfig = loadCreSimulatorTriggerConfig(triggerConfigPath, args.repoRoot)
	return {
		mode: "live-only",
		adapters: ["auto-reveal-relayer", "cre-workflow-simulate"],
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
		triggerConfigPath: triggerConfig.configPath,
		triggerStateFilePath: triggerConfig.stateFilePath,
	}
}

export async function executeCreSimulatorStatus(
	request: CreSimulatorStatusRequest,
	env: EnvRecord,
): Promise<CreSimulatorStatusResult> {
	void env
	const repoRoot = resolveRepoRoot(request.repoRoot)
	assertNoDemoOverrides(request)
	return {
		command: "status",
		result: buildLiveStatus({ repoRoot, configPath: request.configPath }),
	}
}

export async function executeCreSimulatorAdapter(
	request: CreSimulatorAdapterRequest,
	env: EnvRecord,
	deps: CreSimulatorServiceDependencies = {},
): Promise<CreSimulatorAdapterResult> {
	const repoRoot = resolveRepoRoot(request.repoRoot)
	assertNoDemoOverrides(request)
	const executeAdapter = deps.executeAdapter
	if (executeAdapter) {
		return await executeAdapter(request)
	}
	const registry = buildAdapterRegistry(deps.adapterExecutors)
	const executor = registry[request.adapter]
	if (!executor) {
		throw new CreSimulatorRequestError(
			`Unsupported live-only adapter: ${String(request.adapter)}`,
		)
	}
	return {
		adapter: request.adapter,
		result: await executor({
			repoRoot,
			env,
			adapterConfig: request.adapterConfig,
			evidenceDir: request.evidenceDir,
			evmTxHash: request.evmTxHash,
			evmEventIndex: request.evmEventIndex,
		}),
	}
}

export async function executeCreSimulatorTrigger(
	request: {
		triggerName: string
		repoRoot?: string
		configPath?: string
		cwd?: string
		evidenceDir?: string
		evmTxHash?: `0x${string}`
		evmEventIndex?: number
		adapterConfig?: CreSimulatorAdapterRequest["adapterConfig"]
	},
	env: EnvRecord,
	deps: CreSimulatorServiceDependencies & { nowMs?: () => number } = {},
): Promise<CreSimulatorTriggerResult> {
	return await dispatchCreSimulatorTrigger(request, env, {
		executeAdapter:
			deps.executeAdapter ??
			((adapterRequest) => executeCreSimulatorAdapter(adapterRequest, env, deps)),
		executeStatus:
			deps.executeStatus ??
			((statusRequest) => executeCreSimulatorStatus(statusRequest, env)),
		nowMs: deps.nowMs,
	})
}

export async function getCreSimulatorTriggerStatus(
	request: { repoRoot?: string; configPath?: string },
	env: EnvRecord,
): Promise<CreSimulatorTriggerStatusPayload> {
	void env
	const repoRoot = resolveRepoRoot(request.repoRoot)
	const configPath = request.configPath
		? ensureRepoScopedPath(repoRoot, request.configPath, "configPath")
		: buildDefaultCreSimulatorTriggerConfigPath(repoRoot)
	const config = loadCreSimulatorTriggerConfig(configPath, repoRoot)
	const binding = {
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
	}
	const store = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding)
	let healthy = true
	try {
		assertCreSimulatorTriggerStateStoreHealthy(store)
	} catch {
		healthy = false
	}

	return {
		healthy,
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
		recoveredProcessingCount: store.recoveredProcessingCount,
		quarantinedExecutionCount: store.quarantinedExecutionCount,
		httpTriggers: config.httpTriggers.map((trigger) => ({
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
		})),
		cronTriggers: config.cronTriggers.map((trigger) => ({
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			intervalMs: trigger.intervalMs,
			...(store.schedulerCursorByName.get(trigger.triggerName)
				? { lastRunAtMs: store.schedulerCursorByName.get(trigger.triggerName)?.lastRunAtMs }
				: {}),
		})),
		evmLogTriggers: config.evmLogTriggers.map((trigger) => ({
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			contractAddress: trigger.contractAddress,
			topic0: trigger.topic0,
			...(store.listenerCursorByName.get(trigger.triggerName)?.lastSeenBlockNumber !== undefined
				? {
					lastSeenBlockNumber: store.listenerCursorByName
						.get(trigger.triggerName)
						?.lastSeenBlockNumber?.toString(),
				}
				: {}),
			...(store.listenerCursorByName.get(trigger.triggerName)?.lastEventKey
				? { lastEventKey: store.listenerCursorByName.get(trigger.triggerName)?.lastEventKey }
				: {}),
		})),
	}
}

export async function executeCreSimulatorCronTick(
	request: { repoRoot?: string; configPath?: string },
	env: EnvRecord,
	deps: CreSimulatorServiceDependencies & { nowMs?: () => number } = {},
) {
	return await runCronTriggerTick(request, env, {
		executeAdapter:
			deps.executeAdapter ??
			((adapterRequest) => executeCreSimulatorAdapter(adapterRequest, env, deps)),
		executeStatus:
			deps.executeStatus ??
			((statusRequest) => executeCreSimulatorStatus(statusRequest, env)),
		nowMs: deps.nowMs,
	})
}

export async function executeCreSimulatorEvmLogTrigger(
	request: {
		triggerName: string
		repoRoot?: string
		configPath?: string
		event: CreSimulatorEvmLogEvent
	},
	env: EnvRecord,
	deps: CreSimulatorServiceDependencies & { nowMs?: () => number } = {},
) {
	return await dispatchEvmLogTriggerEvent(request, env, {
		executeAdapter:
			deps.executeAdapter ??
			((adapterRequest) => executeCreSimulatorAdapter(adapterRequest, env, deps)),
		executeStatus:
			deps.executeStatus ??
			((statusRequest) => executeCreSimulatorStatus(statusRequest, env)),
		nowMs: deps.nowMs,
	})
}
