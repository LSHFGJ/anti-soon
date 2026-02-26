import { describe, expect, it } from "bun:test"
import { computeOasisEnvelopeHash, OASIS_ENVELOPE_VERSION } from "./oasisEnvelope"
import {
  fetchAndValidateOasisAttestation,
  parseOasisReferenceUri,
  validateOasisAttestationPayload,
} from "./oasisAttestation"

const envelope = {
  version: OASIS_ENVELOPE_VERSION,
  pointer: {
    chain: "oasis-sapphire-testnet",
    contract: "0x1111111111111111111111111111111111111111",
    slotId: "slot-1",
  },
  ciphertext: {
    ciphertextHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ivHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  },
} as const

const envelopeHash = computeOasisEnvelopeHash(envelope)

describe("oasisAttestation", () => {
  it("parses oasis reference with pointer and envelope hash", () => {
    const parsed = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-1#${envelopeHash}`
    )

    expect(parsed.pointer.chain).toBe("oasis-sapphire-testnet")
    expect(parsed.pointer.contract).toBe("0x1111111111111111111111111111111111111111")
    expect(parsed.envelopeHash).toBe(envelopeHash)
  })

  it("validates attestation payload bound to reference and submission", () => {
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-1#${envelopeHash}`
    )

    const result = validateOasisAttestationPayload({
      reference,
      payload: {
        ok: true,
        pointer: reference.pointer,
        envelope,
        envelopeHash,
        observedAtMs: 1700000000000,
        submissionId: "7",
      },
      submissionId: 7n,
    })

    expect(result.ok).toBe(true)
  })

  it("rejects pointer mismatch deterministically", () => {
    const reference = parseOasisReferenceUri(
      `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-1#${envelopeHash}`
    )

    const result = validateOasisAttestationPayload({
      reference,
      payload: {
        ok: true,
        pointer: {
          chain: "oasis-sapphire-testnet",
          contract: "0x2222222222222222222222222222222222222222",
          slotId: "slot-1",
        },
        envelope,
        envelopeHash,
        observedAtMs: 1700000000000,
      },
      submissionId: 7n,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("expected pointer mismatch")
    }
    expect(result.error.kind).toBe("pointer_mismatch")
  })

  it("fetches attestation and classifies http failures", async () => {
    const fetchImpl = async () =>
      new Response("forbidden", {
        status: 403,
      })

    const result = await fetchAndValidateOasisAttestation({
      referenceUri: `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-1#${envelopeHash}`,
      submissionId: 7n,
      baseUrl: "https://api.example.com",
      fetchImpl,
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("expected http failure")
    }
    expect(result.error.kind).toBe("http")
    expect(result.error.statusCode).toBe(403)
  })

  it("fetches and validates a matching attestation payload", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          pointer: envelope.pointer,
          envelope,
          envelopeHash,
          observedAtMs: 1700000000000,
          submissionId: "7",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )

    const result = await fetchAndValidateOasisAttestation({
      referenceUri: `oasis://oasis-sapphire-testnet/0x1111111111111111111111111111111111111111/slot-1#${envelopeHash}`,
      submissionId: 7n,
      baseUrl: "https://api.example.com",
      fetchImpl,
    })

    expect(result.ok).toBe(true)
  })
})
