import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem"

export const VERIFY_POC_IDEMPOTENCY_VERSION =
  "anti-soon.verify-poc.idempotency.v1" as const
export const VERIFY_POC_SCOPED_IDEMPOTENCY_VERSION =
  "anti-soon.verify-poc.scoped-idempotency.v1" as const
export const VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT_ERROR =
  "VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT" as const
export const VERIFY_POC_INVALID_SYNC_TRANSITION_ERROR =
  "VERIFY_POC_INVALID_SYNC_TRANSITION" as const

export type VerifyPocIdempotencyStatus =
  | "processing"
  | "completed"
  | "quarantined"

export type VerifyPocSyncState =
  | "SAPPHIRE_WRITTEN"
  | "SEPOLIA_COMMITTED"
  | "SEPOLIA_REVEALED"
  | "WORKFLOW_VERIFIED"
  | "REPORT_WRITTEN"
  | "QUARANTINED"

export type VerifyPocIdempotencyDecision = {
  shouldProcess: boolean
  reason: "first_seen" | "in_flight" | "already_completed" | "quarantined"
}

export type VerifyPocSyncIdInput = {
  projectId: bigint
  submissionId: bigint
  envelopeHash: string
}

export type VerifyPocScopedIdempotencyInput = {
  syncId: string
  sourceEventFingerprint: string
}

export type VerifyPocIdempotencyInput = {
  mappingVersion: string
  mappingMode: string
  chainSelectorName: string
  bountyHubAddress: string
  projectId: bigint
  submissionId: bigint
  txHash?: string
  logIndex?: bigint | number | string
}

export type VerifyPocIdempotencyMappingState = {
  mappingFingerprint: `0x${string}`
  idempotencyKey: `0x${string}`
}

const idempotencyKeyParams = parseAbiParameters(
  "string version, string mappingVersion, string mappingMode, string chainSelectorName, address bountyHubAddress, uint256 projectId, uint256 submissionId, bytes32 eventTxHash, uint256 eventLogIndex"
)

const sourceEventKeyParams = parseAbiParameters(
  "string chainSelectorName, address bountyHubAddress, uint256 projectId, uint256 submissionId, bytes32 eventTxHash, uint256 eventLogIndex"
)

const mappingFingerprintParams = parseAbiParameters(
  "string mappingVersion, string mappingMode"
)

const syncIdParams = parseAbiParameters(
  "uint256 projectId, uint256 submissionId, bytes32 envelopeHash"
)

const scopedIdempotencyParams = parseAbiParameters(
  "string version, bytes32 syncId, bytes32 sourceEventFingerprint"
)

const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000"

const allowedSyncTransitions: Record<VerifyPocSyncState, readonly VerifyPocSyncState[]> = {
  SAPPHIRE_WRITTEN: ["SEPOLIA_COMMITTED", "QUARANTINED"],
  SEPOLIA_COMMITTED: ["SEPOLIA_REVEALED", "QUARANTINED"],
  SEPOLIA_REVEALED: ["WORKFLOW_VERIFIED", "QUARANTINED"],
  WORKFLOW_VERIFIED: ["REPORT_WRITTEN", "QUARANTINED"],
  REPORT_WRITTEN: [],
  QUARANTINED: [],
}

function normalizeHex(value: string): string {
  return value.toLowerCase().startsWith("0x")
    ? value.toLowerCase()
    : `0x${value.toLowerCase()}`
}

function normalizeRequiredBytes32(value: string): `0x${string}` {
  const normalized = normalizeHex(value)
  if (normalized.length !== 66) {
    throw new Error("INVALID_SYNC_ID_ENVELOPE_HASH")
  }
  return normalized as `0x${string}`
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

function encodeSourceEventIdentity(input: VerifyPocIdempotencyInput): `0x${string}` {
  return encodeAbiParameters(sourceEventKeyParams, [
    input.chainSelectorName,
    normalizeHex(input.bountyHubAddress) as `0x${string}`,
    input.projectId,
    input.submissionId,
    normalizeBytes32(input.txHash),
    toLogIndexBigInt(input.logIndex),
  ])
}

function decodeSourceEventIdentity(
  input: VerifyPocIdempotencyInput
): [
  string,
  `0x${string}`,
  bigint,
  bigint,
  `0x${string}`,
  bigint,
] {
  return [
    input.chainSelectorName,
    normalizeHex(input.bountyHubAddress) as `0x${string}`,
    input.projectId,
    input.submissionId,
    normalizeBytes32(input.txHash),
    toLogIndexBigInt(input.logIndex),
  ]
}

export function deriveVerifyPocSourceEventKey(
  input: VerifyPocIdempotencyInput
): `0x${string}` {
  return keccak256(encodeSourceEventIdentity(input))
}

export function deriveVerifyPocSyncId(input: VerifyPocSyncIdInput): `0x${string}` {
  const encoded = encodeAbiParameters(syncIdParams, [
    input.projectId,
    input.submissionId,
    normalizeRequiredBytes32(input.envelopeHash),
  ])
  return keccak256(encoded)
}

export function deriveVerifyPocScopedIdempotencyKey(
  input: VerifyPocScopedIdempotencyInput
): `0x${string}` {
  const encoded = encodeAbiParameters(scopedIdempotencyParams, [
    VERIFY_POC_SCOPED_IDEMPOTENCY_VERSION,
    normalizeRequiredBytes32(input.syncId),
    normalizeRequiredBytes32(input.sourceEventFingerprint),
  ])

  return keccak256(encoded)
}

export function transitionVerifyPocSyncState(
  stateBySyncId: Map<string, VerifyPocSyncState>,
  syncId: string,
  nextState: VerifyPocSyncState,
  options?: { allowInitialize?: boolean }
): VerifyPocSyncState {
  const currentState = stateBySyncId.get(syncId)

  if (!currentState) {
    if (options?.allowInitialize && nextState === "SAPPHIRE_WRITTEN") {
      stateBySyncId.set(syncId, nextState)
      return nextState
    }

    throw new Error(
      `${VERIFY_POC_INVALID_SYNC_TRANSITION_ERROR}: syncId=${syncId} from=UNSET to=${nextState}`
    )
  }

  const allowed = allowedSyncTransitions[currentState]
  if (!allowed.includes(nextState)) {
    throw new Error(
      `${VERIFY_POC_INVALID_SYNC_TRANSITION_ERROR}: syncId=${syncId} from=${currentState} to=${nextState}`
    )
  }

  stateBySyncId.set(syncId, nextState)
  return nextState
}

export function deriveVerifyPocMappingFingerprint(
  input: Pick<VerifyPocIdempotencyInput, "mappingVersion" | "mappingMode">
): `0x${string}` {
  const encoded = encodeAbiParameters(mappingFingerprintParams, [
    input.mappingVersion,
    input.mappingMode,
  ])
  return keccak256(encoded)
}

export function deriveVerifyPocIdempotencyKey(
  input: VerifyPocIdempotencyInput
): `0x${string}` {
  const encoded = encodeAbiParameters(idempotencyKeyParams, [
    VERIFY_POC_IDEMPOTENCY_VERSION,
    input.mappingVersion,
    input.mappingMode,
    ...decodeSourceEventIdentity(input),
  ])

  return keccak256(encoded)
}

export function assertVerifyPocIdempotencyMappingStable(
  mappingStateBySourceEvent: Map<string, VerifyPocIdempotencyMappingState>,
  input: VerifyPocIdempotencyInput
): {
  sourceEventKey: `0x${string}`
  idempotencyKey: `0x${string}`
  mappingFingerprint: `0x${string}`
} {
  const sourceEventKey = deriveVerifyPocSourceEventKey(input)
  const mappingFingerprint = deriveVerifyPocMappingFingerprint(input)
  const idempotencyKey = deriveVerifyPocIdempotencyKey(input)

  const current = mappingStateBySourceEvent.get(sourceEventKey)
  if (!current) {
    mappingStateBySourceEvent.set(sourceEventKey, {
      mappingFingerprint,
      idempotencyKey,
    })
    return { sourceEventKey, idempotencyKey, mappingFingerprint }
  }

  if (
    current.mappingFingerprint !== mappingFingerprint ||
    current.idempotencyKey !== idempotencyKey
  ) {
    throw new Error(
      `${VERIFY_POC_IDEMPOTENCY_MAPPING_DRIFT_ERROR}: sourceEventKey=${sourceEventKey} expectedFingerprint=${current.mappingFingerprint} gotFingerprint=${mappingFingerprint} expectedIdempotencyKey=${current.idempotencyKey} gotIdempotencyKey=${idempotencyKey}`
    )
  }

  return { sourceEventKey, idempotencyKey, mappingFingerprint }
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
  if (current === "quarantined") {
    return { shouldProcess: false, reason: "quarantined" }
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

export function markVerifyPocIdempotencyQuarantined(
  stateByKey: Map<string, VerifyPocIdempotencyStatus>,
  key: string
): void {
  stateByKey.set(key, "quarantined")
}

export function releaseVerifyPocIdempotencySlot(
  stateByKey: Map<string, VerifyPocIdempotencyStatus>,
  key: string
): void {
  const current = stateByKey.get(key)
  if (current === "processing") {
    stateByKey.set(key, "quarantined")
  }
}
