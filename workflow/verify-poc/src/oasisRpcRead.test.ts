import { describe, expect, it } from "bun:test"
import { keccak256, toBytes } from "viem"
import { computeOasisEnvelopeHash, OASIS_ENVELOPE_VERSION } from "./oasisEnvelope"
import {
  validateOasisRpcPayload,
} from "./oasisRpcRead"
import { parseOasisReferenceUri } from "./oasisAttestation"

const validPoc = {
  target: {
    contract: "0x1111111111111111111111111111111111111111",
    chain: 11155111,
    forkBlock: 1,
  },
  setup: [],
  transactions: [],
  expectedImpact: {
    type: "fundsDrained",
    estimatedLoss: "1",
    description: "x",
  },
} as const

const pocHash = keccak256(toBytes(JSON.stringify(validPoc)))

const envelope = {
  version: OASIS_ENVELOPE_VERSION,
  pointer: {
    chain: "oasis-sapphire-testnet",
    contract: "0x1111111111111111111111111111111111111111",
    slotId: "tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  ciphertext: {
    ciphertextHash: pocHash,
    ivHash: pocHash,
  },
} as const

const envelopeHash = computeOasisEnvelopeHash(envelope)

describe("oasisRpcRead", () => {
  it("validates rpc payload bound to reference and submission", () => {
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#${envelopeHash}`
    )

    const result = validateOasisRpcPayload({
      reference,
      submissionId: 5n,
      payload: {
        ok: true,
        pointer: envelope.pointer,
        envelope,
        envelopeHash,
        submissionId: "5",
        poc: validPoc,
      },
    })

    expect(result.ok).toBe(true)
  })

  it("rejects non tx-prefixed slot ids when reference fragment hash mismatches", () => {
    const reference = parseOasisReferenceUri(
      "oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    )

    const result = validateOasisRpcPayload({
      reference,
      submissionId: 5n,
      payload: {
        ok: true,
        pointer: {
          ...envelope.pointer,
          slotId: "slot-42",
        },
        envelope: {
          ...envelope,
          pointer: {
            ...envelope.pointer,
            slotId: "slot-42",
          },
        },
        envelopeHash: computeOasisEnvelopeHash({
          ...envelope,
          pointer: {
            ...envelope.pointer,
            slotId: "slot-42",
          },
        }),
        submissionId: "5",
        poc: validPoc,
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("envelope_hash_mismatch")
      expect(result.error.message).toBe("Envelope hash does not match oasis reference hash")
    }
  })

  it("accepts non tx-prefixed slot ids when reference fragment hash matches", () => {
    const slotEnvelope = {
      ...envelope,
      pointer: {
        ...envelope.pointer,
        slotId: "slot-42",
      },
    }
    const slotEnvelopeHash = computeOasisEnvelopeHash(slotEnvelope)
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#${slotEnvelopeHash}`
    )

    const result = validateOasisRpcPayload({
      reference,
      submissionId: 5n,
      payload: {
        ok: true,
        pointer: slotEnvelope.pointer,
        envelope: slotEnvelope,
        envelopeHash: slotEnvelopeHash,
        submissionId: "5",
        poc: validPoc,
      },
    })

    expect(result.ok).toBe(true)
  })

  it("rejects payloads that omit poc", () => {
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#${envelopeHash}`
    )

    const result = validateOasisRpcPayload({
      reference,
      submissionId: 5n,
      payload: {
        ok: true,
        pointer: envelope.pointer,
        envelope,
        envelopeHash,
        submissionId: "5",
        legacyCipherPayload: {
          algorithm: "legacy-format-v0",
          ciphertextHex: "0x12",
          ivHex: "0x34",
        },
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_payload")
      expect(result.error.message).toBe("RPC payload must include `poc`")
    }
  })

  it("rejects payloads when poc hash mismatches envelope ciphertext hashes", () => {
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#${envelopeHash}`
    )

    const result = validateOasisRpcPayload({
      reference,
      submissionId: 5n,
      payload: {
        ok: true,
        pointer: envelope.pointer,
        envelope,
        envelopeHash,
        submissionId: "5",
        poc: {
          ...validPoc,
          expectedImpact: {
            ...validPoc.expectedImpact,
            description: "tampered",
          },
        },
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("poc_hash_mismatch")
      expect(result.error.message).toBe("RPC payload poc hash does not match envelope ciphertext hashes")
    }
  })

  it("rejects payloads that only include envelope metadata", () => {
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#${envelopeHash}`
    )

    const result = validateOasisRpcPayload({
      reference,
      submissionId: 5n,
      payload: {
        ok: true,
        pointer: envelope.pointer,
        envelope,
        envelopeHash,
        submissionId: "5",
      },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_payload")
    }
  })
})
