import { resolve } from "node:path"

import type { CreSimulatorAdapterResult } from "../adapter-types"
import type { EnvRecord } from "../env"
import { executeCreSimulatorAdapter, executeCreSimulatorStatus } from "../service"
import type { CreSimulatorExecuteAdapter, CreSimulatorExecuteStatus } from "../types"
import { loadCreSimulatorTriggerConfig } from "./config"
import {
	assertCreSimulatorTriggerStateStoreHealthy,
	claimCreSimulatorTriggerExecution,
	loadCreSimulatorTriggerStateStore,
	markCreSimulatorTriggerExecutionCompleted,
	markCreSimulatorTriggerExecutionQuarantined,
	recordEvmLogTriggerCursor,
} from "./stateStore"
import type { CreSimulatorEvmLogEvent, CreSimulatorEvmLogTriggerConfig } from "./types"

type DispatchEvmLogTriggerEventDeps = {
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

function toEventKey(event: CreSimulatorEvmLogEvent): string {
	return `${event.txHash.toLowerCase()}:${event.logIndex}`
}

function getTrigger(configPath: string, repoRoot: string, triggerName: string): {
	config: ReturnType<typeof loadCreSimulatorTriggerConfig>
	trigger: CreSimulatorEvmLogTriggerConfig
} {
	const config = loadCreSimulatorTriggerConfig(configPath, repoRoot)
	const trigger = config.evmLogTriggers.find((entry) => entry.triggerName === triggerName)
	if (!trigger) {
		throw new Error(`Unknown cre-simulator trigger: ${triggerName}`)
	}
	return { config, trigger }
}

export async function dispatchEvmLogTriggerEvent(
	request: {
		triggerName: string
		repoRoot?: string
		configPath?: string
		event: CreSimulatorEvmLogEvent
	},
	env: EnvRecord,
	deps: DispatchEvmLogTriggerEventDeps = {},
): Promise<{
	triggerType: "evm-log"
	triggerName: string
	adapter: string
	deduped: boolean
	result?: Awaited<ReturnType<typeof dispatchCreSimulatorTrigger>>["result"] | CreSimulatorAdapterResult
}> {
	const repoRoot = request.repoRoot ?? resolve(import.meta.dir, "../../../..")
	const configPath = request.configPath
		? ensureRepoScopedPath(repoRoot, request.configPath, "configPath")
		: `${repoRoot}/backend/cre-simulator/triggers.json`
	const { config, trigger } = getTrigger(configPath, repoRoot, request.triggerName)
	const binding = {
		configPath: config.configPath,
		stateFilePath: config.stateFilePath,
	}
	const nowMs = deps.nowMs?.() ?? Date.now()
	const store = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
	assertCreSimulatorTriggerStateStoreHealthy(store)

	if (request.event.address.toLowerCase() !== trigger.contractAddress.toLowerCase()) {
		throw new Error(`EVM log trigger ${trigger.triggerName} received an unexpected contract address`)
	}
	if (request.event.topic0.toLowerCase() !== trigger.topic0.toLowerCase()) {
		throw new Error(`EVM log trigger ${trigger.triggerName} received an unexpected topic0`)
	}

	const eventKey = toEventKey(request.event)
	const listenerCursor = store.listenerCursorByName.get(trigger.triggerName)
	if (listenerCursor?.lastEventKey === eventKey) {
		return {
			triggerType: "evm-log",
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			deduped: true,
		}
	}

	const executionKey = `evm-log:${trigger.triggerName}:${eventKey}`
	const claimDecision = claimCreSimulatorTriggerExecution(
		store,
		executionKey,
		{ triggerName: trigger.triggerName, triggerType: "evm-log" },
		nowMs,
	)
	if (!claimDecision.shouldProcess) {
		return {
			triggerType: "evm-log",
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			deduped: claimDecision.reason === "already-completed",
		}
	}

	const executeAdapter = deps.executeAdapter
		?? ((adapterRequest) => executeCreSimulatorAdapter(adapterRequest, env))
	const executeStatus = deps.executeStatus
		?? ((statusRequest) => executeCreSimulatorStatus(statusRequest, env))
	try {
		const result = await executeAdapter({
			adapter: trigger.adapter,
			...(trigger.adapterConfig ? { adapterConfig: trigger.adapterConfig } : {}),
			repoRoot,
			...(trigger.evidenceDir ? { evidenceDir: trigger.evidenceDir } : {}),
			evmTxHash: request.event.txHash,
			evmEventIndex: request.event.logIndex,
		})
		const freshStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
		markCreSimulatorTriggerExecutionCompleted(freshStore, executionKey, nowMs)
		recordEvmLogTriggerCursor(
			freshStore,
			trigger.triggerName,
			{
				lastSeenBlockNumber: request.event.blockNumber,
				lastEventKey: eventKey,
			},
			nowMs,
		)
		return {
			triggerType: "evm-log",
			triggerName: trigger.triggerName,
			adapter: trigger.adapter,
			deduped: false,
			result,
		}
	} catch (error) {
		const freshStore = loadCreSimulatorTriggerStateStore(config.stateFilePath, binding, nowMs)
		markCreSimulatorTriggerExecutionQuarantined(
			freshStore,
			executionKey,
			error instanceof Error ? error.message : String(error),
			nowMs,
		)
		throw error
	}
}
