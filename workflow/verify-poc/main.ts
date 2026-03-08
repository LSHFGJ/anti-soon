import {
  bytesToHex,
  consensusIdenticalAggregation,
  EVMClient,
  getNetwork,
  handler,
  hexToBase64,
  HTTPClient,
  Runner,
  TxStatus,
  type EVMLog,
  type Runtime,
  type NodeRuntime,
} from "@chainlink/cre-sdk"
import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
} from "viem"
import { z } from "zod"
import { encodeJsonBodyBase64 } from "./src/httpBody"
import {
  deriveVerifyPocScopedIdempotencyKey,
  deriveVerifyPocSyncId,
  type VerifyPocIdempotencyInput,
} from "./src/idempotency"
import {
  assertDurableVerifyPocIdempotencyMappingStable,
  claimDurableVerifyPocIdempotencySlot,
  loadVerifyPocIdempotencyStore,
  markDurableVerifyPocIdempotencyCompleted,
  markDurableVerifyPocIdempotencyQuarantined,
  markDurableVerifyPocIdempotencyStrictFailed,
  type VerifyPocIdempotencyStore,
} from "./src/idempotencyStore"
import {
  MULTI_GROUPING_VERSION,
  type MultiGroupingCohort,
} from "./src/multiGrouping"
import {
  parseOasisReferenceUri,
  type OasisReference,
} from "./src/oasisAttestation"
import {
  validateOasisRpcPayload,
} from "./src/oasisRpcRead"
import {
  reconcileVerifyPocOrphans,
  type VerifyPocReconciliationAction,
  type VerifyPocReconciliationRecord,
  type VerifyPocReconciliationScanResult,
} from "./src/reconciliation"
import {
  buildRpcEndpointPool,
  RpcReadRetryExhaustedError,
  runRpcReadWithRetry,
  type RpcReadRetryPolicy,
} from "./src/rpcReadRetry"
import {
  decodeSubmissionReadResult,
  encodeSubmissionReadCall,
  type ChainSubmissionRecord,
} from "./src/submissionReader"

// ═══════════════════ Config ═══════════════════

const rpcReadRetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  baseDelayMs: z.number().int().nonnegative(),
  backoffMultiplier: z.number().int().positive(),
  maxDelayMs: z.number().int().nonnegative(),
})

const configSchema = z.object({
  chainSelectorName: z.string(),
  bountyHubAddress: z.string(),
  gasLimit: z.string(),
  tenderlyAccountSlug: z.string(),
  tenderlyProjectSlug: z.string(),
  oasisRpcUrl: z.string().optional(),
  oasisRpcFallbackUrls: z.array(z.string()).default([]),
  sepoliaRpcUrl: z.string().optional(),
  sepoliaRpcFallbackUrls: z.array(z.string()).default([]),
  rpcReadRetry: rpcReadRetryPolicySchema.default({
    maxAttempts: 3,
    baseDelayMs: 250,
    backoffMultiplier: 2,
    maxDelayMs: 2000,
  }),
  mainnetRpcUrl: z.string(),
  defaultRules: z.object({
    maxAttackerSeedWei: z.string(),
    maxWarpSeconds: z.string(),
    allowImpersonation: z.boolean(),
    criticalDrainWei: z.string(),
    highDrainWei: z.string(),
    mediumDrainWei: z.string(),
    lowDrainWei: z.string(),
  }),
})

type Config = z.infer<typeof configSchema>

// ═══════════════════ Types ═══════════════════

type VerificationResult = {
  isValid: boolean
  drainAmountWei: bigint
  reasonCode?: VerifyPocSyncReasonCode
  sapphireWriteTimestampSec?: bigint
}

export const SYNC_REASON_RETRYABLE_RPC = "RETRYABLE_RPC" as const
export const SYNC_REASON_RETRY_EXHAUSTED = "RETRY_EXHAUSTED" as const
export const SYNC_REASON_BINDING_MISMATCH = "BINDING_MISMATCH" as const
export const SYNC_REASON_ORPHAN_RECOVERED = "ORPHAN_RECOVERED" as const
export const SYNC_REASON_ORPHAN_QUARANTINED = "ORPHAN_QUARANTINED" as const

export type VerifyPocSyncReasonCode =
  | typeof SYNC_REASON_RETRYABLE_RPC
  | typeof SYNC_REASON_RETRY_EXHAUSTED
  | typeof SYNC_REASON_BINDING_MISMATCH
  | typeof SYNC_REASON_ORPHAN_RECOVERED
  | typeof SYNC_REASON_ORPHAN_QUARANTINED

export type VerifyPocStrictGateDecision =
  | {
      outcome: "WRITE_REPORT"
      reasonCode?: VerifyPocSyncReasonCode
    }
  | {
      outcome: "EMIT_EVIDENCE"
      reasonCode?: VerifyPocSyncReasonCode
    }
  | {
      outcome: "RETRY_SYNC"
      reasonCode:
        | typeof SYNC_REASON_RETRYABLE_RPC
        | typeof SYNC_REASON_RETRY_EXHAUSTED
    }

export type VerifyPocLatencyBuckets = {
  write_to_commit_ms: number | null
  commit_to_reveal_ms: number | null
  reveal_to_report_ms: number | null
}

type VerifyPocSyncMetricEvent = {
  metric: "verify_poc_sync"
  sync_id: string
  transition: string
  reason_code: VerifyPocSyncReasonCode | null
  write_to_commit_ms: number | null
  commit_to_reveal_ms: number | null
  reveal_to_report_ms: number | null
}

type VerifyPocLatencyInput = {
  sapphireWriteTimestampSec?: bigint
  commitTimestampSec?: bigint
  revealTimestampSec?: bigint
  reportTimestampSec?: bigint
}

function toLatencyMs(startSec?: bigint, endSec?: bigint): number | null {
  if (startSec === undefined || endSec === undefined) {
    return null
  }

  if (startSec <= 0n || endSec <= 0n || endSec < startSec) {
    return null
  }

  const deltaSec = endSec - startSec
  const maxSafeMs = BigInt(Number.MAX_SAFE_INTEGER)
  const deltaMs = deltaSec * 1000n
  if (deltaMs > maxSafeMs) {
    return Number.MAX_SAFE_INTEGER
  }

  return Number(deltaMs)
}

export function buildVerifyPocLatencyBuckets(
  input: VerifyPocLatencyInput,
): VerifyPocLatencyBuckets {
  return {
    write_to_commit_ms: toLatencyMs(
      input.sapphireWriteTimestampSec,
      input.commitTimestampSec,
    ),
    commit_to_reveal_ms: toLatencyMs(
      input.commitTimestampSec,
      input.revealTimestampSec,
    ),
    reveal_to_report_ms: toLatencyMs(
      input.revealTimestampSec,
      input.reportTimestampSec,
    ),
  }
}

export function reconciliationActionToSyncReasonCode(
  action: VerifyPocReconciliationAction,
): VerifyPocSyncReasonCode {
  return action === "RESUMED"
    ? SYNC_REASON_ORPHAN_RECOVERED
    : SYNC_REASON_ORPHAN_QUARANTINED
}

export function isRetryableVerifyPocSyncReasonCode(
  reasonCode?: VerifyPocSyncReasonCode,
): reasonCode is
  | typeof SYNC_REASON_RETRYABLE_RPC
  | typeof SYNC_REASON_RETRY_EXHAUSTED {
  return (
    reasonCode === SYNC_REASON_RETRYABLE_RPC ||
    reasonCode === SYNC_REASON_RETRY_EXHAUSTED
  )
}

export function decideVerifyPocStrictGate(args: {
  isValid: boolean
  reasonCode?: VerifyPocSyncReasonCode
}): VerifyPocStrictGateDecision {
  if (isRetryableVerifyPocSyncReasonCode(args.reasonCode)) {
    return {
      outcome: "RETRY_SYNC",
      reasonCode: args.reasonCode,
    }
  }

  if (!args.isValid) {
    return {
      outcome: "EMIT_EVIDENCE",
      reasonCode: args.reasonCode,
    }
  }

  return {
    outcome: "WRITE_REPORT",
    reasonCode: args.reasonCode,
  }
}

export function classifyVerifyPocSyncReasonCode(
  error: unknown,
): VerifyPocSyncReasonCode {
  if (error instanceof RpcReadRetryExhaustedError) {
    return SYNC_REASON_RETRY_EXHAUSTED
  }

  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()

  if (normalized.includes(SYNC_REASON_RETRY_EXHAUSTED.toLowerCase())) {
    return SYNC_REASON_RETRY_EXHAUSTED
  }

  if (normalized.includes(SYNC_REASON_RETRYABLE_RPC.toLowerCase())) {
    return SYNC_REASON_RETRYABLE_RPC
  }

  if (normalized.includes("rpc_read_retry_exhausted")) {
    return SYNC_REASON_RETRY_EXHAUSTED
  }

  if (
    normalized.includes("rpc_read_retryable") ||
    normalized.includes("timeout") ||
    normalized.includes("temporarily unavailable") ||
    normalized.includes("upstream busy") ||
    normalized.includes("network")
  ) {
    return SYNC_REASON_RETRYABLE_RPC
  }

  return SYNC_REASON_BINDING_MISMATCH
}

export function buildVerifyPocSyncMetricEvent(args: {
  syncId: string
  transition: string
  reasonCode?: VerifyPocSyncReasonCode
  latencyBuckets: VerifyPocLatencyBuckets
}): VerifyPocSyncMetricEvent {
  return {
    metric: "verify_poc_sync",
    sync_id: args.syncId,
    transition: args.transition,
    reason_code: args.reasonCode ?? null,
    write_to_commit_ms: args.latencyBuckets.write_to_commit_ms,
    commit_to_reveal_ms: args.latencyBuckets.commit_to_reveal_ms,
    reveal_to_report_ms: args.latencyBuckets.reveal_to_report_ms,
  }
}

type ProjectRules = {
  maxAttackerSeedWei: bigint
  maxWarpSeconds: bigint
  allowImpersonation: boolean
  thresholds: {
    criticalDrainWei: bigint
    highDrainWei: bigint
    mediumDrainWei: bigint
    lowDrainWei: bigint
  }
}

function projectRulesFromConfig(config: Config): ProjectRules {
  return {
    maxAttackerSeedWei: BigInt(config.defaultRules.maxAttackerSeedWei),
    maxWarpSeconds: BigInt(config.defaultRules.maxWarpSeconds),
    allowImpersonation: config.defaultRules.allowImpersonation,
    thresholds: {
      criticalDrainWei: BigInt(config.defaultRules.criticalDrainWei),
      highDrainWei: BigInt(config.defaultRules.highDrainWei),
      mediumDrainWei: BigInt(config.defaultRules.mediumDrainWei),
      lowDrainWei: BigInt(config.defaultRules.lowDrainWei),
    },
  }
}

type PoCData = {
  version: string
  target: {
    contract: string
    chain: number
    forkBlock: number
  }
  setup: Array<{
    type: string
    address?: string
    value: string
  }>
  transactions: Array<{
    to: string
    data: string
    value: string
  }>
  expectedImpact: {
    type: string
    estimatedLoss: string
    description: string
  }
}

// ═══════════════════ ABI Definitions ═══════════════════

const BountyResultParamsV2 = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei"
)

const VerifyPocTypedContractReportParams = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei, bool hasJury, string juryAction, string juryRationale, bool hasGrouping, string groupingCohort, string groupId, uint256 groupRank, uint256 groupSize",
)
const TypedReportEnvelopeParams = parseAbiParameters(
  "bytes4 magic, uint8 reportType, bytes payload",
)
const VerifyPocStrictFailJuryDigestParams = parseAbiParameters(
  "string version, uint256 submissionId, uint256 projectId, bytes32 syncId, bytes32 sourceEventKey, bytes32 mappingFingerprint, bytes32 envelopeHash",
)

const VERIFY_POC_REPORT_ENVELOPE_MAGIC = "ASRP" as const
const VERIFY_POC_REPORT_ENVELOPE_MAGIC_HEX = "0x41535250" as const
const VERIFY_POC_TYPED_REPORT_V1 = "verified-report/v1" as const
const VERIFY_POC_TYPED_REPORT_V2 = "verified-report/v2" as const
const VERIFY_POC_TYPED_REPORT_V3 = "verified-report/v3" as const
const VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE = "adjudication-final/v1" as const
const VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE =
  "owner-adjudication-expired/v1" as const
const VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE =
  "jury-recommendation/v1" as const
const VERIFY_POC_JURY_COMMITMENT_VERSION =
  "anti-soon.verify-poc.jury-commitment.v1" as const
const VERIFY_POC_ADJUDICATION_VERSION =
  "anti-soon.verify-poc.adjudication.v1" as const
const VERIFY_POC_LEGACY_REPORT_TYPE = "legacy-verify-poc/v0" as const
const VERIFY_POC_CONTRACT_TYPED_REPORT_TYPE = 3
const VERIFY_POC_TYPED_REPORT_V1_KEYS = [
  "magic",
  "reportType",
  "payload",
] as const
const VERIFY_POC_TYPED_REPORT_V2_KEYS = [
  "magic",
  "reportType",
  "payload",
  "jury",
  "testimony",
  "grouping",
] as const
const VERIFY_POC_TYPED_REPORT_V3_KEYS = [
  "magic",
  "reportType",
  "payload",
  "juryCommitment",
  "adjudication",
] as const
const VERIFY_POC_ADJUDICATION_FINAL_REPORT_KEYS = [
  "magic",
  "reportType",
  "payload",
  "grouping",
] as const
const VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_KEYS = [
  "magic",
  "reportType",
  "payload",
] as const
const VERIFY_POC_TYPED_REPORT_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "isValid",
  "drainAmountWei",
  "observedCalldata",
] as const
const VERIFY_POC_JURY_METADATA_KEYS = [
  "recommendationReportType",
  "action",
  "rationale",
] as const
const VERIFY_POC_TESTIMONY_METADATA_KEYS = [
  "recommendationReportType",
  "testimony",
] as const
const VERIFY_POC_GROUPING_METADATA_KEYS = [
  "groupingVersion",
  "cohort",
  "groupId",
  "clusterKey",
  "groupRank",
  "cohortRank",
  "memberRank",
  "groupSize",
  "representativeSubmissionId",
] as const
const VERIFY_POC_JURY_COMMITMENT_METADATA_KEYS = [
  "commitmentVersion",
  "juryLedgerDigest",
  "sourceEventKey",
  "mappingFingerprint",
] as const
const VERIFY_POC_ADJUDICATION_METADATA_KEYS = [
  "adjudicationVersion",
  "syncId",
  "idempotencyKey",
  "cipherURI",
  "severity",
  "juryWindow",
  "adjudicationWindow",
  "commitTimestampSec",
  "revealTimestampSec",
  "sapphireWriteTimestampSec",
  "reasonCode",
  "chainSelectorName",
  "bountyHubAddress",
  "txHash",
  "logIndex",
  "oasis",
] as const
const VERIFY_POC_ADJUDICATION_OASIS_KEYS = [
  "chain",
  "contract",
  "slotId",
  "envelopeHash",
] as const
const VERIFY_POC_ADJUDICATION_FINAL_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "lifecycleStatus",
  "verdictSource",
  "finalValidity",
  "isValid",
  "drainAmountWei",
  "rationale",
  "juryDeadlineTimestampSec",
  "adjudicationDeadlineTimestampSec",
  "evidenceReportType",
  "juryLedgerDigest",
  "ownerTestimonyDigest",
  "sourceEventKey",
  "mappingFingerprint",
  "syncId",
  "idempotencyKey",
  "cipherURI",
  "severity",
  "chainSelectorName",
  "bountyHubAddress",
  "oasisEnvelopeHash",
  "rosterCommitment",
] as const
const VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "lifecycleStatus",
  "resolution",
  "scopeKey",
  "juryDeadlineTimestampSec",
  "adjudicationDeadlineTimestampSec",
  "submittedAtTimestampSec",
  "evidenceReportType",
  "oasisEnvelopeHash",
  "reason",
] as const
export type VerifyPocTypedReportPayload = {
  submissionId: bigint
  projectId: bigint
  isValid: boolean
  drainAmountWei: bigint
  observedCalldata: string[]
}

export type VerifyPocJuryMetadata = {
  recommendationReportType: typeof VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE
  action: "UPHOLD_AI_RESULT" | "OVERTURN_AI_RESULT" | "NEEDS_OWNER_REVIEW"
  rationale: string
}

export type VerifyPocTestimonyMetadata = {
  recommendationReportType: typeof VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE
  testimony: string
}

export type VerifyPocGroupingMetadata = {
  groupingVersion: typeof MULTI_GROUPING_VERSION
  cohort: MultiGroupingCohort
  groupId: string
  clusterKey: string
  groupRank: number
  cohortRank: number
  memberRank: number
  groupSize: number
  representativeSubmissionId: bigint
}

export type VerifyPocJuryCommitmentMetadata = {
  commitmentVersion: typeof VERIFY_POC_JURY_COMMITMENT_VERSION
  juryLedgerDigest: `0x${string}`
  sourceEventKey: `0x${string}`
  mappingFingerprint: `0x${string}`
}

export type VerifyPocAdjudicationOasisMetadata = {
  chain: string
  contract: `0x${string}`
  slotId: string
  envelopeHash: `0x${string}`
}

export type VerifyPocAdjudicationMetadata = {
  adjudicationVersion: typeof VERIFY_POC_ADJUDICATION_VERSION
  syncId: `0x${string}`
  idempotencyKey: `0x${string}`
  cipherURI: string
  severity: number
  juryWindow: bigint
  adjudicationWindow: bigint
  commitTimestampSec: bigint
  revealTimestampSec: bigint
  sapphireWriteTimestampSec?: bigint
  reasonCode?: VerifyPocSyncReasonCode
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  txHash?: `0x${string}`
  logIndex?: bigint
  oasis: VerifyPocAdjudicationOasisMetadata
}

export type VerifyPocTypedReportEnvelopeV1 = {
  magic: typeof VERIFY_POC_REPORT_ENVELOPE_MAGIC
  reportType: typeof VERIFY_POC_TYPED_REPORT_V1
  payload: VerifyPocTypedReportPayload
}

export type VerifyPocTypedReportEnvelopeV2 = {
  magic: typeof VERIFY_POC_REPORT_ENVELOPE_MAGIC
  reportType: typeof VERIFY_POC_TYPED_REPORT_V2
  payload: VerifyPocTypedReportPayload
  jury?: VerifyPocJuryMetadata
  testimony?: VerifyPocTestimonyMetadata
  grouping?: VerifyPocGroupingMetadata
}

export type VerifyPocTypedReportEnvelopeV3 = {
  magic: typeof VERIFY_POC_REPORT_ENVELOPE_MAGIC
  reportType: typeof VERIFY_POC_TYPED_REPORT_V3
  payload: VerifyPocTypedReportPayload
  juryCommitment: VerifyPocJuryCommitmentMetadata
  adjudication: VerifyPocAdjudicationMetadata
}

export type VerifyPocAdjudicationFinalLifecycleStatus =
  | "VERIFIED"
  | "INVALID"

export type VerifyPocAdjudicationFinalVerdictSource =
  | "JURY"
  | "OWNER"

export type VerifyPocAdjudicationFinalValidity =
  | "HIGH"
  | "MEDIUM"
  | "INVALID"

export type VerifyPocAdjudicationFinalPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  lifecycleStatus: VerifyPocAdjudicationFinalLifecycleStatus
  verdictSource: VerifyPocAdjudicationFinalVerdictSource
  finalValidity: VerifyPocAdjudicationFinalValidity
  isValid: boolean
  drainAmountWei: bigint
  rationale: string
  juryDeadlineTimestampSec: bigint
  adjudicationDeadlineTimestampSec: bigint
  evidenceReportType: typeof VERIFY_POC_TYPED_REPORT_V3
  juryLedgerDigest: `0x${string}`
  ownerTestimonyDigest?: `0x${string}`
  sourceEventKey: `0x${string}`
  mappingFingerprint: `0x${string}`
  syncId: `0x${string}`
  idempotencyKey: `0x${string}`
  cipherURI: string
  severity: number
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  oasisEnvelopeHash: `0x${string}`
  rosterCommitment: Record<string, unknown>
}

export type VerifyPocAdjudicationFinalEnvelope = {
  magic: typeof VERIFY_POC_REPORT_ENVELOPE_MAGIC
  reportType: typeof VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE
  payload: VerifyPocAdjudicationFinalPayload
  grouping?: VerifyPocGroupingMetadata
}

export type VerifyPocOwnerAdjudicationExpiredPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  lifecycleStatus: "OWNER_ADJUDICATION_EXPIRED"
  resolution: "UNRESOLVED"
  scopeKey: `0x${string}`
  juryDeadlineTimestampSec: bigint
  adjudicationDeadlineTimestampSec: bigint
  submittedAtTimestampSec: bigint
  evidenceReportType: typeof VERIFY_POC_TYPED_REPORT_V3
  oasisEnvelopeHash: `0x${string}`
  reason: string
}

export type VerifyPocOwnerAdjudicationExpiredEnvelope = {
  magic: typeof VERIFY_POC_REPORT_ENVELOPE_MAGIC
  reportType: typeof VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE
  payload: VerifyPocOwnerAdjudicationExpiredPayload
}

export type VerifyPocTypedReportEnvelope =
  | VerifyPocTypedReportEnvelopeV1
  | VerifyPocTypedReportEnvelopeV2
  | VerifyPocTypedReportEnvelopeV3

export type VerifyPocLegacyDecodedReport = {
  reportType: typeof VERIFY_POC_LEGACY_REPORT_TYPE
  payload: {
    submissionId: bigint
    isValid: boolean
    drainAmountWei: bigint
  }
}

export type VerifyPocDecodedReportEnvelope =
  | VerifyPocLegacyDecodedReport
  | VerifyPocTypedReportEnvelope
  | VerifyPocAdjudicationFinalEnvelope
  | VerifyPocOwnerAdjudicationExpiredEnvelope

function requireReportObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }

  return value as Record<string, unknown>
}

function assertReportKeysExact(
  source: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set<string>(allowedKeys)
  const unexpectedKeys = Object.keys(source).filter((key) => !allowed.has(key))

  if (unexpectedKeys.length > 0) {
    throw new Error(
      `${label} contains unsupported key(s): ${unexpectedKeys.join(", ")}`,
    )
  }
}

function requireReportString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  return value.trim()
}

function requireReportBytes32String(
  value: unknown,
  fieldName: string,
): `0x${string}` {
  const normalized = requireReportString(value, fieldName).toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a 0x-prefixed 32-byte hex string`)
  }

  return normalized as `0x${string}`
}

function requireReportAddressString(
  value: unknown,
  fieldName: string,
): `0x${string}` {
  const normalized = requireReportString(value, fieldName).toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) {
    throw new Error(`${fieldName} must be a 0x-prefixed address`)
  }

  return normalized as `0x${string}`
}

function requireReportBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`)
  }

  return value
}

function requireReportBigIntLike(value: unknown, fieldName: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${fieldName} must be a non-negative integer`)
    }

    return value
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${fieldName} must be a non-negative integer`)
    }

    return BigInt(value)
  }

  const normalized = requireReportString(value, fieldName)
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }

  return BigInt(normalized)
}

function requireReportPositiveSafeInteger(
  value: unknown,
  fieldName: string,
): number {
  const parsed = requireReportBigIntLike(value, fieldName)
  if (parsed === 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} must be a positive safe integer`)
  }

  return Number(parsed)
}

function requireReportNonNegativeSafeInteger(
  value: unknown,
  fieldName: string,
): number {
  const parsed = requireReportBigIntLike(value, fieldName)
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} must be a safe integer`)
  }

  return Number(parsed)
}

function requireReportStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }

  return value.map((entry, index) =>
    requireReportString(entry, `${fieldName}[${index}]`),
  )
}

function requireVerifyPocJuryAction(
  value: unknown,
  fieldName: string,
): VerifyPocJuryMetadata["action"] {
  const action = requireReportString(value, fieldName)
  if (
    action !== "UPHOLD_AI_RESULT" &&
    action !== "OVERTURN_AI_RESULT" &&
    action !== "NEEDS_OWNER_REVIEW"
  ) {
    throw new Error(`${fieldName} must be a supported jury recommendation action`)
  }

  return action
}

function requireVerifyPocGroupingCohort(
  value: unknown,
  fieldName: string,
): MultiGroupingCohort {
  const cohort = requireReportString(value, fieldName).toUpperCase()
  if (cohort !== "HIGH" && cohort !== "MEDIUM" && cohort !== "OTHER") {
    throw new Error(`${fieldName} must be a supported MULTI grouping cohort`)
  }

  return cohort
}

function parseOptionalVerifyPocSyncReasonCode(
  value: unknown,
  fieldName: string,
): VerifyPocSyncReasonCode | undefined {
  if (value === undefined) {
    return undefined
  }

  const reasonCode = requireReportString(value, fieldName)
  if (
    reasonCode !== SYNC_REASON_RETRYABLE_RPC &&
    reasonCode !== SYNC_REASON_RETRY_EXHAUSTED &&
    reasonCode !== SYNC_REASON_BINDING_MISMATCH &&
    reasonCode !== SYNC_REASON_ORPHAN_RECOVERED &&
    reasonCode !== SYNC_REASON_ORPHAN_QUARANTINED
  ) {
    throw new Error(`${fieldName} must be a supported verify-poc sync reason code`)
  }

  return reasonCode
}

function parseVerifyPocTypedPayload(value: unknown): VerifyPocTypedReportPayload {
  const source = requireReportObject(value, "verify-poc report payload")
  assertReportKeysExact(
    source,
    VERIFY_POC_TYPED_REPORT_PAYLOAD_KEYS,
    "verify-poc report payload",
  )

  return {
    submissionId: requireReportBigIntLike(
      source.submissionId,
      "verifyPoc.payload.submissionId",
    ),
    projectId: requireReportBigIntLike(
      source.projectId,
      "verifyPoc.payload.projectId",
    ),
    isValid: requireReportBoolean(source.isValid, "verifyPoc.payload.isValid"),
    drainAmountWei: requireReportBigIntLike(
      source.drainAmountWei,
      "verifyPoc.payload.drainAmountWei",
    ),
    observedCalldata: requireReportStringArray(
      source.observedCalldata,
      "verifyPoc.payload.observedCalldata",
    ),
  }
}

function parseVerifyPocJuryMetadata(value: unknown): VerifyPocJuryMetadata {
  const source = requireReportObject(value, "verify-poc jury metadata")
  assertReportKeysExact(
    source,
    VERIFY_POC_JURY_METADATA_KEYS,
    "verify-poc jury metadata",
  )

  const recommendationReportType = requireReportString(
    source.recommendationReportType,
    "verifyPoc.jury.recommendationReportType",
  )
  if (recommendationReportType !== VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE) {
    throw new Error(
      `verifyPoc.jury.recommendationReportType must be ${VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE}`,
    )
  }

  return {
    recommendationReportType: VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE,
    action: requireVerifyPocJuryAction(source.action, "verifyPoc.jury.action"),
    rationale: requireReportString(
      source.rationale,
      "verifyPoc.jury.rationale",
    ),
  }
}

function parseVerifyPocTestimonyMetadata(
  value: unknown,
): VerifyPocTestimonyMetadata {
  const source = requireReportObject(value, "verify-poc testimony metadata")
  assertReportKeysExact(
    source,
    VERIFY_POC_TESTIMONY_METADATA_KEYS,
    "verify-poc testimony metadata",
  )

  const recommendationReportType = requireReportString(
    source.recommendationReportType,
    "verifyPoc.testimony.recommendationReportType",
  )
  if (recommendationReportType !== VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE) {
    throw new Error(
      `verifyPoc.testimony.recommendationReportType must be ${VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE}`,
    )
  }

  return {
    recommendationReportType: VERIFY_POC_JURY_RECOMMENDATION_REPORT_TYPE,
    testimony: requireReportString(
      source.testimony,
      "verifyPoc.testimony.testimony",
    ),
  }
}

function parseVerifyPocGroupingMetadata(
  value: unknown,
): VerifyPocGroupingMetadata {
  const source = requireReportObject(value, "verify-poc grouping metadata")
  assertReportKeysExact(
    source,
    VERIFY_POC_GROUPING_METADATA_KEYS,
    "verify-poc grouping metadata",
  )

  const groupingVersion = requireReportString(
    source.groupingVersion,
    "verifyPoc.grouping.groupingVersion",
  )
  if (groupingVersion !== MULTI_GROUPING_VERSION) {
    throw new Error(
      `verifyPoc.grouping.groupingVersion must be ${MULTI_GROUPING_VERSION}`,
    )
  }

  return {
    groupingVersion: MULTI_GROUPING_VERSION,
    cohort: requireVerifyPocGroupingCohort(
      source.cohort,
      "verifyPoc.grouping.cohort",
    ),
    groupId: requireReportString(source.groupId, "verifyPoc.grouping.groupId"),
    clusterKey: requireReportString(
      source.clusterKey,
      "verifyPoc.grouping.clusterKey",
    ),
    groupRank: requireReportPositiveSafeInteger(
      source.groupRank,
      "verifyPoc.grouping.groupRank",
    ),
    cohortRank: requireReportPositiveSafeInteger(
      source.cohortRank,
      "verifyPoc.grouping.cohortRank",
    ),
    memberRank: requireReportPositiveSafeInteger(
      source.memberRank,
      "verifyPoc.grouping.memberRank",
    ),
    groupSize: requireReportPositiveSafeInteger(
      source.groupSize,
      "verifyPoc.grouping.groupSize",
    ),
    representativeSubmissionId: requireReportBigIntLike(
      source.representativeSubmissionId,
      "verifyPoc.grouping.representativeSubmissionId",
    ),
  }
}

function parseVerifyPocJuryCommitmentMetadata(
  value: unknown,
): VerifyPocJuryCommitmentMetadata {
  const source = requireReportObject(value, "verify-poc jury commitment metadata")
  assertReportKeysExact(
    source,
    VERIFY_POC_JURY_COMMITMENT_METADATA_KEYS,
    "verify-poc jury commitment metadata",
  )

  const commitmentVersion = requireReportString(
    source.commitmentVersion,
    "verifyPoc.juryCommitment.commitmentVersion",
  )
  if (commitmentVersion !== VERIFY_POC_JURY_COMMITMENT_VERSION) {
    throw new Error(
      `verifyPoc.juryCommitment.commitmentVersion must be ${VERIFY_POC_JURY_COMMITMENT_VERSION}`,
    )
  }

  return {
    commitmentVersion: VERIFY_POC_JURY_COMMITMENT_VERSION,
    juryLedgerDigest: requireReportBytes32String(
      source.juryLedgerDigest,
      "verifyPoc.juryCommitment.juryLedgerDigest",
    ),
    sourceEventKey: requireReportBytes32String(
      source.sourceEventKey,
      "verifyPoc.juryCommitment.sourceEventKey",
    ),
    mappingFingerprint: requireReportBytes32String(
      source.mappingFingerprint,
      "verifyPoc.juryCommitment.mappingFingerprint",
    ),
  }
}

function parseVerifyPocAdjudicationOasisMetadata(
  value: unknown,
): VerifyPocAdjudicationOasisMetadata {
  const source = requireReportObject(value, "verify-poc adjudication oasis metadata")
  assertReportKeysExact(
    source,
    VERIFY_POC_ADJUDICATION_OASIS_KEYS,
    "verify-poc adjudication oasis metadata",
  )

  return {
    chain: requireReportString(source.chain, "verifyPoc.adjudication.oasis.chain"),
    contract: requireReportAddressString(
      source.contract,
      "verifyPoc.adjudication.oasis.contract",
    ),
    slotId: requireReportString(source.slotId, "verifyPoc.adjudication.oasis.slotId"),
    envelopeHash: requireReportBytes32String(
      source.envelopeHash,
      "verifyPoc.adjudication.oasis.envelopeHash",
    ),
  }
}

function parseVerifyPocAdjudicationMetadata(
  value: unknown,
): VerifyPocAdjudicationMetadata {
  const source = requireReportObject(value, "verify-poc adjudication metadata")
  assertReportKeysExact(
    source,
    VERIFY_POC_ADJUDICATION_METADATA_KEYS,
    "verify-poc adjudication metadata",
  )

  const adjudicationVersion = requireReportString(
    source.adjudicationVersion,
    "verifyPoc.adjudication.adjudicationVersion",
  )
  if (adjudicationVersion !== VERIFY_POC_ADJUDICATION_VERSION) {
    throw new Error(
      `verifyPoc.adjudication.adjudicationVersion must be ${VERIFY_POC_ADJUDICATION_VERSION}`,
    )
  }

  return {
    adjudicationVersion: VERIFY_POC_ADJUDICATION_VERSION,
    syncId: requireReportBytes32String(source.syncId, "verifyPoc.adjudication.syncId"),
    idempotencyKey: requireReportBytes32String(
      source.idempotencyKey,
      "verifyPoc.adjudication.idempotencyKey",
    ),
    cipherURI: requireReportString(source.cipherURI, "verifyPoc.adjudication.cipherURI"),
    severity: requireReportNonNegativeSafeInteger(
      source.severity,
      "verifyPoc.adjudication.severity",
    ),
    juryWindow: requireReportBigIntLike(
      source.juryWindow,
      "verifyPoc.adjudication.juryWindow",
    ),
    adjudicationWindow: requireReportBigIntLike(
      source.adjudicationWindow,
      "verifyPoc.adjudication.adjudicationWindow",
    ),
    commitTimestampSec: requireReportBigIntLike(
      source.commitTimestampSec,
      "verifyPoc.adjudication.commitTimestampSec",
    ),
    revealTimestampSec: requireReportBigIntLike(
      source.revealTimestampSec,
      "verifyPoc.adjudication.revealTimestampSec",
    ),
    sapphireWriteTimestampSec:
      source.sapphireWriteTimestampSec === undefined
        ? undefined
        : requireReportBigIntLike(
            source.sapphireWriteTimestampSec,
            "verifyPoc.adjudication.sapphireWriteTimestampSec",
          ),
    reasonCode: parseOptionalVerifyPocSyncReasonCode(
      source.reasonCode,
      "verifyPoc.adjudication.reasonCode",
    ),
    chainSelectorName: requireReportString(
      source.chainSelectorName,
      "verifyPoc.adjudication.chainSelectorName",
    ),
    bountyHubAddress: requireReportAddressString(
      source.bountyHubAddress,
      "verifyPoc.adjudication.bountyHubAddress",
    ),
    txHash:
      source.txHash === undefined
        ? undefined
        : requireReportBytes32String(source.txHash, "verifyPoc.adjudication.txHash"),
    logIndex:
      source.logIndex === undefined
        ? undefined
        : requireReportBigIntLike(source.logIndex, "verifyPoc.adjudication.logIndex"),
    oasis: parseVerifyPocAdjudicationOasisMetadata(source.oasis),
  }
}

function parseVerifyPocAdjudicationFinalLifecycleStatus(
  value: unknown,
  fieldName: string,
): VerifyPocAdjudicationFinalLifecycleStatus {
  const normalized = requireReportString(value, fieldName)
  if (normalized !== "VERIFIED" && normalized !== "INVALID") {
    throw new Error(`${fieldName} must be VERIFIED or INVALID`)
  }

  return normalized
}

function parseVerifyPocAdjudicationFinalVerdictSource(
  value: unknown,
  fieldName: string,
): VerifyPocAdjudicationFinalVerdictSource {
  const normalized = requireReportString(value, fieldName)
  if (normalized !== "JURY" && normalized !== "OWNER") {
    throw new Error(`${fieldName} must be JURY or OWNER`)
  }

  return normalized
}

function parseVerifyPocAdjudicationFinalValidity(
  value: unknown,
  fieldName: string,
): VerifyPocAdjudicationFinalValidity {
  const normalized = requireReportString(value, fieldName)
  if (
    normalized !== "HIGH" &&
    normalized !== "MEDIUM" &&
    normalized !== "INVALID"
  ) {
    throw new Error(`${fieldName} must be HIGH, MEDIUM, or INVALID`)
  }

  return normalized
}

function parseOptionalVerifyPocBytes32String(
  value: unknown,
  fieldName: string,
): `0x${string}` | undefined {
  return value === undefined
    ? undefined
    : requireReportBytes32String(value, fieldName)
}

function parseVerifyPocAdjudicationFinalPayload(
  value: unknown,
): VerifyPocAdjudicationFinalPayload {
  const source = requireReportObject(value, "verify-poc adjudication final payload")
  assertReportKeysExact(
    source,
    VERIFY_POC_ADJUDICATION_FINAL_PAYLOAD_KEYS,
    "verify-poc adjudication final payload",
  )

  const lifecycleStatus = parseVerifyPocAdjudicationFinalLifecycleStatus(
    source.lifecycleStatus,
    "verifyPoc.adjudicationFinal.lifecycleStatus",
  )
  const verdictSource = parseVerifyPocAdjudicationFinalVerdictSource(
    source.verdictSource,
    "verifyPoc.adjudicationFinal.verdictSource",
  )
  const finalValidity = parseVerifyPocAdjudicationFinalValidity(
    source.finalValidity,
    "verifyPoc.adjudicationFinal.finalValidity",
  )
  const isValid = requireReportBoolean(
    source.isValid,
    "verifyPoc.adjudicationFinal.isValid",
  )
  const drainAmountWei = requireReportBigIntLike(
    source.drainAmountWei,
    "verifyPoc.adjudicationFinal.drainAmountWei",
  )
  const ownerTestimonyDigest = parseOptionalVerifyPocBytes32String(
    source.ownerTestimonyDigest,
    "verifyPoc.adjudicationFinal.ownerTestimonyDigest",
  )

  if (lifecycleStatus === "VERIFIED") {
    if (
      (finalValidity !== "HIGH" && finalValidity !== "MEDIUM") ||
      !isValid
    ) {
      throw new Error(
        "verifyPoc.adjudicationFinal lifecycleStatus VERIFIED requires HIGH or MEDIUM final validity and isValid=true",
      )
    }
    if (drainAmountWei === 0n) {
      throw new Error(
        "verifyPoc.adjudicationFinal.drainAmountWei must be positive when finalValidity is HIGH or MEDIUM",
      )
    }
  } else {
    if (finalValidity !== "INVALID" || isValid) {
      throw new Error(
        "verifyPoc.adjudicationFinal lifecycleStatus INVALID requires INVALID final validity and isValid=false",
      )
    }
    if (drainAmountWei !== 0n) {
      throw new Error(
        "verifyPoc.adjudicationFinal.drainAmountWei must be zero when finalValidity is INVALID",
      )
    }
  }

  if (verdictSource === "OWNER" && ownerTestimonyDigest === undefined) {
    throw new Error(
      "verifyPoc.adjudicationFinal.ownerTestimonyDigest is required when verdictSource is OWNER",
    )
  }

  if (verdictSource === "JURY" && ownerTestimonyDigest !== undefined) {
    throw new Error(
      "verifyPoc.adjudicationFinal.ownerTestimonyDigest cannot be set when verdictSource is JURY",
    )
  }

  const evidenceReportType = requireReportString(
    source.evidenceReportType,
    "verifyPoc.adjudicationFinal.evidenceReportType",
  )
  if (evidenceReportType !== VERIFY_POC_TYPED_REPORT_V3) {
    throw new Error(
      `verifyPoc.adjudicationFinal.evidenceReportType must be ${VERIFY_POC_TYPED_REPORT_V3}`,
    )
  }

  return {
    submissionId: requireReportBigIntLike(
      source.submissionId,
      "verifyPoc.adjudicationFinal.submissionId",
    ),
    projectId: requireReportBigIntLike(
      source.projectId,
      "verifyPoc.adjudicationFinal.projectId",
    ),
    juryRoundId: requireReportBigIntLike(
      source.juryRoundId,
      "verifyPoc.adjudicationFinal.juryRoundId",
    ),
    lifecycleStatus,
    verdictSource,
    finalValidity,
    isValid,
    drainAmountWei,
    rationale: requireReportString(
      source.rationale,
      "verifyPoc.adjudicationFinal.rationale",
    ),
    juryDeadlineTimestampSec: requireReportBigIntLike(
      source.juryDeadlineTimestampSec,
      "verifyPoc.adjudicationFinal.juryDeadlineTimestampSec",
    ),
    adjudicationDeadlineTimestampSec: requireReportBigIntLike(
      source.adjudicationDeadlineTimestampSec,
      "verifyPoc.adjudicationFinal.adjudicationDeadlineTimestampSec",
    ),
    evidenceReportType: VERIFY_POC_TYPED_REPORT_V3,
    juryLedgerDigest: requireReportBytes32String(
      source.juryLedgerDigest,
      "verifyPoc.adjudicationFinal.juryLedgerDigest",
    ),
    ownerTestimonyDigest,
    sourceEventKey: requireReportBytes32String(
      source.sourceEventKey,
      "verifyPoc.adjudicationFinal.sourceEventKey",
    ),
    mappingFingerprint: requireReportBytes32String(
      source.mappingFingerprint,
      "verifyPoc.adjudicationFinal.mappingFingerprint",
    ),
    syncId: requireReportBytes32String(
      source.syncId,
      "verifyPoc.adjudicationFinal.syncId",
    ),
    idempotencyKey: requireReportBytes32String(
      source.idempotencyKey,
      "verifyPoc.adjudicationFinal.idempotencyKey",
    ),
    cipherURI: requireReportString(
      source.cipherURI,
      "verifyPoc.adjudicationFinal.cipherURI",
    ),
    severity: requireReportNonNegativeSafeInteger(
      source.severity,
      "verifyPoc.adjudicationFinal.severity",
    ),
    chainSelectorName: requireReportString(
      source.chainSelectorName,
      "verifyPoc.adjudicationFinal.chainSelectorName",
    ),
    bountyHubAddress: requireReportAddressString(
      source.bountyHubAddress,
      "verifyPoc.adjudicationFinal.bountyHubAddress",
    ),
    oasisEnvelopeHash: requireReportBytes32String(
      source.oasisEnvelopeHash,
      "verifyPoc.adjudicationFinal.oasisEnvelopeHash",
    ),
    rosterCommitment: requireReportObject(
      source.rosterCommitment,
      "verifyPoc.adjudicationFinal.rosterCommitment",
    ),
  }
}

function parseVerifyPocAdjudicationFinalEnvelopeObject(
  value: unknown,
): VerifyPocAdjudicationFinalEnvelope {
  const source = requireReportObject(value, "verify-poc adjudication final envelope")
  assertReportKeysExact(
    source,
    VERIFY_POC_ADJUDICATION_FINAL_REPORT_KEYS,
    "verify-poc adjudication final envelope",
  )

  const magic = requireReportString(source.magic, "verifyPoc.magic")
  if (magic !== VERIFY_POC_REPORT_ENVELOPE_MAGIC) {
    throw new Error(`verifyPoc.magic must be ${VERIFY_POC_REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireReportString(source.reportType, "verifyPoc.reportType")
  if (reportType !== VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE) {
    throw new Error(
      `verifyPoc.reportType must be ${VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE}`,
    )
  }

  return {
    magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
    reportType: VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE,
    payload: parseVerifyPocAdjudicationFinalPayload(source.payload),
    grouping:
      source.grouping === undefined
        ? undefined
        : parseVerifyPocGroupingMetadata(source.grouping),
  }
}

function parseVerifyPocOwnerAdjudicationExpiredPayload(
  value: unknown,
): VerifyPocOwnerAdjudicationExpiredPayload {
  const source = requireReportObject(
    value,
    "verify-poc owner adjudication expired payload",
  )
  assertReportKeysExact(
    source,
    VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_PAYLOAD_KEYS,
    "verify-poc owner adjudication expired payload",
  )

  const lifecycleStatus = requireReportString(
    source.lifecycleStatus,
    "verifyPoc.ownerAdjudicationExpired.lifecycleStatus",
  )
  if (lifecycleStatus !== "OWNER_ADJUDICATION_EXPIRED") {
    throw new Error(
      "verifyPoc.ownerAdjudicationExpired.lifecycleStatus must be OWNER_ADJUDICATION_EXPIRED",
    )
  }

  const resolution = requireReportString(
    source.resolution,
    "verifyPoc.ownerAdjudicationExpired.resolution",
  )
  if (resolution !== "UNRESOLVED") {
    throw new Error(
      "verifyPoc.ownerAdjudicationExpired.resolution must be UNRESOLVED",
    )
  }

  const evidenceReportType = requireReportString(
    source.evidenceReportType,
    "verifyPoc.ownerAdjudicationExpired.evidenceReportType",
  )
  if (evidenceReportType !== VERIFY_POC_TYPED_REPORT_V3) {
    throw new Error(
      `verifyPoc.ownerAdjudicationExpired.evidenceReportType must be ${VERIFY_POC_TYPED_REPORT_V3}`,
    )
  }

  return {
    submissionId: requireReportBigIntLike(
      source.submissionId,
      "verifyPoc.ownerAdjudicationExpired.submissionId",
    ),
    projectId: requireReportBigIntLike(
      source.projectId,
      "verifyPoc.ownerAdjudicationExpired.projectId",
    ),
    juryRoundId: requireReportBigIntLike(
      source.juryRoundId,
      "verifyPoc.ownerAdjudicationExpired.juryRoundId",
    ),
    lifecycleStatus: "OWNER_ADJUDICATION_EXPIRED",
    resolution: "UNRESOLVED",
    scopeKey: requireReportBytes32String(
      source.scopeKey,
      "verifyPoc.ownerAdjudicationExpired.scopeKey",
    ),
    juryDeadlineTimestampSec: requireReportBigIntLike(
      source.juryDeadlineTimestampSec,
      "verifyPoc.ownerAdjudicationExpired.juryDeadlineTimestampSec",
    ),
    adjudicationDeadlineTimestampSec: requireReportBigIntLike(
      source.adjudicationDeadlineTimestampSec,
      "verifyPoc.ownerAdjudicationExpired.adjudicationDeadlineTimestampSec",
    ),
    submittedAtTimestampSec: requireReportBigIntLike(
      source.submittedAtTimestampSec,
      "verifyPoc.ownerAdjudicationExpired.submittedAtTimestampSec",
    ),
    evidenceReportType: VERIFY_POC_TYPED_REPORT_V3,
    oasisEnvelopeHash: requireReportBytes32String(
      source.oasisEnvelopeHash,
      "verifyPoc.ownerAdjudicationExpired.oasisEnvelopeHash",
    ),
    reason: requireReportString(
      source.reason,
      "verifyPoc.ownerAdjudicationExpired.reason",
    ),
  }
}

function parseVerifyPocOwnerAdjudicationExpiredEnvelopeObject(
  value: unknown,
): VerifyPocOwnerAdjudicationExpiredEnvelope {
  const source = requireReportObject(
    value,
    "verify-poc owner adjudication expired envelope",
  )
  assertReportKeysExact(
    source,
    VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_KEYS,
    "verify-poc owner adjudication expired envelope",
  )

  const magic = requireReportString(source.magic, "verifyPoc.magic")
  if (magic !== VERIFY_POC_REPORT_ENVELOPE_MAGIC) {
    throw new Error(`verifyPoc.magic must be ${VERIFY_POC_REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireReportString(source.reportType, "verifyPoc.reportType")
  if (reportType !== VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE) {
    throw new Error(
      `verifyPoc.reportType must be ${VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE}`,
    )
  }

  return {
    magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
    reportType: VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE,
    payload: parseVerifyPocOwnerAdjudicationExpiredPayload(source.payload),
  }
}

function parseVerifyPocTypedReportEnvelopeObject(
  value: unknown,
): VerifyPocTypedReportEnvelope {
  const source = requireReportObject(value, "verify-poc report envelope")
  const magic = requireReportString(source.magic, "verifyPoc.magic")
  if (magic !== VERIFY_POC_REPORT_ENVELOPE_MAGIC) {
    throw new Error(
      `verifyPoc.magic must be ${VERIFY_POC_REPORT_ENVELOPE_MAGIC}`,
    )
  }

  const reportType = requireReportString(source.reportType, "verifyPoc.reportType")
  if (reportType === VERIFY_POC_TYPED_REPORT_V1) {
    assertReportKeysExact(
      source,
      VERIFY_POC_TYPED_REPORT_V1_KEYS,
      "verify-poc report envelope",
    )

    return {
      magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
      reportType: VERIFY_POC_TYPED_REPORT_V1,
      payload: parseVerifyPocTypedPayload(source.payload),
    }
  }

  if (reportType === VERIFY_POC_TYPED_REPORT_V2) {
    assertReportKeysExact(
      source,
      VERIFY_POC_TYPED_REPORT_V2_KEYS,
      "verify-poc report envelope",
    )

    return {
      magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
      reportType: VERIFY_POC_TYPED_REPORT_V2,
      payload: parseVerifyPocTypedPayload(source.payload),
      jury:
        source.jury === undefined
          ? undefined
          : parseVerifyPocJuryMetadata(source.jury),
      testimony:
        source.testimony === undefined
          ? undefined
          : parseVerifyPocTestimonyMetadata(source.testimony),
      grouping:
        source.grouping === undefined
          ? undefined
          : parseVerifyPocGroupingMetadata(source.grouping),
    }
  }

  if (reportType === VERIFY_POC_TYPED_REPORT_V3) {
    assertReportKeysExact(
      source,
      VERIFY_POC_TYPED_REPORT_V3_KEYS,
      "verify-poc report envelope",
    )

    return {
      magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
      reportType: VERIFY_POC_TYPED_REPORT_V3,
      payload: parseVerifyPocTypedPayload(source.payload),
      juryCommitment: parseVerifyPocJuryCommitmentMetadata(source.juryCommitment),
      adjudication: parseVerifyPocAdjudicationMetadata(source.adjudication),
    }
  }

  throw new Error(
    `verifyPoc.reportType must be ${VERIFY_POC_TYPED_REPORT_V1}, ${VERIFY_POC_TYPED_REPORT_V2}, or ${VERIFY_POC_TYPED_REPORT_V3}`,
  )
}

export function encodeVerifyPocTypedReportEnvelope(
  envelope: VerifyPocTypedReportEnvelope,
): string {
  const normalized = parseVerifyPocTypedReportEnvelopeObject(envelope)

  return JSON.stringify(normalized, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  )
}

export function decodeVerifyPocReportEnvelope(
  report: string | VerifyPocDecodedReportEnvelope,
): VerifyPocDecodedReportEnvelope {
  if (typeof report === "string" && report.startsWith("0x")) {
    const [submissionId, isValid, drainAmountWei] = decodeAbiParameters(
      BountyResultParamsV2,
      report as `0x${string}`,
    )

    return {
      reportType: VERIFY_POC_LEGACY_REPORT_TYPE,
      payload: {
        submissionId,
        isValid,
        drainAmountWei,
      },
    }
  }

  const source = typeof report === "string" ? JSON.parse(report) : report
  const envelopeSource = requireReportObject(source, "verify-poc report envelope")
  const reportType = requireReportString(
    envelopeSource.reportType,
    "verifyPoc.reportType",
  )
  if (reportType === VERIFY_POC_LEGACY_REPORT_TYPE) {
    const payloadSource = requireReportObject(
      envelopeSource.payload,
      "verify-poc legacy report payload",
    )
    return {
      reportType: VERIFY_POC_LEGACY_REPORT_TYPE,
      payload: {
        submissionId: requireReportBigIntLike(
          payloadSource.submissionId,
          "verifyPoc.legacy.submissionId",
        ),
        isValid: requireReportBoolean(
          payloadSource.isValid,
          "verifyPoc.legacy.isValid",
        ),
        drainAmountWei: requireReportBigIntLike(
          payloadSource.drainAmountWei,
          "verifyPoc.legacy.drainAmountWei",
        ),
      },
    }
  }

  if (reportType === VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE) {
    return parseVerifyPocAdjudicationFinalEnvelopeObject(envelopeSource)
  }

  if (reportType === VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE) {
    return parseVerifyPocOwnerAdjudicationExpiredEnvelopeObject(envelopeSource)
  }

  return parseVerifyPocTypedReportEnvelopeObject(source)
}

export function encodeVerifyPocLegacyReport(
  submissionId: bigint,
  isValid: boolean,
  drainAmountWei: bigint,
): `0x${string}` {
  return encodeAbiParameters(BountyResultParamsV2, [
    submissionId,
    isValid,
    drainAmountWei,
  ])
}

export function encodeVerifyPocContractReport(
  report: VerifyPocDecodedReportEnvelope | string,
): `0x${string}` {
  const normalized = decodeVerifyPocReportEnvelope(report)

  if (normalized.reportType === VERIFY_POC_LEGACY_REPORT_TYPE) {
    return encodeVerifyPocLegacyReport(
      normalized.payload.submissionId,
      normalized.payload.isValid,
      normalized.payload.drainAmountWei,
    )
  }

  if (normalized.reportType === VERIFY_POC_TYPED_REPORT_V3) {
    throw new Error("verified-report/v3 evidence packages are not contract-writable")
  }

  if (normalized.reportType === VERIFY_POC_OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE) {
    throw new Error(
      "owner-adjudication-expired/v1 cannot be committed as a final verdict",
    )
  }

  if (normalized.reportType === VERIFY_POC_ADJUDICATION_FINAL_REPORT_TYPE) {
    throw new Error(
      "adjudication-final/v1 must be encoded by jury-orchestrator",
    )
  }

  const jury =
    normalized.reportType === VERIFY_POC_TYPED_REPORT_V2
      ? normalized.jury
      : undefined
  const grouping =
    normalized.reportType === VERIFY_POC_TYPED_REPORT_V2
      ? normalized.grouping
      : undefined

  const payload = encodeAbiParameters(VerifyPocTypedContractReportParams, [
    normalized.payload.submissionId,
    normalized.payload.isValid,
    normalized.payload.drainAmountWei,
    jury !== undefined,
    jury?.action ?? "",
    jury?.rationale ?? "",
    grouping !== undefined,
    grouping?.cohort ?? "",
    grouping?.groupId ?? "",
    BigInt(grouping?.groupRank ?? 0),
    BigInt(grouping?.groupSize ?? 0),
  ])

  return encodeAbiParameters(TypedReportEnvelopeParams, [
    VERIFY_POC_REPORT_ENVELOPE_MAGIC_HEX,
    VERIFY_POC_CONTRACT_TYPED_REPORT_TYPE,
    payload,
  ])
}

export function buildVerifyPocStrictPassReportEnvelope(args: {
  submissionId: bigint
  projectId: bigint
  verifyResult: Pick<VerificationResult, "isValid" | "drainAmountWei">
}): VerifyPocTypedReportEnvelopeV2 {
  return {
    magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
    reportType: VERIFY_POC_TYPED_REPORT_V2,
    payload: {
      submissionId: args.submissionId,
      projectId: args.projectId,
      isValid: args.verifyResult.isValid,
      drainAmountWei: args.verifyResult.drainAmountWei,
      observedCalldata: [],
    },
  }
}

function deriveVerifyPocStrictFailJuryLedgerDigest(args: {
  submissionId: bigint
  projectId: bigint
  syncId: `0x${string}`
  sourceEventKey: `0x${string}`
  mappingFingerprint: `0x${string}`
  envelopeHash: `0x${string}`
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(VerifyPocStrictFailJuryDigestParams, [
      VERIFY_POC_JURY_COMMITMENT_VERSION,
      args.submissionId,
      args.projectId,
      args.syncId,
      args.sourceEventKey,
      args.mappingFingerprint,
      args.envelopeHash,
    ]),
  )
}

export function buildVerifyPocStrictFailEvidenceEnvelope(args: {
  submissionId: bigint
  projectId: bigint
  cipherURI: string
  severity: number
  juryWindow: bigint
  adjudicationWindow: bigint
  commitTimestampSec: bigint
  revealTimestampSec: bigint
  syncId: `0x${string}`
  oasisReference: {
    pointer: {
      chain: string
      contract: `0x${string}`
      slotId: string
    }
    envelopeHash: `0x${string}`
  }
  sourceEventKey: `0x${string}`
  idempotencyKey: `0x${string}`
  mappingFingerprint: `0x${string}`
  verifyResult: VerificationResult
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  txHash?: `0x${string}` | string
  logIndex?: bigint | number | string
}): VerifyPocTypedReportEnvelopeV3 {
  const txHash =
    typeof args.txHash === "string" && args.txHash.length > 0
      ? (args.txHash.toLowerCase() as `0x${string}`)
      : undefined
  const logIndex =
    args.logIndex === undefined
      ? undefined
      : typeof args.logIndex === "bigint"
        ? args.logIndex
        : BigInt(args.logIndex)

  return {
    magic: VERIFY_POC_REPORT_ENVELOPE_MAGIC,
    reportType: VERIFY_POC_TYPED_REPORT_V3,
    payload: {
      submissionId: args.submissionId,
      projectId: args.projectId,
      isValid: args.verifyResult.isValid,
      drainAmountWei: args.verifyResult.drainAmountWei,
      observedCalldata: [],
    },
    juryCommitment: {
      commitmentVersion: VERIFY_POC_JURY_COMMITMENT_VERSION,
      juryLedgerDigest: deriveVerifyPocStrictFailJuryLedgerDigest({
        submissionId: args.submissionId,
        projectId: args.projectId,
        syncId: args.syncId,
        sourceEventKey: args.sourceEventKey,
        mappingFingerprint: args.mappingFingerprint,
        envelopeHash: args.oasisReference.envelopeHash,
      }),
      sourceEventKey: args.sourceEventKey,
      mappingFingerprint: args.mappingFingerprint,
    },
    adjudication: {
      adjudicationVersion: VERIFY_POC_ADJUDICATION_VERSION,
      syncId: args.syncId,
      idempotencyKey: args.idempotencyKey,
      cipherURI: args.cipherURI,
      severity: args.severity,
      juryWindow: args.juryWindow,
      adjudicationWindow: args.adjudicationWindow,
      commitTimestampSec: args.commitTimestampSec,
      revealTimestampSec: args.revealTimestampSec,
      sapphireWriteTimestampSec: args.verifyResult.sapphireWriteTimestampSec,
      reasonCode: args.verifyResult.reasonCode,
      chainSelectorName: args.chainSelectorName,
      bountyHubAddress: args.bountyHubAddress.toLowerCase() as `0x${string}`,
      txHash,
      logIndex,
      oasis: {
        chain: args.oasisReference.pointer.chain,
        contract: args.oasisReference.pointer.contract.toLowerCase() as `0x${string}`,
        slotId: args.oasisReference.pointer.slotId,
        envelopeHash: args.oasisReference.envelopeHash.toLowerCase() as `0x${string}`,
      },
    },
  }
}

const VNET_STATUS_ACTIVE = 2
const VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_VERSION =
  "anti-soon.verify-poc.revealed-map.v1"
const VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_MODE = "poc_revealed"
const VERIFY_POC_IDEMPOTENCY_STORE_PATH_ENV =
  "VERIFY_POC_IDEMPOTENCY_STORE_PATH"
const DEFAULT_VERIFY_POC_IDEMPOTENCY_STORE_PATH =
  ".verify-poc-idempotency-store.json"
const SEPOLIA_RPC_URL = "https://rpc.sepolia.org"
let verifyPocIdempotencyStore: VerifyPocIdempotencyStore | undefined

const ProjectStructAbi = parseAbiParameters(
  "address owner, uint256 bountyPool, uint256 maxPayoutPerBug, address targetContract, uint256 forkBlock, bool active, uint8 mode, uint256 commitDeadline, uint256 revealDeadline, uint256 disputeWindow, uint256 juryWindow, uint256 adjudicationWindow, bytes32 rulesHash, uint8 vnetStatus, string vnetRpcUrl, bytes32 baseSnapshotId, uint256 vnetCreatedAt, string repoUrl"
)

const ProjectAdjudicationWindowsAbi = parseAbiParameters(
  "uint256 juryWindow, uint256 adjudicationWindow",
)

const OasisPoCStoreReadAbi = parseAbi([
  "function read(string slotId) view returns (string payload)",
  "function readMeta(string slotId) view returns (address writer, uint256 storedAt)",
])

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

type AuthorizedReadMeta = {
  authorizedCaller: `0x${string}`
  storedAtSec: bigint
}

type OasisStoredPayload = {
  payload: unknown
  sapphireWriteTimestampSec: bigint
}

type OasisReadResult = {
  poc: PoCData
  sapphireWriteTimestampSec: bigint
}

export function decodeAuthorizedReadMeta(
  metaResult: `0x${string}`,
): AuthorizedReadMeta {
  const [writer, storedAt] = decodeFunctionResult({
    abi: OasisPoCStoreReadAbi,
    functionName: "readMeta",
    data: metaResult,
  })

  const authorizedCaller = writer as `0x${string}`
  if (authorizedCaller.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("Oasis storage metadata missing writer for slot")
  }

  return {
    authorizedCaller,
    storedAtSec: storedAt as bigint,
  }
}

export function decodeAuthorizedReadCaller(metaResult: `0x${string}`): `0x${string}` {
  return decodeAuthorizedReadMeta(metaResult).authorizedCaller
}

export function buildAuthorizedReadCallParams(
  contract: string,
  callData: `0x${string}`,
  authorizedCaller: `0x${string}`,
): [{ to: string; data: `0x${string}`; from: `0x${string}` }, "latest"] {
  return [
    {
      to: contract,
      data: callData,
      from: authorizedCaller,
    },
    "latest",
  ]
}

type ProjectVnetInfo = {
  vnetRpcUrl: string
  baseSnapshotId: string
  vnetStatus: number
}

type ProjectAdjudicationWindows = {
  juryWindow: bigint
  adjudicationWindow: bigint
}

export function reconcileVerifyPocSyncDrift(
  records: readonly VerifyPocReconciliationRecord[],
): VerifyPocReconciliationScanResult {
  return reconcileVerifyPocOrphans(records)
}

export function buildReconciliationSyncMetricEvents(
  scanResult: VerifyPocReconciliationScanResult,
): VerifyPocSyncMetricEvent[] {
  return scanResult.outcomes.map((outcome) =>
    buildVerifyPocSyncMetricEvent({
      syncId: outcome.syncId,
      transition: "ORPHAN_RECONCILED",
      reasonCode: reconciliationActionToSyncReasonCode(outcome.action),
      latencyBuckets: {
        write_to_commit_ms: null,
        commit_to_reveal_ms: null,
        reveal_to_report_ms: null,
      },
    }),
  )
}

function logVerifyPocSyncMetric(
  runtime: Runtime<Config> | NodeRuntime<Config>,
  event: VerifyPocSyncMetricEvent,
): void {
  runtime.log(`SYNC_METRIC ${JSON.stringify(event)}`)
}

function nowEpochSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000))
}

function readProcessEnv(name: string): string | undefined {
  const runtimeGlobal = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  return runtimeGlobal.process?.env?.[name]
}

function getVerifyPocIdempotencyStore(
  runtime: Runtime<Config>,
): VerifyPocIdempotencyStore {
  if (!verifyPocIdempotencyStore) {
    const configuredPath = readProcessEnv(
      VERIFY_POC_IDEMPOTENCY_STORE_PATH_ENV,
    )
    const filePath =
      configuredPath && configuredPath.length > 0
        ? configuredPath
        : DEFAULT_VERIFY_POC_IDEMPOTENCY_STORE_PATH
    verifyPocIdempotencyStore = loadVerifyPocIdempotencyStore(filePath)
    runtime.log(
      `Loaded durable idempotency store: path=${filePath}, recoveredProcessing=${verifyPocIdempotencyStore.recoveredProcessingCount}`,
    )
  }

  return verifyPocIdempotencyStore
}

function encodeProjectCall(projectId: bigint): string {
  const selector = keccak256(toBytes("projects(uint256)")).slice(0, 10)
  const encodedId = encodeAbiParameters(parseAbiParameters("uint256"), [projectId])
  return selector + encodedId.slice(2)
}

function decodeProjectVnetInfo(hexResult: string): ProjectVnetInfo {
  const projectResult = normalizeProjectReadResult(hexResult)
  const decoded = decodeAbiParameters(ProjectStructAbi, projectResult)
  return {
    vnetRpcUrl: decoded[14] as string,
    baseSnapshotId: decoded[15] as string,
    vnetStatus: Number(decoded[13]),
  }
}

function encodeProjectAdjudicationWindowsCall(projectId: bigint): string {
  const selector = keccak256(toBytes("getProjectAdjudicationWindows(uint256)")).slice(0, 10)
  const encodedId = encodeAbiParameters(parseAbiParameters("uint256"), [projectId])
  return selector + encodedId.slice(2)
}

function decodeProjectAdjudicationWindows(
  hexResult: string,
): ProjectAdjudicationWindows {
  const normalized = normalizeProjectReadResult(hexResult)
  const [juryWindow, adjudicationWindow] = decodeAbiParameters(
    ProjectAdjudicationWindowsAbi,
    normalized,
  )

  return {
    juryWindow,
    adjudicationWindow,
  }
}

function readProjectAdjudicationWindowsInNode(
  nodeRuntime: NodeRuntime<Config>,
  projectId: bigint,
): ProjectAdjudicationWindows {
  const callData = encodeProjectAdjudicationWindowsCall(projectId)
  const callResult = runEthCallReadWithRetry(nodeRuntime, {
    network: "sepolia",
    operation: "sepolia.projectAdjudicationWindows.read",
    endpoints: getSepoliaReadEndpoints(nodeRuntime.config),
    retryPolicy: nodeRuntime.config.rpcReadRetry,
    callParams: [
      {
        to: nodeRuntime.config.bountyHubAddress,
        data: callData,
      },
      "latest",
    ],
    requestId: 8,
    httpErrorPrefix: `Failed to read project adjudication windows for ${projectId}`,
    rpcErrorPrefix: `Failed to read project adjudication windows for ${projectId}`,
    invalidResponseMessage:
      `Failed to read project adjudication windows for ${projectId}: invalid eth_call response`,
    emptyResponseMessage:
      `Failed to read project adjudication windows for ${projectId}: returned empty payload`,
  })

  return decodeProjectAdjudicationWindows(callResult)
}

function normalizeProjectReadResult(hexResult: string): `0x${string}` {
  const normalized = hexResult.startsWith("0x") ? hexResult.toLowerCase() : `0x${hexResult.toLowerCase()}`

  if (normalized.length < 66) {
    throw new Error("Invalid project read result: too short")
  }

  const headWord = BigInt(`0x${normalized.slice(2, 66)}`)
  if (headWord === 32n) {
    return `0x${normalized.slice(66)}` as `0x${string}`
  }

  return normalized as `0x${string}`
}

function parsePoCData(value: unknown): PoCData {
  if (typeof value !== "object" || value === null) {
    throw new Error("PoC payload must be an object")
  }

  const candidate = value as Partial<PoCData>
  if (
    !candidate.target ||
    typeof candidate.target.contract !== "string" ||
    typeof candidate.target.chain !== "number" ||
    typeof candidate.target.forkBlock !== "number" ||
    !Array.isArray(candidate.setup) ||
    !Array.isArray(candidate.transactions) ||
    !candidate.expectedImpact ||
    typeof candidate.expectedImpact.type !== "string" ||
    typeof candidate.expectedImpact.estimatedLoss !== "string" ||
    typeof candidate.expectedImpact.description !== "string"
  ) {
    throw new Error("PoC payload shape is invalid")
  }

  return candidate as PoCData
}

function parseValidatedPoCPayload(payload: unknown): PoCData {
  if (typeof payload !== "object" || payload === null || !("poc" in payload)) {
    throw new Error("Oasis payload does not include PoC data")
  }

  return parsePoCData((payload as { poc: unknown }).poc)
}

function createHttpStatusError(message: string, statusCode: number): Error {
  const error = new Error(message) as Error & { statusCode: number }
  error.statusCode = statusCode
  return error
}

function getSepoliaReadEndpoints(config: Config): string[] {
  return buildRpcEndpointPool(
    config.sepoliaRpcUrl ?? SEPOLIA_RPC_URL,
    config.sepoliaRpcFallbackUrls,
  )
}

function getOasisReadEndpoints(config: Config): string[] {
  if (!config.oasisRpcUrl) {
    throw new Error("oasisRpcUrl is required for Oasis RPC reads")
  }

  return buildRpcEndpointPool(config.oasisRpcUrl, config.oasisRpcFallbackUrls)
}

function runEthCallReadWithRetry(
  nodeRuntime: NodeRuntime<Config>,
  args: {
    network: "sapphire" | "sepolia"
    operation: string
    endpoints: string[]
    retryPolicy: RpcReadRetryPolicy
    callParams: unknown[]
    requestId: number
    httpErrorPrefix: string
    rpcErrorPrefix: string
    invalidResponseMessage: string
    emptyResponseMessage: string
  },
): `0x${string}` {
  const httpClient = new HTTPClient()

  return runRpcReadWithRetry({
    network: args.network,
    operation: args.operation,
    endpoints: args.endpoints,
    retryPolicy: args.retryPolicy,
    execute: (endpoint: string) => {
      const response = httpClient
        .sendRequest(nodeRuntime, {
          url: endpoint,
          method: "POST" as const,
          headers: { "Content-Type": "application/json" },
          body: encodeJsonBodyBase64({
            jsonrpc: "2.0",
            method: "eth_call",
            params: args.callParams,
            id: args.requestId,
          }),
          cacheSettings: { maxAge: "0s" },
        })
        .result()

      if (response.statusCode !== 200) {
        throw createHttpStatusError(
          `${args.httpErrorPrefix}: status ${response.statusCode}`,
          response.statusCode,
        )
      }

      const payload = JSON.parse(new TextDecoder().decode(response.body)) as {
        result?: `0x${string}`
        error?: { message?: string }
      }

      if (payload.error) {
        throw new Error(
          `${args.rpcErrorPrefix}: ${payload.error.message ?? "unknown error"}`,
        )
      }

      if (typeof payload.result !== "string") {
        throw new Error(args.invalidResponseMessage)
      }

      if (payload.result === "0x") {
        throw new Error(args.emptyResponseMessage)
      }

      return payload.result
    },
  })
}

function readStoredPayloadFromOasisContract(
  nodeRuntime: NodeRuntime<Config>,
  reference: OasisReference,
): OasisStoredPayload {
  const config = nodeRuntime.config
  const retryPolicy = config.rpcReadRetry
  const oasisReadEndpoints = getOasisReadEndpoints(config)
  const metaCallData = encodeFunctionData({
    abi: OasisPoCStoreReadAbi,
    functionName: "readMeta",
    args: [reference.pointer.slotId],
  })

  const metaResult = runEthCallReadWithRetry(nodeRuntime, {
    network: "sapphire",
    operation: "oasis.readMeta",
    endpoints: oasisReadEndpoints,
    retryPolicy,
    callParams: [{ to: reference.pointer.contract, data: metaCallData }, "latest"],
    requestId: 28,
    httpErrorPrefix: "Oasis RPC readMeta eth_call failed",
    rpcErrorPrefix: "Oasis storage readMeta failed",
    invalidResponseMessage: "Oasis storage readMeta returned invalid payload",
    emptyResponseMessage: "Oasis storage readMeta returned empty payload",
  })

  const authorizedReadMeta = decodeAuthorizedReadMeta(metaResult)

  const callData = encodeFunctionData({
    abi: OasisPoCStoreReadAbi,
    functionName: "read",
    args: [reference.pointer.slotId],
  })

  const callResult = runEthCallReadWithRetry(nodeRuntime, {
    network: "sapphire",
    operation: "oasis.read",
    endpoints: oasisReadEndpoints,
    retryPolicy,
    callParams: buildAuthorizedReadCallParams(
      reference.pointer.contract,
      callData,
      authorizedReadMeta.authorizedCaller,
    ),
    requestId: 29,
    httpErrorPrefix: "Oasis RPC eth_call failed",
    rpcErrorPrefix: "Oasis storage read failed",
    invalidResponseMessage: "Oasis storage read returned invalid payload",
    emptyResponseMessage: "Oasis storage read returned empty payload",
  })

  const [payloadJson] = decodeFunctionResult({
    abi: OasisPoCStoreReadAbi,
    functionName: "read",
    data: callResult,
  })

  return {
    payload: JSON.parse(payloadJson),
    sapphireWriteTimestampSec: authorizedReadMeta.storedAtSec,
  }
}

function readPoCFromOasisRpc(
  nodeRuntime: NodeRuntime<Config>,
  reference: OasisReference,
  submissionId: bigint,
): OasisReadResult {
  const parsedPayload = readStoredPayloadFromOasisContract(nodeRuntime, reference)

  const validated = validateOasisRpcPayload({
    reference,
    submissionId,
    payload: parsedPayload.payload,
  })

  if (!validated.ok) {
    throw new Error(
      `Oasis RPC payload validation failed (${validated.error.kind}): ${validated.error.message}`
    )
  }

  return {
    poc: parseValidatedPoCPayload(validated.data),
    sapphireWriteTimestampSec: parsedPayload.sapphireWriteTimestampSec,
  }
}

// ═══════════════════ Verification Logic ═══════════════════

/**
 * Validates POC setup operations against project rules.
 * Returns { valid: true } if all operations are allowed.
 * Returns { valid: false, reason: string } if any operation violates rules.
 */
function validateSetupOps(
  setup: PoCData['setup'],
  rules: ProjectRules
): { valid: boolean; reason?: string } {
  for (const step of setup) {
    // Check balance overrides (attacker funding)
    if (step.type === 'setBalance' && step.address) {
      const amount = BigInt(step.value)
      if (amount > rules.maxAttackerSeedWei) {
        return { 
          valid: false, 
          reason: `setBalance exceeds maxAttackerSeedWei: ${amount} > ${rules.maxAttackerSeedWei}` 
        }
      }
    }
    
    // Check timestamp manipulation
    if (step.type === 'setTimestamp' || step.type === 'evm_increaseTime') {
      if (rules.maxWarpSeconds === 0n) {
        return { 
          valid: false, 
          reason: 'Timestamp manipulation not allowed (maxWarpSeconds = 0)' 
        }
      }
      // For setTimestamp, check the offset from current time
      if (step.type === 'setTimestamp') {
        const targetTime = BigInt(step.value)
        const currentTime = BigInt(Math.floor(Date.now() / 1000))
        const offset = targetTime > currentTime ? targetTime - currentTime : currentTime - targetTime
        if (offset > rules.maxWarpSeconds) {
          return {
            valid: false,
            reason: `Timestamp offset exceeds maxWarpSeconds: ${offset} > ${rules.maxWarpSeconds}`
          }
        }
      }
    }
    
    // Check impersonation
    if (step.type === 'impersonate' || step.type === 'prank') {
      if (!rules.allowImpersonation) {
        return { 
          valid: false, 
          reason: 'Impersonation not allowed (allowImpersonation = false)' 
        }
      }
    }
  }
  
  return { valid: true }
}

function verifyForkState(
  nodeRuntime: NodeRuntime<Config>,
  forkBlock: bigint,
  tenderlyAdminRpc: string,
  sourceChainRpcUrl?: string,
): { verified: boolean; forkBlockHash: string; sourceBlockHash?: string } {
  const httpClient = new HTTPClient()

  const forkBlockResp = httpClient.sendRequest(nodeRuntime, {
    url: tenderlyAdminRpc,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${forkBlock.toString(16)}`, false],
      id: 9998,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  let forkBlockHash = ""
  if (forkBlockResp.statusCode === 200) {
    try {
      const blockData = JSON.parse(new TextDecoder().decode(forkBlockResp.body))
      forkBlockHash = blockData.result?.hash || ""
      nodeRuntime.log(`Fork block ${forkBlock} hash: ${forkBlockHash}`)
    } catch (e) {
      nodeRuntime.log(`Failed to parse fork block response: ${String(e)}`)
    }
  }

  if (!forkBlockHash) {
    return { verified: false, forkBlockHash: "" }
  }

  if (!sourceChainRpcUrl) {
    nodeRuntime.log("Source block comparison skipped (no sourceChainRpcUrl); fork hash presence verified")
    return { verified: true, forkBlockHash }
  }

  const sourceBlockResp = httpClient.sendRequest(nodeRuntime, {
    url: sourceChainRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64({
      jsonrpc: "2.0",
      method: "eth_getBlockByNumber",
      params: [`0x${forkBlock.toString(16)}`, false],
      id: 9999,
    }),
    cacheSettings: { maxAge: "0s" },
  }).result()

  let sourceBlockHash = ""
  if (sourceBlockResp.statusCode === 200) {
    try {
      const blockData = JSON.parse(new TextDecoder().decode(sourceBlockResp.body))
      sourceBlockHash = blockData.result?.hash || ""
      nodeRuntime.log(`Source block ${forkBlock} hash: ${sourceBlockHash}`)
    } catch (e) {
      nodeRuntime.log(`Failed to parse source block response: ${String(e)}`)
    }
  }

  const verified = forkBlockHash === sourceBlockHash && forkBlockHash !== ""
  nodeRuntime.log(`State verification: ${verified ? "PASSED" : "FAILED"}`)

  return { verified, forkBlockHash, sourceBlockHash }
}

const verifyPoC = (
  nodeRuntime: NodeRuntime<Config>,
  submissionId: bigint,
  projectId: bigint,
  cipherURI: string,
  rules: ProjectRules,
): VerificationResult => {
  const httpClient = new HTTPClient()
  const config = nodeRuntime.config
  let sapphireWriteTimestampSec: bigint | undefined

  if (!cipherURI.startsWith("oasis://")) {
    nodeRuntime.log("Rejected non-oasis cipherURI in oasis-only mode")
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
    }
  }

  if (!config.oasisRpcUrl) {
    nodeRuntime.log("Oasis reference provided but oasisRpcUrl is not configured")
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
    }
  }

  let reference: OasisReference
  try {
    reference = parseOasisReferenceUri(cipherURI)
  } catch (e) {
    nodeRuntime.log(`Invalid Oasis reference: ${String(e)}`)
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
    }
  }

  let pocJson: PoCData
  try {
    const oasisRead = readPoCFromOasisRpc(
      nodeRuntime,
      reference,
      submissionId,
    )
    pocJson = oasisRead.poc
    sapphireWriteTimestampSec = oasisRead.sapphireWriteTimestampSec
  } catch (e) {
    const reasonCode = classifyVerifyPocSyncReasonCode(e)
    nodeRuntime.log(
      `Failed to read Oasis PoC payload from Sapphire RPC: reasonCode=${reasonCode}`,
    )
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode,
      sapphireWriteTimestampSec,
    }
  }

  nodeRuntime.log(`PoC ready: ${pocJson.transactions.length} txs targeting ${pocJson.target.contract}`)

  // Validate setup operations against rules
  const validation = validateSetupOps(pocJson.setup, rules)
  if (!validation.valid) {
    nodeRuntime.log(`POC rejected: ${validation.reason}`)
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
      sapphireWriteTimestampSec,
    }
  }
  nodeRuntime.log(`Setup validation passed`)

  // ═══ Read project VNet info from contract ═══
  // The VNet is created once per project by vnet-init workflow, reused for all POCs

  const projectCallData = encodeProjectCall(projectId)
  let projectCallResult: `0x${string}`
  try {
    projectCallResult = runEthCallReadWithRetry(nodeRuntime, {
      network: "sepolia",
      operation: "sepolia.projects.read",
      endpoints: getSepoliaReadEndpoints(config),
      retryPolicy: config.rpcReadRetry,
      callParams: [
        {
          to: config.bountyHubAddress,
          data: projectCallData,
        },
        "latest",
      ],
      requestId: 1,
      httpErrorPrefix: "Failed to read project VNet info",
      rpcErrorPrefix: "Failed to read project VNet info",
      invalidResponseMessage: "Failed to read project VNet info: invalid eth_call response",
      emptyResponseMessage: "Failed to read project VNet info: empty payload",
    })
  } catch (error) {
    const reasonCode = classifyVerifyPocSyncReasonCode(error)
    nodeRuntime.log(`Failed to read project VNet info: reasonCode=${reasonCode}`)
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode,
      sapphireWriteTimestampSec,
    }
  }

  let vnetInfo: ProjectVnetInfo
  try {
    vnetInfo = decodeProjectVnetInfo(projectCallResult)
  } catch (error) {
    const reasonCode = classifyVerifyPocSyncReasonCode(error)
    nodeRuntime.log(`Failed to decode project VNet info: reasonCode=${reasonCode}`)
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode,
      sapphireWriteTimestampSec,
    }
  }

  const { vnetRpcUrl, baseSnapshotId, vnetStatus } = vnetInfo

  // Check VNet is active
  if (vnetStatus !== VNET_STATUS_ACTIVE) {
    nodeRuntime.log(`VNet not active (status=${vnetStatus}). POC verification skipped.`)
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
      sapphireWriteTimestampSec,
    }
  }

  if (!vnetRpcUrl || vnetRpcUrl.length === 0) {
    nodeRuntime.log("VNet RPC URL is empty. POC verification skipped.")
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
      sapphireWriteTimestampSec,
    }
  }

  nodeRuntime.log(`Using project VNet: ${vnetRpcUrl}, snapshot: ${baseSnapshotId}`)

  const adminRpcUrl = vnetRpcUrl

  const forkBlock = BigInt(pocJson.target.forkBlock)
  const sourceChainRpcUrl = pocJson.target.chain === 1 ? config.mainnetRpcUrl : undefined

  const stateResult = verifyForkState(
    nodeRuntime,
    forkBlock,
    adminRpcUrl,
    sourceChainRpcUrl
  )

  if (!stateResult.verified) {
    nodeRuntime.log("State verification failed; rejecting PoC result")
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_BINDING_MISMATCH,
      sapphireWriteTimestampSec,
    }
  }

  // ═══ HTTP 3: Batch RPC — state isolation + setup + execute + state diff ═══
  const batchCalls: Array<{ jsonrpc: string; id: number; method: string; params: unknown[] }> = []
  let callId = 1

  // 3a: State isolation - revert to base snapshot, then create new snapshot
  const revertId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: revertId,
    method: "evm_revert",
    params: [baseSnapshotId],
  })

  const newSnapshotId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: newSnapshotId,
    method: "evm_snapshot",
    params: [],
  })

  // 3b: Setup preconditions
  for (const step of pocJson.setup) {
    if (step.type === "setBalance" && step.address) {
      batchCalls.push({
        jsonrpc: "2.0",
        id: callId++,
        method: "tenderly_setBalance",
        params: [[step.address], `0x${BigInt(step.value).toString(16)}`],
      })
    } else if (step.type === "setTimestamp") {
      batchCalls.push({
        jsonrpc: "2.0",
        id: callId++,
        method: "evm_setNextBlockTimestamp",
        params: [`0x${BigInt(step.value).toString(16)}`],
      })
    }
  }

  // 3c: Get pre-attack balance
  const preBalanceId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: preBalanceId,
    method: "eth_getBalance",
    params: [pocJson.target.contract, "latest"],
  })

  // 3d: Execute attack transactions
  const txIds: number[] = []
  const attackerAddress = pocJson.setup.find(s => s.type === "setBalance")?.address || "0x0000000000000000000000000000000000000001"

  for (const tx of pocJson.transactions) {
    const txId = callId++
    txIds.push(txId)
    batchCalls.push({
      jsonrpc: "2.0",
      id: txId,
      method: "eth_sendTransaction",
      params: [{
        from: attackerAddress,
        to: tx.to,
        data: tx.data,
        value: tx.value && tx.value !== "0" ? `0x${BigInt(tx.value).toString(16)}` : "0x0",
        gas: "0x7A1200",
      }],
    })
  }

  // 3e: Get post-attack balance
  const postBalanceId = callId++
  batchCalls.push({
    jsonrpc: "2.0",
    id: postBalanceId,
    method: "eth_getBalance",
    params: [pocJson.target.contract, "latest"],
  })

  const batchResp = httpClient.sendRequest(nodeRuntime, {
    url: adminRpcUrl,
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: encodeJsonBodyBase64(batchCalls),
  }).result()

  if (batchResp.statusCode !== 200) {
    nodeRuntime.log(`Tenderly batch RPC failed: status ${batchResp.statusCode}`)
    return {
      isValid: false,
      drainAmountWei: 0n,
      reasonCode: SYNC_REASON_RETRYABLE_RPC,
      sapphireWriteTimestampSec,
    }
  }

  const batchResults: Array<{ id: number; result?: string; error?: { message: string } }> =
    JSON.parse(new TextDecoder().decode(batchResp.body))

  // Parse results
  const preBalResult = batchResults.find(r => r.id === preBalanceId)
  const postBalResult = batchResults.find(r => r.id === postBalanceId)
  const balanceBefore = BigInt(preBalResult?.result || "0")
  const balanceAfter = BigInt(postBalResult?.result || "0")
  const balanceDiff = balanceBefore > balanceAfter ? balanceBefore - balanceAfter : 0n

  const txSuccesses = txIds.map(id => {
    const r = batchResults.find(res => res.id === id)
    return r !== undefined && r.error === undefined
  })
  const allTxSucceeded = txSuccesses.every(Boolean)

  nodeRuntime.log(`Pre-balance: ${balanceBefore}, Post-balance: ${balanceAfter}, Diff: ${balanceDiff}`)
  nodeRuntime.log(`TX results: ${txSuccesses.map((s, i) => `tx${i}=${s ? "OK" : "FAIL"}`).join(", ")}`)

  const isValid = allTxSucceeded && balanceDiff > 0n
  nodeRuntime.log(`Final verdict: execution=${isValid}`)

  return {
    isValid,
    drainAmountWei: isValid ? balanceDiff : 0n,
    sapphireWriteTimestampSec,
  }
}

// ═══════════════════ Main Handler ═══════════════════

const onPoCRevealed = (runtime: Runtime<Config>, log: EVMLog): string => {
  const topic1 = bytesToHex(log.topics[1])
  const submissionId = BigInt(topic1.startsWith("0x") ? topic1 : `0x${topic1}`)

  runtime.log(`PoC Revealed #${submissionId}`)

  const submission = runtime
    .runInNodeMode(
      readSubmissionInNode,
      consensusIdenticalAggregation<ChainSubmissionRecord>()
    )(submissionId)
    .result()
  const { cipherURI, projectId } = submission
  const idempotencyStore = getVerifyPocIdempotencyStore(runtime)
  const syncReference = parseOasisReferenceUri(cipherURI)
  if (!syncReference.envelopeHash) {
    throw new Error("Oasis reference must include envelope hash for sync synchronization")
  }
  const syncId = deriveVerifyPocSyncId({
    projectId,
    submissionId,
    envelopeHash: syncReference.envelopeHash,
  })
  const baselineLatencyBuckets = buildVerifyPocLatencyBuckets({
    commitTimestampSec: submission.commitTimestamp,
    revealTimestampSec: submission.revealTimestamp,
  })

  const idempotencySource = log as unknown as Record<string, unknown>
  const idempotencyInput: VerifyPocIdempotencyInput = {
    mappingVersion: VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_VERSION,
    mappingMode: VERIFY_POC_REVEALED_IDEMPOTENCY_MAPPING_MODE,
    chainSelectorName: runtime.config.chainSelectorName,
    bountyHubAddress: runtime.config.bountyHubAddress,
    projectId,
    submissionId,
    txHash:
      typeof idempotencySource.transactionHash === "string"
        ? idempotencySource.transactionHash
        : typeof idempotencySource.txHash === "string"
          ? idempotencySource.txHash
          : undefined,
    logIndex:
      typeof idempotencySource.logIndex === "bigint" ||
      typeof idempotencySource.logIndex === "number" ||
      typeof idempotencySource.logIndex === "string"
        ? idempotencySource.logIndex
        : undefined,
  }

  const mappedIdempotency = assertDurableVerifyPocIdempotencyMappingStable(
    idempotencyStore,
    idempotencyInput
  )
  const idempotencyKey = deriveVerifyPocScopedIdempotencyKey({
    syncId,
    sourceEventFingerprint: mappedIdempotency.sourceEventKey,
  })

  const idempotencyDecision = claimDurableVerifyPocIdempotencySlot(
    idempotencyStore,
    idempotencyKey
  )
  if (!idempotencyDecision.shouldProcess) {
    runtime.log(
      `Skipping duplicate PoCRevealed. key=${idempotencyKey}, reason=${idempotencyDecision.reason}`
    )
    return `idempotency_skip:${idempotencyDecision.reason}:${idempotencyKey}`
  }

  runtime.log(
    `Idempotency accepted. key=${idempotencyKey}, syncId=${syncId}, sourceEvent=${mappedIdempotency.sourceEventKey}`
  )
  logVerifyPocSyncMetric(
    runtime,
    buildVerifyPocSyncMetricEvent({
      syncId,
      transition: "SEPOLIA_REVEALED",
      latencyBuckets: baselineLatencyBuckets,
    }),
  )

  try {
    const defaultRules = projectRulesFromConfig(runtime.config)

    const verifyResult = runtime
      .runInNodeMode(
        verifyPoC,
        consensusIdenticalAggregation<VerificationResult>()
      )(submissionId, projectId, cipherURI, defaultRules)
      .result()

    runtime.log(`Verification result: valid=${verifyResult.isValid}, drain=${verifyResult.drainAmountWei}`)
    const verifiedLatencyBuckets = buildVerifyPocLatencyBuckets({
      sapphireWriteTimestampSec: verifyResult.sapphireWriteTimestampSec,
      commitTimestampSec: submission.commitTimestamp,
      revealTimestampSec: submission.revealTimestamp,
    })
    logVerifyPocSyncMetric(
      runtime,
      buildVerifyPocSyncMetricEvent({
        syncId,
        transition: "WORKFLOW_VERIFIED",
        reasonCode: verifyResult.reasonCode,
        latencyBuckets: verifiedLatencyBuckets,
      }),
    )

    const strictGateDecision = decideVerifyPocStrictGate({
      isValid: verifyResult.isValid,
      reasonCode: verifyResult.reasonCode,
    })
    if (strictGateDecision.outcome === "RETRY_SYNC") {
      runtime.log(
        `Strict gate deferred report write. syncId=${syncId}, reasonCode=${strictGateDecision.reasonCode}`,
      )
      throw new Error(
        `VERIFY_POC_STRICT_GATE_RETRY:${strictGateDecision.reasonCode}`,
      )
    }

    if (strictGateDecision.outcome === "EMIT_EVIDENCE") {
      const projectWindows = runtime
        .runInNodeMode(
          readProjectAdjudicationWindowsInNode,
          consensusIdenticalAggregation<ProjectAdjudicationWindows>(),
        )(projectId)
        .result()
      const evidenceEnvelope = buildVerifyPocStrictFailEvidenceEnvelope({
        submissionId,
        projectId,
        cipherURI,
        severity: submission.severity,
        juryWindow: projectWindows.juryWindow,
        adjudicationWindow: projectWindows.adjudicationWindow,
        commitTimestampSec: submission.commitTimestamp,
        revealTimestampSec: submission.revealTimestamp,
        syncId,
        oasisReference: {
          pointer: {
            ...syncReference.pointer,
            contract: syncReference.pointer.contract as `0x${string}`,
          },
          envelopeHash: syncReference.envelopeHash,
        },
        sourceEventKey: mappedIdempotency.sourceEventKey,
        idempotencyKey,
        mappingFingerprint: mappedIdempotency.mappingFingerprint,
        verifyResult,
        chainSelectorName: runtime.config.chainSelectorName,
        bountyHubAddress: runtime.config.bountyHubAddress as `0x${string}`,
        txHash: idempotencyInput.txHash,
        logIndex: idempotencyInput.logIndex,
      })
      const encodedEvidence = encodeVerifyPocTypedReportEnvelope(evidenceEnvelope)
      markDurableVerifyPocIdempotencyStrictFailed(idempotencyStore, idempotencyKey)
      runtime.log(
        `Strict fail emitted evidence package. syncId=${syncId}, idempotencyKey=${idempotencyKey}, reasonCode=${strictGateDecision.reasonCode ?? "NONE"}`,
      )
      return encodedEvidence
    }

    const network = getNetwork({
      chainFamily: "evm",
      chainSelectorName: runtime.config.chainSelectorName,
      isTestnet: true,
    })

    if (!network) {
      throw new Error(`Network not found: ${runtime.config.chainSelectorName}`)
    }

    const evmClient = new EVMClient(network.chainSelector.selector)

    const reportData = encodeVerifyPocContractReport(
      buildVerifyPocStrictPassReportEnvelope({
        submissionId,
        projectId,
        verifyResult,
      }),
    )

    const report = runtime
      .report({
        encodedPayload: hexToBase64(reportData),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result()

    const writeResult = evmClient
      .writeReport(runtime, {
        receiver: runtime.config.bountyHubAddress,
        report,
        gasConfig: { gasLimit: runtime.config.gasLimit },
      })
      .result()

    if (writeResult.txStatus === TxStatus.SUCCESS) {
      const txHash = bytesToHex(writeResult.txHash || new Uint8Array(32))
      markDurableVerifyPocIdempotencyCompleted(idempotencyStore, idempotencyKey)
      const reportTimestampSec = nowEpochSeconds()
      const finalLatencyBuckets = buildVerifyPocLatencyBuckets({
        sapphireWriteTimestampSec: verifyResult.sapphireWriteTimestampSec,
        commitTimestampSec: submission.commitTimestamp,
        revealTimestampSec: submission.revealTimestamp,
        reportTimestampSec,
      })
      logVerifyPocSyncMetric(
        runtime,
        buildVerifyPocSyncMetricEvent({
          syncId,
          transition: "REPORT_WRITTEN",
          reasonCode: verifyResult.reasonCode,
          latencyBuckets: finalLatencyBuckets,
        }),
      )
      runtime.log(`Result written on-chain. tx=${txHash}`)
      return txHash
    }

    throw new Error(`EVM Write failed: ${writeResult.txStatus}`)
  } catch (error) {
    const reasonCode = classifyVerifyPocSyncReasonCode(error)
    try {
      markDurableVerifyPocIdempotencyQuarantined(idempotencyStore, idempotencyKey)
      runtime.log(`Idempotency quarantined after failure. key=${idempotencyKey}`)
    } catch (quarantineError) {
      runtime.log(
        `Failed to persist idempotency quarantine for key=${idempotencyKey}: ${String(
          quarantineError,
        )}`,
      )
    }
    logVerifyPocSyncMetric(
      runtime,
      buildVerifyPocSyncMetricEvent({
        syncId,
        transition: "SYNC_FAILURE",
        reasonCode,
        latencyBuckets: baselineLatencyBuckets,
      }),
    )
    throw error
  }
}

function readSubmissionInNode(
  nodeRuntime: NodeRuntime<Config>,
  submissionId: bigint
): ChainSubmissionRecord {
  const callData = encodeSubmissionReadCall(submissionId)
  const callResult = runEthCallReadWithRetry(nodeRuntime, {
    network: "sepolia",
    operation: "sepolia.submissions.read",
    endpoints: getSepoliaReadEndpoints(nodeRuntime.config),
    retryPolicy: nodeRuntime.config.rpcReadRetry,
    callParams: [
      {
        to: nodeRuntime.config.bountyHubAddress,
        data: callData,
      },
      "latest",
    ],
    requestId: 7,
    httpErrorPrefix: `Failed to read submission ${submissionId}`,
    rpcErrorPrefix: `Failed to read submission ${submissionId}`,
    invalidResponseMessage: `Failed to read submission ${submissionId}: invalid eth_call response`,
    emptyResponseMessage: `Failed to read submission ${submissionId}: returned empty payload`,
  })

  return decodeSubmissionReadResult(callResult)
}

// ═══════════════════ Workflow Init ═══════════════════

const initWorkflow = (config: Config) => {
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: config.chainSelectorName,
    isTestnet: true,
  })

  if (!network) {
    throw new Error(`Network not found: ${config.chainSelectorName}`)
  }

  const evmClient = new EVMClient(network.chainSelector.selector)

  const pocRevealedHash = keccak256(
    toBytes("PoCRevealed(uint256)")
  )

  return [
    handler(
      evmClient.logTrigger({
        addresses: [hexToBase64(config.bountyHubAddress)],
        topics: [
          { values: [hexToBase64(pocRevealedHash)] },
        ],
      }),
      onPoCRevealed
    ),
  ]
}

export async function main() {
  const runner = await Runner.newRunner<Config>()
  await runner.run(initWorkflow)
}
