import { existsSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import type {
	AutoRevealRelayerAdapterConfig,
	CreSimulatorAdapterBinding,
	CreSimulatorAdapterKey,
	CreWorkflowSimulateAdapterConfig,
} from "../types"
import type {
	CreSimulatorCronTriggerConfig,
	CreSimulatorEvmLogTriggerConfig,
	CreSimulatorHttpTriggerConfig,
	CreSimulatorTriggerConfig,
} from "./types"
import { TRIGGER_CONFIG_SCHEMA_VERSION } from "./types"

export { TRIGGER_CONFIG_SCHEMA_VERSION }

type RawMapping = {
	adapter?: unknown
	adapterConfig?: unknown
	evidenceDir?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function ensureRepoScopedPath(repoRoot: string, rawPath: string, label: string): string {
	const resolved = resolve(repoRoot, rawPath)
	if (resolved === repoRoot || resolved.startsWith(`${repoRoot}/`)) {
		return resolved
	}
	throw new Error(`${label} must stay within repoRoot`)
}

function parseAdapter(value: unknown, label: string): CreSimulatorAdapterKey {
	if (value === "auto-reveal-relayer" || value === "cre-workflow-simulate") {
		return value
	}
	throw new Error(`${label} must be a valid cre-simulator adapter`)
}

function parseCreWorkflowSimulateAdapterConfig(
	repoRoot: string,
	triggerName: string,
	value: unknown,
): CreWorkflowSimulateAdapterConfig {
	if (!isObject(value)) {
		throw new Error(`Invalid cre-workflow-simulate config for trigger=${triggerName}`)
	}
	if (typeof value.workflowPath !== "string") {
		throw new Error(`cre-workflow-simulate trigger ${triggerName} must define workflowPath`)
	}
	if (typeof value.target !== "string" || value.target.trim().length === 0) {
		throw new Error(`cre-workflow-simulate trigger ${triggerName} must define target`)
	}
	if (typeof value.triggerIndex !== "number" || !Number.isInteger(value.triggerIndex) || value.triggerIndex < 0) {
		throw new Error(`cre-workflow-simulate trigger ${triggerName} must define a non-negative triggerIndex`)
	}
	if (value.evmInput !== undefined && value.evmInput !== "event-coordinates") {
		throw new Error(`cre-workflow-simulate trigger ${triggerName} has unsupported evmInput`)
	}
	return {
		workflowPath: (ensureRepoScopedPath(repoRoot, value.workflowPath, "workflowPath"), value.workflowPath),
		target: value.target.trim(),
		triggerIndex: value.triggerIndex,
		...(value.evmInput === "event-coordinates" ? { evmInput: value.evmInput } : {}),
		...(typeof value.idempotencyStorePath === "string"
			? {
				idempotencyStorePath: (ensureRepoScopedPath(
					repoRoot,
					value.idempotencyStorePath,
					"idempotencyStorePath",
				), value.idempotencyStorePath),
			}
			: {}),
	}
}

function parseAutoRevealAdapterConfig(
	repoRoot: string,
	triggerName: string,
	value: unknown,
): AutoRevealRelayerAdapterConfig {
	if (value === undefined) {
		return {}
	}
	if (!isObject(value)) {
		throw new Error(`Invalid auto-reveal-relayer config for trigger=${triggerName}`)
	}
	return {
		...(typeof value.configPath === "string"
			? { configPath: (ensureRepoScopedPath(repoRoot, value.configPath, "configPath"), value.configPath) }
			: {}),
	}
}

function parseAdapterBinding(
	repoRoot: string,
	triggerName: string,
	record: RawMapping,
): CreSimulatorAdapterBinding {
	const adapter = parseAdapter(record.adapter, `${triggerName}.adapter`)
	if (adapter === "cre-workflow-simulate") {
		return {
			adapter,
			adapterConfig: parseCreWorkflowSimulateAdapterConfig(
				repoRoot,
				triggerName,
				record.adapterConfig,
			),
		}
	}
	return {
		adapter,
		...(record.adapterConfig !== undefined
			? { adapterConfig: parseAutoRevealAdapterConfig(repoRoot, triggerName, record.adapterConfig) }
			: {}),
	}
}

function parseBaseMapping(
	repoRoot: string,
	triggerName: string,
	value: unknown,
): Omit<CreSimulatorHttpTriggerConfig, "triggerName"> {
	if (!isObject(value)) {
		throw new Error(`Invalid trigger config for trigger=${triggerName}`)
	}
	const record = value as RawMapping
	return {
		...parseAdapterBinding(repoRoot, triggerName, record),
		...(typeof record.evidenceDir === "string"
			? { evidenceDir: ensureRepoScopedPath(repoRoot, record.evidenceDir, "evidenceDir") }
			: {}),
	}
}

function parseHttpTriggers(repoRoot: string, value: unknown): CreSimulatorHttpTriggerConfig[] {
	if (!isObject(value)) {
		throw new Error("httpTriggers must be an object")
	}
	return Object.entries(value).map(([triggerName, record]) => ({
		triggerName,
		...parseBaseMapping(repoRoot, triggerName, record),
	}))
}

function parseCronTriggers(repoRoot: string, value: unknown): CreSimulatorCronTriggerConfig[] {
	if (!isObject(value)) {
		throw new Error("cronTriggers must be an object")
	}
	return Object.entries(value).map(([triggerName, record]) => {
		if (!isObject(record) || typeof record.intervalMs !== "number" || record.intervalMs <= 0) {
			throw new Error(`cron trigger ${triggerName} must define a positive intervalMs`)
		}
		return {
			triggerName,
			intervalMs: record.intervalMs,
			...parseBaseMapping(repoRoot, triggerName, record),
		}
	})
}

function parseEvmLogTriggers(repoRoot: string, value: unknown): CreSimulatorEvmLogTriggerConfig[] {
	if (!isObject(value)) {
		throw new Error("evmLogTriggers must be an object")
	}
	return Object.entries(value).map(([triggerName, record]) => {
		if (
			!isObject(record)
			|| typeof record.wsRpcUrlEnvVar !== "string"
			|| !/^0x[a-fA-F0-9]{40}$/.test(String(record.contractAddress ?? ""))
			|| !/^0x[a-fA-F0-9]{64}$/.test(String(record.topic0 ?? ""))
		) {
			throw new Error(`Invalid EVM log trigger config for trigger=${triggerName}`)
		}
		return {
			triggerName,
			wsRpcUrlEnvVar: record.wsRpcUrlEnvVar,
			contractAddress: String(record.contractAddress).toLowerCase() as `0x${string}`,
			topic0: String(record.topic0).toLowerCase() as `0x${string}`,
			...parseBaseMapping(repoRoot, triggerName, record),
		}
	})
}

export function buildDefaultCreSimulatorTriggerConfigPath(repoRoot: string): string {
	return join(repoRoot, "backend/cre-simulator/triggers.json")
}

export function loadCreSimulatorTriggerConfig(
	configPath: string,
	repoRoot: string,
): CreSimulatorTriggerConfig {
	const resolvedConfigPath = resolve(configPath)
	if (!existsSync(resolvedConfigPath) || !statSync(resolvedConfigPath).isFile()) {
		throw new Error(`Trigger config file does not exist: ${resolvedConfigPath}`)
	}
	const parsed = JSON.parse(readFileSync(resolvedConfigPath, "utf8")) as unknown
	if (!isObject(parsed)) {
		throw new Error("Invalid cre-simulator trigger config payload")
	}
	if (parsed.schemaVersion !== TRIGGER_CONFIG_SCHEMA_VERSION) {
		throw new Error(`Unsupported cre-simulator trigger config schema: ${String(parsed.schemaVersion)}`)
	}
	if (typeof parsed.stateFilePath !== "string") {
		throw new Error("stateFilePath must be a string")
	}

	return {
		schemaVersion: TRIGGER_CONFIG_SCHEMA_VERSION,
		configPath: resolvedConfigPath,
		stateFilePath: ensureRepoScopedPath(repoRoot, parsed.stateFilePath, "stateFilePath"),
		httpTriggers: parseHttpTriggers(repoRoot, parsed.httpTriggers ?? {}),
		cronTriggers: parseCronTriggers(repoRoot, parsed.cronTriggers ?? {}),
		evmLogTriggers: parseEvmLogTriggers(repoRoot, parsed.evmLogTriggers ?? {}),
	}
}
