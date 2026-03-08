import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import {
	assertCreWorkflowSecretsAvailable,
	prepareCreWorkflowExecution,
} from "./creWorkflowRuntime"

function withTempRepoRoot(run: (repoRoot: string) => void): void {
	const repoRoot = mkdtempSync(join(tmpdir(), "cre-sim-runtime-"))
	try {
		run(repoRoot)
	} finally {
		rmSync(repoRoot, { recursive: true, force: true })
	}
}

function writeWorkflowFixture(repoRoot: string, workflowPath: string): void {
	const absoluteWorkflowPath = resolve(repoRoot, workflowPath)
	mkdirSync(absoluteWorkflowPath, { recursive: true })
	writeFileSync(join(absoluteWorkflowPath, "workflow.yaml"), "staging-settings:\n", "utf8")
	writeFileSync(join(absoluteWorkflowPath, "main.ts"), "export const ok = true\n", "utf8")
}

describe("cre workflow runtime", () => {
	it("accepts TENDERLY_API_KEY from env without a checked-in secrets file", () => {
		withTempRepoRoot((repoRoot) => {
			expect(() =>
				assertCreWorkflowSecretsAvailable({
					repoRoot,
					workflowPath: "workflow/vnet-init",
					env: { TENDERLY_API_KEY: "railway-secret" },
				}),
			).not.toThrow()
		})
	})

	it("creates an isolated runtime workflow copy with generated secrets.yaml when TENDERLY_API_KEY is provided", () => {
		withTempRepoRoot((repoRoot) => {
			writeWorkflowFixture(repoRoot, "workflow/vnet-init")

			const runtime = prepareCreWorkflowExecution({
				repoRoot,
				workflowPath: "workflow/vnet-init",
				env: { TENDERLY_API_KEY: "railway-secret" },
			})

			const runtimeWorkflowPath = resolve(repoRoot, runtime.workflowPath)
			const runtimeSecretsPath = resolve(runtimeWorkflowPath, "../../secrets.yaml")

			expect(runtime.workflowPath).not.toBe("workflow/vnet-init")
			expect(existsSync(join(runtimeWorkflowPath, "workflow.yaml"))).toBe(true)
			expect(readFileSync(runtimeSecretsPath, "utf8")).toContain("railway-secret")

			runtime.cleanup()
			expect(existsSync(runtimeWorkflowPath)).toBe(false)
		})
	})
})
