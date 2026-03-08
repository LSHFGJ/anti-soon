import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import type { AutoRevealRelayerAdapterConfig } from "./adapter-types"
import type { EnvRecord } from "./env"
import {
	loadRunOnceConfig,
	runAutoRevealRelayerCycle,
	type RunOnceExecutionResult,
} from "../../../workflow/auto-reveal-relayer/run-once"
import {
	buildLiveRevealEnv,
	createLiveRevealRuntime,
} from "../../../workflow/auto-reveal-relayer/live-runtime"

const DEFAULT_RELAYER_CONFIG_PATH = "workflow/auto-reveal-relayer/config.staging.json"

type AutoRevealWorkflowConfig = {
	bountyHubAddress: `0x${string}`
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
	const parsed = JSON.parse(raw) as unknown
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object`)
	}
	return parsed as Record<string, unknown>
}

function normalizeAddress(value: string, label: string): `0x${string}` {
	if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
		throw new Error(`${label} must be a valid EVM address`)
	}
	return value as `0x${string}`
}

function requiredEnv(env: EnvRecord, key: string): string {
	const value = env[key]
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing required environment variable: ${key}`)
	}
	return value
}

function normalizeRelativePath(value: string, label: string): string {
	if (value.startsWith("/") || value.includes("..")) {
		throw new Error(`${label} must stay within repoRoot`)
	}
	return value
}

function readAutoRevealWorkflowConfig(repoRoot: string, configPath: string): AutoRevealWorkflowConfig {
	const resolvedConfigPath = resolve(repoRoot, normalizeRelativePath(configPath, "configPath"))
	const parsed = parseJsonObject(readFileSync(resolvedConfigPath, "utf8"), configPath)
	return {
		bountyHubAddress: normalizeAddress(
			String(parsed.bountyHubAddress ?? ""),
			`${configPath} bountyHubAddress`,
		),
	}
}

export async function executeAutoRevealRelayerAdapter(args: {
	repoRoot: string
	env: EnvRecord
 	adapterConfig?: AutoRevealRelayerAdapterConfig
}): Promise<RunOnceExecutionResult> {
	const workflowConfig = readAutoRevealWorkflowConfig(
		args.repoRoot,
		args.adapterConfig?.configPath ?? DEFAULT_RELAYER_CONFIG_PATH,
	)
	const liveRevealEnv = buildLiveRevealEnv(workflowConfig, {
		...args.env,
		AUTO_REVEAL_PUBLIC_RPC_URL: requiredEnv(args.env, "DEMO_OPERATOR_PUBLIC_RPC_URL"),
		AUTO_REVEAL_ADMIN_RPC_URL: requiredEnv(args.env, "DEMO_OPERATOR_ADMIN_RPC_URL"),
		AUTO_REVEAL_PRIVATE_KEY: requiredEnv(args.env, "DEMO_OPERATOR_PRIVATE_KEY"),
	})
	const runOnceConfig = loadRunOnceConfig(liveRevealEnv)
	const runtime = await createLiveRevealRuntime({ env: liveRevealEnv, runOnceConfig })
	return await runAutoRevealRelayerCycle(runOnceConfig, runtime)
}
