import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { basename, join, relative, resolve } from "node:path"

import type { EnvRecord } from "./config"

function getTenderlyApiKey(env: EnvRecord): string | null {
	const value = env.TENDERLY_API_KEY?.trim()
	return value && value.length > 0 ? value : null
}

function normalizeRelativePath(value: string): string {
	return value.replaceAll("\\", "/")
}

function buildGeneratedSecretsYaml(tenderlyApiKey: string): string {
	return [
		"secretsNames:",
		"  TENDERLY_API_KEY:",
		`    - ${tenderlyApiKey}`,
		"",
	].join("\n")
}

export function assertCreWorkflowSecretsAvailable(args: {
	repoRoot: string
	workflowPath: string
	env: EnvRecord
}): void {
	void args.workflowPath
	if (getTenderlyApiKey(args.env)) {
		return
	}

	const secretsPath = resolve(args.repoRoot, "secrets.yaml")
	if (!existsSync(secretsPath)) {
		throw new Error(
			`Missing broadcast prerequisite: ${args.workflowPath} target staging-settings requires ../../secrets.yaml`,
		)
	}

	if (!readFileSync(secretsPath, "utf8").includes("TENDERLY_API_KEY:")) {
		throw new Error(
			`Missing broadcast prerequisite: ${args.workflowPath} target staging-settings requires TENDERLY_API_KEY in ../../secrets.yaml`,
		)
	}
}

export function prepareCreWorkflowExecution(args: {
	repoRoot: string
	workflowPath: string
	env: EnvRecord
}): {
	workflowPath: string
	cleanup: () => void
} {
	const tenderlyApiKey = getTenderlyApiKey(args.env)
	if (!tenderlyApiKey) {
		return {
			workflowPath: args.workflowPath,
			cleanup: () => {},
		}
	}

	const runtimeBaseDir = resolve(args.repoRoot, ".cre-simulator-runtime")
	mkdirSync(runtimeBaseDir, { recursive: true })
	const runtimeRoot = mkdtempSync(join(runtimeBaseDir, `${basename(args.workflowPath)}-`))
	const sourceWorkflowPath = resolve(args.repoRoot, args.workflowPath)
	const runtimeWorkflowPath = resolve(runtimeRoot, args.workflowPath)
	mkdirSync(resolve(runtimeWorkflowPath, ".."), { recursive: true })
	cpSync(sourceWorkflowPath, runtimeWorkflowPath, { recursive: true })
	writeFileSync(
		join(runtimeRoot, "secrets.yaml"),
		buildGeneratedSecretsYaml(tenderlyApiKey),
		"utf8",
	)

	return {
		workflowPath: normalizeRelativePath(relative(args.repoRoot, runtimeWorkflowPath)),
		cleanup: () => {
			rmSync(runtimeRoot, { recursive: true, force: true })
		},
	}
}
