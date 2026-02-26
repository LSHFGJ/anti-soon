import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem"

export const VERIFY_POC_IDEMPOTENCY_VERSION =
  "anti-soon.verify-poc.idempotency.v1" as const

export type VerifyPocIdempotencyStatus = "processing" | "completed"

export type VerifyPocIdempotencyDecision = {
  shouldProcess: boolean
  reason: "first_seen" | "in_flight" | "already_completed"
}

export type VerifyPocIdempotencyInput = {
  chainSelectorName: string
  bountyHubAddress: string
  projectId: bigint
  submissionId: bigint
  txHash?: string
  logIndex?: bigint | number | string
}

const idempotencyKeyParams = parseAbiParameters(
  "string version, string chainSelectorName, address bountyHubAddress, uint256 projectId, uint256 submissionId, bytes32 eventTxHash, uint256 eventLogIndex"
)

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000"

function normalizeHex(value: string): string {
  return value.toLowerCase().startsWith("0x")
    ? value.toLowerCase()
    : `0x${value.toLowerCase()}`
}

function normalizeBytes32(value: string | undefined): `0x${string}` {
  if (!value) {
    return ZERO_BYTES32
  }

  const normalized = normalizeHex(value)
  if (normalized.length !== 66) {
    return ZERO_BYTES32
  }
  return normalized as `0x${string}`
}

function toLogIndexBigInt(value: VerifyPocIdempotencyInput["logIndex"]): bigint {
  if (typeof value === "bigint") {
    return value
  }
  if (typeof value === "number") {
    return BigInt(value)
  }
  if (typeof value === "string" && value.length > 0) {
    const normalized = value.startsWith("0x") ? value : value
    return BigInt(normalized)
  }
  return 0n
}

export function deriveVerifyPocIdempotencyKey(
  input: VerifyPocIdempotencyInput
): `0x${string}` {
  const encoded = encodeAbiParameters(idempotencyKeyParams, [
    VERIFY_POC_IDEMPOTENCY_VERSION,
    input.chainSelectorName,
    normalizeHex(input.bountyHubAddress) as `0x${string}`,
    input.projectId,
    input.submissionId,
    normalizeBytes32(input.txHash),
    toLogIndexBigInt(input.logIndex),
  ])

  return keccak256(encoded)
}

export function claimVerifyPocIdempotencySlot(
  stateByKey: Map<string, VerifyPocIdempotencyStatus>,
  key: string
): VerifyPocIdempotencyDecision {
  const current = stateByKey.get(key)
  if (current === "processing") {
    return { shouldProcess: false, reason: "in_flight" }
  }
  if (current === "completed") {
    return { shouldProcess: false, reason: "already_completed" }
  }

  stateByKey.set(key, "processing")
  return { shouldProcess: true, reason: "first_seen" }
}

export function markVerifyPocIdempotencyCompleted(
  stateByKey: Map<string, VerifyPocIdempotencyStatus>,
  key: string
): void {
  stateByKey.set(key, "completed")
}

export function releaseVerifyPocIdempotencySlot(
  stateByKey: Map<string, VerifyPocIdempotencyStatus>,
  key: string
): void {
  const current = stateByKey.get(key)
  if (current === "processing") {
    stateByKey.delete(key)
  }
}
