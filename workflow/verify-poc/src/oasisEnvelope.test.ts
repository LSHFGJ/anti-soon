import { describe, expect, it } from "bun:test"
import {
  OASIS_ENVELOPE_VERSION,
  computeOasisCommitBindingHash,
  computeOasisEnvelopeHash,
  parseOasisEnvelope,
} from "./oasisEnvelope"

describe("oasis envelope", () => {
  it("accepts a valid envelope", () => {
    const parsed = parseOasisEnvelope({
      version: OASIS_ENVELOPE_VERSION,
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0x1111111111111111111111111111111111111111",
        slotId: "slot-42",
      },
      ciphertext: {
        ciphertextHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ivHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    })

    expect(parsed.pointer.contract).toBe("0x1111111111111111111111111111111111111111")
  })

  it("rejects malformed envelope", () => {
    expect(() =>
      parseOasisEnvelope({
        version: OASIS_ENVELOPE_VERSION,
        pointer: {
          chain: "oasis-sapphire-testnet",
          contract: "0x1111111111111111111111111111111111111111",
          slotId: "slot-42",
          extra: "nope",
        },
        ciphertext: {
          ciphertextHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          ivHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      })
    ).toThrow("Invalid Oasis envelope")
  })

  it("computes deterministic envelope and commit-binding hash", () => {
    const inputA = {
      version: OASIS_ENVELOPE_VERSION,
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
        slotId: "slot-42",
      },
      ciphertext: {
        ciphertextHash: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        ivHash: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      },
    }

    const inputB = {
      version: OASIS_ENVELOPE_VERSION,
      pointer: {
        chain: "oasis-sapphire-testnet",
        contract: "0xabcdefABCDEFabcdefabcdefabcdefABCDEFabcd",
        slotId: "slot-42",
      },
      ciphertext: {
        ciphertextHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ivHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    }

    const parsedA = parseOasisEnvelope(inputA)
    const parsedB = parseOasisEnvelope(inputB)

    const envelopeHashA = computeOasisEnvelopeHash(parsedA)
    const envelopeHashB = computeOasisEnvelopeHash(parsedB)
    expect(envelopeHashA).toBe(envelopeHashB)

    const sender = "0x1234567890123456789012345678901234567890"
    const salt = "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
    const commitHashA = computeOasisCommitBindingHash(parsedA, sender, salt)
    const commitHashB = computeOasisCommitBindingHash(parsedB, sender, salt)
    expect(commitHashA).toBe(commitHashB)
  })
})
