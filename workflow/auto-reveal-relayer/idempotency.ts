import { createHash } from "node:crypto"

export const AUTO_REVEAL_QUEUE_ITEM_IDEMPOTENCY_VERSION =
  "anti-soon.auto-reveal.idempotency.v1" as const
export const AUTO_REVEAL_COMMITTED_CANDIDATE_IDEMPOTENCY_VERSION =
  "anti-soon.auto-reveal.unique-commit.v1" as const

export type AutoRevealIdempotencyStatus =
  | "processing"
  | "completed"
  | "quarantined"

export type AutoRevealIdempotencyDecision = {
  shouldProcess: boolean
  reason:
    | "first_seen"
    | "in_flight"
    | "already_completed"
    | "quarantined"
}

export type AutoRevealQueueItemIdentity = {
  chainId: number
  bountyHubAddress: `0x${string}`
  queueTxHash: `0x${string}`
  queueLogIndex: bigint | number | string
  queuedBlockNumber: bigint | number | string
  projectId: bigint | number | string
  submissionId: bigint | number | string
}

export type AutoRevealCommittedCandidateIdentity = {
  chainId: number
  bountyHubAddress: `0x${string}`
  commitTxHash: `0x${string}`
  commitLogIndex: bigint | number | string
  commitBlockNumber: bigint | number | string
  projectId: bigint | number | string
  submissionId: bigint | number | string
}

function normalizeBytes32(value: string, label: string): `0x${string}` {
  const normalized = value.toLowerCase().startsWith("0x")
    ? value.toLowerCase()
    : `0x${value.toLowerCase()}`
  if (normalized.length !== 66) {
    throw new Error(`${label} must be a 32-byte hex value`)
  }
  return normalized as `0x${string}`
}

function toBigInt(value: bigint | number | string, label: string): bigint {
  if (typeof value === "bigint") {
    return value
  }
  if (typeof value === "number") {
    return BigInt(value)
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return BigInt(value)
  }
  throw new Error(`${label} must be a bigint-compatible value`)
}

export function deriveAutoRevealQueueItemIdempotencyKey(
  item: AutoRevealQueueItemIdentity,
): `0x${string}` {
  const payload = [
    AUTO_REVEAL_QUEUE_ITEM_IDEMPOTENCY_VERSION,
    BigInt(item.chainId).toString(),
    item.bountyHubAddress.toLowerCase(),
    normalizeBytes32(item.queueTxHash, "queueTxHash"),
    toBigInt(item.queueLogIndex, "queueLogIndex").toString(),
    toBigInt(item.queuedBlockNumber, "queuedBlockNumber").toString(),
    toBigInt(item.projectId, "projectId").toString(),
    toBigInt(item.submissionId, "submissionId").toString(),
  ].join("|")
  const digest = createHash("sha256").update(payload).digest("hex")

  return `0x${digest}` as `0x${string}`
}

export function deriveAutoRevealCommittedCandidateIdempotencyKey(
  item: AutoRevealCommittedCandidateIdentity,
): `0x${string}` {
  const payload = [
    AUTO_REVEAL_COMMITTED_CANDIDATE_IDEMPOTENCY_VERSION,
    BigInt(item.chainId).toString(),
    item.bountyHubAddress.toLowerCase(),
    normalizeBytes32(item.commitTxHash, "commitTxHash"),
    toBigInt(item.commitLogIndex, "commitLogIndex").toString(),
    toBigInt(item.commitBlockNumber, "commitBlockNumber").toString(),
    toBigInt(item.projectId, "projectId").toString(),
    toBigInt(item.submissionId, "submissionId").toString(),
  ].join("|")
  const digest = createHash("sha256").update(payload).digest("hex")

  return `0x${digest}` as `0x${string}`
}

export function claimAutoRevealIdempotencySlot(
  stateByKey: Map<string, AutoRevealIdempotencyStatus>,
  key: string,
): AutoRevealIdempotencyDecision {
  const current = stateByKey.get(key)
  if (current === "processing") {
    return { shouldProcess: false, reason: "in_flight" }
  }
  if (current === "completed") {
    return { shouldProcess: false, reason: "already_completed" }
  }
  if (current === "quarantined") {
    return { shouldProcess: false, reason: "quarantined" }
  }

  stateByKey.set(key, "processing")
  return { shouldProcess: true, reason: "first_seen" }
}

export function markAutoRevealQueueItemCompleted(
  stateByKey: Map<string, AutoRevealIdempotencyStatus>,
  key: string,
): void {
  stateByKey.set(key, "completed")
}

export function markAutoRevealQueueItemQuarantined(
  stateByKey: Map<string, AutoRevealIdempotencyStatus>,
  key: string,
): void {
  stateByKey.set(key, "quarantined")
}
