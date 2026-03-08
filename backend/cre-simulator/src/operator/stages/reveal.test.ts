import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { runDemoOperatorCommand } from "../../operator-cli"
import type { DemoOperatorConfig, EnvRecord } from "../config"
import { loadScenarioFromFile } from "../scenario"
import { DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION } from "../stateStore"
import {
  runRevealStage,
  type RevealStageResult,
} from "./reveal"

const REAL_REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const REAL_SCENARIO_PATH = resolve(
  REAL_REPO_ROOT,
  "demo-data/operator/multi-fast-happy-path.json",
)
const OPERATOR_PRIVATE_KEY =
  "0x6666666666666666666666666666666666666666666666666666666666666666" as const
const REVEAL_TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
const COMMIT_TX_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const
const OASIS_TX_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "demo-operator-reveal-"))

  return Promise.resolve()
    .then(() => run(tempDir))
    .finally(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })
}

function buildConfig(tempDir: string): DemoOperatorConfig {
  return {
    command: "reveal",
    repoRoot: REAL_REPO_ROOT,
    cwd: join(REAL_REPO_ROOT, "backend/cre-simulator"),
    scenarioPath: REAL_SCENARIO_PATH,
    stateFilePath: join(tempDir, ".demo-operator-state.json"),
    evidenceDir: join(tempDir, "evidence"),
    scenario: loadScenarioFromFile(REAL_SCENARIO_PATH, {
      repoRoot: REAL_REPO_ROOT,
    }),
  }
}

function buildEnv(): EnvRecord {
  return {
    DEMO_OPERATOR_PUBLIC_RPC_URL: "https://rpc.public.test",
    DEMO_OPERATOR_ADMIN_RPC_URL: "https://rpc.admin.test",
    DEMO_OPERATOR_PRIVATE_KEY: OPERATOR_PRIVATE_KEY,
  }
}

function buildRegisterStageData(projectId: string): Record<string, unknown> {
  return {
    projectId,
    registrationTxHash:
      "0x1111111111111111111111111111111111111111111111111111111111111111",
    registrationEventIndex: 0,
    simulateCommand: ["cre", "workflow", "simulate"],
    vnetStatus: 2,
    vnetRpcUrl: "https://rpc.tenderly.co/vnet/77",
  }
}

function buildSubmitStageData(submissionId: string): Record<string, unknown> {
  return {
    submissionId,
    commitTxHash: COMMIT_TX_HASH,
    commitHash:
      "0x2222222222222222222222222222222222222222222222222222222222222222",
    cipherURI:
      "oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-fixed#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    salt:
      "0x3333333333333333333333333333333333333333333333333333333333333333",
    oasisTxHash: OASIS_TX_HASH,
  }
}

function writeStateFile(
  config: DemoOperatorConfig,
  options: {
    register?: Record<string, unknown>
    submit?: Record<string, unknown>
    reveal?: Record<string, unknown>
    revealStatus?: "pending" | "completed" | "quarantined"
  } = {},
): void {
  writeFileSync(
    config.stateFilePath,
    `${JSON.stringify(
      {
        schemaVersion: DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION,
        binding: {
          scenarioId: config.scenario.scenarioId,
          scenarioPath: config.scenarioPath,
          evidenceDir: config.evidenceDir,
        },
        stageStateByName: {
          register: {
            status: options.register ? "completed" : "pending",
            updatedAtMs: 1,
          },
          submit: {
            status: options.submit ? "completed" : "pending",
            updatedAtMs: 1,
          },
          reveal: {
            status: options.revealStatus ?? "pending",
            updatedAtMs: 1,
            ...(options.revealStatus === "quarantined"
              ? { lastError: "trigger lookup failed after relayer execution" }
              : {}),
          },
          verify: {
            status: "pending",
            updatedAtMs: 0,
          },
        },
        ...(options.register || options.submit || options.reveal
          ? {
              stageData: {
                ...(options.register ? { register: options.register } : {}),
                ...(options.submit ? { submit: options.submit } : {}),
                ...(options.reveal ? { reveal: options.reveal } : {}),
              },
            }
          : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
}

function readStateFile(config: DemoOperatorConfig): Record<string, unknown> {
  return JSON.parse(readFileSync(config.stateFilePath, "utf8")) as Record<string, unknown>
}

describe("runDemoOperatorCommand reveal", () => {
  it("delegates reveal to the real stage instead of returning the scaffold error", async () => {
    await withTempDir(async (tempDir) => {
      const stateFilePath = join(tempDir, ".demo-operator-state.json")
      const evidenceDir = join(tempDir, "evidence")
      const stdout: string[] = []
      const stderr: string[] = []
      const revealCalls: unknown[] = []

      const exitCode = await (
        runDemoOperatorCommand as unknown as (
          argv: string[],
          env: Record<string, string | undefined>,
          io: { stdout: (line: string) => void; stderr: (line: string) => void },
          deps: {
            reveal: {
              runReveal: (args: { config: { command: string; scenarioPath: string } }) => Promise<unknown>
            }
          },
        ) => Promise<number>
      )(
        [
          "reveal",
          "--scenario",
          REAL_SCENARIO_PATH,
          "--state-file",
          stateFilePath,
          "--evidence-dir",
          evidenceDir,
        ],
        {},
        {
          stdout: (line) => stdout.push(line),
          stderr: (line) => stderr.push(line),
        },
        {
          reveal: {
            runReveal: async (args) => {
              revealCalls.push(args)
              return {
                submissionId: "12",
                revealTxHash: REVEAL_TX_HASH,
                revealEventIndex: 6,
              }
            },
          },
        },
      )

      expect(exitCode).toBe(0)
      expect(revealCalls).toHaveLength(1)
      expect(stdout).toEqual([
        JSON.stringify(
          {
            submissionId: "12",
            revealTxHash: REVEAL_TX_HASH,
            revealEventIndex: 6,
          },
          null,
          2,
        ),
      ])
      expect(stderr).toEqual([])
    })
  })
})

describe("runRevealStage", () => {
  it("fails closed before commit deadline and leaves the reveal stage pending", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      writeStateFile(config, {
        register: buildRegisterStageData("77"),
        submit: buildSubmitStageData("12"),
      })

      let runRelayerCallCount = 0

      await expect(
        runRevealStage({
          config,
          env: buildEnv(),
          deps: {
            createRuntimeBundle: async () => ({
              getCurrentTimestampSec: async () => 1_700_000_300n,
              readProject: async (projectId) => {
                expect(projectId).toBe(77n)
                return {
                  mode: "MULTI",
                  commitDeadline: 1_700_000_300n,
                  revealDeadline: 1_700_000_900n,
                }
              },
              runRelayerCycle: async () => {
                runRelayerCallCount += 1
                throw new Error("relayer should not run")
              },
              findRevealWorkflowTrigger: async () => {
                throw new Error("trigger lookup should not run")
              },
            }),
          },
        }),
      ).rejects.toThrow("Reveal stage blocked until the project commit deadline has passed")

      expect(runRelayerCallCount).toBe(0)

      const persisted = readStateFile(config)
      expect((persisted.stageStateByName as Record<string, { status: string }>).reveal.status).toBe(
        "pending",
      )
      expect((persisted.stageData as Record<string, unknown> | undefined)?.reveal).toBeUndefined()
    })
  })

  it("runs the auto-reveal relayer path and persists the PoCRevealed coordinates", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      writeStateFile(config, {
        register: buildRegisterStageData("77"),
        submit: buildSubmitStageData("12"),
      })

      const observedRunOnceConfigs: Array<Record<string, unknown>> = []
      let runRelayerCallCount = 0

      const result = await runRevealStage({
        config,
        env: buildEnv(),
        deps: {
          nowMs: 1_700_000_000_000,
          createRuntimeBundle: async ({ runOnceConfig }) => {
            observedRunOnceConfigs.push(runOnceConfig as unknown as Record<string, unknown>)

            return {
              getCurrentTimestampSec: async () => 1_700_000_400n,
              readProject: async (projectId) => {
                expect(projectId).toBe(77n)
                return {
                  mode: "MULTI",
                  commitDeadline: 1_700_000_300n,
                  revealDeadline: 1_700_000_900n,
                }
              },
              runRelayerCycle: async () => {
                runRelayerCallCount += 1
                return {
                  plan: {
                    mode: "run-once",
                    chainId: 11155111,
                    publicRpcUrl: "https://rpc.public.test/",
                    adminRpcUrl: "https://rpc.admin.test/",
                    bountyHubAddress:
                      "0x17797b473864806072186f6997801D4473AAF6e8",
                    cursorFile: resolve(
                      REAL_REPO_ROOT,
                      "workflow/auto-reveal-relayer/.auto-reveal-cursor.json",
                    ),
                    cursorLastFinalizedBlock: 0n,
                    recoveredProcessingCount: 0,
                    quarantinedItemCount: 0,
                    replayOverlapBlocks: 12,
                    logChunkBlocks: 5000,
                    maxExecutionBatchSize: 25,
                    fromBlock: 1n,
                    toBlock: 5000n,
                  },
                  unique: {
                    scannedLogCount: 0,
                    selectedCandidateSubmissionIds: [],
                    skipped: [],
                    pendingCommittedCandidates: [],
                    cursorAdvancedToBlock: 5000n,
                  },
                  multi: {
                    scannedLogCount: 1,
                    executedCount: 1,
                    executedSubmissionIds: [12n],
                    skipped: [],
                    pendingQueueItems: [],
                    failureMetrics: [],
                    cursorAdvancedToBlock: 5000n,
                  },
                }
              },
              findRevealWorkflowTrigger: async (submissionId) => {
                expect(submissionId).toBe(12n)
                return {
                  eventName: "PoCRevealed",
                  submissionId,
                  txHash: REVEAL_TX_HASH,
                  eventIndex: 7,
                }
              },
            }
          },
        },
      })

      expect(runRelayerCallCount).toBe(1)
      expect(observedRunOnceConfigs).toEqual([
        {
          publicRpcUrl: "https://rpc.public.test/",
          adminRpcUrl: "https://rpc.admin.test/",
          privateKey: OPERATOR_PRIVATE_KEY,
          bountyHubAddress: "0x17797b473864806072186f6997801d4473aaf6e8",
          chainId: 11155111,
          lookbackBlocks: 5000,
          replayOverlapBlocks: 12,
          logChunkBlocks: 5000,
          maxExecutionBatchSize: 25,
          cursorFile: resolve(
            REAL_REPO_ROOT,
            "workflow/auto-reveal-relayer/.auto-reveal-cursor.json",
          ),
        },
      ])

      expect(result).toEqual({
        submissionId: "12",
        revealTxHash: REVEAL_TX_HASH,
        revealEventIndex: 7,
      } satisfies RevealStageResult)

      const persisted = readStateFile(config)
      expect((persisted.stageStateByName as Record<string, { status: string }>).reveal.status).toBe(
        "completed",
      )
      expect(((persisted.stageData as Record<string, unknown>).reveal) as RevealStageResult).toEqual(
        result,
      )
    })
  })

  it("reuses the persisted reveal trigger on rerun instead of invoking the relayer again", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      const persistedReveal: RevealStageResult = {
        submissionId: "12",
        revealTxHash: REVEAL_TX_HASH,
        revealEventIndex: 7,
      }

      writeStateFile(config, {
        register: buildRegisterStageData("77"),
        submit: buildSubmitStageData("12"),
        reveal: persistedReveal,
        revealStatus: "completed",
      })

      let createRuntimeBundleCallCount = 0

      await expect(
        runRevealStage({
          config,
          env: buildEnv(),
          deps: {
            createRuntimeBundle: async () => {
              createRuntimeBundleCallCount += 1
              throw new Error("runtime bundle should not be created")
            },
          },
        }),
      ).resolves.toEqual(persistedReveal)

      expect(createRuntimeBundleCallCount).toBe(0)
    })
  })

  it("recovers a quarantined reveal stage from the persisted on-chain trigger without rerunning the relayer", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      writeStateFile(config, {
        register: buildRegisterStageData("77"),
        submit: buildSubmitStageData("12"),
        revealStatus: "quarantined",
      })

      let runRelayerCallCount = 0
      let findTriggerCallCount = 0

      const result = await runRevealStage({
        config,
        env: buildEnv(),
        deps: {
          createRuntimeBundle: async () => ({
            getCurrentTimestampSec: async () => 1_700_000_400n,
            readProject: async () => ({
              mode: "MULTI",
              commitDeadline: 1_700_000_300n,
              revealDeadline: 1_700_000_900n,
            }),
            runRelayerCycle: async () => {
              runRelayerCallCount += 1
              throw new Error("relayer should not rerun during recovery")
            },
            findRevealWorkflowTrigger: async (submissionId) => {
              findTriggerCallCount += 1
              expect(submissionId).toBe(12n)
              return {
                eventName: "PoCRevealed",
                submissionId,
                txHash: REVEAL_TX_HASH,
                eventIndex: 7,
              }
            },
          }),
        },
      })

      expect(runRelayerCallCount).toBe(0)
      expect(findTriggerCallCount).toBe(1)
      expect(result).toEqual({
        submissionId: "12",
        revealTxHash: REVEAL_TX_HASH,
        revealEventIndex: 7,
      } satisfies RevealStageResult)

      const persisted = readStateFile(config)
      expect((persisted.stageStateByName as Record<string, { status: string }>).reveal.status).toBe(
        "completed",
      )
      expect(((persisted.stageData as Record<string, unknown>).reveal) as RevealStageResult).toEqual(
        result,
      )
    })
  })
})
