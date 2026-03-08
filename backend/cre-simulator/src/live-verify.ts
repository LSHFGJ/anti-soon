import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import type { CreWorkflowSimulateAdapterConfig } from "./adapter-types"
import type { EnvRecord } from "./env"
import { prepareCreWorkflowExecution } from "./operator/creWorkflowRuntime"

const DEFAULT_CRE_WORKFLOW_EVIDENCE_DIR = ".sisyphus/evidence/cre-workflow-simulate"

type VerifyCommandSpec = {
	command: string
	args: string[]
	cwd: string
	env: Record<string, string | undefined>
}

type VerifyCommandResult = {
	exitCode: number
	stdout: string
	stderr: string
}

export type CreWorkflowSimulateResult = {
	mode: "cre-workflow-simulate"
	workflowPath: string
	target: string
	triggerIndex: number
	evmTxHash?: `0x${string}`
	evmEventIndex?: number
	idempotencyStorePath?: string
	outputPath: string
	resultPath: string
	simulateCommand: string[]
}

type ExecuteCreWorkflowSimulateArgs = {
	repoRoot: string
	env: EnvRecord
	adapterConfig: CreWorkflowSimulateAdapterConfig
	evmTxHash?: `0x${string}`
	evmEventIndex?: number
	evidenceDir?: string
	runCommand?: (spec: VerifyCommandSpec) => Promise<VerifyCommandResult>
}

function ensureParentDirectory(filePath: string): void {
	mkdirSync(dirname(filePath), { recursive: true })
}

function normalizeHash(value: string, label: string): `0x${string}` {
	if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
		throw new Error(`${label} must be a 32-byte hex string`)
	}
	return value.toLowerCase() as `0x${string}`
}

function normalizeEventIndex(value: unknown): number {
	if (!Number.isInteger(value) || Number(value) < 0) {
		throw new Error("evmEventIndex must be a non-negative integer")
	}
	return Number(value)
}

function normalizeRelativePath(value: string, label: string): string {
	if (value.startsWith("/") || value.includes("..")) {
		throw new Error(`${label} must stay within repoRoot`)
	}
	return value
}

function buildVerifyCommand(args: {
	repoRoot: string
	workflowPath: string
	target: string
	triggerIndex: number
	evmTxHash?: `0x${string}`
	evmEventIndex?: number
	idempotencyStorePath?: string
	env: EnvRecord
}): VerifyCommandSpec {
	const simulateArgs = [
		"workflow",
		"simulate",
		args.workflowPath,
		"--target",
		args.target,
		"--non-interactive",
		"--trigger-index",
		String(args.triggerIndex),
	] satisfies string[]
	if (args.evmTxHash) {
		simulateArgs.push("--evm-tx-hash", args.evmTxHash)
	}
	if (args.evmEventIndex !== undefined) {
		simulateArgs.push("--evm-event-index", String(args.evmEventIndex))
	}
	simulateArgs.push("--broadcast")
	return {
		command: "cre",
		args: simulateArgs,
		cwd: args.repoRoot,
		env: {
			...(args.idempotencyStorePath
				? { VERIFY_POC_IDEMPOTENCY_STORE_PATH: args.idempotencyStorePath }
				: {}),
			...args.env,
		},
	}
}

async function runLocalCommand(
	spec: VerifyCommandSpec,
): Promise<VerifyCommandResult> {
	return await new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(spec.command, spec.args, {
			cwd: spec.cwd,
			env: {
				...(process.env as Record<string, string | undefined>),
				...spec.env,
			},
			stdio: ["ignore", "pipe", "pipe"],
		})
		let stdout = ""
		let stderr = ""
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk)
		})
		child.stderr.on("data", (chunk) => {
			stderr += String(chunk)
		})
		child.on("error", (error) => {
			rejectPromise(new Error(`Failed to execute ${spec.command}: ${error.message}`))
		})
		child.on("close", (code) => {
			resolvePromise({ exitCode: code ?? 1, stdout, stderr })
		})
	})
}

export async function executeCreWorkflowSimulateAdapter(
	args: ExecuteCreWorkflowSimulateArgs,
): Promise<CreWorkflowSimulateResult> {
	const workflowPath = normalizeRelativePath(args.adapterConfig.workflowPath, "workflowPath")
	const target = args.adapterConfig.target.trim()
	if (!target) {
		throw new Error("target is required")
	}
	if (!Number.isInteger(args.adapterConfig.triggerIndex) || args.adapterConfig.triggerIndex < 0) {
		throw new Error("triggerIndex must be a non-negative integer")
	}
	const requiresEvmInput = args.adapterConfig.evmInput === "event-coordinates"
	const evmTxHash = args.evmTxHash ? normalizeHash(args.evmTxHash, "evmTxHash") : undefined
	const evmEventIndex =
		args.evmEventIndex !== undefined ? normalizeEventIndex(args.evmEventIndex) : undefined
	if (requiresEvmInput && (!evmTxHash || evmEventIndex === undefined)) {
		throw new Error("cre-workflow-simulate requires evmTxHash and evmEventIndex")
	}
	const evidenceDir = resolve(
		args.repoRoot,
		args.evidenceDir ?? DEFAULT_CRE_WORKFLOW_EVIDENCE_DIR,
	)
	const runId = evmTxHash && evmEventIndex !== undefined
		? `${evmTxHash.slice(2, 10)}-${evmEventIndex}`
		: `${target.replace(/[^a-zA-Z0-9_-]+/g, "-")}-${args.adapterConfig.triggerIndex}`
	const artifactDir = join(evidenceDir, runId)
	const outputPath = join(artifactDir, "output.txt")
	const resultPath = join(artifactDir, "adapter-result.json")
	const idempotencyStorePath = args.adapterConfig.idempotencyStorePath
		? resolve(args.repoRoot, normalizeRelativePath(args.adapterConfig.idempotencyStorePath, "idempotencyStorePath"))
		: undefined
	const workflowRuntime = prepareCreWorkflowExecution({
		repoRoot: args.repoRoot,
		workflowPath,
		env: args.env,
	})
	const commandSpec = buildVerifyCommand({
		repoRoot: args.repoRoot,
		workflowPath: workflowRuntime.workflowPath,
		target,
		triggerIndex: args.adapterConfig.triggerIndex,
		evmTxHash,
		evmEventIndex,
		idempotencyStorePath,
		env: args.env,
	})

	try {
		const commandResult = await (args.runCommand ?? runLocalCommand)(commandSpec)
		if (commandResult.exitCode !== 0) {
			throw new Error(
				`cre workflow simulate failed with exitCode=${commandResult.exitCode}: ${commandResult.stderr.trim() || commandResult.stdout.trim() || "no output"}`,
			)
		}

		const result: CreWorkflowSimulateResult = {
			mode: "cre-workflow-simulate",
			workflowPath: workflowRuntime.workflowPath,
			target,
			triggerIndex: args.adapterConfig.triggerIndex,
			evmTxHash,
			evmEventIndex,
			idempotencyStorePath,
			outputPath,
			resultPath,
			simulateCommand: [commandSpec.command, ...commandSpec.args],
		}

		ensureParentDirectory(outputPath)
		writeFileSync(
			outputPath,
			[
				`$ ${commandSpec.command} ${commandSpec.args.join(" ")}`,
				"",
				"STDOUT:",
				commandResult.stdout,
				"",
				"STDERR:",
				commandResult.stderr,
			].join("\n"),
			"utf8",
		)
		ensureParentDirectory(resultPath)
		writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
		return result
	} finally {
		workflowRuntime.cleanup()
	}
}
