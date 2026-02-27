import { z } from "zod"
import { keccak256, toBytes } from "viem"
import {
  computeOasisEnvelopeHash,
  parseOasisEnvelope,
  type OasisEnvelope,
  type OasisPointer,
} from "./oasisEnvelope"
import type { OasisReference } from "./oasisAttestation"

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be 0x-prefixed 32-byte hex")

const pointerSchema = z
  .object({
    chain: z.string().min(1),
    contract: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    slotId: z.string().min(1),
  })
  .strict()

const rpcPayloadSchema = z
  .object({
    ok: z.literal(true),
    pointer: pointerSchema,
    envelope: z.unknown(),
    envelopeHash: bytes32Schema,
    submissionId: z.string().optional(),
    poc: z.unknown(),
  })
  .passthrough()

export type OasisRpcPayloadErrorKind =
  | "invalid_payload"
  | "pointer_mismatch"
  | "envelope_hash_mismatch"
  | "poc_hash_mismatch"
  | "submission_mismatch"

export type OasisRpcPayloadError = {
  kind: OasisRpcPayloadErrorKind
  message: string
}

export type OasisRpcPayload = {
  pointer: OasisPointer
  envelope: OasisEnvelope
  envelopeHash: `0x${string}`
  submissionId?: string
  poc: unknown
}

export type OasisRpcPayloadResult =
  | { ok: true; data: OasisRpcPayload }
  | { ok: false; error: OasisRpcPayloadError }

function normalizePointer(pointer: OasisPointer): OasisPointer {
  return {
    chain: pointer.chain,
    contract: pointer.contract.toLowerCase(),
    slotId: pointer.slotId,
  }
}

function pointerKey(pointer: OasisPointer): string {
  return `${pointer.chain}/${pointer.contract.toLowerCase()}/${pointer.slotId}`
}

export function validateOasisRpcPayload(args: {
  reference: OasisReference
  submissionId: bigint
  payload: unknown
}): OasisRpcPayloadResult {
  const parsed = rpcPayloadSchema.safeParse(args.payload)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message: `Invalid oasis rpc payload: ${parsed.error.message}`,
      },
    }
  }

  if (parsed.data.poc === undefined) {
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message: "RPC payload must include `poc`",
      },
    }
  }

  const pointer = normalizePointer(parsed.data.pointer)
  if (pointerKey(pointer) !== pointerKey(args.reference.pointer)) {
    return {
      ok: false,
      error: {
        kind: "pointer_mismatch",
        message: "RPC payload pointer does not match Oasis reference",
      },
    }
  }

  let envelope: OasisEnvelope
  try {
    envelope = parseOasisEnvelope(parsed.data.envelope)
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message: error instanceof Error ? error.message : "Invalid envelope",
      },
    }
  }

  const declaredHash = parsed.data.envelopeHash.toLowerCase() as `0x${string}`
  const computedHash = computeOasisEnvelopeHash(envelope).toLowerCase() as `0x${string}`
  if (declaredHash !== computedHash) {
    return {
      ok: false,
      error: {
        kind: "envelope_hash_mismatch",
        message: "Envelope hash does not match computed envelope hash",
      },
    }
  }

  if (args.reference.envelopeHash && args.reference.envelopeHash !== declaredHash) {
    return {
      ok: false,
      error: {
        kind: "envelope_hash_mismatch",
        message: "Envelope hash does not match oasis reference hash",
      },
    }
  }

  let pocHash: `0x${string}`
  try {
    pocHash = keccak256(toBytes(JSON.stringify(parsed.data.poc))).toLowerCase() as `0x${string}`
  } catch {
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message: "RPC payload `poc` must be JSON-serializable",
      },
    }
  }

  const ciphertextHash = envelope.ciphertext.ciphertextHash.toLowerCase() as `0x${string}`
  const ivHash = envelope.ciphertext.ivHash.toLowerCase() as `0x${string}`
  if (pocHash !== ciphertextHash || pocHash !== ivHash) {
    return {
      ok: false,
      error: {
        kind: "poc_hash_mismatch",
        message: "RPC payload poc hash does not match envelope ciphertext hashes",
      },
    }
  }

  const expectedSubmissionId = args.submissionId.toString()
  if (parsed.data.submissionId !== undefined && parsed.data.submissionId !== expectedSubmissionId) {
    return {
      ok: false,
      error: {
        kind: "submission_mismatch",
        message: "RPC payload submissionId does not match expected submissionId",
      },
    }
  }

  return {
    ok: true,
    data: {
      pointer,
      envelope,
      envelopeHash: declaredHash,
      submissionId: parsed.data.submissionId,
      poc: parsed.data.poc,
    },
  }
}
