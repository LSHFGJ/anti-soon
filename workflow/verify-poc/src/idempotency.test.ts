import { describe, expect, it } from "bun:test"
import {
  claimVerifyPocIdempotencySlot,
  deriveVerifyPocIdempotencyKey,
  markVerifyPocIdempotencyCompleted,
  releaseVerifyPocIdempotencySlot,
  type VerifyPocIdempotencyStatus,
} from "./idempotency"

describe("verify-poc idempotency", () => {
  it("derives deterministic key for normalized equivalent input", () => {
    const inputA = {
      chainSelectorName: "ethereum-testnet-sepolia-1",
      bountyHubAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
      projectId: 42n,
      submissionId: 7n,
      txHash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      logIndex: 3n,
    }

    const inputB = {
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
})
