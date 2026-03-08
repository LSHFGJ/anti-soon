import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import * as idempotencyStoreModule from "./idempotencyStore"
import {
  deriveVerifyPocScopedIdempotencyKey,
  deriveVerifyPocSyncId,
  type VerifyPocIdempotencyInput,
} from "./idempotency"
import {
  assertDurableVerifyPocIdempotencyMappingStable,
  claimDurableVerifyPocIdempotencySlot,
  loadVerifyPocIdempotencyStore,
  markDurableVerifyPocIdempotencyCompleted,
  readVerifyPocIdempotencyStoreFile,
} from "./idempotencyStore"

function makeInput(overrides?: Partial<VerifyPocIdempotencyInput>): VerifyPocIdempotencyInput {
  return {
    mappingVersion: "anti-soon.verify-poc.revealed-map.v1",
    mappingMode: "poc_revealed",
    chainSelectorName: "ethereum-testnet-sepolia-1",
    bountyHubAddress: "0x1111111111111111111111111111111111111111",
    projectId: 7n,
    submissionId: 11n,
    txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    logIndex: 1n,
    ...overrides,
  }
}

describe("verify-poc durable idempotency store", () => {
  it("idempotency survives restart", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-idempotency-store-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const input = makeInput()
      const firstStore = loadVerifyPocIdempotencyStore(storePath, 1000)
      const mapped = assertDurableVerifyPocIdempotencyMappingStable(
        firstStore,
        input,
        1100,
      )
      const syncId = deriveVerifyPocSyncId({
        projectId: input.projectId,
        submissionId: input.submissionId,
        envelopeHash:
          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      })
      const scopedIdempotencyKey = deriveVerifyPocScopedIdempotencyKey({
        syncId,
        sourceEventFingerprint: mapped.sourceEventKey,
      })

      const firstClaim = claimDurableVerifyPocIdempotencySlot(
        firstStore,
        scopedIdempotencyKey,
        1200,
      )
      expect(firstClaim.shouldProcess).toBe(true)
      expect(firstClaim.reason).toBe("first_seen")

      markDurableVerifyPocIdempotencyCompleted(firstStore, scopedIdempotencyKey, 1300)

      const persistedAfterComplete = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persistedAfterComplete.syncStatusBySyncId[scopedIdempotencyKey]?.status,
      ).toBe("completed")
      expect(
        persistedAfterComplete.syncStatusBySyncId[scopedIdempotencyKey]?.updatedAtMs,
      ).toBe(1300)

      const restartedStore = loadVerifyPocIdempotencyStore(storePath, 2000)
      expect(restartedStore.recoveredProcessingCount).toBe(0)

      const replayClaim = claimDurableVerifyPocIdempotencySlot(
        restartedStore,
        scopedIdempotencyKey,
        2100,
      )
      expect(replayClaim.shouldProcess).toBe(false)
      expect(replayClaim.reason).toBe("already_completed")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("in-flight idempotency recovery is fail-closed", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-idempotency-store-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const input = makeInput({
        submissionId: 99n,
        txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      })

      const firstStore = loadVerifyPocIdempotencyStore(storePath, 100)
      const mapped = assertDurableVerifyPocIdempotencyMappingStable(
        firstStore,
        input,
        110,
      )
      const syncId = deriveVerifyPocSyncId({
        projectId: input.projectId,
        submissionId: input.submissionId,
        envelopeHash:
          "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      })
      const scopedIdempotencyKey = deriveVerifyPocScopedIdempotencyKey({
        syncId,
        sourceEventFingerprint: mapped.sourceEventKey,
      })

      const firstClaim = claimDurableVerifyPocIdempotencySlot(
        firstStore,
        scopedIdempotencyKey,
        120,
      )
      expect(firstClaim.shouldProcess).toBe(true)

      const restartedStore = loadVerifyPocIdempotencyStore(storePath, 500)
      expect(restartedStore.recoveredProcessingCount).toBe(1)

      const persistedAfterRecovery = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persistedAfterRecovery.syncStatusBySyncId[scopedIdempotencyKey]?.status,
      ).toBe("quarantined")
      expect(
        persistedAfterRecovery.syncStatusBySyncId[scopedIdempotencyKey]?.updatedAtMs,
      ).toBe(500)

      const blockedClaim = claimDurableVerifyPocIdempotencySlot(
        restartedStore,
        scopedIdempotencyKey,
        510,
      )
      expect(blockedClaim.shouldProcess).toBe(false)
      expect(blockedClaim.reason).toBe("quarantined")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("persists strict_failed terminal status across restart", () => {
    const markStrictFailed = (idempotencyStoreModule as Record<string, unknown>)
      .markDurableVerifyPocIdempotencyStrictFailed
    expect(typeof markStrictFailed).toBe("function")

    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-idempotency-store-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const input = makeInput({
        submissionId: 404n,
        txHash: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      })
      const firstStore = loadVerifyPocIdempotencyStore(storePath, 100)
      const mapped = assertDurableVerifyPocIdempotencyMappingStable(
        firstStore,
        input,
        110,
      )
      const syncId = deriveVerifyPocSyncId({
        projectId: input.projectId,
        submissionId: input.submissionId,
        envelopeHash:
          "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      })
      const scopedIdempotencyKey = deriveVerifyPocScopedIdempotencyKey({
        syncId,
        sourceEventFingerprint: mapped.sourceEventKey,
      })

      const firstClaim = claimDurableVerifyPocIdempotencySlot(
        firstStore,
        scopedIdempotencyKey,
        120,
      )
      expect(firstClaim.shouldProcess).toBe(true)

      ;(
        markStrictFailed as (
          store: ReturnType<typeof loadVerifyPocIdempotencyStore>,
          syncId: string,
          nowMs?: number,
        ) => void
      )(firstStore, scopedIdempotencyKey, 130)

      const persistedAfterStrictFail = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persistedAfterStrictFail.syncStatusBySyncId[scopedIdempotencyKey]?.status,
      ).toBe("strict_failed")
      expect(
        persistedAfterStrictFail.syncStatusBySyncId[scopedIdempotencyKey]?.updatedAtMs,
      ).toBe(130)

      const restartedStore = loadVerifyPocIdempotencyStore(storePath, 500)
      const replayClaim = claimDurableVerifyPocIdempotencySlot(
        restartedStore,
        scopedIdempotencyKey,
        510,
      )
      expect(replayClaim.shouldProcess).toBe(false)
      expect(replayClaim.reason).toBe("strict_failed")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
