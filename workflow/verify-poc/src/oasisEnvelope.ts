import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem"
import { z } from "zod"

export const OASIS_ENVELOPE_VERSION = "anti-soon.oasis-envelope.v1" as const

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be 0x-prefixed 32-byte hex")

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be 0x-prefixed 20-byte address")

const oasisPointerSchema = z
  .object({
    chain: z.string().min(1),
    contract: addressSchema,
    slotId: z.string().min(1),
  })
  .strict()

const oasisEnvelopeSchema = z
  .object({
    version: z.literal(OASIS_ENVELOPE_VERSION),
    pointer: oasisPointerSchema,
    ciphertext: z
      .object({
        ciphertextHash: bytes32Schema,
        ivHash: bytes32Schema,
      })
      .strict(),
  })
  .strict()

type OasisEnvelopeSchema = z.infer<typeof oasisEnvelopeSchema>

export type OasisPointer = OasisEnvelopeSchema["pointer"]
export type OasisCiphertextDescriptor = OasisEnvelopeSchema["ciphertext"]
export type OasisEnvelope = OasisEnvelopeSchema

const envelopeHashParams = parseAbiParameters(
  "string version, string chain, address contractAddr, string slotId, bytes32 ciphertextHash, bytes32 ivHash"
)

const commitBindingParams = parseAbiParameters("bytes32 envelopeHash, address sender, bytes32 salt")

function formatZodPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "root"
  }
  return path.join(".")
}

function normalizeEnvelope(envelope: OasisEnvelopeSchema): OasisEnvelope {
  return {
    version: envelope.version,
    pointer: {
      chain: envelope.pointer.chain,
      contract: envelope.pointer.contract.toLowerCase(),
      slotId: envelope.pointer.slotId,
    },
    ciphertext: {
      ciphertextHash: envelope.ciphertext.ciphertextHash.toLowerCase(),
      ivHash: envelope.ciphertext.ivHash.toLowerCase(),
    },
  }
}

export function parseOasisEnvelope(value: unknown): OasisEnvelope {
  const parsed = oasisEnvelopeSchema.safeParse(value)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${formatZodPath(issue.path)}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid Oasis envelope: ${details}`)
  }
  return normalizeEnvelope(parsed.data)
}

export function serializeOasisEnvelopeCanonical(envelope: OasisEnvelope): string {
  const normalized = normalizeEnvelope(envelope)
  return JSON.stringify({
    version: normalized.version,
    pointer: {
      chain: normalized.pointer.chain,
      contract: normalized.pointer.contract,
      slotId: normalized.pointer.slotId,
    },
    ciphertext: {
      ciphertextHash: normalized.ciphertext.ciphertextHash,
      ivHash: normalized.ciphertext.ivHash,
    },
  })
}

export function computeOasisEnvelopeHash(envelope: OasisEnvelope): `0x${string}` {
  const normalized = normalizeEnvelope(envelope)
  const encoded = encodeAbiParameters(envelopeHashParams, [
    normalized.version,
    normalized.pointer.chain,
    normalized.pointer.contract as `0x${string}`,
    normalized.pointer.slotId,
    normalized.ciphertext.ciphertextHash as `0x${string}`,
    normalized.ciphertext.ivHash as `0x${string}`,
  ])
  return keccak256(encoded)
}

export function computeOasisCommitBindingHash(
  envelope: OasisEnvelope,
  sender: `0x${string}`,
  salt: `0x${string}`
): `0x${string}` {
  const envelopeHash = computeOasisEnvelopeHash(envelope)
  const encoded = encodeAbiParameters(commitBindingParams, [envelopeHash, sender, salt])
  return keccak256(encoded)
}
