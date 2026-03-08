import type { EnvRecord } from "../operator/config"
import { executeCreSimulatorCommand } from "../service"
import type { CreSimulatorExecuteCommand } from "../types"
import { loadCreSimulatorTriggerConfig } from "./config"
import {
	assertCreSimulatorTriggerStateStoreHealthy,
	claimCreSimulatorTriggerExecution,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionCompleted,
	markCreSimulatorTriggerExecutionQuarantined,
} from "./stateStore"
import type {
	CreSimulatorCronTriggerConfig,
	CreSimulatorEvmLogTriggerConfig,
	CreSimulatorHttpTriggerConfig,
	CreSimulatorTriggerDispatchResult,
	CreSimulatorTriggerRequest,
} from "./types"

	type DispatchDeps = {
	executeCommand?: CreSimulatorExecuteCommand
	nowMs?: () => number
}

type ResolvedTrigger =
	| { triggerType: "http"; trigger: CreSimulatorHttpTriggerConfig }
	| { triggerType: "cron"; trigger: CreSimulatorCronTriggerConfig }
	| { triggerType: "evm-log"; trigger: CreSimulatorEvmLogTriggerConfig }

function resolvePathFromImportMeta(): string {
	return new URL("../../..", import.meta.url).pathname
}

function ensureRepoScopedPath(repoRoot: string, rawPath: string, label: string): string {
	const resolved = new URL(`file://${rawPath.startsWith("/") ? rawPath : `${repoRoot}/${rawPath}`}`).pathname
	if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
		return resolved
	}
	throw new Error(`${label} must stay within repoRoot`)
}

function findTrigger(
	config: ReturnType<typeof loadCreSimulatorTriggerConfig>,
	request: CreSimulatorTriggerRequest,
): ResolvedTrigger {
	if (!request.triggerType || request.triggerType === "http") {
		const trigger = config.httpTriggers.find((entry) => entry.triggerName === request.triggerName)
		if (trigger && (!request.triggerType || request.triggerType === "http")) {
			return { triggerType: "http", trigger }
		}
	}
	if (!request.triggerType || request.triggerType === "cron") {
		const trigger = config.cronTriggers.find((entry) => entry.triggerName === request.triggerName)
		if (trigger && (!request.triggerType || request.triggerType === "cron")) {
			return { triggerType: "cron", trigger }
		}
	}
	if (!request.triggerType || request.triggerType === "evm-log") {
		const trigger = config.evmLogTriggers.find((entry) => entry.triggerName === request.triggerName)
		if (trigger && (!request.triggerType || request.triggerType === "evm-log")) {
			return { triggerType: "evm-log", trigger }
		}
	}
	throw new Error(`Unknown cre-simulator trigger: ${request.triggerName}`)
}

export async function dispatchCreSimulatorTrigger(
	request: CreSimulatorTriggerRequest,
	env: EnvRecord,
	deps: DispatchDeps = {},
): Promise<CreSimulatorTriggerDispatchResult> {
	const repoRoot = request.repoRoot ? request.repoRoot : resolvePathFromImportMeta()
	const configPath = request.configPath
		? ensureRepoScopedPath(repoRoot, request.configPath, "configPath")
		: `${repoRoot}/backend/cre-simulator/triggers.json`
	const config = loadCreSimulatorTriggerConfig(configPath, repoRoot)
	const resolved = findTrigger(config, request)
	const binding = {
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
	}
	const nowMs = deps.nowMs?.() ?? Date.now()
	const store = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
	assertCreSimulatorTriggerStateStoreHealthy(store)
	const executionKey = `${resolved.triggerType}:${resolved.trigger.triggerName}:${nowMs}`
	const claimDecision = claimCreSimulatorTriggerExecution(
		store,
		executionKey,
		{
			triggerName: resolved.trigger.triggerName,
			triggerType: resolved.triggerType,
		},
		nowMs,
	)
	if (!claimDecision.shouldProcess) {
		if (claimDecision.reason === "already-completed") {
			const executeCommand = deps.executeCommand ?? ((commandRequest) => executeCreSimulatorCommand(commandRequest, env))
			return {
				triggerType: resolved.triggerType,
				triggerName: resolved.trigger.triggerName,
				command: resolved.trigger.command,
				executionKey,
				deduped: true,
				result: await executeCommand({
					command: "status",
					repoRoot,
				}),
			}
		}
		throw new Error(`Trigger ${resolved.trigger.triggerName} is not runnable because it is ${claimDecision.reason}`)
	}

	const executeCommand = deps.executeCommand ?? ((commandRequest) => executeCreSimulatorCommand(commandRequest, env))
	try {
		const result = await executeCommand({
			command: resolved.trigger.command,
			repoRoot,
			...(resolved.trigger.scenarioPath ? { scenarioPath: resolved.trigger.scenarioPath } : {}),
			...(resolved.trigger.stateFilePath ? { stateFilePath: resolved.trigger.stateFilePath } : {}),
			...(resolved.trigger.evidenceDir ? { evidenceDir: resolved.trigger.evidenceDir } : {}),
			...(request.scenarioPath ? { scenarioPath: request.scenarioPath } : {}),
			...(request.stateFilePath ? { stateFilePath: request.stateFilePath } : {}),
			...(request.evidenceDir ? { evidenceDir: request.evidenceDir } : {}),
		})
		markCreSimulatorTriggerExecutionCompleted(store, executionKey, nowMs)
		return {
			triggerType: resolved.triggerType,
			triggerName: resolved.trigger.triggerName,
			command: resolved.trigger.command,
			executionKey,
			deduped: false,
			result,
		}
	} catch (error) {
		markCreSimulatorTriggerExecutionQuarantined(
			store,
			executionKey,
			error instanceof Error ? error.message : String(error),
			nowMs,
		)
		throw error
	}
}
