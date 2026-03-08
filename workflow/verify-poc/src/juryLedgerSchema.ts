import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem"
import { z } from "zod"
import { type OasisEnvelope, parseOasisEnvelope } from "./oasisEnvelope"

export const JURY_LEDGER_SCOPE_VERSION = "anti-soon.jury-ledger.scope.v1" as const
export const JURY_LEDGER_RECORD_VERSION = "anti-soon.jury-ledger.record.v1" as const
export const JURY_LEDGER_SLOT_VERSION = "anti-soon.jury-ledger.slot.v1" as const
const JURY_LEDGER_SLOT_PREFIX = "jury-ledger/v1" as const
export const JURY_LEDGER_APPEND_ONLY_ERROR = "JURY_LEDGER_APPEND_ONLY" as const
export const JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE_ERROR =
  "JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE" as const
export const JURY_LEDGER_RECORD_NOT_FOUND_ERROR =
  "JURY_LEDGER_RECORD_NOT_FOUND" as const

const bigintLikeSchema = z.union([
  z.bigint(),
  z.number().int().safe(),
  z.string().regex(/^[0-9]+$/, "must be a non-negative integer string"),
])

const timestampSchema = z.number().finite().nonnegative()

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a 0x-prefixed 20-byte address")

const actionSchema = z.enum([
  "UPHOLD_AI_RESULT",
  "OVERTURN_AI_RESULT",
  "NEEDS_OWNER_REVIEW",
])

const jurorSlotSchema = z
  .object({
    jurorSlotIndex: bigintLikeSchema,
    jurorAddress: addressSchema,
  })
  .strict()

const countsSchema = z
  .object({
    upholdAiResult: bigintLikeSchema,
    overturnAiResult: bigintLikeSchema,
    needsOwnerReview: bigintLikeSchema,
  })
  .strict()

const caseHeaderSchema = z
  .object({
    submissionId: bigintLikeSchema,
    juryRoundId: bigintLikeSchema,
    projectId: bigintLikeSchema,
    juryDeadlineTimestamp: timestampSchema,
  })
  .strict()

const jurorRosterSchema = z
  .object({
    submissionId: bigintLikeSchema,
    juryRoundId: bigintLikeSchema,
    jurorSlots: z.array(jurorSlotSchema).min(1),
  })
  .strict()

const sealedOpinionSchema = z
  .object({
    submissionId: bigintLikeSchema,
    juryRoundId: bigintLikeSchema,
    jurorSlotIndex: bigintLikeSchema,
    jurorAddress: addressSchema,
    envelope: z.unknown(),
  })
  .strict()

const aggregationResultSchema = z
  .object({
    submissionId: bigintLikeSchema,
    juryRoundId: bigintLikeSchema,
    finalAction: actionSchema,
    aggregatedAtTimestamp: timestampSchema,
    counts: countsSchema,
  })
  .strict()

const ownerTestimonySchema = z
  .object({
    submissionId: bigintLikeSchema,
    juryRoundId: bigintLikeSchema,
    envelope: z.unknown(),
    submittedAtTimestamp: timestampSchema,
  })
  .strict()

const scopeKeyParams = parseAbiParameters(
  "string version, uint256 submissionId, uint256 juryRoundId"
)

const recordKeyParams = parseAbiParameters(
  "string version, bytes32 scopeKey, string role, uint256 roleSlot"
)

export type JuryLedgerAction = z.infer<typeof actionSchema>

export type JuryLedgerRecordRole =
  | "case_header"
  | "juror_roster"
  | "sealed_opinion"
  | "aggregation_result"
  | "owner_testimony"

export type JuryLedgerScope = {
  submissionId: bigint
  juryRoundId: bigint
  scopeKey: `0x${string}`
}

type JuryLedgerRecordBase<Role extends JuryLedgerRecordRole> = JuryLedgerScope & {
  version: typeof JURY_LEDGER_RECORD_VERSION
  role: Role
  recordKey: `0x${string}`
  slotId: string
}

export type JuryCaseHeaderRecord = JuryLedgerRecordBase<"case_header"> & {
  projectId: bigint
  juryDeadlineTimestamp: number
}

export type JuryJurorRosterRecord = JuryLedgerRecordBase<"juror_roster"> & {
  jurorSlots: Array<{
    jurorSlotIndex: number
    jurorAddress: `0x${string}`
  }>
}

export type JurySealedOpinionRecord = JuryLedgerRecordBase<"sealed_opinion"> & {
  jurorSlotIndex: number
  jurorAddress: `0x${string}`
  envelope: OasisEnvelope
}

export type JuryAggregationResultRecord = JuryLedgerRecordBase<"aggregation_result"> & {
  finalAction: JuryLedgerAction
  aggregatedAtTimestamp: number
  counts: {
    upholdAiResult: number
    overturnAiResult: number
    needsOwnerReview: number
  }
}

export type JuryOwnerTestimonyRecord = JuryLedgerRecordBase<"owner_testimony"> & {
  envelope: OasisEnvelope
  submittedAtTimestamp: number
}

export type JuryLedgerRecord =
  | JuryCaseHeaderRecord
  | JuryJurorRosterRecord
  | JurySealedOpinionRecord
  | JuryAggregationResultRecord
  | JuryOwnerTestimonyRecord

export type JuryLedgerState = Map<string, JuryLedgerRecord>

type JuryLedgerScopeInput = {
  submissionId: bigint | number | string
  juryRoundId: bigint | number | string
}

type JuryLedgerRecordKeyInput = JuryLedgerScopeInput & {
  role: JuryLedgerRecordRole
  jurorSlotIndex?: number
}

function formatZodPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "root"
  }

  return path.join(".")
}

function parseWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string
): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${formatZodPath(issue.path)}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid ${label}: ${details}`)
  }

  return parsed.data
}

function normalizeBigIntLike(value: bigint | number | string, fieldName: string): bigint {
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

  const normalized = BigInt(value)
  if (normalized < 0n) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }
  return normalized
}

function normalizeSafeInteger(value: bigint | number | string, fieldName: string): number {
  const normalized = normalizeBigIntLike(value, fieldName)
  if (normalized > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} must be a safe integer`)
  }
  return Number(normalized)
}

function normalizeTimestamp(value: number, fieldName: string): number {
  const normalized = Math.floor(value)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${fieldName} must be a non-negative integer timestamp`)
  }
  return normalized
}

function normalizeAddress(value: string): `0x${string}` {
  return value.toLowerCase() as `0x${string}`
}

function roleSegment(role: JuryLedgerRecordRole): string {
  switch (role) {
    case "case_header":
      return "case-header"
    case "juror_roster":
      return "juror-roster"
    case "sealed_opinion":
      return "sealed-opinion"
    case "aggregation_result":
      return "aggregation-result"
    case "owner_testimony":
      return "owner-testimony"
  }
}

function resolveRoleSlot(input: JuryLedgerRecordKeyInput): number {
  if (input.role === "sealed_opinion") {
    if (input.jurorSlotIndex === undefined) {
      throw new Error("jurorSlotIndex is required for sealed_opinion record keys")
    }
    return normalizeSafeInteger(input.jurorSlotIndex, "jurorSlotIndex")
  }

  return 0
}

function buildRecordIdentity(input: JuryLedgerRecordKeyInput): {
  scope: JuryLedgerScope
  recordKey: `0x${string}`
  slotId: string
} {
  const scope = deriveJuryLedgerScope(input)
  const roleSlot = resolveRoleSlot(input)
  const recordKey = deriveJuryLedgerRecordKey({
    submissionId: scope.submissionId,
    juryRoundId: scope.juryRoundId,
    role: input.role,
    jurorSlotIndex: roleSlot,
  })

  return {
    scope,
    recordKey,
    slotId: deriveJuryLedgerSlotId({
      submissionId: scope.submissionId,
      juryRoundId: scope.juryRoundId,
      role: input.role,
      jurorSlotIndex: roleSlot,
    }),
  }
}

function getTypedRecord<Role extends JuryLedgerRecordRole>(
  state: JuryLedgerState,
  input: JuryLedgerRecordKeyInput,
  expectedRole: Role
): Extract<JuryLedgerRecord, { role: Role }> {
  const key = deriveJuryLedgerRecordKey(input)
  const record = state.get(key)
  if (!record || record.role !== expectedRole) {
    throw new Error(
      `${JURY_LEDGER_RECORD_NOT_FOUND_ERROR}: role=${expectedRole} recordKey=${key}`
    )
  }
  return record as Extract<JuryLedgerRecord, { role: Role }>
}

export function deriveJuryLedgerScope(input: JuryLedgerScopeInput): JuryLedgerScope {
  const submissionId = normalizeBigIntLike(input.submissionId, "submissionId")
  const juryRoundId = normalizeBigIntLike(input.juryRoundId, "juryRoundId")
  const scopeKey = deriveJuryLedgerScopeKey({ submissionId, juryRoundId })

  return {
    submissionId,
    juryRoundId,
    scopeKey,
  }
}

export function deriveJuryLedgerScopeKey(
  input: JuryLedgerScopeInput
): `0x${string}` {
  const submissionId = normalizeBigIntLike(input.submissionId, "submissionId")
  const juryRoundId = normalizeBigIntLike(input.juryRoundId, "juryRoundId")
  const encoded = encodeAbiParameters(scopeKeyParams, [
    JURY_LEDGER_SCOPE_VERSION,
    submissionId,
    juryRoundId,
  ])
  return keccak256(encoded)
}

export function deriveJuryLedgerRecordKey(
  input: JuryLedgerRecordKeyInput
): `0x${string}` {
  const scopeKey = deriveJuryLedgerScopeKey(input)
  const roleSlot = resolveRoleSlot(input)
  const encoded = encodeAbiParameters(recordKeyParams, [
    JURY_LEDGER_RECORD_VERSION,
    scopeKey,
    input.role,
    BigInt(roleSlot),
  ])

  return keccak256(encoded)
}

export function deriveJuryLedgerSlotId(input: JuryLedgerRecordKeyInput): string {
  const scopeKey = deriveJuryLedgerScopeKey(input)
  const recordKey = deriveJuryLedgerRecordKey(input)
  const roleSlot = resolveRoleSlot(input)
  const slotSegment =
    input.role === "sealed_opinion"
      ? `slot-${String(roleSlot).padStart(4, "0")}`
      : "singleton"

  return `${JURY_LEDGER_SLOT_PREFIX}/${scopeKey}/${roleSegment(input.role)}/${slotSegment}/${recordKey}`
}

export function createJuryLedgerState(): JuryLedgerState {
  return new Map<string, JuryLedgerRecord>()
}

export function buildJuryCaseHeaderRecord(value: unknown): JuryCaseHeaderRecord {
  const parsed = parseWithSchema(caseHeaderSchema, value, "jury case header record")
  const identity = buildRecordIdentity({
    submissionId: parsed.submissionId,
    juryRoundId: parsed.juryRoundId,
    role: "case_header",
  })

  return {
    version: JURY_LEDGER_RECORD_VERSION,
    role: "case_header",
    submissionId: identity.scope.submissionId,
    juryRoundId: identity.scope.juryRoundId,
    scopeKey: identity.scope.scopeKey,
    recordKey: identity.recordKey,
    slotId: identity.slotId,
    projectId: normalizeBigIntLike(parsed.projectId, "projectId"),
    juryDeadlineTimestamp: normalizeTimestamp(
      parsed.juryDeadlineTimestamp,
      "juryDeadlineTimestamp"
    ),
  }
}

export function buildJuryJurorRosterRecord(value: unknown): JuryJurorRosterRecord {
  const parsed = parseWithSchema(jurorRosterSchema, value, "jury juror roster record")
  const identity = buildRecordIdentity({
    submissionId: parsed.submissionId,
    juryRoundId: parsed.juryRoundId,
    role: "juror_roster",
  })

  return {
    version: JURY_LEDGER_RECORD_VERSION,
    role: "juror_roster",
    submissionId: identity.scope.submissionId,
    juryRoundId: identity.scope.juryRoundId,
    scopeKey: identity.scope.scopeKey,
    recordKey: identity.recordKey,
    slotId: identity.slotId,
    jurorSlots: [...parsed.jurorSlots]
      .map((slot) => ({
        jurorSlotIndex: normalizeSafeInteger(slot.jurorSlotIndex, "jurorSlotIndex"),
        jurorAddress: normalizeAddress(slot.jurorAddress),
      }))
      .sort((left, right) => left.jurorSlotIndex - right.jurorSlotIndex),
  }
}

export function buildJurySealedOpinionRecord(value: unknown): JurySealedOpinionRecord {
  const parsed = parseWithSchema(sealedOpinionSchema, value, "jury sealed opinion record")
  const jurorSlotIndex = normalizeSafeInteger(parsed.jurorSlotIndex, "jurorSlotIndex")
  const identity = buildRecordIdentity({
    submissionId: parsed.submissionId,
    juryRoundId: parsed.juryRoundId,
    role: "sealed_opinion",
    jurorSlotIndex,
  })

  return {
    version: JURY_LEDGER_RECORD_VERSION,
    role: "sealed_opinion",
    submissionId: identity.scope.submissionId,
    juryRoundId: identity.scope.juryRoundId,
    scopeKey: identity.scope.scopeKey,
    recordKey: identity.recordKey,
    slotId: identity.slotId,
    jurorSlotIndex,
    jurorAddress: normalizeAddress(parsed.jurorAddress),
    envelope: parseOasisEnvelope(parsed.envelope),
  }
}

export function buildJuryAggregationResultRecord(
  value: unknown
): JuryAggregationResultRecord {
  const parsed = parseWithSchema(
    aggregationResultSchema,
    value,
    "jury aggregation result record"
  )
  const identity = buildRecordIdentity({
    submissionId: parsed.submissionId,
    juryRoundId: parsed.juryRoundId,
    role: "aggregation_result",
  })

  return {
    version: JURY_LEDGER_RECORD_VERSION,
    role: "aggregation_result",
    submissionId: identity.scope.submissionId,
    juryRoundId: identity.scope.juryRoundId,
    scopeKey: identity.scope.scopeKey,
    recordKey: identity.recordKey,
    slotId: identity.slotId,
    finalAction: parsed.finalAction,
    aggregatedAtTimestamp: normalizeTimestamp(
      parsed.aggregatedAtTimestamp,
      "aggregatedAtTimestamp"
    ),
    counts: {
      upholdAiResult: normalizeSafeInteger(parsed.counts.upholdAiResult, "counts.upholdAiResult"),
      overturnAiResult: normalizeSafeInteger(
        parsed.counts.overturnAiResult,
        "counts.overturnAiResult"
      ),
      needsOwnerReview: normalizeSafeInteger(
        parsed.counts.needsOwnerReview,
        "counts.needsOwnerReview"
      ),
    },
  }
}

export function buildJuryOwnerTestimonyRecord(value: unknown): JuryOwnerTestimonyRecord {
  const parsed = parseWithSchema(
    ownerTestimonySchema,
    value,
    "jury owner testimony record"
  )
  const identity = buildRecordIdentity({
    submissionId: parsed.submissionId,
    juryRoundId: parsed.juryRoundId,
    role: "owner_testimony",
  })

  return {
    version: JURY_LEDGER_RECORD_VERSION,
    role: "owner_testimony",
    submissionId: identity.scope.submissionId,
    juryRoundId: identity.scope.juryRoundId,
    scopeKey: identity.scope.scopeKey,
    recordKey: identity.recordKey,
    slotId: identity.slotId,
    envelope: parseOasisEnvelope(parsed.envelope),
    submittedAtTimestamp: normalizeTimestamp(
      parsed.submittedAtTimestamp,
      "submittedAtTimestamp"
    ),
  }
}

export function appendJuryLedgerRecord(
  state: JuryLedgerState,
  record: JuryLedgerRecord
): JuryLedgerRecord {
  if (state.has(record.recordKey)) {
    throw new Error(
      `${JURY_LEDGER_APPEND_ONLY_ERROR}: role=${record.role} recordKey=${record.recordKey}`
    )
  }

  state.set(record.recordKey, record)
  return record
}

export function readClosedJuryAggregationResultRecord(args: {
  state: JuryLedgerState
  submissionId: bigint | number | string
  juryRoundId: bigint | number | string
  currentTimestamp: number
}): JuryAggregationResultRecord {
  const currentTimestamp = normalizeTimestamp(args.currentTimestamp, "currentTimestamp")
  const header = getTypedRecord(
    args.state,
    {
      submissionId: args.submissionId,
      juryRoundId: args.juryRoundId,
      role: "case_header",
    },
    "case_header"
  )

  if (currentTimestamp < header.juryDeadlineTimestamp) {
    throw new Error(
      `${JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE_ERROR}: currentTimestamp=${currentTimestamp} juryDeadlineTimestamp=${header.juryDeadlineTimestamp}`
    )
  }

  return getTypedRecord(
    args.state,
    {
      submissionId: args.submissionId,
      juryRoundId: args.juryRoundId,
      role: "aggregation_result",
    },
    "aggregation_result"
  )
}
