import { z } from "zod"
import {
  computeOasisEnvelopeHash,
  parseOasisEnvelope,
  type OasisEnvelope,
  type OasisPointer,
} from "./oasisEnvelope"

const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "must be 0x-prefixed 32-byte hex")

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be 0x-prefixed address")

const pointerSchema = z
  .object({
    chain: z.string().min(1),
    contract: addressSchema,
    slotId: z.string().min(1),
  })
  .strict()

const attestationPayloadSchema = z
  .object({
    ok: z.literal(true),
    pointer: pointerSchema,
    envelope: z.unknown(),
    envelopeHash: bytes32Schema,
    observedAtMs: z.number().int().nonnegative(),
    submissionId: z.string().optional(),
  })
  .strict()

export type OasisReference = {
  pointer: OasisPointer
  envelopeHash?: `0x${string}`
}

export type OasisAttestationErrorKind =
  | "invalid_reference"
  | "network"
  | "http"
  | "invalid_payload"
  | "pointer_mismatch"
  | "envelope_hash_mismatch"
  | "submission_mismatch"

export type OasisAttestationError = {
  kind: OasisAttestationErrorKind
  message: string
  statusCode?: number
}

export type OasisAttestationPayload = {
  pointer: OasisPointer
  envelope: OasisEnvelope
  envelopeHash: `0x${string}`
  observedAtMs: number
  submissionId?: string
}

export type OasisAttestationResult =
  | { ok: true; data: OasisAttestationPayload }
  | { ok: false; error: OasisAttestationError }

type ValidateAttestationArgs = {
  reference: OasisReference
  payload: unknown
  submissionId: bigint
}

type FetchAttestationArgs = {
  referenceUri: string
  submissionId: bigint
  baseUrl: string
  fetchImpl?: typeof fetch
}

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

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
  const suffix = path.startsWith("/") ? path : `/${path}`
  return `${base}${suffix}`
}

export function parseOasisReferenceUri(uri: string): OasisReference {
  if (!uri.startsWith("oasis://")) {
    throw new Error("Oasis reference must start with oasis://")
  }

  const withoutScheme = uri.slice("oasis://".length)
  const [pathPart, fragment] = withoutScheme.split("#", 2)
  const segments = pathPart.split("/")
  if (segments.length < 3) {
    throw new Error("Oasis reference must include chain, contract, and slotId")
  }

  const chain = decodeURIComponent(segments[0] ?? "")
  const contract = (segments[1] ?? "").toLowerCase()
  const slotId = decodeURIComponent(segments.slice(2).join("/"))

  const pointerParse = pointerSchema.safeParse({ chain, contract, slotId })
  if (!pointerParse.success) {
    throw new Error(`Invalid Oasis pointer in reference: ${pointerParse.error.message}`)
  }

  if (fragment === undefined || fragment.length === 0) {
    return { pointer: normalizePointer(pointerParse.data) }
  }

  const envelopeHashParse = bytes32Schema.safeParse(fragment)
  if (!envelopeHashParse.success) {
    throw new Error("Invalid Oasis reference fragment: expected bytes32 envelope hash")
  }

  return {
    pointer: normalizePointer(pointerParse.data),
    envelopeHash: envelopeHashParse.data.toLowerCase() as `0x${string}`,
  }
}

export function validateOasisAttestationPayload({
  reference,
  payload,
  submissionId,
}: ValidateAttestationArgs): OasisAttestationResult {
  const parsed = attestationPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message: `Invalid attestation payload: ${parsed.error.message}`,
      },
    }
  }

  const attestationPointer = normalizePointer(parsed.data.pointer)
  if (pointerKey(attestationPointer) !== pointerKey(reference.pointer)) {
    return {
      ok: false,
      error: {
        kind: "pointer_mismatch",
        message: "Attestation pointer does not match Oasis reference",
      },
    }
  }

  let envelope: OasisEnvelope
  try {
    envelope = parseOasisEnvelope(parsed.data.envelope)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid attestation envelope"
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message,
      },
    }
  }

  const computedHash = computeOasisEnvelopeHash(envelope).toLowerCase() as `0x${string}`
  const declaredHash = parsed.data.envelopeHash.toLowerCase() as `0x${string}`

  if (computedHash !== declaredHash) {
    return {
      ok: false,
      error: {
        kind: "envelope_hash_mismatch",
        message: "Attestation envelope hash does not match computed envelope hash",
      },
    }
  }

  if (reference.envelopeHash && declaredHash !== reference.envelopeHash) {
    return {
      ok: false,
      error: {
        kind: "envelope_hash_mismatch",
        message: "Attestation envelope hash does not match Oasis reference hash",
      },
    }
  }

  const expectedSubmissionId = submissionId.toString()
  if (parsed.data.submissionId !== undefined && parsed.data.submissionId !== expectedSubmissionId) {
    return {
      ok: false,
      error: {
        kind: "submission_mismatch",
        message: "Attestation submissionId does not match expected submissionId",
      },
    }
  }

  return {
    ok: true,
    data: {
      pointer: attestationPointer,
      envelope,
      envelopeHash: declaredHash,
      observedAtMs: parsed.data.observedAtMs,
      submissionId: parsed.data.submissionId,
    },
  }
}

export async function fetchAndValidateOasisAttestation({
  referenceUri,
  submissionId,
  baseUrl,
  fetchImpl = fetch,
}: FetchAttestationArgs): Promise<OasisAttestationResult> {
  let reference: OasisReference
  try {
    reference = parseOasisReferenceUri(referenceUri)
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "invalid_reference",
        message: error instanceof Error ? error.message : "Invalid oasis reference",
      },
    }
  }

  let response: Response
  try {
    response = await fetchImpl(buildUrl(baseUrl, "/api/oasis/attestation"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        pointer: reference.pointer,
        submissionId: submissionId.toString(),
      }),
    })
  } catch (error) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: error instanceof Error ? error.message : "Failed to fetch attestation",
      },
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: "http",
        statusCode: response.status,
        message: `Attestation endpoint failed with status ${response.status}`,
      },
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      ok: false,
      error: {
        kind: "invalid_payload",
        message: "Attestation endpoint returned non-JSON payload",
      },
    }
  }

  return validateOasisAttestationPayload({
    reference,
    payload,
    submissionId,
  })
}
