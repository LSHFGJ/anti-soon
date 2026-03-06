export type JuryRecommendationAction =
  | "UPHOLD_AI_RESULT"
  | "OVERTURN_AI_RESULT"
  | "NEEDS_OWNER_REVIEW"

export type JuryRecommendationPayload = {
  submissionId: bigint
  projectId: bigint
  action: JuryRecommendationAction
  rationale: string
}

export type OwnerTestimonyPayload = {
  submissionId: bigint
  projectId: bigint
  recommendationReportType: "jury-recommendation/v1"
  testimony: string
}

export type VerifiedReportJuryMetadata = {
  recommendationReportType: "jury-recommendation/v1"
  action: JuryRecommendationAction
  rationale: string
}

export type VerifiedReportTestimonyMetadata = {
  recommendationReportType: "jury-recommendation/v1"
  testimony: string
}

export type VerifiedReportPayload = {
  submissionId: bigint
  projectId: bigint
  isValid: boolean
  drainAmountWei: bigint
  observedCalldata: string[]
}

export type VerifiedReportEnvelope = {
  magic: "ASRP"
  reportType: "verified-report/v1" | "verified-report/v2"
  payload: VerifiedReportPayload
  jury?: VerifiedReportJuryMetadata
  testimony?: VerifiedReportTestimonyMetadata
}

export type JuryRecommendationPipelineInput = {
  config: unknown
  verifiedReport: unknown
}

export type JuryConsensusPipelineInput = {
  config: unknown
  recommendations: unknown
  requiredQuorum: unknown
  timedOut?: unknown
}

export type JuryOwnerTestimonyPipelineInput = {
  config: unknown
  recommendation: unknown
  ownerTestimony: unknown
  verifiedReport?: unknown
}

export type JuryPipelineInput =
  | JuryRecommendationPipelineInput
  | JuryConsensusPipelineInput
  | JuryOwnerTestimonyPipelineInput

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const POSITIVE_INTEGER_STRING_REGEX = /^[0-9]+$/
const NON_NEGATIVE_INTEGER_STRING_REGEX = /^[0-9]+$/
const REPORT_ENVELOPE_MAGIC = "ASRP"
const VERIFIED_REPORT_TYPE_V1 = "verified-report/v1"
const VERIFIED_REPORT_TYPE_V2 = "verified-report/v2"
const JURY_RECOMMENDATION_REPORT_TYPE = "jury-recommendation/v1"
const JURY_WORKFLOW_CONFIG_KEYS = [
  "chainSelectorName",
  "bountyHubAddress",
  "gasLimit",
  "juryPolicy",
] as const
const VERIFIED_REPORT_ENVELOPE_V1_KEYS = ["magic", "reportType", "payload"] as const
const VERIFIED_REPORT_ENVELOPE_V2_KEYS = [
  "magic",
  "reportType",
  "payload",
  "jury",
  "testimony",
] as const
const VERIFIED_REPORT_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "isValid",
  "drainAmountWei",
  "observedCalldata",
] as const
const VERIFIED_REPORT_JURY_METADATA_KEYS = [
  "recommendationReportType",
  "action",
  "rationale",
] as const
const VERIFIED_REPORT_TESTIMONY_METADATA_KEYS = [
  "recommendationReportType",
  "testimony",
] as const
const JURY_RECOMMENDATION_ENVELOPE_KEYS = ["magic", "reportType", "payload"] as const
const JURY_RECOMMENDATION_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "action",
  "rationale",
] as const
const OWNER_TESTIMONY_KEYS = [
  "submissionId",
  "projectId",
  "recommendationReportType",
  "testimony",
] as const
const JURY_POLICY_KEYS = [
  "allowDirectSettlement",
  "requireOwnerResolution",
] as const
const JURY_ACTION_ORDER: readonly JuryRecommendationAction[] = [
  "UPHOLD_AI_RESULT",
  "OVERTURN_AI_RESULT",
  "NEEDS_OWNER_REVIEW",
]

export type JuryPolicy = {
  allowDirectSettlement: false
  requireOwnerResolution: true
}

export type JuryWorkflowConfig = {
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  gasLimit: string
  juryPolicy: JuryPolicy
}

type JuryConsensusCounts = Record<JuryRecommendationAction, number>

export type JuryTypedReportEnvelope = {
  magic: "ASRP"
  reportType: "jury-recommendation/v1"
  payload: JuryRecommendationPayload
}

export const BOUNTY_HUB_FINALIZE_SELECTOR = "0x05261aea"
export const BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR = "0x34b25ee2"

const FORBIDDEN_AUTHORITY_SELECTORS = new Set<string>([
  BOUNTY_HUB_FINALIZE_SELECTOR,
  BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR,
])

function requireObject(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }

  return value as Record<string, unknown>
}

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  return value.trim()
}

function requirePositiveIntegerString(
  value: unknown,
  fieldName: string,
): string {
  const normalized = requireNonEmptyString(value, fieldName)
  if (!POSITIVE_INTEGER_STRING_REGEX.test(normalized) || normalized === "0") {
    throw new Error(`${fieldName} must be a positive integer string`)
  }

  return normalized
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${fieldName} must be a boolean`)
  }

  return value
}

function requireOptionalBoolean(
  value: unknown,
  fieldName: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireBoolean(value, fieldName)
}

function requireBigIntLike(value: unknown, fieldName: string): bigint {
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

  const normalized = requireNonEmptyString(value, fieldName)
  if (!NON_NEGATIVE_INTEGER_STRING_REGEX.test(normalized)) {
    throw new Error(`${fieldName} must be a non-negative integer`)
  }

  return BigInt(normalized)
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }

  return value.map((entry, index) =>
    requireNonEmptyString(entry, `${fieldName}[${index}]`),
  )
}

function requirePositiveSafeInteger(value: unknown, fieldName: string): number {
  const parsed = requireBigIntLike(value, fieldName)
  if (parsed === 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} must be a positive safe integer`)
  }

  return Number(parsed)
}

function requireJuryRecommendationAction(
  value: unknown,
  fieldName: string,
): JuryRecommendationAction {
  const normalized = requireNonEmptyString(value, fieldName)

  if (
    normalized !== "UPHOLD_AI_RESULT" &&
    normalized !== "OVERTURN_AI_RESULT" &&
    normalized !== "NEEDS_OWNER_REVIEW"
  ) {
    throw new Error(`${fieldName} must be a supported jury recommendation action`)
  }

  return normalized
}

function assertExactKeys(
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

export function parseJuryWorkflowConfig(config: unknown): JuryWorkflowConfig {
  const source = requireObject(config, "jury workflow config")
  assertExactKeys(source, JURY_WORKFLOW_CONFIG_KEYS, "jury workflow config")

  const chainSelectorName = requireNonEmptyString(
    source.chainSelectorName,
    "chainSelectorName",
  )
  const bountyHubAddress = requireNonEmptyString(
    source.bountyHubAddress,
    "bountyHubAddress",
  )
  const gasLimit = requirePositiveIntegerString(source.gasLimit, "gasLimit")
  const juryPolicySource = requireObject(source.juryPolicy, "juryPolicy")
  assertExactKeys(juryPolicySource, JURY_POLICY_KEYS, "juryPolicy")

  if (!EVM_ADDRESS_REGEX.test(bountyHubAddress)) {
    throw new Error("bountyHubAddress must be a valid EVM address")
  }

  if (bountyHubAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new Error("bountyHubAddress must be a non-zero EVM address")
  }

  if (juryPolicySource.allowDirectSettlement !== false) {
    throw new Error(
      "juryPolicy.allowDirectSettlement must remain false for recommendation-only flow",
    )
  }

  if (juryPolicySource.requireOwnerResolution !== true) {
    throw new Error(
      "juryPolicy.requireOwnerResolution must remain true for recommendation-only flow",
    )
  }

  return {
    chainSelectorName,
    bountyHubAddress: bountyHubAddress as `0x${string}`,
    gasLimit,
    juryPolicy: {
      allowDirectSettlement: false,
      requireOwnerResolution: true,
    },
  }
}

function parseVerifiedReportJuryMetadata(
  value: unknown,
): VerifiedReportJuryMetadata {
  const source = requireObject(value, "verifiedReport.jury")
  assertExactKeys(
    source,
    VERIFIED_REPORT_JURY_METADATA_KEYS,
    "verifiedReport.jury",
  )

  const recommendationReportType = requireNonEmptyString(
    source.recommendationReportType,
    "verifiedReport.jury.recommendationReportType",
  )
  if (recommendationReportType !== JURY_RECOMMENDATION_REPORT_TYPE) {
    throw new Error(
      `verifiedReport.jury.recommendationReportType must be ${JURY_RECOMMENDATION_REPORT_TYPE}`,
    )
  }

  return {
    recommendationReportType: JURY_RECOMMENDATION_REPORT_TYPE,
    action: requireJuryRecommendationAction(
      source.action,
      "verifiedReport.jury.action",
    ),
    rationale: requireNonEmptyString(
      source.rationale,
      "verifiedReport.jury.rationale",
    ),
  }
}

function parseVerifiedReportTestimonyMetadata(
  value: unknown,
): VerifiedReportTestimonyMetadata {
  const source = requireObject(value, "verifiedReport.testimony")
  assertExactKeys(
    source,
    VERIFIED_REPORT_TESTIMONY_METADATA_KEYS,
    "verifiedReport.testimony",
  )

  const recommendationReportType = requireNonEmptyString(
    source.recommendationReportType,
    "verifiedReport.testimony.recommendationReportType",
  )
  if (recommendationReportType !== JURY_RECOMMENDATION_REPORT_TYPE) {
    throw new Error(
      `verifiedReport.testimony.recommendationReportType must be ${JURY_RECOMMENDATION_REPORT_TYPE}`,
    )
  }

  return {
    recommendationReportType: JURY_RECOMMENDATION_REPORT_TYPE,
    testimony: requireNonEmptyString(
      source.testimony,
      "verifiedReport.testimony.testimony",
    ),
  }
}

export function parseVerifiedReportEnvelope(report: unknown): VerifiedReportEnvelope {
  const source = requireObject(report, "verified report envelope")

  const magic = requireNonEmptyString(source.magic, "verifiedReport.magic")
  if (magic !== REPORT_ENVELOPE_MAGIC) {
    throw new Error(`verifiedReport.magic must be ${REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireNonEmptyString(
    source.reportType,
    "verifiedReport.reportType",
  )
  if (reportType !== VERIFIED_REPORT_TYPE_V1 && reportType !== VERIFIED_REPORT_TYPE_V2) {
    throw new Error(
      `verifiedReport.reportType must be ${VERIFIED_REPORT_TYPE_V1} or ${VERIFIED_REPORT_TYPE_V2}`,
    )
  }

  assertExactKeys(
    source,
    reportType === VERIFIED_REPORT_TYPE_V2
      ? VERIFIED_REPORT_ENVELOPE_V2_KEYS
      : VERIFIED_REPORT_ENVELOPE_V1_KEYS,
    "verified report envelope",
  )

  const payloadSource = requireObject(source.payload, "verifiedReport.payload")
  assertExactKeys(payloadSource, VERIFIED_REPORT_PAYLOAD_KEYS, "verifiedReport.payload")

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType,
    payload: {
      submissionId: requireBigIntLike(
        payloadSource.submissionId,
        "verifiedReport.payload.submissionId",
      ),
      projectId: requireBigIntLike(
        payloadSource.projectId,
        "verifiedReport.payload.projectId",
      ),
      isValid: requireBoolean(
        payloadSource.isValid,
        "verifiedReport.payload.isValid",
      ),
      drainAmountWei: requireBigIntLike(
        payloadSource.drainAmountWei,
        "verifiedReport.payload.drainAmountWei",
      ),
      observedCalldata: requireStringArray(
        payloadSource.observedCalldata,
        "verifiedReport.payload.observedCalldata",
      ),
    },
    jury:
      reportType === VERIFIED_REPORT_TYPE_V2 && source.jury !== undefined
        ? parseVerifiedReportJuryMetadata(source.jury)
        : undefined,
    testimony:
      reportType === VERIFIED_REPORT_TYPE_V2 && source.testimony !== undefined
        ? parseVerifiedReportTestimonyMetadata(source.testimony)
        : undefined,
  }
}

export function parseJuryRecommendationEnvelope(
  report: unknown,
): JuryTypedReportEnvelope {
  const source = requireObject(report, "jury recommendation envelope")
  assertExactKeys(source, JURY_RECOMMENDATION_ENVELOPE_KEYS, "jury recommendation envelope")

  const magic = requireNonEmptyString(source.magic, "juryRecommendation.magic")
  if (magic !== REPORT_ENVELOPE_MAGIC) {
    throw new Error(`juryRecommendation.magic must be ${REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireNonEmptyString(
    source.reportType,
    "juryRecommendation.reportType",
  )
  if (reportType !== JURY_RECOMMENDATION_REPORT_TYPE) {
    throw new Error(
      `juryRecommendation.reportType must be ${JURY_RECOMMENDATION_REPORT_TYPE}`,
    )
  }

  const payloadSource = requireObject(source.payload, "juryRecommendation.payload")
  assertExactKeys(
    payloadSource,
    JURY_RECOMMENDATION_PAYLOAD_KEYS,
    "juryRecommendation.payload",
  )

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: JURY_RECOMMENDATION_REPORT_TYPE,
    payload: {
      submissionId: requireBigIntLike(
        payloadSource.submissionId,
        "juryRecommendation.payload.submissionId",
      ),
      projectId: requireBigIntLike(
        payloadSource.projectId,
        "juryRecommendation.payload.projectId",
      ),
      action: requireJuryRecommendationAction(
        payloadSource.action,
        "juryRecommendation.payload.action",
      ),
      rationale: requireNonEmptyString(
        payloadSource.rationale,
        "juryRecommendation.payload.rationale",
      ),
    },
  }
}

export function parseOwnerTestimonyPayload(
  testimony: unknown,
): OwnerTestimonyPayload {
  const source = requireObject(testimony, "ownerTestimony")
  assertExactKeys(source, OWNER_TESTIMONY_KEYS, "ownerTestimony")

  const recommendationReportType = requireNonEmptyString(
    source.recommendationReportType,
    "ownerTestimony.recommendationReportType",
  )
  if (recommendationReportType !== JURY_RECOMMENDATION_REPORT_TYPE) {
    throw new Error(
      `ownerTestimony.recommendationReportType must be ${JURY_RECOMMENDATION_REPORT_TYPE}`,
    )
  }

  return {
    submissionId: requireBigIntLike(
      source.submissionId,
      "ownerTestimony.submissionId",
    ),
    projectId: requireBigIntLike(source.projectId, "ownerTestimony.projectId"),
    recommendationReportType: JURY_RECOMMENDATION_REPORT_TYPE,
    testimony: requireNonEmptyString(source.testimony, "ownerTestimony.testimony"),
  }
}

export function extractSelector(calldata: string): string {
  if (!calldata.startsWith("0x") || calldata.length < 10) {
    throw new Error("Invalid calldata: missing selector")
  }

  return calldata.slice(0, 10).toLowerCase()
}

export function assertNoAuthorityBypass(calldata: string): void {
  const selector = extractSelector(calldata)
  if (FORBIDDEN_AUTHORITY_SELECTORS.has(selector)) {
    throw new Error(
      `Forbidden authority call selector (${selector}) for jury scaffold`,
    )
  }
}

export function buildJuryRecommendationEnvelope(
  payload: JuryRecommendationPayload,
): JuryTypedReportEnvelope {
  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: JURY_RECOMMENDATION_REPORT_TYPE,
    payload,
  }
}

export function buildRecommendationPayloadFromVerifiedReport(
  verifiedReport: VerifiedReportEnvelope,
): JuryRecommendationPayload {
  for (const calldata of verifiedReport.payload.observedCalldata) {
    assertNoAuthorityBypass(calldata)
  }

  const action: JuryRecommendationAction = verifiedReport.payload.isValid
    ? "UPHOLD_AI_RESULT"
    : "OVERTURN_AI_RESULT"

  return {
    submissionId: verifiedReport.payload.submissionId,
    projectId: verifiedReport.payload.projectId,
    action,
    rationale: `Verified report for submission ${verifiedReport.payload.submissionId} marked isValid=${verifiedReport.payload.isValid} with drainAmountWei=${verifiedReport.payload.drainAmountWei}; recommending ${action} for owner resolution.`,
  }
}

function parseJuryRecommendationEnvelopes(
  recommendations: unknown,
): JuryTypedReportEnvelope[] {
  if (!Array.isArray(recommendations) || recommendations.length === 0) {
    throw new Error(
      "recommendations must be a non-empty array of jury recommendation envelopes",
    )
  }

  return recommendations.map((entry) => parseJuryRecommendationEnvelope(entry))
}

function assertMatchingRecommendationScope(
  recommendations: JuryTypedReportEnvelope[],
): { submissionId: bigint; projectId: bigint } {
  const [firstRecommendation] = recommendations
  const { submissionId, projectId } = firstRecommendation.payload

  for (const recommendation of recommendations.slice(1)) {
    if (recommendation.payload.submissionId !== submissionId) {
      throw new Error(
        "recommendations must agree on payload.submissionId for deterministic aggregation",
      )
    }

    if (recommendation.payload.projectId !== projectId) {
      throw new Error(
        "recommendations must agree on payload.projectId for deterministic aggregation",
      )
    }
  }

  return { submissionId, projectId }
}

function countRecommendationActions(
  recommendations: JuryTypedReportEnvelope[],
): JuryConsensusCounts {
  const counts: JuryConsensusCounts = {
    UPHOLD_AI_RESULT: 0,
    OVERTURN_AI_RESULT: 0,
    NEEDS_OWNER_REVIEW: 0,
  }

  for (const recommendation of recommendations) {
    counts[recommendation.payload.action] += 1
  }

  return counts
}

function formatRecommendationCounts(counts: JuryConsensusCounts): string {
  return JURY_ACTION_ORDER.map((action) => `${action}=${counts[action]}`).join(", ")
}

export function aggregateJuryRecommendationEnvelopes(args: {
  recommendations: JuryTypedReportEnvelope[]
  requiredQuorum: number
  timedOut?: boolean
}): JuryRecommendationPayload {
  const { submissionId, projectId } = assertMatchingRecommendationScope(
    args.recommendations,
  )
  const counts = countRecommendationActions(args.recommendations)
  const highestCount = Math.max(...JURY_ACTION_ORDER.map((action) => counts[action]))
  const leadingActions = JURY_ACTION_ORDER.filter(
    (action) => counts[action] === highestCount,
  )
  const quorumActions = JURY_ACTION_ORDER.filter(
    (action) => counts[action] >= args.requiredQuorum,
  )

  if (
    leadingActions.length === 1 &&
    quorumActions.length === 1 &&
    leadingActions[0] === quorumActions[0]
  ) {
    const action = leadingActions[0]

    return {
      submissionId,
      projectId,
      action,
      rationale: `Deterministic jury quorum ${args.requiredQuorum} reached for ${action} with ${counts[action]}/${args.recommendations.length} recommendations. Counts: ${formatRecommendationCounts(counts)}.`,
    }
  }

  const unresolvedReason = args.timedOut
    ? `Jury quorum ${args.requiredQuorum} was not reached before timeout`
    : leadingActions.length > 1 || quorumActions.length > 1
      ? `Jury recommendation state is unresolved without a deterministic quorum winner`
      : `Jury quorum ${args.requiredQuorum} was not reached`

  return {
    submissionId,
    projectId,
    action: "NEEDS_OWNER_REVIEW",
    rationale: `${unresolvedReason}; escalating to owner review. Counts: ${formatRecommendationCounts(counts)}.`,
  }
}

export function assertOwnerTestimonyConsistency(args: {
  recommendation: JuryTypedReportEnvelope
  ownerTestimony: OwnerTestimonyPayload
  verifiedReport?: VerifiedReportEnvelope
}): void {
  const { recommendation, ownerTestimony, verifiedReport } = args

  if (ownerTestimony.submissionId !== recommendation.payload.submissionId) {
    throw new Error(
      "ownerTestimony.submissionId must match recommendation.payload.submissionId",
    )
  }

  if (ownerTestimony.projectId !== recommendation.payload.projectId) {
    throw new Error(
      "ownerTestimony.projectId must match recommendation.payload.projectId",
    )
  }

  if (ownerTestimony.recommendationReportType !== recommendation.reportType) {
    throw new Error(
      "ownerTestimony.recommendationReportType must match recommendation.reportType",
    )
  }

  if (!verifiedReport) {
    return
  }

  if (verifiedReport.payload.submissionId !== recommendation.payload.submissionId) {
    throw new Error(
      "verifiedReport.payload.submissionId must match recommendation.payload.submissionId for testimony consistency",
    )
  }

  if (verifiedReport.payload.projectId !== recommendation.payload.projectId) {
    throw new Error(
      "verifiedReport.payload.projectId must match recommendation.payload.projectId for testimony consistency",
    )
  }

  for (const calldata of verifiedReport.payload.observedCalldata) {
    assertNoAuthorityBypass(calldata)
  }
}

export function ingestOwnerTestimony(args: {
  recommendation: JuryTypedReportEnvelope
  ownerTestimony: OwnerTestimonyPayload
  verifiedReport?: VerifiedReportEnvelope
}): JuryTypedReportEnvelope {
  assertOwnerTestimonyConsistency(args)
  return args.recommendation
}

export function runJuryRecommendationPipeline(
  input: JuryPipelineInput,
): JuryTypedReportEnvelope {
  const inputSource = requireObject(input, "jury pipeline input")
  parseJuryWorkflowConfig(inputSource.config)

  const hasVerifiedReport = Object.hasOwn(inputSource, "verifiedReport")
  const hasRecommendations = Object.hasOwn(inputSource, "recommendations")
  const hasRecommendation = Object.hasOwn(inputSource, "recommendation")
  const hasOwnerTestimony = Object.hasOwn(inputSource, "ownerTestimony")

  if (hasRecommendation || hasOwnerTestimony) {
    if (!hasRecommendation || !hasOwnerTestimony) {
      throw new Error(
        "jury pipeline owner testimony mode must include both recommendation and ownerTestimony",
      )
    }

    if (hasRecommendations) {
      throw new Error(
        "jury pipeline owner testimony mode cannot include recommendations",
      )
    }

    const recommendation = parseJuryRecommendationEnvelope(
      inputSource.recommendation,
    )
    const ownerTestimony = parseOwnerTestimonyPayload(inputSource.ownerTestimony)
    const verifiedReport = hasVerifiedReport
      ? parseVerifiedReportEnvelope(inputSource.verifiedReport)
      : undefined

    return ingestOwnerTestimony({
      recommendation,
      ownerTestimony,
      verifiedReport,
    })
  }

  if (hasVerifiedReport === hasRecommendations) {
    throw new Error(
      "jury pipeline input must include exactly one of verifiedReport or recommendations",
    )
  }

  if (hasVerifiedReport) {
    const verifiedReport = parseVerifiedReportEnvelope(inputSource.verifiedReport)

    return buildJuryRecommendationEnvelope(
      buildRecommendationPayloadFromVerifiedReport(verifiedReport),
    )
  }

  const recommendations = parseJuryRecommendationEnvelopes(
    inputSource.recommendations,
  )
  const requiredQuorum = requirePositiveSafeInteger(
    inputSource.requiredQuorum,
    "requiredQuorum",
  )
  const timedOut =
    requireOptionalBoolean(inputSource.timedOut, "timedOut") ?? false

  return buildJuryRecommendationEnvelope(
    aggregateJuryRecommendationEnvelopes({
      recommendations,
      requiredQuorum,
      timedOut,
    }),
  )
}

export async function main(
  input: JuryPipelineInput,
): Promise<JuryTypedReportEnvelope> {
  return runJuryRecommendationPipeline(input)
}
