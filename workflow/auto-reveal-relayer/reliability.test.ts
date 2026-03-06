import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as runOnceModule from "./run-once"

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
}

type CursorStoreLike = {
  recoveredProcessingCount: number
}

type QueueItemDecisionLike = {
  shouldProcess: boolean
  reason: string
}

type QueueItemIdentityLike = {
  chainId: number
  bountyHubAddress: `0x${string}`
  queueTxHash: `0x${string}`
  queueLogIndex: bigint
  queuedBlockNumber: bigint
  projectId: bigint
  submissionId: bigint
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>
}

function requireFunction<T extends (...args: never[]) => unknown>(name: string): T {
  const candidate = (runOnceModule as Record<string, unknown>)[name]
  expect(typeof candidate).toBe("function")
  return candidate as T
}

describe("auto-reveal-relayer reliability primitives", () => {
  it("replay overlap plan loads the durable cursor anchor", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-cursor-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      writeFileSync(
        cursorPath,
        `${JSON.stringify(
          {
            schemaVersion: "anti-soon.auto-reveal.cursor-store.v1",
            cursor: {
              lastFinalizedBlock: "120",
              updatedAtMs: 100,
            },
            queueItemStatusByIdempotencyKey: {},
          },
          null,
          2,
        )}\n`,
        "utf8",
      )

      const out: string[] = []
      const err: string[] = []
      const exitCode = await runOnceModule.runOnceCommand(
        ["--cursor-file", cursorPath],
        {
          ...validEnv,
          AUTO_REVEAL_CURSOR_FILE: cursorPath,
        },
        {
          stdout: (line) => out.push(line),
          stderr: (line) => err.push(line),
        },
      )

      expect(exitCode).toBe(0)
      expect(err).toHaveLength(0)

      const plan = JSON.parse(out.join("\n")) as Record<string, string>
      expect(plan.cursorLastFinalizedBlock).toBe("120")
      expect(plan.fromBlock).toBe("109")
      expect(plan.toBlock).toBe("5108")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("crash recovery quarantines in-flight queue items and fails closed", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-restart-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      writeFileSync(
        cursorPath,
        `${JSON.stringify(
          {
            schemaVersion: "anti-soon.auto-reveal.cursor-store.v1",
            cursor: {
              lastFinalizedBlock: "120",
              updatedAtMs: 100,
            },
            queueItemStatusByIdempotencyKey: {
              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa": {
                status: "processing",
                blockNumber: "120",
                updatedAtMs: 110,
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      )

      const out: string[] = []
      const err: string[] = []
      const exitCode = await runOnceModule.runOnceCommand(
        ["--cursor-file", cursorPath],
        {
          ...validEnv,
          AUTO_REVEAL_CURSOR_FILE: cursorPath,
        },
        {
          stdout: (line) => out.push(line),
          stderr: (line) => err.push(line),
        },
      )

      expect(exitCode).toBe(1)
      expect(out).toHaveLength(0)
      expect(err.join("\n")).toContain("quarantined")

      const persisted = readJson(cursorPath)
      const queueItemStatusByIdempotencyKey =
        persisted.queueItemStatusByIdempotencyKey as Record<
          string,
          { status: string; updatedAtMs: number }
        >

      expect(
        queueItemStatusByIdempotencyKey[
          "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        ]?.status,
      ).toBe("quarantined")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("replay overlap dedupes completed queue items with durable idempotency keys", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "auto-reveal-relayer-idempotency-"))
    const cursorPath = join(tempDir, "cursor.json")

    try {
      const loadAutoRevealCursorStore = requireFunction<
        (filePath: string, nowMs?: number) => CursorStoreLike
      >("loadAutoRevealCursorStore")
      const deriveAutoRevealQueueItemIdempotencyKey = requireFunction<
        (item: QueueItemIdentityLike) => string
      >("deriveAutoRevealQueueItemIdempotencyKey")
      const claimDurableAutoRevealQueueItem = requireFunction<
        (
          store: CursorStoreLike,
          idempotencyKey: string,
          blockNumber: bigint,
          nowMs?: number,
        ) => QueueItemDecisionLike
      >("claimDurableAutoRevealQueueItem")
      const markDurableAutoRevealQueueItemCompleted = requireFunction<
        (
          store: CursorStoreLike,
          idempotencyKey: string,
          nowMs?: number,
        ) => void
      >("markDurableAutoRevealQueueItemCompleted")
      const advanceDurableAutoRevealCursor = requireFunction<
        (
          store: CursorStoreLike,
          nextLastFinalizedBlock: bigint,
          nowMs?: number,
        ) => bigint
      >("advanceDurableAutoRevealCursor")

      const queueItem = {
        chainId: 11155111,
        bountyHubAddress:
          "0x17797b473864806072186f6997801D4473AAF6e8" as `0x${string}`,
        queueTxHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`,
        queueLogIndex: 7n,
        queuedBlockNumber: 120n,
        projectId: 42n,
        submissionId: 99n,
      }

      const firstStore = loadAutoRevealCursorStore(cursorPath, 100)
      const key = deriveAutoRevealQueueItemIdempotencyKey(queueItem)
      const firstClaim = claimDurableAutoRevealQueueItem(
        firstStore,
        key,
        queueItem.queuedBlockNumber,
        110,
      )

      expect(firstClaim.shouldProcess).toBe(true)
      expect(firstClaim.reason).toBe("first_seen")

      markDurableAutoRevealQueueItemCompleted(firstStore, key, 120)
      expect(advanceDurableAutoRevealCursor(firstStore, queueItem.queuedBlockNumber, 130)).toBe(120n)

      const restartedStore = loadAutoRevealCursorStore(cursorPath, 200)
      expect(restartedStore.recoveredProcessingCount).toBe(0)

      const replayClaim = claimDurableAutoRevealQueueItem(
        restartedStore,
        key,
        queueItem.queuedBlockNumber,
        210,
      )

      expect(replayClaim.shouldProcess).toBe(false)
      expect(replayClaim.reason).toBe("already_completed")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
