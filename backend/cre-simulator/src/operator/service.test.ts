import { describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import {
	executeDemoOperatorService,
	loadDemoOperatorServiceConfig,
	type DemoOperatorServiceDependencies,
} from "./service"
import { DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION } from "./stateStore"

const REPO_ROOT = resolve(import.meta.dir, "../../../..")
const SCENARIO_PATH = join(REPO_ROOT, "demo-data/operator/multi-fast-happy-path.json")
const AUDITOR_ADDRESS = "0x1111111111111111111111111111111111111111"

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
	const tempDir = mkdtempSync(join(tmpdir(), "demo-operator-service-"))
	return Promise.resolve()
		.then(() => run(tempDir))
		.finally(() => rmSync(tempDir, { recursive: true, force: true }))
}

function buildEnv(): Record<string, string | undefined> {
	return {
		DEMO_AUDITOR_ADDRESS: AUDITOR_ADDRESS,
	}
}

function persistStageState(
	stateFilePath: string,
	stageName: "register" | "submit" | "reveal" | "verify",
	stageData: Record<string, unknown>,
): void {
	const payload = JSON.parse(readFileSync(stateFilePath, "utf8")) as {
		schemaVersion: string
		binding: Record<string, string>
		stageStateByName: Record<string, { status: string; updatedAtMs: number }>
		stageData?: Record<string, unknown>
	}

	payload.stageStateByName[stageName] = {
		status: "completed",
		updatedAtMs: 1,
	}
	payload.stageData = {
		...(payload.stageData ?? {}),
		[stageName]: stageData,
	}

	writeFileSync(stateFilePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

function buildServiceConfig(tempDir: string, command: "register" | "status" | "run") {
	return loadDemoOperatorServiceConfig(
		{
			command,
			scenario: SCENARIO_PATH,
			stateFile: join(tempDir, ".demo-operator-state.json"),
			evidenceDir: join(tempDir, "evidence"),
		},
		buildEnv(),
		REPO_ROOT,
	)
}

describe("demo-operator service", () => {
	it("dispatches register through the reusable service layer", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildServiceConfig(tempDir, "register")
			const deps: DemoOperatorServiceDependencies = {
				register: {
					runRegister: async ({ config: observedConfig }) => {
						expect(observedConfig.command).toBe("register")
						return {
							projectId: "77",
							registrationTxHash:
								"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
							registrationEventIndex: 1,
							simulateCommand: ["cre", "workflow", "simulate"],
							vnetStatus: 2,
							vnetRpcUrl: "https://rpc.tenderly.test/vnet/77",
						}
					},
				},
			}

			await expect(
				executeDemoOperatorService({ config, env: buildEnv(), deps }),
			).resolves.toEqual({
				projectId: "77",
				registrationTxHash:
					"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				registrationEventIndex: 1,
				simulateCommand: ["cre", "workflow", "simulate"],
				vnetStatus: 2,
				vnetRpcUrl: "https://rpc.tenderly.test/vnet/77",
			})
		})
	})

	it("builds status payload without going through CLI stdout", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildServiceConfig(tempDir, "status")

			const result = await executeDemoOperatorService({
				config,
				env: buildEnv(),
			})

			expect(result).toMatchObject({
				command: "status",
				healthy: true,
				scenarioId: "multi-fast-happy-path",
				stateFilePath: join(tempDir, ".demo-operator-state.json"),
				evidenceDir: join(tempDir, "evidence"),
				recoveredProcessingCount: 0,
				quarantinedStageCount: 0,
			})
			expect(existsSync(join(tempDir, ".demo-operator-state.json"))).toBe(true)
		})
	})

	it("initializes the durable state store using the existing schema", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildServiceConfig(tempDir, "status")

			await executeDemoOperatorService({
				config,
				env: buildEnv(),
			})

			const payload = await Bun.file(config.stateFilePath).json()
			expect(payload).toMatchObject({
				schemaVersion: DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION,
			})
		})
	})

	it("runs all demo stages in order and returns the final status snapshot", async () => {
		await withTempDir(async (tempDir) => {
			const config = buildServiceConfig(tempDir, "run")
			await executeDemoOperatorService({
				config: buildServiceConfig(tempDir, "status"),
				env: buildEnv(),
			})
			const stageOrder: string[] = []
			const deps: DemoOperatorServiceDependencies = {
				register: {
					runRegister: async () => {
						stageOrder.push("register")
						const result = { projectId: "77" }
						persistStageState(config.stateFilePath, "register", result)
						return result
					},
				},
				submit: {
					runSubmit: async () => {
						stageOrder.push("submit")
						const result = { submissionId: "12" }
						persistStageState(config.stateFilePath, "submit", result)
						return result
					},
				},
				reveal: {
					runReveal: async () => {
						stageOrder.push("reveal")
						const result = { submissionId: "12", revealTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", revealEventIndex: 0 }
						persistStageState(config.stateFilePath, "reveal", result)
						return result
					},
				},
				verify: {
					runVerify: async () => {
						stageOrder.push("verify")
						const result = { submissionId: "12", terminalSubmission: { status: "Finalized" } }
						persistStageState(config.stateFilePath, "verify", result)
						return result
					},
				},
			}

			const result = await executeDemoOperatorService({
				config,
				env: buildEnv(),
				deps,
			})

			expect(stageOrder).toEqual(["register", "submit", "reveal", "verify"])
			expect(result).toMatchObject({
				command: "run",
				stages: {
					register: { projectId: "77" },
					submit: { submissionId: "12" },
					reveal: { submissionId: "12" },
					verify: { submissionId: "12" },
				},
				finalStatus: {
					command: "status",
					healthy: true,
					scenarioId: "multi-fast-happy-path",
					stageStates: {
						0: { stageName: "register", status: "completed" },
						1: { stageName: "submit", status: "completed" },
						2: { stageName: "reveal", status: "completed" },
						3: { stageName: "verify", status: "completed" },
					},
				},
			})
			})
		})

		it("stops the orchestrated run at the first failing stage", async () => {
			await withTempDir(async (tempDir) => {
				const config = buildServiceConfig(tempDir, "run")
				await executeDemoOperatorService({
					config: buildServiceConfig(tempDir, "status"),
					env: buildEnv(),
				})
				const stageOrder: string[] = []
				const deps: DemoOperatorServiceDependencies = {
				register: {
					runRegister: async () => {
						stageOrder.push("register")
						const result = { projectId: "77" }
						persistStageState(config.stateFilePath, "register", result)
						return result
					},
				},
				submit: {
					runSubmit: async () => {
						stageOrder.push("submit")
						throw new Error("submit failed")
					},
				},
				reveal: {
					runReveal: async () => {
						stageOrder.push("reveal")
						throw new Error("reveal should not run")
					},
				},
			}

				await expect(
					executeDemoOperatorService({ config, env: buildEnv(), deps }),
				).rejects.toThrow("submit failed")
				expect(stageOrder).toEqual(["register", "submit"])
				expect(
					await executeDemoOperatorService({
						config: buildServiceConfig(tempDir, "status"),
						env: buildEnv(),
					}),
				).toMatchObject({
					command: "status",
					stageStates: {
						0: { stageName: "register", status: "completed" },
						1: { stageName: "submit", status: "pending" },
					},
				})
			})
		})
})
