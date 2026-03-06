import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  runMultiDeadlineScanner,
} from "./multi-deadline"
import type {
  MultiDeadlineRuntime,
  MultiProjectSnapshot,
  MultiQueuedRevealLog,
  MultiQueuedRevealSnapshot,
  MultiSubmissionSnapshot,
} from "./multi-deadline"
import type { AutoRevealPendingQueueItem } from "./cursor-store"
import { buildRunOncePlan, loadAutoRevealCursorStore, loadRunOnceConfig } from "./run-once"

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
  nowTimestampSec: bigint
  logs: MultiQueuedRevealLog[]
  submissions: Map<string, MultiSubmissionSnapshot>
  projects: Map<string, MultiProjectSnapshot>
  queuedReveals: Map<string, MultiQueuedRevealSnapshot>
  executedSubmissionIds: bigint[]
}

function makeProject(
  projectId: bigint,
  mode: "UNIQUE" | "MULTI",
  commitDeadline: bigint,
  revealDeadline: bigint,
): MultiProjectSnapshot {
  return {
    projectId,
    mode,
    commitDeadline,
    revealDeadline,
  }
}

function makeSubmission(
  submissionId: bigint,
  projectId: bigint,
  status: "Committed" | "Revealed" | "Verified" | "Invalid",
): MultiSubmissionSnapshot {
  return {
    submissionId,
    projectId,
    status,
  }
}

function makeQueuedReveal(
  submissionId: bigint,
  deadline: bigint,
  queued = true,
): MultiQueuedRevealSnapshot {
  return {
    submissionId,
    auditor: "0x1111111111111111111111111111111111111111",
    salt: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    deadline,
    queued,
  }
}

function makeLog(
  submissionId: bigint,
  blockNumber: bigint,
  txFill: string,
  logIndex: bigint,
): MultiQueuedRevealLog {
  return {
    submissionId,
    blockNumber,
    transactionHash: `0x${txFill.repeat(64)}` as `0x${string}`,
    logIndex,
  }
}

function makeRuntime(state: RuntimeState): MultiDeadlineRuntime {
  return {
    getNowTimestampSec: async () => state.nowTimestampSec,
    getQueuedRevealLogs: async () => state.logs,
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
    readQueuedReveal: async (submissionId) => {
      const queuedReveal = state.queuedReveals.get(submissionId.toString())
      if (!queuedReveal) {
        return {
          submissionId,
          auditor: "0x0000000000000000000000000000000000000000",
          salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
          deadline: 0n,
          queued: false,
        }
      }
      return queuedReveal
    },
    executeQueuedReveal: async (submissionId) => {
      state.executedSubmissionIds.push(submissionId)
      return {
        txHash:
          `0x${submissionId.toString(16).padStart(64, "0")}` as `0x${string}`,
      }
    },
  }
}

function pendingSubmissionIds(items: AutoRevealPendingQueueItem[]): string[] {
  return items.map((item) => item.submissionId.toString()).sort()
}

function bigintStrings(values: bigint[]): string[] {
  return values.map((value) => value.toString())
}

describe("auto-reveal-relayer multi deadline scanner", () => {
  it("multi deadline scanner executes only eligible MULTI queued reveals and emits deterministic skip reasons", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-deadline-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
      })
      const store = loadAutoRevealCursorStore(cursorPath, 100)
      const plan = buildRunOncePlan(config, store.cursorLastFinalizedBlock)
      const runtimeState: RuntimeState = {
        nowTimestampSec: 200n,
        logs: [
          makeLog(101n, 120n, "a", 0n),
          makeLog(102n, 121n, "b", 0n),
          makeLog(103n, 122n, "c", 0n),
        ],
        submissions: new Map([
          ["101", makeSubmission(101n, 1n, "Committed")],
          ["102", makeSubmission(102n, 2n, "Committed")],
          ["103", makeSubmission(103n, 3n, "Committed")],
        ]),
        projects: new Map([
          ["1", makeProject(1n, "MULTI", 150n, 400n)],
          ["2", makeProject(2n, "MULTI", 250n, 400n)],
          ["3", makeProject(3n, "UNIQUE", 0n, 0n)],
        ]),
        queuedReveals: new Map([
          ["101", makeQueuedReveal(101n, 500n)],
          ["102", makeQueuedReveal(102n, 500n)],
          ["103", makeQueuedReveal(103n, 500n)],
        ]),
        executedSubmissionIds: [],
      }

      const result = await runMultiDeadlineScanner({
        config,
        plan,
        store,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(bigintStrings(runtimeState.executedSubmissionIds)).toEqual(["101"])
      expect(result.executedCount).toBe(1)
      expect(result.executedSubmissionIds).toEqual([101n])
      expect(
        result.skipped.map((entry) => [entry.submissionId.toString(), entry.reason, entry.terminal]),
      ).toEqual([
        ["102", "COMMIT_DEADLINE_NOT_REACHED", false],
        ["103", "NOT_MULTI", true],
      ])
      expect(result.cursorAdvancedToBlock).toBe(plan.toBlock)
      expect(pendingSubmissionIds(result.pendingQueueItems)).toEqual(["102"])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("multi deadline scanner keeps premature MULTI queue items pending across cursor advancement until they become eligible", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-pending-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
      })
      const runtimeState: RuntimeState = {
        nowTimestampSec: 200n,
        logs: [makeLog(201n, 120n, "d", 0n)],
        submissions: new Map([["201", makeSubmission(201n, 4n, "Committed")]]),
        projects: new Map([["4", makeProject(4n, "MULTI", 250n, 500n)]]),
        queuedReveals: new Map([["201", makeQueuedReveal(201n, 600n)]]),
        executedSubmissionIds: [],
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const firstPlan = buildRunOncePlan(config, firstStore.cursorLastFinalizedBlock)
      const firstResult = await runMultiDeadlineScanner({
        config,
        plan: firstPlan,
        store: firstStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 120,
      })

      expect(firstResult.executedCount).toBe(0)
      expect(firstResult.skipped).toEqual([
        {
          submissionId: 201n,
          reason: "COMMIT_DEADLINE_NOT_REACHED",
          terminal: false,
        },
      ])
      expect(firstResult.cursorAdvancedToBlock).toBe(firstPlan.toBlock)
      expect(pendingSubmissionIds(firstResult.pendingQueueItems)).toEqual(["201"])

      runtimeState.nowTimestampSec = 260n
      runtimeState.logs = []

      const secondStore = loadAutoRevealCursorStore(cursorPath, 200)
      const secondPlan = buildRunOncePlan(config, secondStore.cursorLastFinalizedBlock)
      const secondResult = await runMultiDeadlineScanner({
        config,
        plan: secondPlan,
        store: secondStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 220,
      })

      expect(secondResult.executedSubmissionIds).toEqual([201n])
      expect(runtimeState.executedSubmissionIds).toEqual([201n])
      expect(secondResult.pendingQueueItems).toHaveLength(0)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("multi deadline scanner respects bounded execution batches and replay-safe completed dedupe", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-batch-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
        AUTO_REVEAL_MAX_EXECUTION_BATCH_SIZE: "1",
        AUTO_REVEAL_LOOKBACK_BLOCKS: "20",
      })
      const runtimeState: RuntimeState = {
        nowTimestampSec: 300n,
        logs: [makeLog(301n, 10n, "e", 0n), makeLog(302n, 11n, "f", 0n)],
        submissions: new Map([
          ["301", makeSubmission(301n, 5n, "Committed")],
          ["302", makeSubmission(302n, 5n, "Committed")],
        ]),
        projects: new Map([["5", makeProject(5n, "MULTI", 150n, 500n)]]),
        queuedReveals: new Map([
          ["301", makeQueuedReveal(301n, 600n)],
          ["302", makeQueuedReveal(302n, 600n)],
        ]),
        executedSubmissionIds: [],
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const firstPlan = buildRunOncePlan(config, firstStore.cursorLastFinalizedBlock)
      const firstResult = await runMultiDeadlineScanner({
        config,
        plan: firstPlan,
        store: firstStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(firstResult.executedSubmissionIds).toEqual([301n])
      expect(firstResult.skipped).toEqual([
        {
          submissionId: 302n,
          reason: "BATCH_LIMIT_REACHED",
          terminal: false,
        },
      ])

      runtimeState.logs = [makeLog(301n, 10n, "e", 0n), makeLog(302n, 11n, "f", 0n)]

      const secondStore = loadAutoRevealCursorStore(cursorPath, 200)
      const secondPlan = buildRunOncePlan(config, secondStore.cursorLastFinalizedBlock)
      const secondResult = await runMultiDeadlineScanner({
        config,
        plan: secondPlan,
        store: secondStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 210,
      })

      expect(runtimeState.executedSubmissionIds).toEqual([301n, 302n])
      expect(secondResult.executedSubmissionIds).toEqual([302n])
      expect(
        secondResult.skipped.some(
          (entry) => entry.submissionId === 301n && entry.reason === "ALREADY_COMPLETED",
        ),
      ).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("duplicate reorg matrix does not double-execute the same logical submission across overlap replays", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-reorg-duplicate-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
        AUTO_REVEAL_LOOKBACK_BLOCKS: "20",
      })
      const runtimeState: RuntimeState = {
        nowTimestampSec: 300n,
        logs: [makeLog(401n, 10n, "9", 0n)],
        submissions: new Map([["401", makeSubmission(401n, 7n, "Committed")]]),
        projects: new Map([["7", makeProject(7n, "MULTI", 150n, 500n)]]),
        queuedReveals: new Map([["401", makeQueuedReveal(401n, 700n)]]),
        executedSubmissionIds: [],
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const firstPlan = buildRunOncePlan(config, firstStore.cursorLastFinalizedBlock)
      const firstResult = await runMultiDeadlineScanner({
        config,
        plan: firstPlan,
        store: firstStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(firstResult.executedSubmissionIds).toEqual([401n])
      expect(runtimeState.executedSubmissionIds).toEqual([401n])

      runtimeState.logs = [makeLog(401n, 11n, "8", 1n)]

      const secondStore = loadAutoRevealCursorStore(cursorPath, 200)
      const secondPlan = buildRunOncePlan(config, secondStore.cursorLastFinalizedBlock)
      const secondResult = await runMultiDeadlineScanner({
        config,
        plan: secondPlan,
        store: secondStore,
        runtime: makeRuntime(runtimeState),
        nowMs: 210,
      })

      expect(secondResult.executedSubmissionIds).toEqual([])
      expect(runtimeState.executedSubmissionIds).toEqual([401n])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("deadline matrix blocks exactly at commit deadline and allows exact reveal/signature deadline", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-deadline-matrix-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
      })
      const boundaryStore = loadAutoRevealCursorStore(cursorPath, 100)
      const boundaryPlan = buildRunOncePlan(config, boundaryStore.cursorLastFinalizedBlock)
      const boundaryRuntime: RuntimeState = {
        nowTimestampSec: 250n,
        logs: [makeLog(501n, 120n, "7", 0n)],
        submissions: new Map([["501", makeSubmission(501n, 8n, "Committed")]]),
        projects: new Map([["8", makeProject(8n, "MULTI", 250n, 400n)]]),
        queuedReveals: new Map([["501", makeQueuedReveal(501n, 500n)]]),
        executedSubmissionIds: [],
      }

      const blockedResult = await runMultiDeadlineScanner({
        config,
        plan: boundaryPlan,
        store: boundaryStore,
        runtime: makeRuntime(boundaryRuntime),
        nowMs: 110,
      })

      expect(blockedResult.executedSubmissionIds).toEqual([])
      expect(blockedResult.skipped).toEqual([
        {
          submissionId: 501n,
          reason: "COMMIT_DEADLINE_NOT_REACHED",
          terminal: false,
        },
      ])

      const exactTempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-deadline-exact-"))
      const exactCursorPath = join(exactTempDir, "cursor.json")

      try {
        const exactConfig = loadRunOnceConfig({
          ...validEnv,
          AUTO_REVEAL_CURSOR_FILE: exactCursorPath,
        })
        const exactStore = loadAutoRevealCursorStore(exactCursorPath, 200)
        const exactPlan = buildRunOncePlan(exactConfig, exactStore.cursorLastFinalizedBlock)
        const exactRuntime: RuntimeState = {
          nowTimestampSec: 400n,
          logs: [makeLog(502n, 121n, "6", 0n)],
          submissions: new Map([["502", makeSubmission(502n, 9n, "Committed")]]),
          projects: new Map([["9", makeProject(9n, "MULTI", 300n, 400n)]]),
          queuedReveals: new Map([["502", makeQueuedReveal(502n, 400n)]]),
          executedSubmissionIds: [],
        }

        const exactResult = await runMultiDeadlineScanner({
          config: exactConfig,
          plan: exactPlan,
          store: exactStore,
          runtime: makeRuntime(exactRuntime),
          nowMs: 210,
        })

        expect(exactResult.executedSubmissionIds).toEqual([502n])
      } finally {
        rmSync(exactTempDir, { recursive: true, force: true })
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("mixed mode matrix preserves deterministic ordering for multi, unique, and terminal deadline outcomes", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-multi-mixed-matrix-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
      })
      const store = loadAutoRevealCursorStore(cursorPath, 100)
      const plan = buildRunOncePlan(config, store.cursorLastFinalizedBlock)
      const runtimeState: RuntimeState = {
        nowTimestampSec: 500n,
        logs: [
          makeLog(601n, 120n, "5", 0n),
          makeLog(602n, 121n, "4", 0n),
          makeLog(603n, 122n, "3", 0n),
          makeLog(604n, 123n, "2", 0n),
        ],
        submissions: new Map([
          ["601", makeSubmission(601n, 10n, "Committed")],
          ["602", makeSubmission(602n, 11n, "Committed")],
          ["603", makeSubmission(603n, 12n, "Committed")],
          ["604", makeSubmission(604n, 13n, "Committed")],
        ]),
        projects: new Map([
          ["10", makeProject(10n, "MULTI", 150n, 700n)],
          ["11", makeProject(11n, "MULTI", 550n, 700n)],
          ["12", makeProject(12n, "UNIQUE", 0n, 0n)],
          ["13", makeProject(13n, "MULTI", 150n, 400n)],
        ]),
        queuedReveals: new Map([
          ["601", makeQueuedReveal(601n, 700n)],
          ["602", makeQueuedReveal(602n, 700n)],
          ["603", makeQueuedReveal(603n, 700n)],
          ["604", makeQueuedReveal(604n, 700n)],
        ]),
        executedSubmissionIds: [],
      }

      const result = await runMultiDeadlineScanner({
        config,
        plan,
        store,
        runtime: makeRuntime(runtimeState),
        nowMs: 110,
      })

      expect(result.executedSubmissionIds).toEqual([601n])
      expect(
        result.skipped.map((entry) => [entry.submissionId.toString(), entry.reason, entry.terminal]),
      ).toEqual([
        ["602", "COMMIT_DEADLINE_NOT_REACHED", false],
        ["603", "NOT_MULTI", true],
        ["604", "REVEAL_DEADLINE_PASSED", true],
      ])
      expect(pendingSubmissionIds(result.pendingQueueItems)).toEqual(["602"])
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
