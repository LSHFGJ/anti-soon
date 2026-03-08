import { describe, expect, it } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import type { DemoOperatorConfig, EnvRecord } from "../config"
import { loadScenarioFromFile } from "../scenario"
import { registerAndBootstrap } from "./registerAndBootstrap"

const REAL_REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const REAL_SCENARIO_PATH = resolve(
  REAL_REPO_ROOT,
  "backend/cre-simulator/default-scenario.json",
)

const TX_REGISTER =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
const OWNER_ADDRESS = "0x1111111111111111111111111111111111111111" as const
const OWNER_PRIVATE_KEY =
  "0x1111111111111111111111111111111111111111111111111111111111111111" as const
const OPERATOR_ADDRESS = "0x2222222222222222222222222222222222222222" as const

function withTempRepoRoot(run: (repoRoot: string) => Promise<void> | void): Promise<void> {
  const tempRoot = mkdtempSync(join(tmpdir(), "demo-operator-register-"))

  return Promise.resolve()
    .then(() => run(tempRoot))
    .finally(() => {
      rmSync(tempRoot, { recursive: true, force: true })
    })
}

function buildScenario() {
  return loadScenarioFromFile(REAL_SCENARIO_PATH, {
    repoRoot: REAL_REPO_ROOT,
  })
}

function buildConfig(repoRoot: string): DemoOperatorConfig {
  mkdirSync(join(repoRoot, "backend/cre-simulator"), { recursive: true })
  mkdirSync(join(repoRoot, ".sisyphus/evidence/demo-run"), { recursive: true })

  return {
    command: "register",
    repoRoot,
    cwd: join(repoRoot, "backend/cre-simulator"),
    scenarioPath: join(repoRoot, "backend/cre-simulator/default-scenario.json"),
    stateFilePath: join(repoRoot, "backend/cre-simulator/.demo-operator-state.json"),
    evidenceDir: join(repoRoot, ".sisyphus/evidence/demo-run"),
    scenario: buildScenario(),
  }
}

function buildEnv(): EnvRecord {
  return {
    DEMO_PROJECT_OWNER_ADDRESS: OWNER_ADDRESS,
    DEMO_PROJECT_OWNER_PRIVATE_KEY: OWNER_PRIVATE_KEY,
    DEMO_OPERATOR_ADDRESS: OPERATOR_ADDRESS,
    DEMO_OPERATOR_PUBLIC_RPC_URL: "https://rpc.public.test",
    DEMO_OPERATOR_ADMIN_RPC_URL: "https://rpc.admin.test",
  }
}

function writeWorkflowFixtures(
  repoRoot: string,
  options: {
    includeSecrets?: boolean
    owner?: string
  } = {},
): void {
  const workflowDir = join(repoRoot, "workflow/vnet-init")
  mkdirSync(workflowDir, { recursive: true })

  writeFileSync(
    join(workflowDir, "workflow.yaml"),
    [
      "staging-settings:",
      "  user-workflow:",
      '    workflow-name: "antisoon-vnet-init-staging"',
      "  workflow-artifacts:",
      '    workflow-path: "./main.ts"',
      '    config-path: "./config.staging.json"',
      '    secrets-path: "../../secrets.yaml"',
      "",
    ].join("\n"),
    "utf8",
  )

  writeFileSync(
    join(workflowDir, "config.staging.json"),
    `${JSON.stringify(
      {
        chainSelectorName: "ethereum-testnet-sepolia",
        bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
        gasLimit: "500000",
        tenderlyAccountSlug: "LSHFGJ",
        tenderlyProjectSlug: "anti-soon",
        owner: options.owner ?? OPERATOR_ADDRESS,
      },
      null,
      2,
    )}\n`,
    "utf8",
  )

  if (options.includeSecrets !== false) {
    writeFileSync(
      join(repoRoot, "secrets.yaml"),
      [
        "secretsNames:",
        "  TENDERLY_API_KEY:",
        "    - TENDERLY_API_KEY_VALUE",
        "",
      ].join("\n"),
      "utf8",
    )
  }
}

function readPersistedState(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>
}

describe("registerAndBootstrap", () => {
  it("registers the demo project, shells out to vnet-init simulate, and persists the trigger coordinates", async () => {
    await withTempRepoRoot(async (repoRoot) => {
      const config = buildConfig(repoRoot)
      const env = buildEnv()
      writeWorkflowFixtures(repoRoot)

      const registerInputs: unknown[] = []
      const simulateCommands: unknown[] = []
      const stepOrder: string[] = []

      const result = await registerAndBootstrap({
        config,
        env,
        deps: {
          nowMs: 1_700_000_000_000,
          createClient: async () => ({
            registerProjectV2: async (input) => {
              stepOrder.push("register")
              registerInputs.push(input)

              return {
                eventName: "ProjectRegisteredV2",
                projectId: 77n,
                txHash: TX_REGISTER,
                eventIndex: 4,
              }
            },
            readProject: async (projectId) => {
              stepOrder.push("read-project")
              expect(projectId).toBe(77n)

              return {
                owner: OWNER_ADDRESS,
                bountyPool: 10_000_000_000_000_000_000n,
                maxPayoutPerBug: 1_000_000_000_000_000_000n,
                targetContract:
                  config.scenario.project.targetContract as `0x${string}`,
                forkBlock: BigInt(config.scenario.project.forkBlock),
                active: true,
                mode: 1,
                commitDeadline: 1_700_000_300n,
                revealDeadline: 1_700_000_900n,
                disputeWindow: 0n,
                rulesHash:
                  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                vnetStatus: 2,
                vnetRpcUrl: "https://rpc.tenderly.co/vnet/77",
                baseSnapshotId:
                  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
                vnetCreatedAt: 1_700_000_123n,
                repoUrl: config.scenario.project.repoUrl,
              }
            },
          }),
          runCommand: async (spec) => {
            stepOrder.push("simulate")
            simulateCommands.push(spec)

            return {
              exitCode: 0,
              stdout: "ok",
              stderr: "",
            }
          },
        },
      })

      expect(stepOrder).toEqual(["register", "simulate", "read-project"])
      expect(registerInputs).toEqual([
        {
          value: 10_000_000_000_000_000_000n,
          targetContract: "0x3333333333333333333333333333333333333333",
          maxPayoutPerBug: 1_000_000_000_000_000_000n,
          forkBlock: 6_500_000n,
          mode: 1,
          commitDeadline: 1_700_000_300n,
          revealDeadline: 1_700_000_900n,
          disputeWindow: 0n,
          rules: {
            maxAttackerSeedWei: 100_000_000_000_000_000_000n,
            maxWarpSeconds: 3_600n,
            allowImpersonation: true,
            thresholds: {
              criticalDrainWei: 10_000_000_000_000_000_000n,
              highDrainWei: 5_000_000_000_000_000_000n,
              mediumDrainWei: 1_000_000_000_000_000_000n,
              lowDrainWei: 100_000_000_000_000_000n,
            },
          },
        },
      ])
      expect(simulateCommands).toEqual([
        {
          command: "cre",
          args: [
            "workflow",
            "simulate",
            "workflow/vnet-init",
            "--target",
            "staging-settings",
            "--non-interactive",
            "--trigger-index",
            "0",
            "--evm-tx-hash",
            TX_REGISTER,
            "--evm-event-index",
            "4",
            "--broadcast",
          ],
          cwd: repoRoot,
        },
      ])
      expect(result).toEqual({
        projectId: "77",
        registrationTxHash: TX_REGISTER,
        registrationEventIndex: 4,
        simulateCommand: [
          "cre",
          "workflow",
          "simulate",
          "workflow/vnet-init",
          "--target",
          "staging-settings",
          "--non-interactive",
          "--trigger-index",
          "0",
          "--evm-tx-hash",
          TX_REGISTER,
          "--evm-event-index",
          "4",
          "--broadcast",
        ],
        vnetStatus: 2,
        vnetRpcUrl: "https://rpc.tenderly.co/vnet/77",
      })

      const persisted = readPersistedState(config.stateFilePath)
      expect((persisted.stageStateByName as Record<string, { status: string }>).register.status).toBe(
        "completed",
      )
      expect(
        ((persisted.stageData as Record<string, unknown>).register as Record<string, unknown>),
      ).toEqual(result)
    })
  })

	it("rejects missing broadcast prerequisites before simulate", async () => {
		await withTempRepoRoot(async (repoRoot) => {
      const config = buildConfig(repoRoot)
      const env = buildEnv()
      writeWorkflowFixtures(repoRoot, { includeSecrets: false })

      let registerCalled = false
      let simulateCalled = false

      await expect(
        registerAndBootstrap({
          config,
          env,
          deps: {
            createClient: async () => ({
              registerProjectV2: async () => {
                registerCalled = true
                throw new Error("register should not run")
              },
              readProject: async () => {
                throw new Error("readProject should not run")
              },
            }),
            runCommand: async () => {
              simulateCalled = true
              return { exitCode: 0, stdout: "", stderr: "" }
            },
          },
        }),
      ).rejects.toThrow(
        "Missing broadcast prerequisite: workflow/vnet-init target staging-settings requires ../../secrets.yaml",
      )

      expect(registerCalled).toBe(false)
      expect(simulateCalled).toBe(false)
      expect(existsSync(config.stateFilePath)).toBe(true)

      const persisted = readPersistedState(config.stateFilePath)
      expect((persisted.stageStateByName as Record<string, { status: string }>).register.status).toBe(
        "pending",
      )
      expect((persisted.stageData as Record<string, unknown> | undefined)?.register).toBeUndefined()
		})
	})

	it("accepts TENDERLY_API_KEY from env and generates a runtime secrets file when repo secrets are absent", async () => {
		await withTempRepoRoot(async (repoRoot) => {
			const config = buildConfig(repoRoot)
			const env = {
				...buildEnv(),
				TENDERLY_API_KEY: "railway-secret",
			}
			writeWorkflowFixtures(repoRoot, { includeSecrets: false })

			const simulateWorkflowPaths: string[] = []
			const runtimeSecretsPayloads: string[] = []

			const result = await registerAndBootstrap({
				config,
				env,
				deps: {
					nowMs: 1_700_000_000_000,
					createClient: async () => ({
						registerProjectV2: async () => ({
							eventName: "ProjectRegisteredV2",
							projectId: 77n,
							txHash: TX_REGISTER,
							eventIndex: 4,
						}),
						readProject: async () => ({
							owner: OWNER_ADDRESS,
							bountyPool: 10_000_000_000_000_000_000n,
							maxPayoutPerBug: 1_000_000_000_000_000_000n,
							targetContract:
								config.scenario.project.targetContract as `0x${string}`,
							forkBlock: BigInt(config.scenario.project.forkBlock),
							active: true,
							mode: 1,
							commitDeadline: 1_700_000_300n,
							revealDeadline: 1_700_000_900n,
							disputeWindow: 0n,
							rulesHash:
								"0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
							vnetStatus: 2,
							vnetRpcUrl: "https://rpc.tenderly.co/vnet/77",
							baseSnapshotId:
								"0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
							vnetCreatedAt: 1_700_000_123n,
							repoUrl: config.scenario.project.repoUrl,
						}),
					}),
					runCommand: async (spec) => {
						const workflowPath = String(spec.args[2])
						simulateWorkflowPaths.push(workflowPath)
						runtimeSecretsPayloads.push(
							readFileSync(resolve(spec.cwd, workflowPath, "../../secrets.yaml"), "utf8"),
						)

						return {
							exitCode: 0,
							stdout: "ok",
							stderr: "",
						}
					},
				},
			})

			expect(result.projectId).toBe("77")
			expect(simulateWorkflowPaths).toHaveLength(1)
			expect(simulateWorkflowPaths[0]).not.toBe("workflow/vnet-init")
			expect(simulateWorkflowPaths[0]).toContain(".cre-simulator-runtime")
			expect(runtimeSecretsPayloads[0]).toContain("railway-secret")
		})
	})
})
