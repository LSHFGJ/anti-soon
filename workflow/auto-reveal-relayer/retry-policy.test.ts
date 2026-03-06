import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT,
  AUTO_REVEAL_REASON_RETRY_EXHAUSTED,
  AUTO_REVEAL_REASON_TERMINAL_INVALID_PAYLOAD,
  runAutoRevealWithRetry,
  type AutoRevealFailureMetricEvent,
} from "./retry-policy"
import { buildRunOncePlan, loadAutoRevealCursorStore, loadRunOnceConfig } from "./run-once"
import {
  runMultiDeadlineScanner,
  type MultiDeadlineRuntime,
  type MultiProjectSnapshot,
  type MultiQueuedRevealLog,
  type MultiQueuedRevealSnapshot,
  type MultiSubmissionSnapshot,
} from "./multi-deadline"

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
  executeBehavior: (submissionId: bigint, attempt: number) => Promise<void> | void
}

function makeProject(
  projectId: bigint,
  mode: "UNIQUE" | "MULTI",
  commitDeadline: bigint,
  revealDeadline: bigint,
): MultiProjectSnapshot {
  return { projectId, mode, commitDeadline, revealDeadline }
}

function makeSubmission(
  submissionId: bigint,
  projectId: bigint,
  status: "Committed" | "Revealed" | "Verified" | "Invalid",
): MultiSubmissionSnapshot {
  return { submissionId, projectId, status }
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
  const attemptsBySubmission = new Map<string, number>()

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
      const nextAttempt = (attemptsBySubmission.get(submissionId.toString()) ?? 0) + 1
      attemptsBySubmission.set(submissionId.toString(), nextAttempt)
      await state.executeBehavior(submissionId, nextAttempt)
      state.executedSubmissionIds.push(submissionId)
      const currentSubmission = state.submissions.get(submissionId.toString())
      if (!currentSubmission) {
        throw new Error(`missing submission ${submissionId.toString()}`)
      }
      state.submissions.set(
        submissionId.toString(),
        makeSubmission(
          submissionId,
          currentSubmission.projectId,
          "Revealed",
        ),
      )
      state.queuedReveals.set(
        submissionId.toString(),
        makeQueuedReveal(submissionId, 0n, false),
      )
      return {
        txHash:
          `0x${submissionId.toString(16).padStart(64, "0")}` as `0x${string}`,
      }
    },
  }
}

describe("auto-reveal-relayer retry policy", () => {
  it("retry policy recovers transient failures with bounded backoff and retryable reason metrics", async () => {
    const delays: number[] = []
    const metrics: AutoRevealFailureMetricEvent[] = []
    let attempts = 0

    const result = await runAutoRevealWithRetry({
      operation: "executeQueuedReveal",
      idempotencyKey: "0xabc",
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 250,
        backoffMultiplier: 2,
        maxDelayMs: 2000,
      },
      sleep: async (delayMs) => {
        delays.push(delayMs)
      },
      onMetric: (event) => metrics.push(event),
      execute: async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error("upstream busy")
        }
        return "ok"
      },
    })

    expect(result).toBe("ok")
    expect(attempts).toBe(3)
    expect(delays).toEqual([250, 500])
    expect(
      metrics.map((event) => [event.transition, event.reason_code, event.attempt]),
    ).toEqual([
      ["RETRY_SCHEDULED", AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT, 1],
      ["RETRY_SCHEDULED", AUTO_REVEAL_REASON_RETRYABLE_RPC_TRANSIENT, 2],
    ])
  })

  it("quarantine reason metrics persist after retry exhausted", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-retry-exhausted-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({ ...validEnv, AUTO_REVEAL_CURSOR_FILE: cursorPath })
      const store = loadAutoRevealCursorStore(cursorPath, 100)
      const plan = buildRunOncePlan(config, store.cursorLastFinalizedBlock)
      const metrics: AutoRevealFailureMetricEvent[] = []
      const runtimeState: RuntimeState = {
        nowTimestampSec: 300n,
        logs: [makeLog(501n, 120n, "a", 0n)],
        submissions: new Map([["501", makeSubmission(501n, 5n, "Committed")]]),
        projects: new Map([["5", makeProject(5n, "MULTI", 150n, 600n)]]),
        queuedReveals: new Map([["501", makeQueuedReveal(501n, 900n)]]),
        executedSubmissionIds: [],
        executeBehavior: async () => {
          const error = new Error("timeout while reaching relayer upstream") as Error & {
            name: string
          }
          error.name = "TimeoutError"
          throw error
        },
      }

      let exhaustedMessage = ""
      try {
        await runMultiDeadlineScanner({
          config,
          plan,
          store,
          runtime: makeRuntime(runtimeState),
          nowMs: 110,
          retryPolicy: {
            maxAttempts: 3,
            baseDelayMs: 250,
            backoffMultiplier: 2,
            maxDelayMs: 2000,
          },
          recordMetric: (event) => metrics.push(event),
        })
      } catch (error) {
        exhaustedMessage = error instanceof Error ? error.message : String(error)
      }

      expect(exhaustedMessage).toContain(AUTO_REVEAL_REASON_RETRY_EXHAUSTED)

      expect(store.quarantinedItemCount).toBe(1)
      expect(
        metrics.some(
          (event) =>
            event.transition === "EXECUTION_FAILED"
            && event.reason_code === AUTO_REVEAL_REASON_RETRY_EXHAUSTED
            && event.quarantine_state === "QUARANTINED",
        ),
      ).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("terminal reason classification avoids retry on invalid payload errors", async () => {
    const delays: number[] = []
    const metrics: AutoRevealFailureMetricEvent[] = []
    let attempts = 0

    let terminalMessage = ""
    try {
      await runAutoRevealWithRetry({
        operation: "executeQueuedReveal",
        idempotencyKey: "0xdef",
        sleep: async (delayMs) => {
          delays.push(delayMs)
        },
        onMetric: (event) => metrics.push(event),
        execute: async () => {
          attempts += 1
          throw new Error("payload validation failed: returned empty payload")
        },
      })
    } catch (error) {
      terminalMessage = error instanceof Error ? error.message : String(error)
    }

    expect(terminalMessage).toContain(AUTO_REVEAL_REASON_TERMINAL_INVALID_PAYLOAD)

    expect(attempts).toBe(1)
    expect(delays).toEqual([])
    expect(
      metrics.map((event) => [event.transition, event.reason_code]),
    ).toEqual([["EXECUTION_FAILED", AUTO_REVEAL_REASON_TERMINAL_INVALID_PAYLOAD]])
  })

  it("duplicate replay writes once after transient execution retry", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-duplicate-replay-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const config = loadRunOnceConfig({
        ...validEnv,
        AUTO_REVEAL_CURSOR_FILE: cursorPath,
        AUTO_REVEAL_LOOKBACK_BLOCKS: "20",
      })
      let transientFailures = 0
      const runtimeState: RuntimeState = {
        nowTimestampSec: 300n,
        logs: [makeLog(601n, 10n, "b", 0n)],
        submissions: new Map([["601", makeSubmission(601n, 6n, "Committed")]]),
        projects: new Map([["6", makeProject(6n, "MULTI", 150n, 600n)]]),
        queuedReveals: new Map([["601", makeQueuedReveal(601n, 900n)]]),
        executedSubmissionIds: [],
        executeBehavior: async () => {
          transientFailures += 1
          if (transientFailures === 1) {
            throw new Error("upstream busy")
          }
        },
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

      expect(firstResult.executedSubmissionIds).toEqual([601n])
      expect(runtimeState.executedSubmissionIds).toEqual([601n])

      runtimeState.logs = [makeLog(601n, 10n, "b", 0n)]

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
      expect(runtimeState.executedSubmissionIds).toEqual([601n])
      expect(
        secondResult.skipped.some(
          (entry) =>
            entry.submissionId === 601n
            && (
              entry.reason === "ALREADY_COMPLETED"
              || entry.reason === "SUBMISSION_NOT_COMMITTED"
            ),
        ),
      ).toBe(true)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
