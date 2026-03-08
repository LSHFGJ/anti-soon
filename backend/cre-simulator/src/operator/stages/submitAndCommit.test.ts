import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { runDemoOperatorCommand } from "../../operator-cli"
import type { DemoOperatorConfig, EnvRecord } from "../config"
import { loadScenarioFromFile } from "../scenario"
import { DEMO_OPERATOR_STATE_STORE_SCHEMA_VERSION } from "../stateStore"
import {
  submitAndCommit,
  type SubmitAndCommitResult,
} from "./submitAndCommit"

const REAL_REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const REAL_SCENARIO_PATH = resolve(
  REAL_REPO_ROOT,
  "backend/cre-simulator/default-scenario.json",
)
const AUDITOR_ADDRESS = "0x7777777777777777777777777777777777777777" as const
const AUDITOR_PRIVATE_KEY =
  "0x7777777777777777777777777777777777777777777777777777777777777777" as const
const FIXED_SALT =
  "0x9999999999999999999999999999999999999999999999999999999999999999" as const
const CIPHER_URI =
  "oasis://oasis-sapphire-testnet/0x000000000000000000000000000000000000dead/slot-fixed#0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const
const OASIS_TX_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const
const COMMIT_TX_HASH =
  "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as const
const EXPECTED_COMMIT_HASH =
  "0xae9fb9f44c2a84f7f8c30812ae77f121ab57b13a97b41f1db0da824ef02e73d7" as const

function withTempDir(run: (tempDir: string) => Promise<void> | void): Promise<void> {
  const tempDir = mkdtempSync(join(tmpdir(), "demo-operator-submit-"))

  return Promise.resolve()
    .then(() => run(tempDir))
    .finally(() => {
      rmSync(tempDir, { recursive: true, force: true })
    })
}

function buildConfig(tempDir: string): DemoOperatorConfig {
  return {
    command: "submit",
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
    DEMO_AUDITOR_ADDRESS: AUDITOR_ADDRESS,
    DEMO_AUDITOR_PRIVATE_KEY: AUDITOR_PRIVATE_KEY,
  }
}

function writeStateFile(
  config: DemoOperatorConfig,
  options: {
    register?: Record<string, unknown>
    submit?: Record<string, unknown>
    submitStatus?: "pending" | "completed"
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
            status: options.submitStatus ?? "pending",
            updatedAtMs: 1,
          },
          reveal: {
            status: "pending",
            updatedAtMs: 0,
          },
          verify: {
            status: "pending",
            updatedAtMs: 0,
          },
        },
        ...(options.register || options.submit
          ? {
              stageData: {
                ...(options.register ? { register: options.register } : {}),
                ...(options.submit ? { submit: options.submit } : {}),
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

describe("runDemoOperatorCommand submit", () => {
  it("delegates submit to the real stage instead of returning the scaffold error", async () => {
    await withTempDir(async (tempDir) => {
      const stateFilePath = join(tempDir, ".demo-operator-state.json")
      const evidenceDir = join(tempDir, "evidence")
      const stdout: string[] = []
      const stderr: string[] = []
      const submitCalls: unknown[] = []

      const exitCode = await (
        runDemoOperatorCommand as unknown as (
          argv: string[],
          env: Record<string, string | undefined>,
          io: { stdout: (line: string) => void; stderr: (line: string) => void },
          deps: {
            submit: {
              runSubmit: (args: { config: { command: string; scenarioPath: string } }) => Promise<unknown>
            }
          },
        ) => Promise<number>
      )(
        [
          "submit",
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
          submit: {
            runSubmit: async (args) => {
              submitCalls.push(args)
              return {
                submissionId: "12",
                commitTxHash:
                  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              }
            },
          },
        },
      )

      expect(exitCode).toBe(0)
      expect(submitCalls).toHaveLength(1)
      expect(stdout).toEqual([
        JSON.stringify(
          {
            submissionId: "12",
            commitTxHash:
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          null,
          2,
        ),
      ])
      expect(stderr).toEqual([])
    })
  })
})

describe("submitAndCommit", () => {
  it("normalizes the checked-in DummyVault fixture, computes the frontend commit hash, and persists stageData.submit", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      writeStateFile(config, {
        register: buildRegisterStageData("77"),
      })

      const uploadCalls: Array<{ projectId: bigint; auditor: string; pocJson: string }> = []
      const commitCalls: Array<{
        projectId: bigint
        auditor: string
        cipherURI: string
        salt: `0x${string}`
        commitHash: `0x${string}`
      }> = []

      const result = await submitAndCommit({
        config,
        env: buildEnv(),
        deps: {
          randomSalt: () => FIXED_SALT,
          computeCommitHashFromCipherUri: async () => EXPECTED_COMMIT_HASH,
          uploadOasisPoC: async (args) => {
            uploadCalls.push(args)
            return {
              cipherURI: CIPHER_URI,
              oasisTxHash: OASIS_TX_HASH,
            }
          },
          commitPoC: async (args) => {
            commitCalls.push(args)
            return {
              submissionId: 12n,
              commitTxHash: COMMIT_TX_HASH,
            }
          },
        },
      })

      expect(uploadCalls).toHaveLength(1)
      expect(uploadCalls[0]).toEqual({
        projectId: 77n,
        auditor: AUDITOR_ADDRESS,
        pocJson: JSON.stringify({
          target: {
            contract: "0x3333333333333333333333333333333333333333",
            chain: 11155111,
            forkBlock: 6500000,
          },
          setup: [
            {
              type: "setBalance",
              address: "0x4444444444444444444444444444444444444444",
              value: "1000000000000000000",
            },
          ],
          transactions: [
            {
              to: "0x3333333333333333333333333333333333333333",
              data: "0x",
              value: "0",
            },
            {
              to: "0x3333333333333333333333333333333333333333",
              data: "0x",
              value: "0",
            },
          ],
          expectedImpact: {
            type: "fundsDrained",
            estimatedLoss: "1000000000000000000",
            description: "Reentrancy path example using builder-compatible fields.",
          },
        }),
      })

      expect(commitCalls).toEqual([
        {
          projectId: 77n,
          auditor: AUDITOR_ADDRESS,
          cipherURI: CIPHER_URI,
          salt: FIXED_SALT,
          commitHash: EXPECTED_COMMIT_HASH,
        },
      ])
      expect(result).toEqual({
        submissionId: "12",
        commitTxHash: COMMIT_TX_HASH,
        commitHash: EXPECTED_COMMIT_HASH,
        cipherURI: CIPHER_URI,
        salt: FIXED_SALT,
        oasisTxHash: OASIS_TX_HASH,
      })

      const persisted = readStateFile(config)
      expect(
        ((persisted.stageStateByName as Record<string, { status: string }>).submit).status,
      ).toBe("completed")
      expect(
        ((persisted.stageData as Record<string, unknown>).submit as SubmitAndCommitResult),
      ).toEqual(result)
    })
  })

  it("fails closed when the register stage did not persist a valid projectId", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      writeStateFile(config, {
        register: {
          ...buildRegisterStageData("77"),
          projectId: "",
        },
      })

      await expect(
        submitAndCommit({
          config,
          env: buildEnv(),
          deps: {
            uploadOasisPoC: async () => {
              throw new Error("upload should not run")
            },
            commitPoC: async () => {
              throw new Error("commit should not run")
            },
          },
        }),
      ).rejects.toThrow("Persisted register stage projectId is invalid")

      const persisted = readStateFile(config)
      expect(
        ((persisted.stageStateByName as Record<string, { status: string }>).submit).status,
      ).toBe("pending")
      expect((persisted.stageData as Record<string, unknown> | undefined)?.submit).toBeUndefined()
    })
  })

  it("reuses existing submission instead of double-committing", async () => {
    await withTempDir(async (tempDir) => {
      const config = buildConfig(tempDir)
      const persistedSubmit: SubmitAndCommitResult = {
        submissionId: "12",
        commitTxHash: COMMIT_TX_HASH,
        commitHash:
          "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        cipherURI: CIPHER_URI,
        salt: FIXED_SALT,
        oasisTxHash: OASIS_TX_HASH,
      }

      writeStateFile(config, {
        register: buildRegisterStageData("77"),
        submit: persistedSubmit,
        submitStatus: "completed",
      })

      let uploadCallCount = 0
      let commitCallCount = 0

      await expect(
        submitAndCommit({
          config,
          env: buildEnv(),
          deps: {
            uploadOasisPoC: async () => {
              uploadCallCount += 1
              throw new Error("upload should not run")
            },
            commitPoC: async () => {
              commitCallCount += 1
              throw new Error("commit should not run")
            },
          },
        }),
      ).resolves.toEqual(persistedSubmit)

      expect(uploadCallCount).toBe(0)
      expect(commitCallCount).toBe(0)
    })
  })
})
