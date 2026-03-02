import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT_ERROR } from "./idempotency"
import {
  assertDurableVerifyPocIdempotencyMappingStable,
  claimDurableVerifyPocIdempotencySlot,
  loadVerifyPocIdempotencyStore,
  markDurableVerifyPocIdempotencyCompleted,
  readVerifyPocIdempotencyStoreFile,
} from "./idempotencyStore"

function makeInput(mappingVersion: string = "anti-soon.verify-poc.idempotency-map.v1") {
  return {
    mappingVersion,
    mappingMode: "poc_revealed",
    chainSelectorName: "ethereum-testnet-sepolia-1",
    bountyHubAddress: "0x1111111111111111111111111111111111111111",
    projectId: 77n,
    submissionId: 9n,
    txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    logIndex: 4n,
  }
}

describe("verify-poc durable idempotency store", () => {
  it("deduplicates replayed syncId after restart using persisted completed status", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-idempotency-store-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const input = makeInput()
      const firstStore = loadVerifyPocIdempotencyStore(storePath, 1000)
      const firstMapped = assertDurableVerifyPocIdempotencyMappingStable(
        firstStore,
        input,
        1100,
      )
      const firstClaim = claimDurableVerifyPocIdempotencySlot(
        firstStore,
        firstMapped.idempotencyKey,
        undefined,
        1200,
      )

      expect(firstClaim.shouldProcess).toBe(true)
      expect(firstClaim.reason).toBe("first_seen")

      markDurableVerifyPocIdempotencyCompleted(
        firstStore,
        firstMapped.idempotencyKey,
        1300,
      )

      const persistedAfterComplete = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persistedAfterComplete.syncStatusBySyncId[firstMapped.idempotencyKey],
      ).toEqual({ status: "completed", updatedAtMs: 1300 })

      const restartedStore = loadVerifyPocIdempotencyStore(storePath, 2000)
      expect(restartedStore.recoveredProcessingCount).toBe(0)

      const replayMapped = assertDurableVerifyPocIdempotencyMappingStable(
        restartedStore,
        input,
        2100,
      )
      const replayClaim = claimDurableVerifyPocIdempotencySlot(
        restartedStore,
        replayMapped.idempotencyKey,
        undefined,
        2200,
      )

      expect(replayMapped.idempotencyKey).toBe(firstMapped.idempotencyKey)
      expect(replayClaim.shouldProcess).toBe(false)
      expect(replayClaim.reason).toBe("already_completed")
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("recovers stale processing state into quarantined and supports explicit reclaim", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-idempotency-store-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const input = makeInput()
      const firstStore = loadVerifyPocIdempotencyStore(storePath, 100)
      const mapped = assertDurableVerifyPocIdempotencyMappingStable(
        firstStore,
        input,
        110,
      )

      const claimed = claimDurableVerifyPocIdempotencySlot(
        firstStore,
        mapped.idempotencyKey,
        undefined,
        120,
      )
      expect(claimed.shouldProcess).toBe(true)

      const restartedStore = loadVerifyPocIdempotencyStore(storePath, 500)
      expect(restartedStore.recoveredProcessingCount).toBe(1)

      const persistedAfterRecovery = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persistedAfterRecovery.syncStatusBySyncId[mapped.idempotencyKey],
      ).toEqual({ status: "quarantined", updatedAtMs: 500 })

      const blockedClaim = claimDurableVerifyPocIdempotencySlot(
        restartedStore,
        mapped.idempotencyKey,
        undefined,
        510,
      )
      expect(blockedClaim.shouldProcess).toBe(false)
      expect(blockedClaim.reason).toBe("quarantined")

      const reclaimedClaim = claimDurableVerifyPocIdempotencySlot(
        restartedStore,
        mapped.idempotencyKey,
        { allowQuarantinedReclaim: true },
        520,
      )
      expect(reclaimedClaim.shouldProcess).toBe(true)
      expect(reclaimedClaim.reason).toBe("reclaimed_quarantined")

      const persistedAfterReclaim = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persistedAfterReclaim.syncStatusBySyncId[mapped.idempotencyKey],
      ).toEqual({ status: "processing", updatedAtMs: 520 })
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("persists source-event fingerprint mapping and fails closed on mapping drift", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "verify-poc-idempotency-store-"))
    const storePath = join(tempDir, "idempotency.json")

    try {
      const firstStore = loadVerifyPocIdempotencyStore(storePath, 100)
      const mapped = assertDurableVerifyPocIdempotencyMappingStable(
        firstStore,
        makeInput("anti-soon.verify-poc.idempotency-map.v1"),
        110,
      )

      const persisted = readVerifyPocIdempotencyStoreFile(storePath)
      expect(
        persisted.sourceEventMappingByFingerprint[mapped.sourceEventKey]
          .idempotencyKey,
      ).toBe(mapped.idempotencyKey)

      const restartedStore = loadVerifyPocIdempotencyStore(storePath, 200)
      expect(() =>
        assertDurableVerifyPocIdempotencyMappingStable(
          restartedStore,
          makeInput("anti-soon.verify-poc.idempotency-map.v2"),
          210,
        ),
      ).toThrow(VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT_ERROR)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
