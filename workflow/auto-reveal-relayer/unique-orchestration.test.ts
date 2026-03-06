import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildRunOncePlan, loadAutoRevealCursorStore, loadRunOnceConfig } from "./run-once"
import {
  runUniqueCommittedCandidateScanner,
  type UniqueCandidateRuntime,
  type UniqueCommittedLog,
  type UniqueProjectSnapshot,
  type UniqueRevealStateSnapshot,
  type UniqueSubmissionSnapshot,
} from "./unique-orchestration"
import type { AutoRevealPendingCommittedCandidate } from "./cursor-store"

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
  AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE: "2",
}

type RuntimeState = {
  logs: UniqueCommittedLog[]
  submissions: Map<string, UniqueSubmissionSnapshot>
  projects: Map<string, UniqueProjectSnapshot>
  uniqueStateByProject: Map<string, UniqueRevealStateSnapshot>
}

function makeCommittedLog(
  submissionId: bigint,
  projectId: bigint,
  blockNumber: bigint,
  txFill: string,
  logIndex: bigint,
): UniqueCommittedLog {
  return {
    submissionId,
    projectId,
    auditor: "0x1111111111111111111111111111111111111111",
    commitHash: `0x${txFill.repeat(64)}` as `0x${string}`,
    blockNumber,
    transactionHash: `0x${txFill.repeat(64)}` as `0x${string}`,
    logIndex,
  }
}

function makeSubmission(
  submissionId: bigint,
  projectId: bigint,
  status: "Committed" | "Revealed" | "Verified" | "Invalid" | "Finalized",
): UniqueSubmissionSnapshot {
  return { submissionId, projectId, status }
}

function makeProject(
  projectId: bigint,
  mode: "UNIQUE" | "MULTI",
): UniqueProjectSnapshot {
  return { projectId, mode }
}

function makeRevealState(
  hasCandidate: boolean,
  candidateSubmissionId: bigint,
  winnerLocked: boolean,
  winnerSubmissionId: bigint,
): UniqueRevealStateSnapshot {
  return {
    hasCandidate,
    candidateSubmissionId,
    winnerLocked,
    winnerSubmissionId,
  }
}

function makeRuntime(state: RuntimeState): UniqueCandidateRuntime {
  return {
    getCommittedLogs: async () => state.logs,
    readSubmission: async (submissionId) => {
      const submission = state.submissions.get(submissionId.toString())
      if (!submission) {
        throw new Error(`missing submission ${submissionId.toString()}`)
      }
      return submission
    },
    readProject: async (projectId) => {
      const project = state.projects.get(projectId.toString())
      if (!project) {
        throw new Error(`missing project ${projectId.toString()}`)
      }
      return project
    },
    readUniqueRevealState: async (projectId) => {
      const snapshot = state.uniqueStateByProject.get(projectId.toString())
      if (!snapshot) {
        throw new Error(`missing unique reveal state ${projectId.toString()}`)
      }
      return snapshot
    },
  }
}

function pendingSubmissionIds(items: AutoRevealPendingCommittedCandidate[]): string[] {
  return items.map((item) => item.submissionId.toString()).sort()
}

describe("auto-reveal-relayer unique orchestration", () => {
  it("derives UNIQUE candidate work from PoCCommitted context and keeps later commits pending", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-unique-order-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({ ...validEnv, AUTO_REVEAL_CURSOR_FILE: cursorPath })
      const store = loadAutoRevealCursorStore(cursorPath, 100)
      const plan = buildRunOncePlan(config, store.cursorLastFinalizedBlock)
      const runtimeState: RuntimeState = {
        logs: [
          makeCommittedLog(101n, 1n, 120n, "a", 0n),
          makeCommittedLog(102n, 1n, 121n, "b", 0n),
          makeCommittedLog(201n, 2n, 122n, "c", 0n),
        ],
        submissions: new Map([
          ["101", makeSubmission(101n, 1n, "Committed")],
          ["102", makeSubmission(102n, 1n, "Committed")],
          ["201", makeSubmission(201n, 2n, "Committed")],
        ]),
        projects: new Map([
          ["1", makeProject(1n, "UNIQUE")],
          ["2", makeProject(2n, "MULTI")],
        ]),
        uniqueStateByProject: new Map([
          ["1", makeRevealState(false, 0n, false, 0n)],
          ["2", makeRevealState(false, 0n, false, 0n)],
        ]),
      }

      const result = await runUniqueCommittedCandidateScanner({
        config,
        plan,
        store,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(result.selectedCandidateSubmissionIds).toEqual([101n])
      expect(
        result.skipped.map((entry) => [entry.submissionId.toString(), entry.reason, entry.terminal]),
      ).toEqual([
        ["102", "EARLIER_COMMIT_PENDING", false],
        ["201", "NOT_UNIQUE", true],
      ])
      expect(pendingSubmissionIds(result.pendingCommittedCandidates)).toEqual(["101", "102"])
      expect(result.cursorAdvancedToBlock).toBe(plan.toBlock)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("keeps late UNIQUE commits pending until the active candidate clears and PoCRevealed handoff remains terminal", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-unique-handoff-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({ ...validEnv, AUTO_REVEAL_CURSOR_FILE: cursorPath })
      const runtimeState: RuntimeState = {
        logs: [
          makeCommittedLog(301n, 3n, 120n, "d", 0n),
          makeCommittedLog(302n, 3n, 121n, "e", 0n),
        ],
        submissions: new Map([
          ["301", makeSubmission(301n, 3n, "Revealed")],
          ["302", makeSubmission(302n, 3n, "Committed")],
        ]),
        projects: new Map([["3", makeProject(3n, "UNIQUE")]]),
        uniqueStateByProject: new Map([["3", makeRevealState(true, 301n, false, 0n)]]),
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const firstPlan = buildRunOncePlan(config, firstStore.cursorLastFinalizedBlock)
      const firstResult = await runUniqueCommittedCandidateScanner({
        config,
        plan: firstPlan,
        store: firstStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(firstResult.selectedCandidateSubmissionIds).toEqual([])
      expect(
        firstResult.skipped.map((entry) => [entry.submissionId.toString(), entry.reason, entry.terminal]),
      ).toEqual([
        ["301", "POC_REVEALED_HANDOFF", true],
        ["302", "CANDIDATE_PENDING", false],
      ])
      expect(pendingSubmissionIds(firstResult.pendingCommittedCandidates)).toEqual(["302"])

      runtimeState.logs = []
      runtimeState.submissions.set("301", makeSubmission(301n, 3n, "Invalid"))
      runtimeState.uniqueStateByProject.set("3", makeRevealState(false, 0n, false, 0n))

      const secondStore = loadAutoRevealCursorStore(cursorPath, 200)
      const secondPlan = buildRunOncePlan(config, secondStore.cursorLastFinalizedBlock)
      const secondResult = await runUniqueCommittedCandidateScanner({
        config,
        plan: secondPlan,
        store: secondStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 210,
      })

      expect(secondResult.selectedCandidateSubmissionIds).toEqual([302n])
      expect(pendingSubmissionIds(secondResult.pendingCommittedCandidates)).toEqual(["302"])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("replayed late UNIQUE commits cannot produce a second winner path after winner lock", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-unique-winner-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
        AUTO_REVEAL_LOOKBACK_BLOCKS: "20",
      })
      const runtimeState: RuntimeState = {
        logs: [
          makeCommittedLog(401n, 4n, 10n, "f", 0n),
          makeCommittedLog(402n, 4n, 11n, "g", 0n),
        ],
        submissions: new Map([
          ["401", makeSubmission(401n, 4n, "Committed")],
          ["402", makeSubmission(402n, 4n, "Committed")],
        ]),
        projects: new Map([["4", makeProject(4n, "UNIQUE")]]),
        uniqueStateByProject: new Map([["4", makeRevealState(false, 0n, false, 0n)]]),
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const firstPlan = buildRunOncePlan(config, firstStore.cursorLastFinalizedBlock)
      const firstResult = await runUniqueCommittedCandidateScanner({
        config,
        plan: firstPlan,
        store: firstStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(firstResult.selectedCandidateSubmissionIds).toEqual([401n])

      runtimeState.uniqueStateByProject.set("4", makeRevealState(false, 0n, true, 401n))
      runtimeState.submissions.set("401", makeSubmission(401n, 4n, "Verified"))
      runtimeState.logs = [
        makeCommittedLog(401n, 4n, 10n, "f", 0n),
        makeCommittedLog(402n, 4n, 11n, "g", 0n),
      ]

      const secondStore = loadAutoRevealCursorStore(cursorPath, 200)
      const secondPlan = buildRunOncePlan(config, secondStore.cursorLastFinalizedBlock)
      const secondResult = await runUniqueCommittedCandidateScanner({
        config,
        plan: secondPlan,
        store: secondStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 210,
      })

      expect(secondResult.selectedCandidateSubmissionIds).toEqual([])
      expect(
        secondResult.skipped.map((entry) => [entry.submissionId.toString(), entry.reason]),
      ).toEqual([
        ["401", "WINNER_LOCKED"],
        ["402", "WINNER_LOCKED"],
      ])
      expect(secondResult.pendingCommittedCandidates).toHaveLength(0)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("duplicate reorg matrix does not keep duplicate UNIQUE committed candidates for the same submission", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-unique-duplicate-matrix-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
        AUTO_REVEAL_LOOKBACK_BLOCKS: "20",
      })
      const firstRuntime: RuntimeState = {
        logs: [makeCommittedLog(501n, 5n, 10n, "1", 0n)],
        submissions: new Map([["501", makeSubmission(501n, 5n, "Committed")]]),
        projects: new Map([["5", makeProject(5n, "UNIQUE")]]),
        uniqueStateByProject: new Map([["5", makeRevealState(false, 0n, false, 0n)]]),
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const firstPlan = buildRunOncePlan(config, firstStore.cursorLastFinalizedBlock)
      const firstResult = await runUniqueCommittedCandidateScanner({
        config,
        plan: firstPlan,
        store: firstStore,
        runtime: makeRuntime(firstRuntime),
        nowMs: 110,
      })

      expect(firstResult.selectedCandidateSubmissionIds).toEqual([501n])
      expect(pendingSubmissionIds(firstResult.pendingCommittedCandidates)).toEqual(["501"])

      const secondRuntime: RuntimeState = {
        logs: [makeCommittedLog(501n, 5n, 11n, "2", 1n)],
        submissions: new Map([["501", makeSubmission(501n, 5n, "Committed")]]),
        projects: new Map([["5", makeProject(5n, "UNIQUE")]]),
        uniqueStateByProject: new Map([["5", makeRevealState(false, 0n, false, 0n)]]),
      }

      const secondStore = loadAutoRevealCursorStore(cursorPath, 200)
      const secondPlan = buildRunOncePlan(config, secondStore.cursorLastFinalizedBlock)
      const secondResult = await runUniqueCommittedCandidateScanner({
        config,
        plan: secondPlan,
        store: secondStore,
        runtime: makeRuntime(secondRuntime),
        nowMs: 210,
      })

      expect(secondResult.selectedCandidateSubmissionIds).toEqual([501n])
      expect(pendingSubmissionIds(secondResult.pendingCommittedCandidates)).toEqual(["501"])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
