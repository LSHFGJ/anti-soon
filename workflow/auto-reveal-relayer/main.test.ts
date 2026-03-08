import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { main, parseWorkflowConfig } from "./main"
import {
  buildRunOncePlan,
  loadRunOnceConfig,
  parseRunOnceCliArgs,
  runOnceCommand,
} from "./run-once"
import type {
  MultiDeadlineRuntime,
  MultiProjectSnapshot,
  MultiQueuedRevealLog,
  MultiQueuedRevealSnapshot,
  MultiSubmissionSnapshot,
} from "./multi-deadline"
import type {
  UniqueCandidateRuntime,
  UniqueCommittedLog,
  UniqueProjectSnapshot,
  UniqueRevealStateSnapshot,
  UniqueSubmissionSnapshot,
} from "./unique-orchestration"

const validWorkflowConfig = {
  chainSelectorName: "ethereum-testnet-sepolia",
  bountyHubAddress: "0x17797b473864806072186f6997801D4473AAF6e8",
  gasLimit: "500000",
}

const validEnv: Record<string, string | undefined> = {
  AUTO_REVEAL_PUBLIC_RPC_URL: "https://ethereum-sepolia-rpc.publicnode.com",
  AUTO_REVEAL_ADMIN_RPC_URL: "https://rpc.tenderly.co/fork/admin",
  AUTO_REVEAL_PRIVATE_KEY:
    "0x1111111111111111111111111111111111111111111111111111111111111111",
  AUTO_REVEAL_BOUNTY_HUB_ADDRESS: "0x17797b473864806072186f6997801D4473AAF6e8",
  AUTO_REVEAL_CHAIN_ID: "11155111",
  AUTO_REVEAL_LOOKBACK_BLOCKS: "5000",
  AUTO_REVEAL_REPLAY_OVERLAP_BLOCKS: "12",
  AUTO_REVEAL_LOG_CHUNK_BLOCKS: "500",
  AUTO_REVEAL_CURSOR_FILE: "workflow/auto-reveal-relayer/.auto-reveal-cursor.json",
}

describe("auto-reveal-relayer workflow config", () => {
  it("parses baseline workflow config", () => {
    const parsed = parseWorkflowConfig(validWorkflowConfig)
    expect(parsed.chainSelectorName).toBe(validWorkflowConfig.chainSelectorName)
    expect(parsed.bountyHubAddress).toBe(validWorkflowConfig.bountyHubAddress)
    expect(parsed.gasLimit).toBe(validWorkflowConfig.gasLimit)
  })

  it("parses checked-in workflow configs with public fields only", async () => {
    const stagingConfig = await Bun.file(
      new URL("./config.staging.json", import.meta.url),
    ).json()
    const productionConfig = await Bun.file(
      new URL("./config.production.json", import.meta.url),
    ).json()

    expect(parseWorkflowConfig(stagingConfig)).toEqual({
      ...validWorkflowConfig,
      bountyHubAddress: "0x3fBd5ab0F3FD234A40923ae7986f45acB9d4A3cf",
    })
    expect(parseWorkflowConfig(productionConfig)).toEqual(validWorkflowConfig)
  })

  it("rejects workflow config that tries to carry relayer signer material", () => {
    expect(() =>
      parseWorkflowConfig({
        ...validWorkflowConfig,
        AUTO_REVEAL_PRIVATE_KEY:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      }),
    ).toThrow("AUTO_REVEAL_PRIVATE_KEY")
  })

  it("rejects non-numeric gas limits", () => {
    expect(() =>
      parseWorkflowConfig({
        ...validWorkflowConfig,
        gasLimit: "five-hundred-thousand",
      }),
    ).toThrow("gasLimit")
  })

  it("parameterized main API executes real relayer orchestration", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-main-entrypoint-"))
    const cursorPath = join(tempDir, "cursor.json")

    const uniqueLogs: UniqueCommittedLog[] = [
      {
        submissionId: 701n,
        projectId: 71n,
        auditor: "0x1111111111111111111111111111111111111111",
        commitHash:
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        blockNumber: 10n,
        transactionHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        logIndex: 0n,
      },
    ]
    const uniqueSubmissions = new Map<string, UniqueSubmissionSnapshot>([
      ["701", { submissionId: 701n, projectId: 71n, status: "Committed" }],
    ])
    const uniqueProjects = new Map<string, UniqueProjectSnapshot>([
      ["71", { projectId: 71n, mode: "UNIQUE" }],
    ])
    const uniqueRevealStates = new Map<string, UniqueRevealStateSnapshot>([
      [
        "71",
        {
          hasCandidate: false,
          candidateSubmissionId: 0n,
          winnerLocked: false,
          winnerSubmissionId: 0n,
        },
      ],
    ])
    const uniqueRuntime: UniqueCandidateRuntime = {
      getCommittedLogs: async () => uniqueLogs,
      readSubmission: async (submissionId) => {
        const submission = uniqueSubmissions.get(submissionId.toString())
        if (!submission) {
          throw new Error(`missing unique submission ${submissionId.toString()}`)
        }
        return submission
      },
      readProject: async (projectId) => {
        const project = uniqueProjects.get(projectId.toString())
        if (!project) {
          throw new Error(`missing unique project ${projectId.toString()}`)
        }
        return project
      },
      readUniqueRevealState: async (projectId) => {
        const state = uniqueRevealStates.get(projectId.toString())
        if (!state) {
          throw new Error(`missing unique reveal state ${projectId.toString()}`)
        }
        return state
      },
    }

    const executedSubmissionIds: bigint[] = []
    const multiLogs: MultiQueuedRevealLog[] = [
      {
        submissionId: 801n,
        blockNumber: 11n,
        transactionHash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        logIndex: 0n,
      },
    ]
    const multiSubmissions = new Map<string, MultiSubmissionSnapshot>([
      ["801", { submissionId: 801n, projectId: 81n, status: "Committed" }],
    ])
    const multiProjects = new Map<string, MultiProjectSnapshot>([
      ["81", { projectId: 81n, mode: "MULTI", commitDeadline: 100n, revealDeadline: 400n }],
    ])
    const multiQueuedReveals = new Map<string, MultiQueuedRevealSnapshot>([
      [
        "801",
        {
          submissionId: 801n,
          auditor: "0x1111111111111111111111111111111111111111",
          salt:
            "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
          deadline: 300n,
          queued: true,
        },
      ],
    ])
    const multiRuntime: MultiDeadlineRuntime = {
      getNowTimestampSec: async () => 200n,
      getQueuedRevealLogs: async () => multiLogs,
      readSubmission: async (submissionId) => {
        const submission = multiSubmissions.get(submissionId.toString())
        if (!submission) {
          throw new Error(`missing multi submission ${submissionId.toString()}`)
        }
        return submission
      },
      readProject: async (projectId) => {
        const project = multiProjects.get(projectId.toString())
        if (!project) {
          throw new Error(`missing multi project ${projectId.toString()}`)
        }
        return project
      },
      readQueuedReveal: async (submissionId) => {
        const queuedReveal = multiQueuedReveals.get(submissionId.toString())
        if (!queuedReveal) {
          throw new Error(`missing queued reveal ${submissionId.toString()}`)
        }
        return queuedReveal
      },
      executeQueuedReveal: async (submissionId) => {
        executedSubmissionIds.push(submissionId)
        return {
          txHash:
            `0x${submissionId.toString(16).padStart(64, "0")}` as `0x${string}`,
        }
      },
    }

    try {
      const result = await main(
        validWorkflowConfig,
        {
          ...validEnv,
          AUTO_REVEAL_CURSOR_FILE: cursorPath,
        },
        {
          uniqueRuntime,
          multiRuntime,
          nowMs: 110,
        },
      )

      expect(result.plan.fromBlock).toBe(1n)
      expect(result.unique.selectedCandidateSubmissionIds).toEqual([701n])
      expect(result.multi.executedSubmissionIds).toEqual([801n])
      expect(executedSubmissionIds).toEqual([801n])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

describe("auto-reveal-relayer run-once config", () => {
  it("fails closed when required env is missing", () => {
    expect(() =>
      loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_PRIVATE_KEY: undefined,
      }),
    ).toThrow("Missing required environment variable: AUTO_REVEAL_PRIVATE_KEY")
  })

  it("rejects identical public and admin RPC URLs", () => {
    expect(() =>
      loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_ADMIN_RPC_URL: validEnv.AUTO_REVEAL_PUBLIC_RPC_URL,
      }),
    ).toThrow("AUTO_REVEAL_ADMIN_RPC_URL must be different from AUTO_REVEAL_PUBLIC_RPC_URL")
  })

  it("builds deterministic plan from cursor and overlap", () => {
    const config = loadRunOnceConfig(validEnv)

    const first = buildRunOncePlan(config, 120n)
    const second = buildRunOncePlan(config, 120n)

    expect(first).toEqual(second)
    expect(first.fromBlock).toBe(109n)
    expect(first.toBlock).toBe(5108n)
    expect(first.cursorFile).toBe(validEnv.AUTO_REVEAL_CURSOR_FILE)
    expect(first.replayOverlapBlocks).toBe(12)
    expect(first.logChunkBlocks).toBe(500)
  })
})

describe("run-once CLI", () => {
  it("parses help and override flags", () => {
    const args = parseRunOnceCliArgs([
      "--help",
      "--cursor-file",
      "./cursor.json",
      "--replay-overlap-blocks",
      "24",
    ])

    expect(args.help).toBe(true)
    expect(args.cursorFile).toBe("./cursor.json")
    expect(args.replayOverlapBlocks).toBe("24")
  })

  it("returns zero and prints help without env", async () => {
    const out: string[] = []
    const err: string[] = []

    const exitCode = await runOnceCommand(["--help"], {}, {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    })

    expect(exitCode).toBe(0)
    expect(err).toHaveLength(0)
    expect(out.join("\n")).toContain("Usage: bun run run-once")
  })

  it("returns non-zero for invalid env", async () => {
    const out: string[] = []
    const err: string[] = []

    const exitCode = await runOnceCommand([], { ...validEnv, AUTO_REVEAL_PRIVATE_KEY: undefined }, {
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    })

    expect(exitCode).toBe(1)
    expect(err.join("\n")).toContain("Missing required environment variable: AUTO_REVEAL_PRIVATE_KEY")
  })
})
