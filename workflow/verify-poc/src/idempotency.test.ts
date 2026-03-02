import { describe, expect, it } from "bun:test"
import {
  assertVerifyPocIdempotencyMappingStable,
  claimVerifyPocIdempotencySlot,
  deriveVerifyPocIdempotencyKey,
  markVerifyPocIdempotencyCompleted,
  markVerifyPocIdempotencyQuarantined,
  releaseVerifyPocIdempotencySlot,
  VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT_ERROR,
  type VerifyPocIdempotencyMappingState,
  type VerifyPocIdempotencyStatus,
} from "./idempotency"

describe("verify-poc idempotency", () => {
  it("derives deterministic key for normalized equivalent input", () => {
    const inputA = {
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v1",
      mappingMode: "poc_revealed",
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
      projectId: 42n,
      submissionId: 7n,
      txHash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      logIndex: 3n,
    }

    const inputB = {
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v1",
      mappingMode: "poc_revealed",
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      projectId: 42n,
      submissionId: 7n,
      txHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      logIndex: 3n,
    }

    expect(deriveVerifyPocIdempotencyKey(inputA)).toBe(
      deriveVerifyPocIdempotencyKey(inputB)
    )
  })

  it("changes key when submission identity changes", () => {
    const base = {
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v1",
      mappingMode: "poc_revealed",
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0x1111111111111111111111111111111111111111",
      projectId: 1n,
      submissionId: 9n,
      txHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      logIndex: 0n,
    }

    const changed = {
      ...base,
      submissionId: 10n,
    }

    expect(deriveVerifyPocIdempotencyKey(base) === deriveVerifyPocIdempotencyKey(changed)).toBe(false)
  })

  it("allows first claim and skips duplicate claims", () => {
    const state = new Map<string, VerifyPocIdempotencyStatus>()
    const key = "0x1234"

    const first = claimVerifyPocIdempotencySlot(state, key)
    expect(first.shouldProcess).toBe(true)
    expect(first.reason).toBe("first_seen")

    const duplicateWhileProcessing = claimVerifyPocIdempotencySlot(state, key)
    expect(duplicateWhileProcessing.shouldProcess).toBe(false)
    expect(duplicateWhileProcessing.reason).toBe("in_flight")

    markVerifyPocIdempotencyCompleted(state, key)
    const duplicateAfterComplete = claimVerifyPocIdempotencySlot(state, key)
    expect(duplicateAfterComplete.shouldProcess).toBe(false)
    expect(duplicateAfterComplete.reason).toBe("already_completed")
  })

  it("stores mapping for source event and permits deterministic duplicate no-op", () => {
    const mappingState = new Map<string, VerifyPocIdempotencyMappingState>()
    const processingState = new Map<string, VerifyPocIdempotencyStatus>()
    const input = {
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v1",
      mappingMode: "poc_revealed",
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0x1111111111111111111111111111111111111111",
      projectId: 3n,
      submissionId: 5n,
      txHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      logIndex: 1n,
    }

    const first = assertVerifyPocIdempotencyMappingStable(mappingState, input)
    const claim = claimVerifyPocIdempotencySlot(processingState, first.idempotencyKey)
    expect(claim.shouldProcess).toBe(true)
    markVerifyPocIdempotencyCompleted(processingState, first.idempotencyKey)

    const duplicate = assertVerifyPocIdempotencyMappingStable(mappingState, input)
    expect(duplicate.sourceEventKey).toBe(first.sourceEventKey)
    expect(duplicate.idempotencyKey).toBe(first.idempotencyKey)

    const duplicateClaim = claimVerifyPocIdempotencySlot(processingState, duplicate.idempotencyKey)
    expect(duplicateClaim.shouldProcess).toBe(false)
    expect(duplicateClaim.reason).toBe("already_completed")
  })

  it("fails closed on mapping drift for same source event", () => {
    const mappingState = new Map<string, VerifyPocIdempotencyMappingState>()
    const base = {
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v1",
      mappingMode: "poc_revealed",
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0x1111111111111111111111111111111111111111",
      projectId: 22n,
      submissionId: 99n,
      txHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      logIndex: 9n,
    }

    assertVerifyPocIdempotencyMappingStable(mappingState, base)

    const drifted = {
      ...base,
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v2",
    }

    expect(() => assertVerifyPocIdempotencyMappingStable(mappingState, drifted)).toThrow(
      VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT_ERROR
    )
  })

  it("rejects replayed source event after successful completion", () => {
    const mappingState = new Map<string, VerifyPocIdempotencyMappingState>()
    const processingState = new Map<string, VerifyPocIdempotencyStatus>()
    const input = {
      mappingVersion: "anti-soon.verify-poc.idempotency-map.v1",
      mappingMode: "poc_revealed",
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0x1111111111111111111111111111111111111111",
      projectId: 44n,
      submissionId: 12n,
      txHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      logIndex: 2n,
    }

    const mapped = assertVerifyPocIdempotencyMappingStable(mappingState, input)
    const firstClaim = claimVerifyPocIdempotencySlot(processingState, mapped.idempotencyKey)
    expect(firstClaim.shouldProcess).toBe(true)
    markVerifyPocIdempotencyCompleted(processingState, mapped.idempotencyKey)

    const replayMapped = assertVerifyPocIdempotencyMappingStable(mappingState, input)
    const replayClaim = claimVerifyPocIdempotencySlot(processingState, replayMapped.idempotencyKey)
    expect(replayClaim.shouldProcess).toBe(false)
    expect(replayClaim.reason).toBe("already_completed")
  })

  it("releases processing slot on failure to allow retry", () => {
    const state = new Map<string, VerifyPocIdempotencyStatus>()
    const key = "0xabcd"

    const first = claimVerifyPocIdempotencySlot(state, key)
    expect(first.shouldProcess).toBe(true)

    releaseVerifyPocIdempotencySlot(state, key)

    const retry = claimVerifyPocIdempotencySlot(state, key)
    expect(retry.shouldProcess).toBe(true)
    expect(retry.reason).toBe("first_seen")
  })

  it("fails closed for quarantined status unless reclaim is explicitly enabled", () => {
    const state = new Map<string, VerifyPocIdempotencyStatus>()
    const key = "0xfeed"

    markVerifyPocIdempotencyQuarantined(state, key)

    const blocked = claimVerifyPocIdempotencySlot(state, key)
    expect(blocked.shouldProcess).toBe(false)
    expect(blocked.reason).toBe("quarantined")

    const reclaimed = claimVerifyPocIdempotencySlot(state, key, {
      allowQuarantinedReclaim: true,
    })
    expect(reclaimed.shouldProcess).toBe(true)
    expect(reclaimed.reason).toBe("reclaimed_quarantined")
  })
})
