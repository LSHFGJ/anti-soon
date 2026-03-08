import { existsSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"

import type { CreSimulatorCommand } from "../types"
import type {
	CreSimulatorCronTriggerConfig,
	CreSimulatorEvmLogTriggerConfig,
	CreSimulatorHttpTriggerConfig,
	CreSimulatorTriggerConfig,
} from "./types"
import { TRIGGER_CONFIG_SCHEMA_VERSION } from "./types"

export { TRIGGER_CONFIG_SCHEMA_VERSION }

type RawMapping = {
	command?: unknown
	scenarioPath?: unknown
	stateFilePath?: unknown
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

function parseCommand(value: unknown, label: string): CreSimulatorCommand {
	if (
		value === "register"
		|| value === "submit"
		|| value === "reveal"
		|| value === "verify"
		|| value === "run"
		|| value === "status"
	) {
		return value
	}
	throw new Error(`${label} must be a valid cre-simulator command`)
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
		command: parseCommand(record.command, `${triggerName}.command`),
		...(typeof record.scenarioPath === "string"
			? { scenarioPath: ensureRepoScopedPath(repoRoot, record.scenarioPath, "scenarioPath") }
			: {}),
		...(typeof record.stateFilePath === "string"
			? { stateFilePath: ensureRepoScopedPath(repoRoot, record.stateFilePath, "stateFilePath") }
			: {}),
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
