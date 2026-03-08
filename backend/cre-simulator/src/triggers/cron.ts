import { resolve } from "node:path"

import type { EnvRecord } from "../operator/config"
import type { CreSimulatorExecuteCommand } from "../types"
import { loadCreSimulatorTriggerConfig } from "./config"
import { dispatchCreSimulatorTrigger } from "./dispatch"
import {
	assertCreSimulatorTriggerStateStoreHealthy,
	loadCreSimulatorTriggerStateStore,
	recordCronTriggerRun,
} from "./stateStore"

type RunCronTriggerTickDeps = {
	executeCommand?: CreSimulatorExecuteCommand
	nowMs?: () => number
}

function ensureRepoScopedPath(repoRoot: string, rawPath: string, label: string): string {
	const resolved = new URL(`file://${rawPath.startsWith("/") ? rawPath : `${repoRoot}/${rawPath}`}`).pathname
	if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
		return resolved
	}
	throw new Error(`${label} must stay within repoRoot`)
}

export async function runCronTriggerTick(
	request: { repoRoot?: string; configPath?: string },
	env: EnvRecord,
	deps: RunCronTriggerTickDeps = {},
): Promise<{
	timestampMs: number
	executed: Array<{ triggerName: string; command: string }>
	skipped: string[]
}> {
	const repoRoot = request.repoRoot ?? resolve(import.meta.dir, "../../../..")
	const configPath = request.configPath
		? ensureRepoScopedPath(repoRoot, request.configPath, "configPath")
		: `${repoRoot}/backend/cre-simulator/triggers.json`
	const config = loadCreSimulatorTriggerConfig(configPath, repoRoot)
	const nowMs = deps.nowMs?.() ?? Date.now()
	const binding = {
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
	}
	const initialStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
	assertCreSimulatorTriggerStateStoreHealthy(initialStore)

	const executed: Array<{ triggerName: string; command: string }> = []
	const skipped: string[] = []

	for (const trigger of config.cronTriggers) {
		const lastRunAtMs = initialStore.schedulerCursorByName.get(trigger.triggerName)?.lastRunAtMs
		if (lastRunAtMs !== undefined && nowMs - lastRunAtMs < trigger.intervalMs) {
			skipped.push(trigger.triggerName)
			continue
		}

		await dispatchCreSimulatorTrigger(
			{
				repoRoot,
				configPath: config.configPath,
				triggerType: "cron",
				triggerName: trigger.triggerName,
			},
			env,
			{
				executeCommand: deps.executeCommand,
				nowMs: deps.nowMs,
			},
		)

		const freshStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
		recordCronTriggerRun(freshStore, trigger.triggerName, nowMs)
		executed.push({ triggerName: trigger.triggerName, command: trigger.command })
	}

	return { timestampMs: nowMs, executed, skipped }
}
