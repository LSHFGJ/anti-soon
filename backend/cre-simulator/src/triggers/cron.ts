import { resolve } from "node:path"

import type { EnvRecord } from "../env"
import type { CreSimulatorExecuteAdapter, CreSimulatorExecuteStatus } from "../types"
import { loadCreSimulatorTriggerConfig } from "./config"
import { dispatchCreSimulatorTrigger } from "./dispatch"
import {
	assertCreSimulatorTriggerStateStoreHealthy,
	deleteCreSimulatorDeadlineJob,
	listDueCreSimulatorDeadlineJobs,
	loadCreSimulatorTriggerStateStore,
	recordCronTriggerRun,
} from "./stateStore"

type RunCronTriggerTickDeps = {
	executeAdapter?: CreSimulatorExecuteAdapter
	executeStatus?: CreSimulatorExecuteStatus
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
	executed: Array<{ triggerName: string; adapter: string }>
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

	const executed: Array<{ triggerName: string; adapter: string }> = []
	const skipped: string[] = []
	const processedCronTriggerNames = new Set<string>()

	for (const job of listDueCreSimulatorDeadlineJobs(initialStore, nowMs)) {
		if (job.jobType === "project-commit-deadline") {
			const trigger = config.cronTriggers.find((entry) => entry.triggerName === "reveal-relay")
			if (!trigger) {
				throw new Error("Missing cron trigger binding for reveal-relay")
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
					executeAdapter: deps.executeAdapter,
					executeStatus: deps.executeStatus,
					nowMs: deps.nowMs,
				},
			)

			const freshStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
			recordCronTriggerRun(freshStore, trigger.triggerName, nowMs)
			deleteCreSimulatorDeadlineJob(freshStore, job.jobKey)
			executed.push({ triggerName: trigger.triggerName, adapter: trigger.adapter })
			processedCronTriggerNames.add(trigger.triggerName)
			continue
		}

		const trigger = config.httpTriggers.find((entry) => entry.triggerName === "manual-reveal-deadline")
		if (!trigger) {
			throw new Error("Missing http trigger binding for manual-reveal-deadline")
		}
		if (!job.submissionId) {
			throw new Error(`Missing submissionId for deadline job ${job.jobKey}`)
		}

		await dispatchCreSimulatorTrigger(
			{
				repoRoot,
				configPath: config.configPath,
				triggerType: "http",
				triggerName: trigger.triggerName,
				inputPayload: {
					phase: "reveal-deadline",
					submissionId: job.submissionId,
					...(job.juryRoundId ? { juryRoundId: job.juryRoundId } : {}),
				},
			},
			env,
			{
				executeAdapter: deps.executeAdapter,
				executeStatus: deps.executeStatus,
				nowMs: deps.nowMs,
			},
		)

		const freshStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
		deleteCreSimulatorDeadlineJob(freshStore, job.jobKey)
		executed.push({ triggerName: job.jobKey, adapter: trigger.adapter })
	}

	for (const trigger of config.cronTriggers) {
		if (processedCronTriggerNames.has(trigger.triggerName)) {
			continue
		}
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
				executeAdapter: deps.executeAdapter,
				executeStatus: deps.executeStatus,
				nowMs: deps.nowMs,
			},
		)

		const freshStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
		recordCronTriggerRun(freshStore, trigger.triggerName, nowMs)
		executed.push({ triggerName: trigger.triggerName, adapter: trigger.adapter })
	}

	return { timestampMs: nowMs, executed, skipped }
}
