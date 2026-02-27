import { describe, expect, it } from "bun:test"
import { computeOasisEnvelopeHash, OASIS_ENVELOPE_VERSION } from "./oasisEnvelope"
import {
  parseOasisRpcTxSlotId,
  resolveOasisRpcTxHash,
  validateOasisRpcPayload,
} from "./oasisRpcRead"
import { parseOasisReferenceUri } from "./oasisAttestation"

const envelope = {
  version: OASIS_ENVELOPE_VERSION,
  pointer: {
    chain: "oasis-sapphire-testnet",
    contract: "0x1111111111111111111111111111111111111111",
    slotId: "tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
  ciphertext: {
    ciphertextHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ivHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
} as const

const envelopeHash = computeOasisEnvelopeHash(envelope)

describe("oasisRpcRead", () => {
  it("extracts tx hash from tx-prefixed slot ids", () => {
    const txHash = parseOasisRpcTxSlotId("tx-0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    expect(txHash).toBe("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
  })

  it("rejects non tx-prefixed slot ids", () => {
    expect(() => parseOasisRpcTxSlotId("slot-42")).toThrow("must be tx-0x")
  })

  it("uses uri fragment as rpc tx hash when slot id is not tx-prefixed", () => {
    const reference = parseOasisReferenceUri(
      "oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-42#0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    )
    expect(resolveOasisRpcTxHash(reference)).toBe(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    )
  })

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
        poc: {
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
        },
      },
    })

    expect(result.ok).toBe(true)
  })

  it("does not bind reference fragment hash for non tx-prefixed slot ids", () => {
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
        poc: {
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
        },
      },
    })

    expect(result.ok).toBe(true)
  })

  it("accepts encrypted payloads without plaintext poc field", () => {
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
        encryptedPoc: {
          algorithm: "aes-256-gcm",
          ciphertextHex: "0x12",
          ivHex: "0x34",
        },
      },
    })

    expect(result.ok).toBe(true)
  })

  it("rejects payloads that omit poc and encryptedPoc", () => {
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
