import { join, resolve } from "node:path"

import type { EnvRecord } from "./operator/config"
import {
	executeDemoOperatorService,
	loadDemoOperatorServiceConfig,
} from "./operator/service"
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
	CreSimulatorCommandRequest,
	CreSimulatorCommandResult,
	CreSimulatorServiceDependencies,
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

export function buildDefaultCreSimulatorScenarioPath(repoRoot: string): string {
	return join(repoRoot, "demo-data/operator/multi-fast-happy-path.json")
}

export { buildDefaultCreSimulatorTriggerConfigPath }

export async function executeCreSimulatorCommand(
	request: CreSimulatorCommandRequest,
	env: EnvRecord,
	deps: CreSimulatorServiceDependencies = {},
): Promise<CreSimulatorCommandResult> {
	const repoRoot = resolveRepoRoot(request.repoRoot)
	const cwd = request.cwd
		? ensureRepoScopedPath(repoRoot, request.cwd, "cwd")
		: repoRoot
	const scenarioPath = request.scenarioPath
		? ensureRepoScopedPath(repoRoot, request.scenarioPath, "scenarioPath")
		: buildDefaultCreSimulatorScenarioPath(repoRoot)
	const stateFilePath = request.stateFilePath
		? ensureRepoScopedPath(repoRoot, request.stateFilePath, "stateFilePath")
		: undefined
	const evidenceDir = request.evidenceDir
		? ensureRepoScopedPath(repoRoot, request.evidenceDir, "evidenceDir")
		: undefined
	const demoRequest = {
		command: request.command,
		scenario: scenarioPath,
		...(stateFilePath ? { stateFile: stateFilePath } : {}),
		...(evidenceDir ? { evidenceDir } : {}),
	}

	const result = deps.executeDemoOperator
		? await deps.executeDemoOperator({ request: demoRequest, env, cwd })
		: await executeDemoOperatorService({
			config: loadDemoOperatorServiceConfig(demoRequest, env, cwd),
			env,
			deps: deps.demoOperatorDeps,
		})

	return {
		command: request.command,
		scenarioPath,
		result,
	}
}

export async function executeCreSimulatorTrigger(
	request: {
		triggerName: string
		repoRoot?: string
		configPath?: string
		cwd?: string
		scenarioPath?: string
		stateFilePath?: string
		evidenceDir?: string
	},
	env: EnvRecord,
	deps: CreSimulatorServiceDependencies & { nowMs?: () => number } = {},
): Promise<CreSimulatorTriggerResult> {
	return await dispatchCreSimulatorTrigger(request, env, {
		executeCommand: deps.executeCommand ?? ((commandRequest) => executeCreSimulatorCommand(commandRequest, env, deps)),
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
			command: trigger.command,
		})),
		cronTriggers: config.cronTriggers.map((trigger) => ({
			triggerName: trigger.triggerName,
			command: trigger.command,
			intervalMs: trigger.intervalMs,
			...(store.schedulerCursorByName.get(trigger.triggerName)
				? { lastRunAtMs: store.schedulerCursorByName.get(trigger.triggerName)?.lastRunAtMs }
				: {}),
		})),
		evmLogTriggers: config.evmLogTriggers.map((trigger) => ({
			triggerName: trigger.triggerName,
			command: trigger.command,
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
		executeCommand: deps.executeCommand ?? ((commandRequest) => executeCreSimulatorCommand(commandRequest, env, deps)),
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
		executeCommand: deps.executeCommand ?? ((commandRequest) => executeCreSimulatorCommand(commandRequest, env, deps)),
		nowMs: deps.nowMs,
	})
}
