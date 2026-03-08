import { encodeAbiParameters, parseAbiParameters } from "../verify-poc/node_modules/viem"

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

export type VerifiedReportJuryCommitmentMetadata = {
  commitmentVersion: "anti-soon.verify-poc.jury-commitment.v1"
  juryLedgerDigest: `0x${string}`
  sourceEventKey: `0x${string}`
  mappingFingerprint: `0x${string}`
}

export type VerifiedReportAdjudicationOasisMetadata = {
  chain: string
  contract: `0x${string}`
  slotId: string
  envelopeHash: `0x${string}`
}

export type VerifiedReportAdjudicationMetadata = {
  adjudicationVersion: "anti-soon.verify-poc.adjudication.v1"
  syncId: `0x${string}`
  idempotencyKey: `0x${string}`
  cipherURI: string
  severity: number
  juryWindow: bigint
  adjudicationWindow: bigint
  commitTimestampSec: bigint
  revealTimestampSec: bigint
  sapphireWriteTimestampSec?: bigint
  reasonCode?: string
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  txHash?: `0x${string}`
  logIndex?: bigint
  oasis: VerifiedReportAdjudicationOasisMetadata
}

export type VerifiedReportEnvelopeV1 = {
  magic: "ASRP"
  reportType: "verified-report/v1"
  payload: VerifiedReportPayload
}

export type VerifiedReportEnvelopeV2 = {
  magic: "ASRP"
  reportType: "verified-report/v2"
  payload: VerifiedReportPayload
  jury?: VerifiedReportJuryMetadata
  testimony?: VerifiedReportTestimonyMetadata
}

export type VerifiedReportEnvelopeV3 = {
  magic: "ASRP"
  reportType: "verified-report/v3"
  payload: VerifiedReportPayload
  juryCommitment: VerifiedReportJuryCommitmentMetadata
  adjudication: VerifiedReportAdjudicationMetadata
}

export type VerifiedReportEnvelope =
  | VerifiedReportEnvelopeV1
  | VerifiedReportEnvelopeV2
  | VerifiedReportEnvelopeV3

export type AdjudicationVerdictSource = "NONE" | "JURY" | "OWNER"
export type AdjudicationResolvedValidity = "HIGH" | "MEDIUM" | "INVALID"
export type AdjudicationFinalValidity = "NONE" | AdjudicationResolvedValidity
export type AdjudicationLifecycleStatus =
  | "JURY_PENDING"
  | "AWAITING_OWNER_ADJUDICATION"
  | "VERIFIED"
  | "INVALID"

export type JurorCohort = "LLM" | "HUMAN"

export type JuryRosterSlot = {
  slotIndex: number
  cohort: JurorCohort
  cohortSlotIndex: number
  jurorId: string
  assignmentDigest: `0x${string}`
}

export type HumanJurorSlotSelection = {
  slotIndex: number
  cohortSlotIndex: number
  jurorId: string
  candidateIndex: number
  selectionDigest: `0x${string}`
}

export type HumanJurorSelectionProvenance = {
  selectionVersion: "anti-soon.human-juror-selection.v1"
  randomnessDigest: `0x${string}`
  selectionSource: string
  selectionNonce: `0x${string}`
  candidatePoolDigest: `0x${string}`
  slotSelections: HumanJurorSlotSelection[]
}

export type HumanJurorReplacementRecord = {
  replacementVersion: "anti-soon.human-juror-replacement.v1"
  slotIndex: number
  cohortSlotIndex: number
  previousJurorId: string
  nextJurorId: string
  replacementReason: string
  replacementTimestampSec: bigint
  replacementSource: string
  replacementNonce: `0x${string}`
  replacementRandomnessDigest: `0x${string}`
  replacementDigest: `0x${string}`
}

export type JuryRosterCommitment = {
  rosterVersion: "anti-soon.jury-roster.v1"
  commitmentDigest: `0x${string}`
  rosterDigest: `0x${string}`
  llmSlotCount: 5
  humanSlotCount: 5
  slots: JuryRosterSlot[]
  humanSelection: HumanJurorSelectionProvenance
  humanSlotReplacements: HumanJurorReplacementRecord[]
}

export type JuryRosterSelectionInput = {
  llmJurors: { jurorId: string }[]
  humanCandidates: { jurorId: string }[]
  humanSelection: {
    selectionVersion: "anti-soon.human-juror-selection.v1"
    randomnessDigest: `0x${string}`
    selectionSource: string
    selectionNonce: `0x${string}`
  }
}

export type OpinionIngestJurorSlotAuthInput = {
  slotIndex: unknown
  cohort: unknown
  jurorId: unknown
}

export type HumanJurorReplacementInput = {
  slotIndex: unknown
  nextJurorId: unknown
  replacementReason: unknown
  replacementTimestampSec: unknown
  replacementSource: unknown
  replacementNonce: unknown
  replacementRandomnessDigest: unknown
}

type AdjudicationCaseContext = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  juryDeadlineTimestampSec: bigint
  adjudicationDeadlineTimestampSec: bigint
  evidenceReportType: "verified-report/v3"
  juryLedgerDigest: `0x${string}`
  sourceEventKey: `0x${string}`
  mappingFingerprint: `0x${string}`
  syncId: `0x${string}`
  idempotencyKey: `0x${string}`
  cipherURI: string
  severity: number
  chainSelectorName: string
  bountyHubAddress: `0x${string}`
  oasisEnvelopeHash: `0x${string}`
  rosterCommitment: JuryRosterCommitment
}

export type AdjudicationCasePayload = AdjudicationCaseContext & {
  lifecycleStatus: "JURY_PENDING"
  verdictSource: "NONE"
  finalValidity: "NONE"
}

export type AdjudicationCaseEnvelope = {
  magic: "ASRP"
  reportType: "adjudication-case/v1"
  payload: AdjudicationCasePayload
}

export type AdjudicationFinalVerdictPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  verdictSource: "JURY" | "OWNER"
  finalValidity: AdjudicationResolvedValidity
  rationale: string
  drainAmountWei: bigint
  ownerTestimonyDigest?: `0x${string}`
}

export type AdjudicationFinalPackagePayload = AdjudicationCaseContext & {
  lifecycleStatus: "VERIFIED" | "INVALID"
  verdictSource: "JURY" | "OWNER"
  finalValidity: AdjudicationResolvedValidity
  isValid: boolean
  drainAmountWei: bigint
  rationale: string
  ownerTestimonyDigest?: `0x${string}`
}

export type AdjudicationFinalPackageEnvelope = {
  magic: "ASRP"
  reportType: "adjudication-final/v1"
  payload: AdjudicationFinalPackagePayload
}

export type JuryConsensusPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  verdictSource: "JURY"
  finalValidity: AdjudicationResolvedValidity
  aggregatedAtTimestampSec: bigint
  juryDeadlineTimestampSec: bigint
  adjudicationDeadlineTimestampSec: bigint
  scopeKey: `0x${string}`
  consensusVoteCount: number
  llmAgreeingVoteCount: number
  humanAgreeingVoteCount: number
  supportingOpinionRecordKeys: `0x${string}`[]
  supportingRationaleDigests: `0x${string}`[]
  supportingTestimonyDigests: `0x${string}`[]
  rationale: string
}

export type JuryConsensusEnvelope = {
  magic: "ASRP"
  reportType: "jury-consensus/v1"
  payload: JuryConsensusPayload
}

export type OwnerAdjudicationHandoffPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  lifecycleStatus: "AWAITING_OWNER_ADJUDICATION"
  aggregatedAtTimestampSec: bigint
  juryDeadlineTimestampSec: bigint
  adjudicationDeadlineTimestampSec: bigint
  scopeKey: `0x${string}`
  receivedVoteCount: number
  requiredConsensusCount: 8
  requiredCohortCount: 3
  leadingFinalValidity?: AdjudicationResolvedValidity
  leadingVoteCount: number
  leadingLLMVoteCount: number
  leadingHumanVoteCount: number
  supportingOpinionRecordKeys: `0x${string}`[]
  supportingRationaleDigests: `0x${string}`[]
  supportingTestimonyDigests: `0x${string}`[]
  reason: string
}

export type OwnerAdjudicationHandoffEnvelope = {
  magic: "ASRP"
  reportType: "owner-adjudication-handoff/v1"
  payload: OwnerAdjudicationHandoffPayload
}

export type OwnerAdjudicationExpiredPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  lifecycleStatus: "OWNER_ADJUDICATION_EXPIRED"
  resolution: "UNRESOLVED"
  scopeKey: `0x${string}`
  juryDeadlineTimestampSec: bigint
  adjudicationDeadlineTimestampSec: bigint
  submittedAtTimestampSec: bigint
  evidenceReportType: "verified-report/v3"
  oasisEnvelopeHash: `0x${string}`
  reason: string
}

export type OwnerAdjudicationExpiredEnvelope = {
  magic: "ASRP"
  reportType: "owner-adjudication-expired/v1"
  payload: OwnerAdjudicationExpiredPayload
}

type OwnerAdjudicationFinalVerdictPayload = {
  submissionId: bigint
  projectId: bigint
  juryRoundId: bigint
  handoffReportType: "owner-adjudication-handoff/v1"
  scopeKey: `0x${string}`
  evidenceReportType: "verified-report/v3"
  oasisEnvelopeHash: `0x${string}`
  finalValidity: AdjudicationResolvedValidity
  rationale: string
  testimony: string
  drainAmountWei: bigint
  currentTimestampSec: bigint
}

export type JuryPipelineMode =
  | "derive-recommendation"
  | "aggregate-recommendations"
  | "aggregate-opinions"
  | "owner-testimony"
  | "opinion-ingest"
  | "case-initialization"
  | "final-package"

export type JuryRecommendationPipelineInput = {
  mode?: "derive-recommendation"
  config: unknown
  verifiedReport: unknown
}

export type JuryConsensusPipelineInput = {
  mode?: "aggregate-recommendations"
  config: unknown
  recommendations: unknown
  requiredQuorum: unknown
  timedOut?: unknown
}

export type OpinionAggregationPipelineInput = {
  mode: "aggregate-opinions"
  config: unknown
  casePackage: unknown
  opinionIngest: unknown
  currentTimestampSec: unknown
}

export type JuryOwnerTestimonyPipelineInput = {
  mode?: "owner-testimony"
  config: unknown
  recommendation: unknown
  ownerTestimony: unknown
  verifiedReport?: unknown
}

export type AdjudicationCaseInitializationPipelineInput = {
  mode: "case-initialization"
  config: unknown
  verifiedReport: unknown
  juryRoundId: unknown
  rosterSelection: unknown
}

export type FinalAdjudicationPackagePipelineInput = {
  mode: "final-package"
  config: unknown
  casePackage: unknown
  finalVerdict: unknown
}

export type OpinionIngestPipelineInput = {
  mode: "opinion-ingest"
  config: unknown
  casePackage: unknown
  sealedOpinions: unknown
}

export type JuryPipelineInput =
  | JuryRecommendationPipelineInput
  | JuryConsensusPipelineInput
  | OpinionAggregationPipelineInput
  | JuryOwnerTestimonyPipelineInput
  | OpinionIngestPipelineInput
  | AdjudicationCaseInitializationPipelineInput
  | FinalAdjudicationPackagePipelineInput

export type SealedJurorOpinionRecord = {
  slotIndex: number
  cohort: JurorCohort
  cohortSlotIndex: number
  jurorId: string
  finalValidity: AdjudicationResolvedValidity
  rationaleDigest: `0x${string}`
  testimonyDigest: `0x${string}`
  ingestTimestampSec: bigint
  scopeKey: `0x${string}`
  recordKey: `0x${string}`
  slotId: string
}

export type OpinionIngestEnvelope = {
  magic: "ASRP"
  reportType: "jury-opinion-ingest/v1"
  payload: {
    submissionId: bigint
    projectId: bigint
    juryRoundId: bigint
    scopeKey: `0x${string}`
    recordCount: number
    records: SealedJurorOpinionRecord[]
  }
}

export type JuryPipelineOutput =
  | JuryTypedReportEnvelope
  | OpinionIngestEnvelope
  | AdjudicationCaseEnvelope
  | AdjudicationFinalPackageEnvelope
  | OwnerAdjudicationExpiredEnvelope
  | JuryConsensusEnvelope
  | OwnerAdjudicationHandoffEnvelope

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const BYTES32_HEX_REGEX = /^0x[0-9a-fA-F]{64}$/
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const
const POSITIVE_INTEGER_STRING_REGEX = /^[0-9]+$/
const NON_NEGATIVE_INTEGER_STRING_REGEX = /^[0-9]+$/
const REPORT_ENVELOPE_MAGIC = "ASRP"
const REPORT_ENVELOPE_MAGIC_HEX = "0x41535250" as const
const VERIFIED_REPORT_TYPE_V1 = "verified-report/v1"
const VERIFIED_REPORT_TYPE_V2 = "verified-report/v2"
const VERIFIED_REPORT_TYPE_V3 = "verified-report/v3"
const JURY_RECOMMENDATION_REPORT_TYPE = "jury-recommendation/v1"
const ADJUDICATION_CASE_REPORT_TYPE = "adjudication-case/v1"
const ADJUDICATION_FINAL_REPORT_TYPE = "adjudication-final/v1"
const CONTRACT_TYPED_REPORT_TYPE = 3
const BOUNTY_HUB_SUBMISSION_STATUS_VERIFIED = 2
const BOUNTY_HUB_SUBMISSION_STATUS_INVALID = 5
const BOUNTY_HUB_VERDICT_SOURCE_JURY = 2
const BOUNTY_HUB_VERDICT_SOURCE_OWNER = 3
const BOUNTY_HUB_FINAL_VALIDITY_VALID = 1
const BOUNTY_HUB_FINAL_VALIDITY_INVALID = 2
const BOUNTY_HUB_SEVERITY_NONE = 0
const BOUNTY_HUB_SEVERITY_MEDIUM = 2
const BOUNTY_HUB_SEVERITY_HIGH = 3
const JURY_CONSENSUS_REPORT_TYPE = "jury-consensus/v1"
const OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE = "owner-adjudication-handoff/v1"
const OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE = "owner-adjudication-expired/v1"
const VERIFY_POC_JURY_COMMITMENT_VERSION =
  "anti-soon.verify-poc.jury-commitment.v1"
const VERIFY_POC_ADJUDICATION_VERSION = "anti-soon.verify-poc.adjudication.v1"
const JURY_ROSTER_VERSION = "anti-soon.jury-roster.v1"
const HUMAN_JUROR_SELECTION_VERSION = "anti-soon.human-juror-selection.v1"
const HUMAN_JUROR_REPLACEMENT_VERSION = "anti-soon.human-juror-replacement.v1"
const LLM_JUROR_ASSIGNMENT_VERSION = "anti-soon.llm-juror-slot.v1"
const EFFECTIVE_JURY_ROSTER_VERSION = "anti-soon.jury-roster-effective.v1"
const JURY_CANDIDATE_POOL_VERSION = "anti-soon.jury-candidate-pool.v1"
const FIXED_LLM_JUROR_SLOT_COUNT = 5 as const
const HUMAN_JUROR_SLOT_COUNT = 5 as const
const TOTAL_JUROR_SLOT_COUNT = 10 as const
const ADJUDICATION_FINAL_CONTRACT_REPORT_PARAMS = parseAbiParameters(
  "uint256 submissionId, bool isValid, uint256 drainAmountWei, bool hasJury, string juryAction, string juryRationale, bool hasGrouping, string groupingCohort, string groupId, uint256 groupRank, uint256 groupSize, uint8 lifecycleStatus, uint256 juryDeadline, uint256 adjudicationDeadline, uint8 verdictSource, uint8 finalValidity, bytes32 juryLedgerDigest, bytes32 ownerTestimonyDigest, uint8 adjudicatedSeverity",
)
const CONTRACT_TYPED_REPORT_ENVELOPE_PARAMS = parseAbiParameters(
  "bytes4 magic, uint8 reportType, bytes payload",
)
const VERSIONED_ENVELOPE_KEYS = ["magic", "reportType", "payload"] as const
const JURY_WORKFLOW_CONFIG_KEYS = [
  "chainSelectorName",
  "bountyHubAddress",
  "gasLimit",
  "juryPolicy",
] as const
const VERIFIED_REPORT_ENVELOPE_V2_KEYS = [
  "magic",
  "reportType",
  "payload",
  "jury",
  "testimony",
] as const
const VERIFIED_REPORT_ENVELOPE_V3_KEYS = [
  "magic",
  "reportType",
  "payload",
  "juryCommitment",
  "adjudication",
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
const VERIFIED_REPORT_JURY_COMMITMENT_KEYS = [
  "commitmentVersion",
  "juryLedgerDigest",
  "sourceEventKey",
  "mappingFingerprint",
] as const
const VERIFIED_REPORT_ADJUDICATION_KEYS = [
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
const VERIFIED_REPORT_ADJUDICATION_OASIS_KEYS = [
  "chain",
  "contract",
  "slotId",
  "envelopeHash",
] as const
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
const JUROR_IDENTITY_INPUT_KEYS = ["jurorId"] as const
const ROSTER_SELECTION_INPUT_KEYS = [
  "llmJurors",
  "humanCandidates",
  "humanSelection",
] as const
const HUMAN_SELECTION_INPUT_KEYS = [
  "selectionVersion",
  "randomnessDigest",
  "selectionSource",
  "selectionNonce",
] as const
const ROSTER_COMMITMENT_KEYS = [
  "rosterVersion",
  "commitmentDigest",
  "rosterDigest",
  "llmSlotCount",
  "humanSlotCount",
  "slots",
  "humanSelection",
  "humanSlotReplacements",
] as const
const JURY_ROSTER_SLOT_KEYS = [
  "slotIndex",
  "cohort",
  "cohortSlotIndex",
  "jurorId",
  "assignmentDigest",
] as const
const HUMAN_SLOT_SELECTION_KEYS = [
  "slotIndex",
  "cohortSlotIndex",
  "jurorId",
  "candidateIndex",
  "selectionDigest",
] as const
const HUMAN_SELECTION_PROVENANCE_KEYS = [
  "selectionVersion",
  "randomnessDigest",
  "selectionSource",
  "selectionNonce",
  "candidatePoolDigest",
  "slotSelections",
] as const
const HUMAN_SLOT_REPLACEMENT_KEYS = [
  "replacementVersion",
  "slotIndex",
  "cohortSlotIndex",
  "previousJurorId",
  "nextJurorId",
  "replacementReason",
  "replacementTimestampSec",
  "replacementSource",
  "replacementNonce",
  "replacementRandomnessDigest",
  "replacementDigest",
] as const
const OPINION_INGEST_SLOT_AUTH_KEYS = [
  "slotIndex",
  "cohort",
  "jurorId",
] as const
const HUMAN_JUROR_REPLACEMENT_INPUT_KEYS = [
  "slotIndex",
  "nextJurorId",
  "replacementReason",
  "replacementTimestampSec",
  "replacementSource",
  "replacementNonce",
  "replacementRandomnessDigest",
] as const
const ADJUDICATION_CASE_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "lifecycleStatus",
  "verdictSource",
  "finalValidity",
  "juryDeadlineTimestampSec",
  "adjudicationDeadlineTimestampSec",
  "evidenceReportType",
  "juryLedgerDigest",
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
const OWNER_ADJUDICATION_HANDOFF_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "lifecycleStatus",
  "aggregatedAtTimestampSec",
  "juryDeadlineTimestampSec",
  "adjudicationDeadlineTimestampSec",
  "scopeKey",
  "receivedVoteCount",
  "requiredConsensusCount",
  "requiredCohortCount",
  "leadingFinalValidity",
  "leadingVoteCount",
  "leadingLLMVoteCount",
  "leadingHumanVoteCount",
  "supportingOpinionRecordKeys",
  "supportingRationaleDigests",
  "supportingTestimonyDigests",
  "reason",
] as const
const JURY_CONSENSUS_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "verdictSource",
  "finalValidity",
  "aggregatedAtTimestampSec",
  "juryDeadlineTimestampSec",
  "adjudicationDeadlineTimestampSec",
  "scopeKey",
  "consensusVoteCount",
  "llmAgreeingVoteCount",
  "humanAgreeingVoteCount",
  "supportingOpinionRecordKeys",
  "supportingRationaleDigests",
  "supportingTestimonyDigests",
  "rationale",
] as const
const JURY_CONSENSUS_FINAL_VERDICT_KEYS = [
  "consensus",
  "opinionIngest",
  "drainAmountWei",
] as const
const ADJUDICATION_FINAL_VERDICT_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "verdictSource",
  "finalValidity",
  "rationale",
  "drainAmountWei",
  "ownerTestimonyDigest",
] as const
const OWNER_ADJUDICATION_FINAL_VERDICT_KEYS = [
  "handoff",
  "opinionIngest",
  "submissionId",
  "projectId",
  "juryRoundId",
  "handoffReportType",
  "scopeKey",
  "evidenceReportType",
  "oasisEnvelopeHash",
  "finalValidity",
  "rationale",
  "testimony",
  "drainAmountWei",
  "currentTimestampSec",
] as const
const RECOMMENDATION_PIPELINE_INPUT_KEYS = [
  "mode",
  "config",
  "verifiedReport",
] as const
const RECOMMENDATION_AGGREGATION_INPUT_KEYS = [
  "mode",
  "config",
  "recommendations",
  "requiredQuorum",
  "timedOut",
] as const
const OWNER_TESTIMONY_INPUT_KEYS = [
  "mode",
  "config",
  "recommendation",
  "ownerTestimony",
  "verifiedReport",
] as const
const CASE_INITIALIZATION_INPUT_KEYS = [
  "mode",
  "config",
  "verifiedReport",
  "juryRoundId",
  "rosterSelection",
] as const
const OPINION_INGEST_INPUT_KEYS = [
  "mode",
  "config",
  "casePackage",
  "sealedOpinions",
] as const
const FINAL_PACKAGE_INPUT_KEYS = [
  "mode",
  "config",
  "casePackage",
  "finalVerdict",
] as const
const OPINION_AGGREGATION_INPUT_KEYS = [
  "mode",
  "config",
  "casePackage",
  "opinionIngest",
  "currentTimestampSec",
] as const
const SEALED_OPINION_INPUT_KEYS = [
  "slotIndex",
  "cohort",
  "jurorId",
  "finalValidity",
  "rationaleDigest",
  "testimonyDigest",
  "ingestTimestampSec",
] as const
const OPINION_INGEST_PAYLOAD_KEYS = [
  "submissionId",
  "projectId",
  "juryRoundId",
  "scopeKey",
  "recordCount",
  "records",
] as const
const OPINION_INGEST_RECORD_KEYS = [
  "slotIndex",
  "cohort",
  "cohortSlotIndex",
  "jurorId",
  "finalValidity",
  "rationaleDigest",
  "testimonyDigest",
  "ingestTimestampSec",
  "scopeKey",
  "recordKey",
  "slotId",
] as const
const JURY_LEDGER_SCOPE_VERSION = "anti-soon.jury-ledger.scope.v1"
const JURY_LEDGER_RECORD_VERSION = "anti-soon.jury-ledger.record.v1"
const JURY_LEDGER_SLOT_PREFIX = "jury-ledger/v1"
const JURY_LEDGER_APPEND_ONLY_ERROR = "JURY_LEDGER_APPEND_ONLY"
const JURY_OPINION_INGEST_REPORT_TYPE = "jury-opinion-ingest/v1"
const JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE_ERROR =
  "JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE"
const CONFIDENTIAL_JURY_LEDGER_READ_FAILED_ERROR =
  "CONFIDENTIAL_JURY_LEDGER_READ_FAILED"
const OWNER_ADJUDICATION_EXPIRED_ERROR = "OWNER_ADJUDICATION_EXPIRED"
const TARGET_STATE_REQUIRED_CONSENSUS_COUNT = 8 as const
const TARGET_STATE_REQUIRED_COHORT_COUNT = 3 as const
const OWNER_ADJUDICATION_TESTIMONY_VERSION =
  "anti-soon.owner-adjudication-testimony.v1"
const JURY_CONSENSUS_ENVELOPE_DIGEST_VERSION =
  "anti-soon.jury-consensus-envelope.v1"
const OWNER_ADJUDICATION_HANDOFF_ENVELOPE_DIGEST_VERSION =
  "anti-soon.owner-adjudication-handoff-envelope.v1"
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

type ParsedRecommendationPipelineInput = {
  config: JuryWorkflowConfig
  verifiedReport: VerifiedReportEnvelope
}

type ParsedRecommendationAggregationPipelineInput = {
  config: JuryWorkflowConfig
  recommendations: JuryTypedReportEnvelope[]
  requiredQuorum: number
  timedOut: boolean
}

type ParsedOwnerTestimonyPipelineInput = {
  config: JuryWorkflowConfig
  recommendation: JuryTypedReportEnvelope
  ownerTestimony: OwnerTestimonyPayload
  verifiedReport?: VerifiedReportEnvelope
}

type ParsedCaseInitializationPipelineInput = {
  config: JuryWorkflowConfig
  verifiedReport: VerifiedReportEnvelope
  juryRoundId: bigint
  rosterSelection: JuryRosterSelectionInput
}

type ParsedFinalVerdictCandidate =
  | {
      kind: "legacy-recommendation"
      envelope: JuryTypedReportEnvelope
    }
  | {
      kind: "jury-consensus"
      consensus: JuryConsensusEnvelope
      opinionIngest: OpinionIngestEnvelope
      payload: {
        drainAmountWei: bigint
      }
    }
  | {
      kind: "owner-adjudication"
      handoff: OwnerAdjudicationHandoffEnvelope
      opinionIngest: OpinionIngestEnvelope
      payload: OwnerAdjudicationFinalVerdictPayload
    }
  | {
      kind: "target-state-final-verdict"
      payload: AdjudicationFinalVerdictPayload
    }

type ParsedFinalPackagePipelineInput = {
  config: JuryWorkflowConfig
  casePackage: AdjudicationCaseEnvelope
  finalVerdict: ParsedFinalVerdictCandidate
}

type ParsedSealedOpinionInput = {
  slotIndex: number
  cohort: JurorCohort
  jurorId: string
  finalValidity: AdjudicationResolvedValidity
  rationaleDigest: `0x${string}`
  testimonyDigest: `0x${string}`
  ingestTimestampSec: bigint
}

type ParsedOpinionIngestPipelineInput = {
  config: JuryWorkflowConfig
  casePackage: AdjudicationCaseEnvelope
  sealedOpinions: ParsedSealedOpinionInput[]
}

type ParsedOpinionAggregationPipelineInput = {
  config: JuryWorkflowConfig
  casePackage: AdjudicationCaseEnvelope
  opinionIngest: OpinionIngestEnvelope
  currentTimestampSec: bigint
}

type TargetStateOpinionSupportBucket = {
  total: number
  LLM: number
  HUMAN: number
  records: SealedJurorOpinionRecord[]
}

type NormalizedAdjudicationDecision =
  | {
      compatibility: "migration-only"
      submissionId: bigint
      projectId: bigint
      juryRoundId?: bigint
      verdictSource: "JURY"
      finalValidity: AdjudicationFinalValidity
      rationale: string
      drainAmountWei: bigint
      legacyAction: JuryRecommendationAction
    }
  | {
      compatibility: "final-verdict-ready"
      submissionId: bigint
      projectId: bigint
      juryRoundId: bigint
      verdictSource: "JURY" | "OWNER"
      finalValidity: AdjudicationResolvedValidity
      rationale: string
      drainAmountWei: bigint
      ownerTestimonyDigest?: `0x${string}`
    }

type FinalPackageResolution =
  | NormalizedAdjudicationDecision
  | OwnerAdjudicationExpiredEnvelope

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

function requireOptionalBigIntLike(
  value: unknown,
  fieldName: string,
): bigint | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireBigIntLike(value, fieldName)
}

function requirePositiveBigIntLike(
  value: unknown,
  fieldName: string,
): bigint {
  const parsed = requireBigIntLike(value, fieldName)
  if (parsed === 0n) {
    throw new Error(`${fieldName} must be a positive integer`)
  }

  return parsed
}

function requireStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }

  return value.map((entry, index) =>
    requireNonEmptyString(entry, `${fieldName}[${index}]`),
  )
}

function requireBytes32HexStringArray(
  value: unknown,
  fieldName: string,
): `0x${string}`[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`)
  }

  return value.map((entry, index) =>
    requireBytes32HexString(entry, `${fieldName}[${index}]`),
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

function requireBytes32HexString(
  value: unknown,
  fieldName: string,
): `0x${string}` {
  const normalized = requireNonEmptyString(value, fieldName)
  if (!BYTES32_HEX_REGEX.test(normalized)) {
    throw new Error(`${fieldName} must be a 0x-prefixed 32-byte hex string`)
  }

  return normalized as `0x${string}`
}

function requireOptionalBytes32HexString(
  value: unknown,
  fieldName: string,
): `0x${string}` | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireBytes32HexString(value, fieldName)
}

function requireAddressString(
  value: unknown,
  fieldName: string,
): `0x${string}` {
  const normalized = requireNonEmptyString(value, fieldName)
  if (!EVM_ADDRESS_REGEX.test(normalized)) {
    throw new Error(`${fieldName} must be a valid EVM address`)
  }

  if (normalized.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${fieldName} must be a non-zero EVM address`)
  }

  return normalized as `0x${string}`
}

function requireAdjudicationVerdictSource(
  value: unknown,
  fieldName: string,
): AdjudicationVerdictSource {
  const normalized = requireNonEmptyString(value, fieldName)

  if (
    normalized !== "NONE" &&
    normalized !== "JURY" &&
    normalized !== "OWNER"
  ) {
    throw new Error(`${fieldName} must be a supported adjudication verdict source`)
  }

  return normalized
}

function requireAdjudicationFinalValidity(
  value: unknown,
  fieldName: string,
): AdjudicationFinalValidity {
  const normalized = requireNonEmptyString(value, fieldName)

  if (
    normalized !== "NONE" &&
    normalized !== "HIGH" &&
    normalized !== "MEDIUM" &&
    normalized !== "INVALID"
  ) {
    throw new Error(`${fieldName} must be a supported adjudication final validity`)
  }

  return normalized
}

function requireFinalValidity(
  value: unknown,
  fieldName: string,
): AdjudicationResolvedValidity {
  const normalized = requireAdjudicationFinalValidity(value, fieldName)
  if (normalized === "NONE") {
    throw new Error(`${fieldName} must be a final adjudication validity`)
  }

  return normalized
}

function requireOptionalFinalValidity(
  value: unknown,
  fieldName: string,
): AdjudicationResolvedValidity | undefined {
  if (value === undefined) {
    return undefined
  }

  return requireFinalValidity(value, fieldName)
}

function requireAdjudicationLifecycleStatus(
  value: unknown,
  fieldName: string,
): AdjudicationLifecycleStatus {
  const normalized = requireNonEmptyString(value, fieldName)

  if (
    normalized !== "JURY_PENDING" &&
    normalized !== "AWAITING_OWNER_ADJUDICATION" &&
    normalized !== "VERIFIED" &&
    normalized !== "INVALID"
  ) {
    throw new Error(`${fieldName} must be a supported adjudication lifecycle status`)
  }

  return normalized
}

type CanonicalDigestValue =
  | null
  | boolean
  | number
  | string
  | bigint
  | CanonicalDigestValue[]
  | { [key: string]: CanonicalDigestValue }

type ParsedOpinionIngestJurorSlotAuthInput = {
  slotIndex: number
  cohort: JurorCohort
  jurorId: string
}

type ParsedHumanJurorReplacementInput = {
  slotIndex: number
  nextJurorId: string
  replacementReason: string
  replacementTimestampSec: bigint
  replacementSource: string
  replacementNonce: `0x${string}`
  replacementRandomnessDigest: `0x${string}`
}

function requireNonNegativeSafeInteger(value: unknown, fieldName: string): number {
  const parsed = requireBigIntLike(value, fieldName)
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${fieldName} must be a non-negative safe integer`)
  }

  return Number(parsed)
}

function requireJurorCohort(value: unknown, fieldName: string): JurorCohort {
  const normalized = requireNonEmptyString(value, fieldName)
  if (normalized !== "LLM" && normalized !== "HUMAN") {
    throw new Error(`${fieldName} must be a supported juror cohort`)
  }

  return normalized
}

function normalizeHexForDigest(value: `0x${string}`): `0x${string}` {
  return value.toLowerCase() as `0x${string}`
}

const SHA256_INITIAL_STATE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
]

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

function rotateRight32(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift))
}

function sha256Hex(input: string): string {
  const source = new TextEncoder().encode(input)
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLength)
  padded.set(source)
  padded[source.length] = 0x80

  const bitLength = BigInt(source.length) * 8n
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Number((bitLength >> 32n) & 0xffffffffn), false)
  view.setUint32(padded.length - 4, Number(bitLength & 0xffffffffn), false)

  const hash = [...SHA256_INITIAL_STATE]
  const schedule = new Uint32Array(64)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = view.getUint32(offset + index * 4, false)
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rotateRight32(schedule[index - 15], 7) ^
        rotateRight32(schedule[index - 15], 18) ^
        (schedule[index - 15] >>> 3)
      const s1 =
        rotateRight32(schedule[index - 2], 17) ^
        rotateRight32(schedule[index - 2], 19) ^
        (schedule[index - 2] >>> 10)
      schedule[index] =
        (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, h] = hash

    for (let index = 0; index < 64; index += 1) {
      const sigma1 =
        rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25)
      const choice = (e & f) ^ (~e & g)
      const temp1 =
        (h + sigma1 + choice + SHA256_ROUND_CONSTANTS[index] + schedule[index]) >>> 0
      const sigma0 =
        rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22)
      const majority = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (sigma0 + majority) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("")
}

function canonicalizeDigestValue(value: CanonicalDigestValue): string {
  if (value === null) {
    return "null"
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error("stable digest canonicalization requires safe integers")
    }
    return `number:${value.toString(10)}`
  }

  if (typeof value === "bigint") {
    return `bigint:${value.toString(10)}`
  }

  if (typeof value === "string") {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalizeDigestValue(entry)).join(",")}]`
  }

  const keys = Object.keys(value).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalizeDigestValue(value[key])}`)
    .join(",")}}`
}

function deriveStableDigest(
  version: string,
  value: CanonicalDigestValue,
): `0x${string}` {
  return `0x${sha256Hex(`${version}|${canonicalizeDigestValue(value)}`)}` as `0x${string}`
}

function serializeJuryRosterSlotForDigest(
  slot: JuryRosterSlot,
): Record<string, CanonicalDigestValue> {
  return {
    slotIndex: slot.slotIndex,
    cohort: slot.cohort,
    cohortSlotIndex: slot.cohortSlotIndex,
    jurorId: slot.jurorId,
    assignmentDigest: normalizeHexForDigest(slot.assignmentDigest),
  }
}

function serializeHumanSlotSelectionForDigest(
  slot: HumanJurorSlotSelection,
): Record<string, CanonicalDigestValue> {
  return {
    slotIndex: slot.slotIndex,
    cohortSlotIndex: slot.cohortSlotIndex,
    jurorId: slot.jurorId,
    candidateIndex: slot.candidateIndex,
    selectionDigest: normalizeHexForDigest(slot.selectionDigest),
  }
}

function serializeHumanSelectionForDigest(
  selection: HumanJurorSelectionProvenance,
): Record<string, CanonicalDigestValue> {
  return {
    selectionVersion: selection.selectionVersion,
    randomnessDigest: normalizeHexForDigest(selection.randomnessDigest),
    selectionSource: selection.selectionSource,
    selectionNonce: normalizeHexForDigest(selection.selectionNonce),
    candidatePoolDigest: normalizeHexForDigest(selection.candidatePoolDigest),
    slotSelections: selection.slotSelections.map((slot) =>
      serializeHumanSlotSelectionForDigest(slot),
    ),
  }
}

function serializeHumanReplacementForDigest(
  replacement: HumanJurorReplacementRecord,
): Record<string, CanonicalDigestValue> {
  return {
    replacementVersion: replacement.replacementVersion,
    slotIndex: replacement.slotIndex,
    cohortSlotIndex: replacement.cohortSlotIndex,
    previousJurorId: replacement.previousJurorId,
    nextJurorId: replacement.nextJurorId,
    replacementReason: replacement.replacementReason,
    replacementTimestampSec: replacement.replacementTimestampSec,
    replacementSource: replacement.replacementSource,
    replacementNonce: normalizeHexForDigest(replacement.replacementNonce),
    replacementRandomnessDigest: normalizeHexForDigest(
      replacement.replacementRandomnessDigest,
    ),
    replacementDigest: normalizeHexForDigest(replacement.replacementDigest),
  }
}

function assertUniqueJurorIds(jurorIds: string[], label: string): void {
  const seen = new Set<string>()
  for (const jurorId of jurorIds) {
    if (seen.has(jurorId)) {
      throw new Error(`${label} contains duplicate jurorId ${jurorId}`)
    }
    seen.add(jurorId)
  }
}

function parseJurorIdentityInputs(
  value: unknown,
  label: string,
  args: { exactLength?: number; minimumLength?: number },
): { jurorId: string }[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`)
  }

  if (args.exactLength !== undefined && value.length !== args.exactLength) {
    throw new Error(`${label} must contain exactly ${args.exactLength} juror slots`)
  }

  if (args.minimumLength !== undefined && value.length < args.minimumLength) {
    throw new Error(`${label} must contain at least ${args.minimumLength} juror candidates`)
  }

  const parsed = value.map((entry, index) => {
    const source = requireObject(entry, `${label}[${index}]`)
    assertExactKeys(source, JUROR_IDENTITY_INPUT_KEYS, `${label}[${index}]`)
    return {
      jurorId: requireNonEmptyString(source.jurorId, `${label}[${index}].jurorId`),
    }
  })

  assertUniqueJurorIds(
    parsed.map((entry) => entry.jurorId),
    label,
  )

  return parsed
}

function parseHumanJurorSelectionInput(
  value: unknown,
): JuryRosterSelectionInput["humanSelection"] {
  const source = requireObject(value, "rosterSelection.humanSelection")
  assertExactKeys(
    source,
    HUMAN_SELECTION_INPUT_KEYS,
    "rosterSelection.humanSelection",
  )

  const selectionVersion = requireNonEmptyString(
    source.selectionVersion,
    "rosterSelection.humanSelection.selectionVersion",
  )
  if (selectionVersion !== HUMAN_JUROR_SELECTION_VERSION) {
    throw new Error(
      `rosterSelection.humanSelection.selectionVersion must be ${HUMAN_JUROR_SELECTION_VERSION}`,
    )
  }

  return {
    selectionVersion: HUMAN_JUROR_SELECTION_VERSION,
    randomnessDigest: normalizeHexForDigest(
      requireBytes32HexString(
        source.randomnessDigest,
        "rosterSelection.humanSelection.randomnessDigest",
      ),
    ),
    selectionSource: requireNonEmptyString(
      source.selectionSource,
      "rosterSelection.humanSelection.selectionSource",
    ),
    selectionNonce: normalizeHexForDigest(
      requireBytes32HexString(
        source.selectionNonce,
        "rosterSelection.humanSelection.selectionNonce",
      ),
    ),
  }
}

function parseRosterSelectionInput(value: unknown): JuryRosterSelectionInput {
  const source = requireObject(value, "rosterSelection")
  assertExactKeys(source, ROSTER_SELECTION_INPUT_KEYS, "rosterSelection")

  const llmJurors = parseJurorIdentityInputs(
    source.llmJurors,
    "rosterSelection.llmJurors",
    { exactLength: FIXED_LLM_JUROR_SLOT_COUNT },
  )
  const humanCandidates = parseJurorIdentityInputs(
    source.humanCandidates,
    "rosterSelection.humanCandidates",
    { minimumLength: HUMAN_JUROR_SLOT_COUNT },
  )

  assertUniqueJurorIds(
    [...llmJurors, ...humanCandidates].map((entry) => entry.jurorId),
    "rosterSelection",
  )

  return {
    llmJurors,
    humanCandidates,
    humanSelection: parseHumanJurorSelectionInput(source.humanSelection),
  }
}

function deriveCandidatePoolDigest(
  humanCandidates: { jurorId: string }[],
): `0x${string}` {
  return deriveStableDigest(JURY_CANDIDATE_POOL_VERSION, {
    jurorIds: humanCandidates.map((candidate) => candidate.jurorId),
  })
}

function deriveRosterCommitmentDigest(args: {
  slots: JuryRosterSlot[]
  humanSelection: HumanJurorSelectionProvenance
}): `0x${string}` {
  return deriveStableDigest(JURY_ROSTER_VERSION, {
    rosterVersion: JURY_ROSTER_VERSION,
    llmSlotCount: FIXED_LLM_JUROR_SLOT_COUNT,
    humanSlotCount: HUMAN_JUROR_SLOT_COUNT,
    slots: args.slots.map((slot) => serializeJuryRosterSlotForDigest(slot)),
    humanSelection: serializeHumanSelectionForDigest(args.humanSelection),
  })
}

function resolveEffectiveRosterSlots(roster: {
  slots: JuryRosterSlot[]
  humanSlotReplacements: HumanJurorReplacementRecord[]
}): JuryRosterSlot[] {
  const effectiveSlots = roster.slots.map((slot) => ({ ...slot }))

  for (const replacement of roster.humanSlotReplacements) {
    const slot = effectiveSlots[replacement.slotIndex]
    if (!slot) {
      throw new Error(
        `replacement references missing roster slot ${replacement.slotIndex}`,
      )
    }

    if (slot.cohort !== "HUMAN") {
      throw new Error(
        `replacement slot ${replacement.slotIndex} must reference a committed human slot`,
      )
    }

    if (slot.cohortSlotIndex !== replacement.cohortSlotIndex) {
      throw new Error(
        `replacement cohortSlotIndex must match committed slot ${replacement.slotIndex}`,
      )
    }

    if (slot.jurorId !== replacement.previousJurorId) {
      throw new Error(
        `replacement previousJurorId must match the active juror for slot ${replacement.slotIndex}`,
      )
    }

    if (
      effectiveSlots.some(
        (candidate, candidateIndex) =>
          candidateIndex !== replacement.slotIndex &&
          candidate.jurorId === replacement.nextJurorId,
      )
    ) {
      throw new Error(
        `replacement nextJurorId ${replacement.nextJurorId} is already active in the committed roster`,
      )
    }

    effectiveSlots[replacement.slotIndex] = {
      ...slot,
      jurorId: replacement.nextJurorId,
      assignmentDigest: replacement.replacementDigest,
    }
  }

  return effectiveSlots
}

function deriveEffectiveRosterDigest(roster: JuryRosterCommitment): `0x${string}` {
  if (roster.humanSlotReplacements.length === 0) {
    return roster.commitmentDigest
  }

  return deriveStableDigest(EFFECTIVE_JURY_ROSTER_VERSION, {
    commitmentDigest: normalizeHexForDigest(roster.commitmentDigest),
    effectiveSlots: resolveEffectiveRosterSlots(roster).map((slot) =>
      serializeJuryRosterSlotForDigest(slot),
    ),
    replacementTrail: roster.humanSlotReplacements.map((replacement) =>
      serializeHumanReplacementForDigest(replacement),
    ),
  })
}

function assertRosterSlotOrder(slots: JuryRosterSlot[], label: string): void {
  if (slots.length !== TOTAL_JUROR_SLOT_COUNT) {
    throw new Error(`${label} must contain exactly ${TOTAL_JUROR_SLOT_COUNT} juror slots`)
  }

  for (const [index, slot] of slots.entries()) {
    if (slot.slotIndex !== index) {
      throw new Error(`${label}[${index}].slotIndex must equal ${index}`)
    }

    const expectedCohort: JurorCohort =
      index < FIXED_LLM_JUROR_SLOT_COUNT ? "LLM" : "HUMAN"
    const expectedCohortSlotIndex =
      index < FIXED_LLM_JUROR_SLOT_COUNT ? index : index - FIXED_LLM_JUROR_SLOT_COUNT

    if (slot.cohort !== expectedCohort) {
      throw new Error(`${label}[${index}].cohort must equal ${expectedCohort}`)
    }

    if (slot.cohortSlotIndex !== expectedCohortSlotIndex) {
      throw new Error(
        `${label}[${index}].cohortSlotIndex must equal ${expectedCohortSlotIndex}`,
      )
    }
  }

  assertUniqueJurorIds(
    slots.map((slot) => slot.jurorId),
    label,
  )
}

function parseJuryRosterSlot(value: unknown, label: string): JuryRosterSlot {
  const source = requireObject(value, label)
  assertExactKeys(source, JURY_ROSTER_SLOT_KEYS, label)

  return {
    slotIndex: requireNonNegativeSafeInteger(source.slotIndex, `${label}.slotIndex`),
    cohort: requireJurorCohort(source.cohort, `${label}.cohort`),
    cohortSlotIndex: requireNonNegativeSafeInteger(
      source.cohortSlotIndex,
      `${label}.cohortSlotIndex`,
    ),
    jurorId: requireNonEmptyString(source.jurorId, `${label}.jurorId`),
    assignmentDigest: normalizeHexForDigest(
      requireBytes32HexString(source.assignmentDigest, `${label}.assignmentDigest`),
    ),
  }
}

function parseHumanJurorSlotSelection(
  value: unknown,
  label: string,
): HumanJurorSlotSelection {
  const source = requireObject(value, label)
  assertExactKeys(source, HUMAN_SLOT_SELECTION_KEYS, label)

  return {
    slotIndex: requireNonNegativeSafeInteger(source.slotIndex, `${label}.slotIndex`),
    cohortSlotIndex: requireNonNegativeSafeInteger(
      source.cohortSlotIndex,
      `${label}.cohortSlotIndex`,
    ),
    jurorId: requireNonEmptyString(source.jurorId, `${label}.jurorId`),
    candidateIndex: requireNonNegativeSafeInteger(
      source.candidateIndex,
      `${label}.candidateIndex`,
    ),
    selectionDigest: normalizeHexForDigest(
      requireBytes32HexString(source.selectionDigest, `${label}.selectionDigest`),
    ),
  }
}

function parseHumanJurorSelectionProvenance(
  value: unknown,
  label: string,
): HumanJurorSelectionProvenance {
  const source = requireObject(value, label)
  assertExactKeys(source, HUMAN_SELECTION_PROVENANCE_KEYS, label)

  const selectionVersion = requireNonEmptyString(
    source.selectionVersion,
    `${label}.selectionVersion`,
  )
  if (selectionVersion !== HUMAN_JUROR_SELECTION_VERSION) {
    throw new Error(
      `${label}.selectionVersion must be ${HUMAN_JUROR_SELECTION_VERSION}`,
    )
  }

  if (!Array.isArray(source.slotSelections)) {
    throw new Error(`${label}.slotSelections must be an array`)
  }

  const slotSelections = source.slotSelections.map((entry, index) =>
    parseHumanJurorSlotSelection(entry, `${label}.slotSelections[${index}]`),
  )

  return {
    selectionVersion: HUMAN_JUROR_SELECTION_VERSION,
    randomnessDigest: normalizeHexForDigest(
      requireBytes32HexString(source.randomnessDigest, `${label}.randomnessDigest`),
    ),
    selectionSource: requireNonEmptyString(
      source.selectionSource,
      `${label}.selectionSource`,
    ),
    selectionNonce: normalizeHexForDigest(
      requireBytes32HexString(source.selectionNonce, `${label}.selectionNonce`),
    ),
    candidatePoolDigest: normalizeHexForDigest(
      requireBytes32HexString(
        source.candidatePoolDigest,
        `${label}.candidatePoolDigest`,
      ),
    ),
    slotSelections,
  }
}

function parseHumanJurorReplacementRecord(
  value: unknown,
  label: string,
): HumanJurorReplacementRecord {
  const source = requireObject(value, label)
  assertExactKeys(source, HUMAN_SLOT_REPLACEMENT_KEYS, label)

  const replacementVersion = requireNonEmptyString(
    source.replacementVersion,
    `${label}.replacementVersion`,
  )
  if (replacementVersion !== HUMAN_JUROR_REPLACEMENT_VERSION) {
    throw new Error(
      `${label}.replacementVersion must be ${HUMAN_JUROR_REPLACEMENT_VERSION}`,
    )
  }

  return {
    replacementVersion: HUMAN_JUROR_REPLACEMENT_VERSION,
    slotIndex: requireNonNegativeSafeInteger(source.slotIndex, `${label}.slotIndex`),
    cohortSlotIndex: requireNonNegativeSafeInteger(
      source.cohortSlotIndex,
      `${label}.cohortSlotIndex`,
    ),
    previousJurorId: requireNonEmptyString(
      source.previousJurorId,
      `${label}.previousJurorId`,
    ),
    nextJurorId: requireNonEmptyString(source.nextJurorId, `${label}.nextJurorId`),
    replacementReason: requireNonEmptyString(
      source.replacementReason,
      `${label}.replacementReason`,
    ),
    replacementTimestampSec: requirePositiveBigIntLike(
      source.replacementTimestampSec,
      `${label}.replacementTimestampSec`,
    ),
    replacementSource: requireNonEmptyString(
      source.replacementSource,
      `${label}.replacementSource`,
    ),
    replacementNonce: normalizeHexForDigest(
      requireBytes32HexString(source.replacementNonce, `${label}.replacementNonce`),
    ),
    replacementRandomnessDigest: normalizeHexForDigest(
      requireBytes32HexString(
        source.replacementRandomnessDigest,
        `${label}.replacementRandomnessDigest`,
      ),
    ),
    replacementDigest: normalizeHexForDigest(
      requireBytes32HexString(source.replacementDigest, `${label}.replacementDigest`),
    ),
  }
}

function assertHumanSelectionMatchesCommittedSlots(
  slots: JuryRosterSlot[],
  humanSelection: HumanJurorSelectionProvenance,
  label: string,
): void {
  if (humanSelection.slotSelections.length !== HUMAN_JUROR_SLOT_COUNT) {
    throw new Error(
      `${label}.slotSelections must contain exactly ${HUMAN_JUROR_SLOT_COUNT} committed human slots`,
    )
  }

  for (const [index, selection] of humanSelection.slotSelections.entries()) {
    const slot = slots[FIXED_LLM_JUROR_SLOT_COUNT + index]
    if (selection.slotIndex !== slot.slotIndex) {
      throw new Error(
        `${label}.slotSelections[${index}].slotIndex must match committed slot ${slot.slotIndex}`,
      )
    }

    if (selection.cohortSlotIndex !== slot.cohortSlotIndex) {
      throw new Error(
        `${label}.slotSelections[${index}].cohortSlotIndex must match committed slot ${slot.cohortSlotIndex}`,
      )
    }

    if (selection.jurorId !== slot.jurorId) {
      throw new Error(
        `${label}.slotSelections[${index}].jurorId must match committed slot ${slot.slotIndex}`,
      )
    }
  }
}

function parseRosterCommitment(
  value: unknown,
  label: string,
): JuryRosterCommitment {
  const source = requireObject(value, label)
  assertExactKeys(source, ROSTER_COMMITMENT_KEYS, label)

  const rosterVersion = requireNonEmptyString(source.rosterVersion, `${label}.rosterVersion`)
  if (rosterVersion !== JURY_ROSTER_VERSION) {
    throw new Error(`${label}.rosterVersion must be ${JURY_ROSTER_VERSION}`)
  }

  if (!Array.isArray(source.slots)) {
    throw new Error(`${label}.slots must be an array`)
  }

  if (!Array.isArray(source.humanSlotReplacements)) {
    throw new Error(`${label}.humanSlotReplacements must be an array`)
  }

  const slots = source.slots.map((entry, index) =>
    parseJuryRosterSlot(entry, `${label}.slots[${index}]`),
  )
  assertRosterSlotOrder(slots, `${label}.slots`)

  const humanSelection = parseHumanJurorSelectionProvenance(
    source.humanSelection,
    `${label}.humanSelection`,
  )
  assertHumanSelectionMatchesCommittedSlots(slots, humanSelection, `${label}.humanSelection`)

  const humanSlotReplacements = source.humanSlotReplacements.map((entry, index) =>
    parseHumanJurorReplacementRecord(
      entry,
      `${label}.humanSlotReplacements[${index}]`,
    ),
  )

  const commitmentDigest = normalizeHexForDigest(
    requireBytes32HexString(source.commitmentDigest, `${label}.commitmentDigest`),
  )
  const rosterDigest = normalizeHexForDigest(
    requireBytes32HexString(source.rosterDigest, `${label}.rosterDigest`),
  )

  const parsed: JuryRosterCommitment = {
    rosterVersion: JURY_ROSTER_VERSION,
    commitmentDigest,
    rosterDigest,
    llmSlotCount: FIXED_LLM_JUROR_SLOT_COUNT,
    humanSlotCount: HUMAN_JUROR_SLOT_COUNT,
    slots,
    humanSelection,
    humanSlotReplacements,
  }

  if (
    requireNonNegativeSafeInteger(source.llmSlotCount, `${label}.llmSlotCount`) !==
    FIXED_LLM_JUROR_SLOT_COUNT
  ) {
    throw new Error(`${label}.llmSlotCount must equal ${FIXED_LLM_JUROR_SLOT_COUNT}`)
  }

  if (
    requireNonNegativeSafeInteger(
      source.humanSlotCount,
      `${label}.humanSlotCount`,
    ) !== HUMAN_JUROR_SLOT_COUNT
  ) {
    throw new Error(`${label}.humanSlotCount must equal ${HUMAN_JUROR_SLOT_COUNT}`)
  }

  const expectedCommitmentDigest = deriveRosterCommitmentDigest({
    slots: parsed.slots,
    humanSelection: parsed.humanSelection,
  })
  if (parsed.commitmentDigest !== expectedCommitmentDigest) {
    throw new Error(
      `${label}.commitmentDigest does not match the normalized roster commitment`,
    )
  }

  const expectedRosterDigest = deriveEffectiveRosterDigest(parsed)
  if (parsed.rosterDigest !== expectedRosterDigest) {
    throw new Error(`${label}.rosterDigest does not match the effective roster state`)
  }

  return parsed
}

function buildRosterCommitment(args: {
  juryRoundId: bigint
  sourceEventKey: `0x${string}`
  mappingFingerprint: `0x${string}`
  rosterSelection: JuryRosterSelectionInput
}): JuryRosterCommitment {
  const candidatePoolDigest = deriveCandidatePoolDigest(
    args.rosterSelection.humanCandidates,
  )

  const llmSlots: JuryRosterSlot[] = args.rosterSelection.llmJurors.map(
    (slot, index) => ({
      slotIndex: index,
      cohort: "LLM",
      cohortSlotIndex: index,
      jurorId: slot.jurorId,
      assignmentDigest: deriveStableDigest(LLM_JUROR_ASSIGNMENT_VERSION, {
        slotIndex: index,
        cohortSlotIndex: index,
        jurorId: slot.jurorId,
      }),
    }),
  )

  const rankedHumanCandidates = args.rosterSelection.humanCandidates
    .map((candidate, candidateIndex) => ({
      candidateIndex,
      jurorId: candidate.jurorId,
      selectionDigest: deriveStableDigest(HUMAN_JUROR_SELECTION_VERSION, {
        juryRoundId: args.juryRoundId,
        candidateIndex,
        jurorId: candidate.jurorId,
        randomnessDigest: normalizeHexForDigest(
          args.rosterSelection.humanSelection.randomnessDigest,
        ),
        selectionSource: args.rosterSelection.humanSelection.selectionSource,
        selectionNonce: normalizeHexForDigest(
          args.rosterSelection.humanSelection.selectionNonce,
        ),
        candidatePoolDigest,
        sourceEventKey: normalizeHexForDigest(args.sourceEventKey),
        mappingFingerprint: normalizeHexForDigest(args.mappingFingerprint),
      }),
    }))
    .sort((left, right) => {
      if (left.selectionDigest < right.selectionDigest) {
        return -1
      }
      if (left.selectionDigest > right.selectionDigest) {
        return 1
      }
      return left.candidateIndex - right.candidateIndex
    })

  const slotSelections: HumanJurorSlotSelection[] = rankedHumanCandidates
    .slice(0, HUMAN_JUROR_SLOT_COUNT)
    .map((candidate, index) => ({
      slotIndex: FIXED_LLM_JUROR_SLOT_COUNT + index,
      cohortSlotIndex: index,
      jurorId: candidate.jurorId,
      candidateIndex: candidate.candidateIndex,
      selectionDigest: candidate.selectionDigest,
    }))

  const humanSelection: HumanJurorSelectionProvenance = {
    selectionVersion: HUMAN_JUROR_SELECTION_VERSION,
    randomnessDigest: normalizeHexForDigest(
      args.rosterSelection.humanSelection.randomnessDigest,
    ),
    selectionSource: args.rosterSelection.humanSelection.selectionSource,
    selectionNonce: normalizeHexForDigest(
      args.rosterSelection.humanSelection.selectionNonce,
    ),
    candidatePoolDigest,
    slotSelections,
  }

  const humanSlots: JuryRosterSlot[] = slotSelections.map((selection) => ({
    slotIndex: selection.slotIndex,
    cohort: "HUMAN",
    cohortSlotIndex: selection.cohortSlotIndex,
    jurorId: selection.jurorId,
    assignmentDigest: selection.selectionDigest,
  }))

  const slots = [...llmSlots, ...humanSlots]
  const commitmentDigest = deriveRosterCommitmentDigest({
    slots,
    humanSelection,
  })

  return {
    rosterVersion: JURY_ROSTER_VERSION,
    commitmentDigest,
    rosterDigest: commitmentDigest,
    llmSlotCount: FIXED_LLM_JUROR_SLOT_COUNT,
    humanSlotCount: HUMAN_JUROR_SLOT_COUNT,
    slots,
    humanSelection,
    humanSlotReplacements: [],
  }
}

function parseOpinionIngestJurorSlotAuth(
  input: OpinionIngestJurorSlotAuthInput,
): ParsedOpinionIngestJurorSlotAuthInput {
  const source = requireObject(input, "opinion juror slot auth")
  assertExactKeys(source, OPINION_INGEST_SLOT_AUTH_KEYS, "opinion juror slot auth")

  return {
    slotIndex: requireNonNegativeSafeInteger(source.slotIndex, "opinion juror slot auth.slotIndex"),
    cohort: requireJurorCohort(source.cohort, "opinion juror slot auth.cohort"),
    jurorId: requireNonEmptyString(source.jurorId, "opinion juror slot auth.jurorId"),
  }
}

function parseHumanJurorReplacementInput(
  input: HumanJurorReplacementInput,
): ParsedHumanJurorReplacementInput {
  const source = requireObject(input, "human juror replacement")
  assertExactKeys(
    source,
    HUMAN_JUROR_REPLACEMENT_INPUT_KEYS,
    "human juror replacement",
  )

  return {
    slotIndex: requireNonNegativeSafeInteger(
      source.slotIndex,
      "human juror replacement.slotIndex",
    ),
    nextJurorId: requireNonEmptyString(
      source.nextJurorId,
      "human juror replacement.nextJurorId",
    ),
    replacementReason: requireNonEmptyString(
      source.replacementReason,
      "human juror replacement.replacementReason",
    ),
    replacementTimestampSec: requirePositiveBigIntLike(
      source.replacementTimestampSec,
      "human juror replacement.replacementTimestampSec",
    ),
    replacementSource: requireNonEmptyString(
      source.replacementSource,
      "human juror replacement.replacementSource",
    ),
    replacementNonce: normalizeHexForDigest(
      requireBytes32HexString(
        source.replacementNonce,
        "human juror replacement.replacementNonce",
      ),
    ),
    replacementRandomnessDigest: normalizeHexForDigest(
      requireBytes32HexString(
        source.replacementRandomnessDigest,
        "human juror replacement.replacementRandomnessDigest",
      ),
    ),
  }
}

function parseSealedOpinionInput(
  value: unknown,
  label: string,
): ParsedSealedOpinionInput {
  const source = requireObject(value, label)
  assertExactKeys(source, SEALED_OPINION_INPUT_KEYS, label)

  return {
    slotIndex: requireNonNegativeSafeInteger(source.slotIndex, `${label}.slotIndex`),
    cohort: requireJurorCohort(source.cohort, `${label}.cohort`),
    jurorId: requireNonEmptyString(source.jurorId, `${label}.jurorId`),
    finalValidity: requireFinalValidity(source.finalValidity, `${label}.finalValidity`),
    rationaleDigest: normalizeHexForDigest(
      requireBytes32HexString(source.rationaleDigest, `${label}.rationaleDigest`),
    ),
    testimonyDigest: normalizeHexForDigest(
      requireBytes32HexString(source.testimonyDigest, `${label}.testimonyDigest`),
    ),
    ingestTimestampSec: requirePositiveBigIntLike(
      source.ingestTimestampSec,
      `${label}.ingestTimestampSec`,
    ),
  }
}

function parseSealedOpinionInputs(value: unknown): ParsedSealedOpinionInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("sealedOpinions must be a non-empty array")
  }

  return value.map((entry, index) =>
    parseSealedOpinionInput(entry, `sealedOpinions[${index}]`),
  )
}

function parseOpinionIngestRecord(
  value: unknown,
  label: string,
): SealedJurorOpinionRecord {
  const source = requireObject(value, label)
  assertExactKeys(source, OPINION_INGEST_RECORD_KEYS, label)

  return {
    slotIndex: requireNonNegativeSafeInteger(source.slotIndex, `${label}.slotIndex`),
    cohort: requireJurorCohort(source.cohort, `${label}.cohort`),
    cohortSlotIndex: requireNonNegativeSafeInteger(
      source.cohortSlotIndex,
      `${label}.cohortSlotIndex`,
    ),
    jurorId: requireNonEmptyString(source.jurorId, `${label}.jurorId`),
    finalValidity: requireFinalValidity(source.finalValidity, `${label}.finalValidity`),
    rationaleDigest: normalizeHexForDigest(
      requireBytes32HexString(source.rationaleDigest, `${label}.rationaleDigest`),
    ),
    testimonyDigest: normalizeHexForDigest(
      requireBytes32HexString(source.testimonyDigest, `${label}.testimonyDigest`),
    ),
    ingestTimestampSec: requirePositiveBigIntLike(
      source.ingestTimestampSec,
      `${label}.ingestTimestampSec`,
    ),
    scopeKey: normalizeHexForDigest(
      requireBytes32HexString(source.scopeKey, `${label}.scopeKey`),
    ),
    recordKey: normalizeHexForDigest(
      requireBytes32HexString(source.recordKey, `${label}.recordKey`),
    ),
    slotId: requireNonEmptyString(source.slotId, `${label}.slotId`),
  }
}

function parseOpinionIngestEnvelope(report: unknown): OpinionIngestEnvelope {
  const source = requireObject(report, "opinionIngest")
  assertExactKeys(source, VERSIONED_ENVELOPE_KEYS, "opinionIngest")

  const magic = requireNonEmptyString(source.magic, "opinionIngest.magic")
  if (magic !== REPORT_ENVELOPE_MAGIC) {
    throw new Error(`opinionIngest.magic must be ${REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireNonEmptyString(
    source.reportType,
    "opinionIngest.reportType",
  )
  if (reportType !== JURY_OPINION_INGEST_REPORT_TYPE) {
    throw new Error(
      `opinionIngest.reportType must be ${JURY_OPINION_INGEST_REPORT_TYPE}`,
    )
  }

  const payloadSource = requireObject(source.payload, "opinionIngest.payload")
  assertExactKeys(payloadSource, OPINION_INGEST_PAYLOAD_KEYS, "opinionIngest.payload")
  const recordsSource = payloadSource.records
  if (!Array.isArray(recordsSource) || recordsSource.length === 0) {
    throw new Error("opinionIngest.payload.records must be a non-empty array")
  }

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: JURY_OPINION_INGEST_REPORT_TYPE,
    payload: {
      submissionId: requireBigIntLike(
        payloadSource.submissionId,
        "opinionIngest.payload.submissionId",
      ),
      projectId: requireBigIntLike(
        payloadSource.projectId,
        "opinionIngest.payload.projectId",
      ),
      juryRoundId: requirePositiveBigIntLike(
        payloadSource.juryRoundId,
        "opinionIngest.payload.juryRoundId",
      ),
      scopeKey: normalizeHexForDigest(
        requireBytes32HexString(
          payloadSource.scopeKey,
          "opinionIngest.payload.scopeKey",
        ),
      ),
      recordCount: requireNonNegativeSafeInteger(
        payloadSource.recordCount,
        "opinionIngest.payload.recordCount",
      ),
      records: recordsSource.map((entry, index) =>
        parseOpinionIngestRecord(entry, `opinionIngest.payload.records[${index}]`),
      ),
    },
  }
}

export function assertOpinionIngestRosterSlotAuthorized(
  casePackage: AdjudicationCaseEnvelope,
  input: OpinionIngestJurorSlotAuthInput,
): JuryRosterSlot {
  const parsedCasePackage = parseAdjudicationCaseEnvelope(casePackage)
  const parsedInput = parseOpinionIngestJurorSlotAuth(input)
  const effectiveSlots = resolveEffectiveRosterSlots(
    parsedCasePackage.payload.rosterCommitment,
  )
  const slot = effectiveSlots.find(
    (candidate) => candidate.slotIndex === parsedInput.slotIndex,
  )

  if (
    !slot ||
    slot.cohort !== parsedInput.cohort ||
    slot.jurorId !== parsedInput.jurorId
  ) {
    throw new Error("opinion juror slot is not present in the committed roster")
  }

  return slot
}

export function reissueHumanJurorSlot(
  casePackage: AdjudicationCaseEnvelope,
  input: HumanJurorReplacementInput,
): AdjudicationCaseEnvelope {
  const parsedCasePackage = parseAdjudicationCaseEnvelope(casePackage)
  const parsedInput = parseHumanJurorReplacementInput(input)
  const rosterCommitment = parsedCasePackage.payload.rosterCommitment
  const effectiveSlots = resolveEffectiveRosterSlots(rosterCommitment)
  const slot = effectiveSlots.find(
    (candidate) => candidate.slotIndex === parsedInput.slotIndex,
  )

  if (!slot || slot.cohort !== "HUMAN") {
    throw new Error("human juror replacement must target an active human roster slot")
  }

  if (slot.jurorId === parsedInput.nextJurorId) {
    throw new Error("human juror replacement must change the active juror identity")
  }

  if (
    effectiveSlots.some(
      (candidate) =>
        candidate.slotIndex !== slot.slotIndex &&
        candidate.jurorId === parsedInput.nextJurorId,
    )
  ) {
    throw new Error(
      `human juror replacement nextJurorId ${parsedInput.nextJurorId} is already active in the roster`,
    )
  }

  const replacementRecord: HumanJurorReplacementRecord = {
    replacementVersion: HUMAN_JUROR_REPLACEMENT_VERSION,
    slotIndex: slot.slotIndex,
    cohortSlotIndex: slot.cohortSlotIndex,
    previousJurorId: slot.jurorId,
    nextJurorId: parsedInput.nextJurorId,
    replacementReason: parsedInput.replacementReason,
    replacementTimestampSec: parsedInput.replacementTimestampSec,
    replacementSource: parsedInput.replacementSource,
    replacementNonce: parsedInput.replacementNonce,
    replacementRandomnessDigest: parsedInput.replacementRandomnessDigest,
    replacementDigest: deriveStableDigest(HUMAN_JUROR_REPLACEMENT_VERSION, {
      commitmentDigest: normalizeHexForDigest(rosterCommitment.commitmentDigest),
      slotIndex: slot.slotIndex,
      cohortSlotIndex: slot.cohortSlotIndex,
      previousJurorId: slot.jurorId,
      nextJurorId: parsedInput.nextJurorId,
      replacementReason: parsedInput.replacementReason,
      replacementTimestampSec: parsedInput.replacementTimestampSec,
      replacementSource: parsedInput.replacementSource,
      replacementNonce: normalizeHexForDigest(parsedInput.replacementNonce),
      replacementRandomnessDigest: normalizeHexForDigest(
        parsedInput.replacementRandomnessDigest,
      ),
    }),
  }

  const nextRosterCommitment: JuryRosterCommitment = {
    ...rosterCommitment,
    humanSlotReplacements: [
      ...rosterCommitment.humanSlotReplacements,
      replacementRecord,
    ],
    rosterDigest: rosterCommitment.rosterDigest,
  }
  nextRosterCommitment.rosterDigest = deriveEffectiveRosterDigest(nextRosterCommitment)

  return buildAdjudicationCaseEnvelope({
    ...parsedCasePackage.payload,
    rosterCommitment: nextRosterCommitment,
  })
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
  const bountyHubAddress = requireAddressString(
    source.bountyHubAddress,
    "bountyHubAddress",
  )
  const gasLimit = requirePositiveIntegerString(source.gasLimit, "gasLimit")
  const juryPolicySource = requireObject(source.juryPolicy, "juryPolicy")
  assertExactKeys(juryPolicySource, JURY_POLICY_KEYS, "juryPolicy")

  if (juryPolicySource.allowDirectSettlement !== false) {
    throw new Error(
      "juryPolicy.allowDirectSettlement must remain false while adjudication emits packages only",
    )
  }

  if (juryPolicySource.requireOwnerResolution !== true) {
    throw new Error(
      "juryPolicy.requireOwnerResolution must remain true while adjudication finalization stays onchain",
    )
  }

  return {
    chainSelectorName,
    bountyHubAddress,
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

function parseVerifiedReportJuryCommitmentMetadata(
  value: unknown,
): VerifiedReportJuryCommitmentMetadata {
  const source = requireObject(value, "verifiedReport.juryCommitment")
  assertExactKeys(
    source,
    VERIFIED_REPORT_JURY_COMMITMENT_KEYS,
    "verifiedReport.juryCommitment",
  )

  const commitmentVersion = requireNonEmptyString(
    source.commitmentVersion,
    "verifiedReport.juryCommitment.commitmentVersion",
  )
  if (commitmentVersion !== VERIFY_POC_JURY_COMMITMENT_VERSION) {
    throw new Error(
      `verifiedReport.juryCommitment.commitmentVersion must be ${VERIFY_POC_JURY_COMMITMENT_VERSION}`,
    )
  }

  return {
    commitmentVersion: VERIFY_POC_JURY_COMMITMENT_VERSION,
    juryLedgerDigest: requireBytes32HexString(
      source.juryLedgerDigest,
      "verifiedReport.juryCommitment.juryLedgerDigest",
    ),
    sourceEventKey: requireBytes32HexString(
      source.sourceEventKey,
      "verifiedReport.juryCommitment.sourceEventKey",
    ),
    mappingFingerprint: requireBytes32HexString(
      source.mappingFingerprint,
      "verifiedReport.juryCommitment.mappingFingerprint",
    ),
  }
}

function parseVerifiedReportAdjudicationOasisMetadata(
  value: unknown,
): VerifiedReportAdjudicationOasisMetadata {
  const source = requireObject(value, "verifiedReport.adjudication.oasis")
  assertExactKeys(
    source,
    VERIFIED_REPORT_ADJUDICATION_OASIS_KEYS,
    "verifiedReport.adjudication.oasis",
  )

  return {
    chain: requireNonEmptyString(
      source.chain,
      "verifiedReport.adjudication.oasis.chain",
    ),
    contract: requireAddressString(
      source.contract,
      "verifiedReport.adjudication.oasis.contract",
    ),
    slotId: requireNonEmptyString(
      source.slotId,
      "verifiedReport.adjudication.oasis.slotId",
    ),
    envelopeHash: requireBytes32HexString(
      source.envelopeHash,
      "verifiedReport.adjudication.oasis.envelopeHash",
    ),
  }
}

function parseVerifiedReportAdjudicationMetadata(
  value: unknown,
): VerifiedReportAdjudicationMetadata {
  const source = requireObject(value, "verifiedReport.adjudication")
  assertExactKeys(
    source,
    VERIFIED_REPORT_ADJUDICATION_KEYS,
    "verifiedReport.adjudication",
  )

  const adjudicationVersion = requireNonEmptyString(
    source.adjudicationVersion,
    "verifiedReport.adjudication.adjudicationVersion",
  )
  if (adjudicationVersion !== VERIFY_POC_ADJUDICATION_VERSION) {
    throw new Error(
      `verifiedReport.adjudication.adjudicationVersion must be ${VERIFY_POC_ADJUDICATION_VERSION}`,
    )
  }

  return {
    adjudicationVersion: VERIFY_POC_ADJUDICATION_VERSION,
    syncId: requireBytes32HexString(
      source.syncId,
      "verifiedReport.adjudication.syncId",
    ),
    idempotencyKey: requireBytes32HexString(
      source.idempotencyKey,
      "verifiedReport.adjudication.idempotencyKey",
    ),
    cipherURI: requireNonEmptyString(
      source.cipherURI,
      "verifiedReport.adjudication.cipherURI",
    ),
    severity: requireNonNegativeSafeInteger(
      source.severity,
      "verifiedReport.adjudication.severity",
    ),
    juryWindow: requirePositiveBigIntLike(
      source.juryWindow,
      "verifiedReport.adjudication.juryWindow",
    ),
    adjudicationWindow: requirePositiveBigIntLike(
      source.adjudicationWindow,
      "verifiedReport.adjudication.adjudicationWindow",
    ),
    commitTimestampSec: requirePositiveBigIntLike(
      source.commitTimestampSec,
      "verifiedReport.adjudication.commitTimestampSec",
    ),
    revealTimestampSec: requirePositiveBigIntLike(
      source.revealTimestampSec,
      "verifiedReport.adjudication.revealTimestampSec",
    ),
    sapphireWriteTimestampSec: requireOptionalBigIntLike(
      source.sapphireWriteTimestampSec,
      "verifiedReport.adjudication.sapphireWriteTimestampSec",
    ),
    reasonCode:
      source.reasonCode === undefined
        ? undefined
        : requireNonEmptyString(
            source.reasonCode,
            "verifiedReport.adjudication.reasonCode",
          ),
    chainSelectorName: requireNonEmptyString(
      source.chainSelectorName,
      "verifiedReport.adjudication.chainSelectorName",
    ),
    bountyHubAddress: requireAddressString(
      source.bountyHubAddress,
      "verifiedReport.adjudication.bountyHubAddress",
    ),
    txHash: requireOptionalBytes32HexString(
      source.txHash,
      "verifiedReport.adjudication.txHash",
    ),
    logIndex: requireOptionalBigIntLike(
      source.logIndex,
      "verifiedReport.adjudication.logIndex",
    ),
    oasis: parseVerifiedReportAdjudicationOasisMetadata(source.oasis),
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
  if (
    reportType !== VERIFIED_REPORT_TYPE_V1 &&
    reportType !== VERIFIED_REPORT_TYPE_V2 &&
    reportType !== VERIFIED_REPORT_TYPE_V3
  ) {
    throw new Error(
      `verifiedReport.reportType must be ${VERIFIED_REPORT_TYPE_V1}, ${VERIFIED_REPORT_TYPE_V2}, or ${VERIFIED_REPORT_TYPE_V3}`,
    )
  }

  assertExactKeys(
    source,
    reportType === VERIFIED_REPORT_TYPE_V1
      ? VERSIONED_ENVELOPE_KEYS
      : reportType === VERIFIED_REPORT_TYPE_V2
        ? VERIFIED_REPORT_ENVELOPE_V2_KEYS
        : VERIFIED_REPORT_ENVELOPE_V3_KEYS,
    "verified report envelope",
  )

  const payloadSource = requireObject(source.payload, "verifiedReport.payload")
  assertExactKeys(payloadSource, VERIFIED_REPORT_PAYLOAD_KEYS, "verifiedReport.payload")

  const payload: VerifiedReportPayload = {
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
  }

  if (reportType === VERIFIED_REPORT_TYPE_V1) {
    return {
      magic: REPORT_ENVELOPE_MAGIC,
      reportType: VERIFIED_REPORT_TYPE_V1,
      payload,
    }
  }

  if (reportType === VERIFIED_REPORT_TYPE_V2) {
    return {
      magic: REPORT_ENVELOPE_MAGIC,
      reportType: VERIFIED_REPORT_TYPE_V2,
      payload,
      jury:
        source.jury === undefined
          ? undefined
          : parseVerifiedReportJuryMetadata(source.jury),
      testimony:
        source.testimony === undefined
          ? undefined
          : parseVerifiedReportTestimonyMetadata(source.testimony),
    }
  }

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: VERIFIED_REPORT_TYPE_V3,
    payload,
    juryCommitment: parseVerifiedReportJuryCommitmentMetadata(
      source.juryCommitment,
    ),
    adjudication: parseVerifiedReportAdjudicationMetadata(source.adjudication),
  }
}

export function parseJuryRecommendationEnvelope(
  report: unknown,
): JuryTypedReportEnvelope {
  const source = requireObject(report, "jury recommendation envelope")
  assertExactKeys(source, VERSIONED_ENVELOPE_KEYS, "jury recommendation envelope")

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

function parseAdjudicationCaseEnvelope(
  casePackage: unknown,
): AdjudicationCaseEnvelope {
  const source = requireObject(casePackage, "adjudication case envelope")
  assertExactKeys(source, VERSIONED_ENVELOPE_KEYS, "adjudication case envelope")

  const magic = requireNonEmptyString(source.magic, "adjudicationCase.magic")
  if (magic !== REPORT_ENVELOPE_MAGIC) {
    throw new Error(`adjudicationCase.magic must be ${REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireNonEmptyString(
    source.reportType,
    "adjudicationCase.reportType",
  )
  if (reportType !== ADJUDICATION_CASE_REPORT_TYPE) {
    throw new Error(
      `adjudicationCase.reportType must be ${ADJUDICATION_CASE_REPORT_TYPE}`,
    )
  }

  const payloadSource = requireObject(source.payload, "adjudicationCase.payload")
  assertExactKeys(
    payloadSource,
    ADJUDICATION_CASE_PAYLOAD_KEYS,
    "adjudicationCase.payload",
  )

  const evidenceReportType = requireNonEmptyString(
    payloadSource.evidenceReportType,
    "adjudicationCase.payload.evidenceReportType",
  )
  if (evidenceReportType !== VERIFIED_REPORT_TYPE_V3) {
    throw new Error(
      `adjudicationCase.payload.evidenceReportType must be ${VERIFIED_REPORT_TYPE_V3}`,
    )
  }

  const lifecycleStatus = requireAdjudicationLifecycleStatus(
    payloadSource.lifecycleStatus,
    "adjudicationCase.payload.lifecycleStatus",
  )
  if (lifecycleStatus !== "JURY_PENDING") {
    throw new Error(
      "adjudicationCase.payload.lifecycleStatus must be JURY_PENDING",
    )
  }

  const verdictSource = requireAdjudicationVerdictSource(
    payloadSource.verdictSource,
    "adjudicationCase.payload.verdictSource",
  )
  if (verdictSource !== "NONE") {
    throw new Error(
      "adjudicationCase.payload.verdictSource must be NONE",
    )
  }

  const finalValidity = requireAdjudicationFinalValidity(
    payloadSource.finalValidity,
    "adjudicationCase.payload.finalValidity",
  )
  if (finalValidity !== "NONE") {
    throw new Error(
      "adjudicationCase.payload.finalValidity must be NONE",
    )
  }

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: ADJUDICATION_CASE_REPORT_TYPE,
    payload: {
      submissionId: requireBigIntLike(
        payloadSource.submissionId,
        "adjudicationCase.payload.submissionId",
      ),
      projectId: requireBigIntLike(
        payloadSource.projectId,
        "adjudicationCase.payload.projectId",
      ),
      juryRoundId: requirePositiveBigIntLike(
        payloadSource.juryRoundId,
        "adjudicationCase.payload.juryRoundId",
      ),
      lifecycleStatus,
      verdictSource,
      finalValidity,
      juryDeadlineTimestampSec: requirePositiveBigIntLike(
        payloadSource.juryDeadlineTimestampSec,
        "adjudicationCase.payload.juryDeadlineTimestampSec",
      ),
      adjudicationDeadlineTimestampSec: requirePositiveBigIntLike(
        payloadSource.adjudicationDeadlineTimestampSec,
        "adjudicationCase.payload.adjudicationDeadlineTimestampSec",
      ),
      evidenceReportType: VERIFIED_REPORT_TYPE_V3,
      juryLedgerDigest: requireBytes32HexString(
        payloadSource.juryLedgerDigest,
        "adjudicationCase.payload.juryLedgerDigest",
      ),
      sourceEventKey: requireBytes32HexString(
        payloadSource.sourceEventKey,
        "adjudicationCase.payload.sourceEventKey",
      ),
      mappingFingerprint: requireBytes32HexString(
        payloadSource.mappingFingerprint,
        "adjudicationCase.payload.mappingFingerprint",
      ),
      syncId: requireBytes32HexString(
        payloadSource.syncId,
        "adjudicationCase.payload.syncId",
      ),
      idempotencyKey: requireBytes32HexString(
        payloadSource.idempotencyKey,
        "adjudicationCase.payload.idempotencyKey",
      ),
      cipherURI: requireNonEmptyString(
        payloadSource.cipherURI,
        "adjudicationCase.payload.cipherURI",
      ),
      severity: requireNonNegativeSafeInteger(
        payloadSource.severity,
        "adjudicationCase.payload.severity",
      ),
      chainSelectorName: requireNonEmptyString(
        payloadSource.chainSelectorName,
        "adjudicationCase.payload.chainSelectorName",
      ),
      bountyHubAddress: requireAddressString(
        payloadSource.bountyHubAddress,
        "adjudicationCase.payload.bountyHubAddress",
      ),
      oasisEnvelopeHash: requireBytes32HexString(
        payloadSource.oasisEnvelopeHash,
        "adjudicationCase.payload.oasisEnvelopeHash",
      ),
      rosterCommitment: parseRosterCommitment(
        payloadSource.rosterCommitment,
        "adjudicationCase.payload.rosterCommitment",
      ),
    },
  }
}

function parseOwnerAdjudicationHandoffEnvelope(
  handoff: unknown,
): OwnerAdjudicationHandoffEnvelope {
  const source = requireObject(handoff, "ownerAdjudicationHandoff")
  assertExactKeys(source, VERSIONED_ENVELOPE_KEYS, "ownerAdjudicationHandoff")

  const magic = requireNonEmptyString(source.magic, "ownerAdjudicationHandoff.magic")
  if (magic !== REPORT_ENVELOPE_MAGIC) {
    throw new Error(
      `ownerAdjudicationHandoff.magic must be ${REPORT_ENVELOPE_MAGIC}`,
    )
  }

  const reportType = requireNonEmptyString(
    source.reportType,
    "ownerAdjudicationHandoff.reportType",
  )
  if (reportType !== OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE) {
    throw new Error(
      `ownerAdjudicationHandoff.reportType must be ${OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE}`,
    )
  }

  const payloadSource = requireObject(
    source.payload,
    "ownerAdjudicationHandoff.payload",
  )
  assertExactKeys(
    payloadSource,
    OWNER_ADJUDICATION_HANDOFF_PAYLOAD_KEYS,
    "ownerAdjudicationHandoff.payload",
  )

  const lifecycleStatus = requireAdjudicationLifecycleStatus(
    payloadSource.lifecycleStatus,
    "ownerAdjudicationHandoff.payload.lifecycleStatus",
  )
  if (lifecycleStatus !== "AWAITING_OWNER_ADJUDICATION") {
    throw new Error(
      "ownerAdjudicationHandoff.payload.lifecycleStatus must be AWAITING_OWNER_ADJUDICATION",
    )
  }

  const requiredConsensusCount = requirePositiveSafeInteger(
    payloadSource.requiredConsensusCount,
    "ownerAdjudicationHandoff.payload.requiredConsensusCount",
  )
  if (requiredConsensusCount !== TARGET_STATE_REQUIRED_CONSENSUS_COUNT) {
    throw new Error(
      `ownerAdjudicationHandoff.payload.requiredConsensusCount must be ${TARGET_STATE_REQUIRED_CONSENSUS_COUNT}`,
    )
  }

  const requiredCohortCount = requirePositiveSafeInteger(
    payloadSource.requiredCohortCount,
    "ownerAdjudicationHandoff.payload.requiredCohortCount",
  )
  if (requiredCohortCount !== TARGET_STATE_REQUIRED_COHORT_COUNT) {
    throw new Error(
      `ownerAdjudicationHandoff.payload.requiredCohortCount must be ${TARGET_STATE_REQUIRED_COHORT_COUNT}`,
    )
  }

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE,
    payload: {
      submissionId: requireBigIntLike(
        payloadSource.submissionId,
        "ownerAdjudicationHandoff.payload.submissionId",
      ),
      projectId: requireBigIntLike(
        payloadSource.projectId,
        "ownerAdjudicationHandoff.payload.projectId",
      ),
      juryRoundId: requirePositiveBigIntLike(
        payloadSource.juryRoundId,
        "ownerAdjudicationHandoff.payload.juryRoundId",
      ),
      lifecycleStatus,
      aggregatedAtTimestampSec: requirePositiveBigIntLike(
        payloadSource.aggregatedAtTimestampSec,
        "ownerAdjudicationHandoff.payload.aggregatedAtTimestampSec",
      ),
      juryDeadlineTimestampSec: requirePositiveBigIntLike(
        payloadSource.juryDeadlineTimestampSec,
        "ownerAdjudicationHandoff.payload.juryDeadlineTimestampSec",
      ),
      adjudicationDeadlineTimestampSec: requirePositiveBigIntLike(
        payloadSource.adjudicationDeadlineTimestampSec,
        "ownerAdjudicationHandoff.payload.adjudicationDeadlineTimestampSec",
      ),
      scopeKey: requireBytes32HexString(
        payloadSource.scopeKey,
        "ownerAdjudicationHandoff.payload.scopeKey",
      ),
      receivedVoteCount: requireNonNegativeSafeInteger(
        payloadSource.receivedVoteCount,
        "ownerAdjudicationHandoff.payload.receivedVoteCount",
      ),
      requiredConsensusCount: TARGET_STATE_REQUIRED_CONSENSUS_COUNT,
      requiredCohortCount: TARGET_STATE_REQUIRED_COHORT_COUNT,
      leadingFinalValidity: requireOptionalFinalValidity(
        payloadSource.leadingFinalValidity,
        "ownerAdjudicationHandoff.payload.leadingFinalValidity",
      ),
      leadingVoteCount: requireNonNegativeSafeInteger(
        payloadSource.leadingVoteCount,
        "ownerAdjudicationHandoff.payload.leadingVoteCount",
      ),
      leadingLLMVoteCount: requireNonNegativeSafeInteger(
        payloadSource.leadingLLMVoteCount,
        "ownerAdjudicationHandoff.payload.leadingLLMVoteCount",
      ),
      leadingHumanVoteCount: requireNonNegativeSafeInteger(
        payloadSource.leadingHumanVoteCount,
        "ownerAdjudicationHandoff.payload.leadingHumanVoteCount",
      ),
      supportingOpinionRecordKeys: requireBytes32HexStringArray(
        payloadSource.supportingOpinionRecordKeys,
        "ownerAdjudicationHandoff.payload.supportingOpinionRecordKeys",
      ),
      supportingRationaleDigests: requireBytes32HexStringArray(
        payloadSource.supportingRationaleDigests,
        "ownerAdjudicationHandoff.payload.supportingRationaleDigests",
      ),
      supportingTestimonyDigests: requireBytes32HexStringArray(
        payloadSource.supportingTestimonyDigests,
        "ownerAdjudicationHandoff.payload.supportingTestimonyDigests",
      ),
      reason: requireNonEmptyString(
        payloadSource.reason,
        "ownerAdjudicationHandoff.payload.reason",
      ),
    },
  }
}

function parseJuryConsensusEnvelope(
  juryConsensus: unknown,
): JuryConsensusEnvelope {
  const source = requireObject(juryConsensus, "juryConsensus")
  assertExactKeys(source, VERSIONED_ENVELOPE_KEYS, "juryConsensus")

  const magic = requireNonEmptyString(source.magic, "juryConsensus.magic")
  if (magic !== REPORT_ENVELOPE_MAGIC) {
    throw new Error(`juryConsensus.magic must be ${REPORT_ENVELOPE_MAGIC}`)
  }

  const reportType = requireNonEmptyString(
    source.reportType,
    "juryConsensus.reportType",
  )
  if (reportType !== JURY_CONSENSUS_REPORT_TYPE) {
    throw new Error(
      `juryConsensus.reportType must be ${JURY_CONSENSUS_REPORT_TYPE}`,
    )
  }

  const payloadSource = requireObject(source.payload, "juryConsensus.payload")
  assertExactKeys(
    payloadSource,
    JURY_CONSENSUS_PAYLOAD_KEYS,
    "juryConsensus.payload",
  )

  const verdictSource = requireAdjudicationVerdictSource(
    payloadSource.verdictSource,
    "juryConsensus.payload.verdictSource",
  )
  if (verdictSource !== "JURY") {
    throw new Error("juryConsensus.payload.verdictSource must be JURY")
  }

  const finalValidity = requireOptionalFinalValidity(
    payloadSource.finalValidity,
    "juryConsensus.payload.finalValidity",
  )
  if (finalValidity === undefined) {
    throw new Error(
      "juryConsensus.payload.finalValidity must be HIGH, MEDIUM, or INVALID",
    )
  }

  const consensusVoteCount = requirePositiveSafeInteger(
    payloadSource.consensusVoteCount,
    "juryConsensus.payload.consensusVoteCount",
  )
  if (consensusVoteCount !== TARGET_STATE_REQUIRED_CONSENSUS_COUNT) {
    throw new Error(
      `juryConsensus.payload.consensusVoteCount must be ${TARGET_STATE_REQUIRED_CONSENSUS_COUNT}`,
    )
  }

  const llmAgreeingVoteCount = requirePositiveSafeInteger(
    payloadSource.llmAgreeingVoteCount,
    "juryConsensus.payload.llmAgreeingVoteCount",
  )
  if (llmAgreeingVoteCount < TARGET_STATE_REQUIRED_COHORT_COUNT) {
    throw new Error(
      `juryConsensus.payload.llmAgreeingVoteCount must be at least ${TARGET_STATE_REQUIRED_COHORT_COUNT}`,
    )
  }

  const humanAgreeingVoteCount = requirePositiveSafeInteger(
    payloadSource.humanAgreeingVoteCount,
    "juryConsensus.payload.humanAgreeingVoteCount",
  )
  if (humanAgreeingVoteCount < TARGET_STATE_REQUIRED_COHORT_COUNT) {
    throw new Error(
      `juryConsensus.payload.humanAgreeingVoteCount must be at least ${TARGET_STATE_REQUIRED_COHORT_COUNT}`,
    )
  }

  if (llmAgreeingVoteCount + humanAgreeingVoteCount !== consensusVoteCount) {
    throw new Error(
      "juryConsensus.payload agreeing cohort totals must equal consensusVoteCount",
    )
  }

  const supportingOpinionRecordKeys = requireBytes32HexStringArray(
    payloadSource.supportingOpinionRecordKeys,
    "juryConsensus.payload.supportingOpinionRecordKeys",
  )
  const supportingRationaleDigests = requireBytes32HexStringArray(
    payloadSource.supportingRationaleDigests,
    "juryConsensus.payload.supportingRationaleDigests",
  )
  const supportingTestimonyDigests = requireBytes32HexStringArray(
    payloadSource.supportingTestimonyDigests,
    "juryConsensus.payload.supportingTestimonyDigests",
  )
  if (
    supportingOpinionRecordKeys.length !== consensusVoteCount ||
    supportingRationaleDigests.length !== consensusVoteCount ||
    supportingTestimonyDigests.length !== consensusVoteCount
  ) {
    throw new Error(
      "juryConsensus.payload supporting evidence arrays must align with consensusVoteCount",
    )
  }

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: JURY_CONSENSUS_REPORT_TYPE,
    payload: {
      submissionId: requireBigIntLike(
        payloadSource.submissionId,
        "juryConsensus.payload.submissionId",
      ),
      projectId: requireBigIntLike(
        payloadSource.projectId,
        "juryConsensus.payload.projectId",
      ),
      juryRoundId: requirePositiveBigIntLike(
        payloadSource.juryRoundId,
        "juryConsensus.payload.juryRoundId",
      ),
      verdictSource: "JURY",
      finalValidity,
      aggregatedAtTimestampSec: requirePositiveBigIntLike(
        payloadSource.aggregatedAtTimestampSec,
        "juryConsensus.payload.aggregatedAtTimestampSec",
      ),
      juryDeadlineTimestampSec: requirePositiveBigIntLike(
        payloadSource.juryDeadlineTimestampSec,
        "juryConsensus.payload.juryDeadlineTimestampSec",
      ),
      adjudicationDeadlineTimestampSec: requirePositiveBigIntLike(
        payloadSource.adjudicationDeadlineTimestampSec,
        "juryConsensus.payload.adjudicationDeadlineTimestampSec",
      ),
      scopeKey: requireBytes32HexString(
        payloadSource.scopeKey,
        "juryConsensus.payload.scopeKey",
      ),
      consensusVoteCount,
      llmAgreeingVoteCount,
      humanAgreeingVoteCount,
      supportingOpinionRecordKeys,
      supportingRationaleDigests,
      supportingTestimonyDigests,
      rationale: requireNonEmptyString(
        payloadSource.rationale,
        "juryConsensus.payload.rationale",
      ),
    },
  }
}

function parseJuryConsensusFinalVerdictCandidate(
  source: Record<string, unknown>,
): ParsedFinalVerdictCandidate {
  assertExactKeys(source, JURY_CONSENSUS_FINAL_VERDICT_KEYS, "finalVerdict")

  return {
    kind: "jury-consensus",
    consensus: parseJuryConsensusEnvelope(source.consensus),
    opinionIngest: parseOpinionIngestEnvelope(source.opinionIngest),
    payload: {
      drainAmountWei: requireBigIntLike(
        source.drainAmountWei,
        "finalVerdict.drainAmountWei",
      ),
    },
  }
}

function parseOwnerAdjudicationFinalVerdictCandidate(
  source: Record<string, unknown>,
): ParsedFinalVerdictCandidate {
  assertExactKeys(source, OWNER_ADJUDICATION_FINAL_VERDICT_KEYS, "finalVerdict")

  const handoffReportType = requireNonEmptyString(
    source.handoffReportType,
    "finalVerdict.handoffReportType",
  )
  if (handoffReportType !== OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE) {
    throw new Error(
      `finalVerdict.handoffReportType must be ${OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE}`,
    )
  }

  const evidenceReportType = requireNonEmptyString(
    source.evidenceReportType,
    "finalVerdict.evidenceReportType",
  )
  if (evidenceReportType !== VERIFIED_REPORT_TYPE_V3) {
    throw new Error(
      `finalVerdict.evidenceReportType must be ${VERIFIED_REPORT_TYPE_V3}`,
    )
  }

  return {
    kind: "owner-adjudication",
    handoff: parseOwnerAdjudicationHandoffEnvelope(source.handoff),
    opinionIngest: parseOpinionIngestEnvelope(source.opinionIngest),
    payload: {
      submissionId: requireBigIntLike(source.submissionId, "finalVerdict.submissionId"),
      projectId: requireBigIntLike(source.projectId, "finalVerdict.projectId"),
      juryRoundId: requirePositiveBigIntLike(
        source.juryRoundId,
        "finalVerdict.juryRoundId",
      ),
      handoffReportType: OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE,
      scopeKey: requireBytes32HexString(source.scopeKey, "finalVerdict.scopeKey"),
      evidenceReportType: VERIFIED_REPORT_TYPE_V3,
      oasisEnvelopeHash: requireBytes32HexString(
        source.oasisEnvelopeHash,
        "finalVerdict.oasisEnvelopeHash",
      ),
      finalValidity: requireFinalValidity(
        source.finalValidity,
        "finalVerdict.finalValidity",
      ),
      rationale: requireNonEmptyString(source.rationale, "finalVerdict.rationale"),
      testimony: requireNonEmptyString(source.testimony, "finalVerdict.testimony"),
      drainAmountWei: requireBigIntLike(
        source.drainAmountWei,
        "finalVerdict.drainAmountWei",
      ),
      currentTimestampSec: requirePositiveBigIntLike(
        source.currentTimestampSec,
        "finalVerdict.currentTimestampSec",
      ),
    },
  }
}

function parseFinalVerdictCandidate(
  finalVerdict: unknown,
): ParsedFinalVerdictCandidate {
  const source = requireObject(finalVerdict, "finalVerdict")

  if (source.reportType === JURY_RECOMMENDATION_REPORT_TYPE) {
    return {
      kind: "legacy-recommendation",
      envelope: parseJuryRecommendationEnvelope(source),
    }
  }

  if (Object.hasOwn(source, "consensus")) {
    return parseJuryConsensusFinalVerdictCandidate(source)
  }

  if (Object.hasOwn(source, "handoff")) {
    return parseOwnerAdjudicationFinalVerdictCandidate(source)
  }

  if (ADJUDICATION_FINAL_VERDICT_KEYS.every((key) => Object.hasOwn(source, key))) {
    assertExactKeys(source, ADJUDICATION_FINAL_VERDICT_KEYS, "finalVerdict")
    throw new Error(
      "finalVerdict target-state object is migration-only; final-package requires jury-consensus/v1 or owner-adjudication-handoff/v1 evidence",
    )
  }

  throw new Error(
    "finalVerdict must include jury-consensus/v1 or owner-adjudication-handoff/v1 evidence",
  )
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
      `Forbidden authority call selector (${selector}) for adjudication workflow`,
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

export function buildAdjudicationCaseEnvelope(
  payload: AdjudicationCasePayload,
): AdjudicationCaseEnvelope {
  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: ADJUDICATION_CASE_REPORT_TYPE,
    payload,
  }
}

export function buildRecommendationPayloadFromVerifiedReport(
  verifiedReport: VerifiedReportEnvelope,
): JuryRecommendationPayload {
  if (verifiedReport.reportType === VERIFIED_REPORT_TYPE_V3) {
    throw new Error(
      "verified-report/v3 evidence must be normalized through case-initialization mode",
    )
  }

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
      ? "Jury recommendation state is unresolved without a deterministic quorum winner"
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

function normalizeStrictFailEvidenceToCase(
  parsed: ParsedCaseInitializationPipelineInput,
): AdjudicationCasePayload {
  const { verifiedReport } = parsed
  if (verifiedReport.reportType !== VERIFIED_REPORT_TYPE_V3) {
    throw new Error(
      `case initialization requires ${VERIFIED_REPORT_TYPE_V3} strict-fail evidence`,
    )
  }

  if (verifiedReport.payload.isValid) {
    throw new Error(
      "case initialization requires strict-fail evidence with payload.isValid=false",
    )
  }

  if (verifiedReport.payload.drainAmountWei !== 0n) {
    throw new Error(
      "case initialization requires strict-fail evidence with drainAmountWei=0",
    )
  }

  const juryDeadlineTimestampSec =
    verifiedReport.adjudication.revealTimestampSec + verifiedReport.adjudication.juryWindow
  const adjudicationDeadlineTimestampSec =
    juryDeadlineTimestampSec + verifiedReport.adjudication.adjudicationWindow

  for (const calldata of verifiedReport.payload.observedCalldata) {
    assertNoAuthorityBypass(calldata)
  }

  const rosterCommitment = buildRosterCommitment({
    juryRoundId: parsed.juryRoundId,
    sourceEventKey: verifiedReport.juryCommitment.sourceEventKey,
    mappingFingerprint: verifiedReport.juryCommitment.mappingFingerprint,
    rosterSelection: parsed.rosterSelection,
  })

  return {
    submissionId: verifiedReport.payload.submissionId,
    projectId: verifiedReport.payload.projectId,
    juryRoundId: parsed.juryRoundId,
    lifecycleStatus: "JURY_PENDING",
    verdictSource: "NONE",
    finalValidity: "NONE",
    juryDeadlineTimestampSec,
    adjudicationDeadlineTimestampSec,
    evidenceReportType: VERIFIED_REPORT_TYPE_V3,
    juryLedgerDigest: verifiedReport.juryCommitment.juryLedgerDigest,
    sourceEventKey: verifiedReport.juryCommitment.sourceEventKey,
    mappingFingerprint: verifiedReport.juryCommitment.mappingFingerprint,
    syncId: verifiedReport.adjudication.syncId,
    idempotencyKey: verifiedReport.adjudication.idempotencyKey,
    cipherURI: verifiedReport.adjudication.cipherURI,
    severity: verifiedReport.adjudication.severity,
    chainSelectorName: verifiedReport.adjudication.chainSelectorName,
    bountyHubAddress: verifiedReport.adjudication.bountyHubAddress,
    oasisEnvelopeHash: verifiedReport.adjudication.oasis.envelopeHash,
    rosterCommitment,
  }
}

function mapLegacyRecommendationToFinalValidity(
  action: JuryRecommendationAction,
): AdjudicationFinalValidity {
  if (action === "UPHOLD_AI_RESULT") {
    return "HIGH"
  }

  if (action === "OVERTURN_AI_RESULT") {
    return "INVALID"
  }

  return "NONE"
}

function isAdjudicatedValidFinalValidity(
  finalValidity: AdjudicationResolvedValidity,
): boolean {
  return finalValidity === "HIGH" || finalValidity === "MEDIUM"
}

function buildOwnerAdjudicationTestimonyDigest(args: {
  payload: OwnerAdjudicationFinalVerdictPayload
}): `0x${string}` {
  return deriveStableDigest(OWNER_ADJUDICATION_TESTIMONY_VERSION, {
    submissionId: args.payload.submissionId,
    projectId: args.payload.projectId,
    juryRoundId: args.payload.juryRoundId,
    scopeKey: normalizeHexForDigest(args.payload.scopeKey),
    evidenceReportType: args.payload.evidenceReportType,
    oasisEnvelopeHash: normalizeHexForDigest(args.payload.oasisEnvelopeHash),
    finalValidity: args.payload.finalValidity,
    rationale: args.payload.rationale,
    testimony: args.payload.testimony,
  })
}

function serializeJuryConsensusEnvelopeForDigest(
  envelope: JuryConsensusEnvelope,
): Record<string, CanonicalDigestValue> {
  return {
    magic: envelope.magic,
    reportType: envelope.reportType,
    payload: {
      submissionId: envelope.payload.submissionId,
      projectId: envelope.payload.projectId,
      juryRoundId: envelope.payload.juryRoundId,
      verdictSource: envelope.payload.verdictSource,
      finalValidity: envelope.payload.finalValidity,
      aggregatedAtTimestampSec: envelope.payload.aggregatedAtTimestampSec,
      juryDeadlineTimestampSec: envelope.payload.juryDeadlineTimestampSec,
      adjudicationDeadlineTimestampSec:
        envelope.payload.adjudicationDeadlineTimestampSec,
      scopeKey: normalizeHexForDigest(envelope.payload.scopeKey),
      consensusVoteCount: envelope.payload.consensusVoteCount,
      llmAgreeingVoteCount: envelope.payload.llmAgreeingVoteCount,
      humanAgreeingVoteCount: envelope.payload.humanAgreeingVoteCount,
      supportingOpinionRecordKeys: envelope.payload.supportingOpinionRecordKeys.map(
        normalizeHexForDigest,
      ),
      supportingRationaleDigests: envelope.payload.supportingRationaleDigests.map(
        normalizeHexForDigest,
      ),
      supportingTestimonyDigests: envelope.payload.supportingTestimonyDigests.map(
        normalizeHexForDigest,
      ),
      rationale: envelope.payload.rationale,
    },
  }
}

function serializeOwnerAdjudicationHandoffEnvelopeForDigest(
  envelope: OwnerAdjudicationHandoffEnvelope,
): Record<string, CanonicalDigestValue> {
  return {
    magic: envelope.magic,
    reportType: envelope.reportType,
    payload: {
      submissionId: envelope.payload.submissionId,
      projectId: envelope.payload.projectId,
      juryRoundId: envelope.payload.juryRoundId,
      lifecycleStatus: envelope.payload.lifecycleStatus,
      aggregatedAtTimestampSec: envelope.payload.aggregatedAtTimestampSec,
      juryDeadlineTimestampSec: envelope.payload.juryDeadlineTimestampSec,
      adjudicationDeadlineTimestampSec:
        envelope.payload.adjudicationDeadlineTimestampSec,
      scopeKey: normalizeHexForDigest(envelope.payload.scopeKey),
      receivedVoteCount: envelope.payload.receivedVoteCount,
      requiredConsensusCount: envelope.payload.requiredConsensusCount,
      requiredCohortCount: envelope.payload.requiredCohortCount,
      leadingFinalValidity: envelope.payload.leadingFinalValidity ?? null,
      leadingVoteCount: envelope.payload.leadingVoteCount,
      leadingLLMVoteCount: envelope.payload.leadingLLMVoteCount,
      leadingHumanVoteCount: envelope.payload.leadingHumanVoteCount,
      supportingOpinionRecordKeys: envelope.payload.supportingOpinionRecordKeys.map(
        normalizeHexForDigest,
      ),
      supportingRationaleDigests: envelope.payload.supportingRationaleDigests.map(
        normalizeHexForDigest,
      ),
      supportingTestimonyDigests: envelope.payload.supportingTestimonyDigests.map(
        normalizeHexForDigest,
      ),
      reason: envelope.payload.reason,
    },
  }
}

function deriveJuryConsensusEnvelopeDigest(
  envelope: JuryConsensusEnvelope,
): `0x${string}` {
  return deriveStableDigest(
    JURY_CONSENSUS_ENVELOPE_DIGEST_VERSION,
    serializeJuryConsensusEnvelopeForDigest(envelope),
  )
}

function deriveOwnerAdjudicationHandoffEnvelopeDigest(
  envelope: OwnerAdjudicationHandoffEnvelope,
): `0x${string}` {
  return deriveStableDigest(
    OWNER_ADJUDICATION_HANDOFF_ENVELOPE_DIGEST_VERSION,
    serializeOwnerAdjudicationHandoffEnvelopeForDigest(envelope),
  )
}

function deriveTrustedOpinionAggregationEnvelope(args: {
  casePackage: AdjudicationCaseEnvelope
  opinionIngest: OpinionIngestEnvelope
  aggregatedAtTimestampSec: bigint
}): JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope {
  const records = assertOpinionAggregationReadConsistency({
    casePackage: args.casePackage,
    opinionIngest: args.opinionIngest,
  })

  return aggregateTargetStateOpinionRecords({
    casePackage: args.casePackage,
    currentTimestampSec: args.aggregatedAtTimestampSec,
    records,
  })
}

function normalizeOwnerAdjudicationCandidate(args: {
  casePackage: AdjudicationCaseEnvelope
  candidate: Extract<ParsedFinalVerdictCandidate, { kind: "owner-adjudication" }>
}): FinalPackageResolution {
  const { casePackage, candidate } = args
  const { handoff, payload } = candidate

  if (handoff.payload.submissionId !== casePackage.payload.submissionId) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.submissionId must match casePackage.payload.submissionId",
    )
  }

  if (handoff.payload.projectId !== casePackage.payload.projectId) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.projectId must match casePackage.payload.projectId",
    )
  }

  if (handoff.payload.juryRoundId !== casePackage.payload.juryRoundId) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.juryRoundId must match casePackage.payload.juryRoundId",
    )
  }

  if (
    handoff.payload.juryDeadlineTimestampSec !==
    casePackage.payload.juryDeadlineTimestampSec
  ) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.juryDeadlineTimestampSec must match casePackage.payload.juryDeadlineTimestampSec",
    )
  }

  if (
    handoff.payload.adjudicationDeadlineTimestampSec !==
    casePackage.payload.adjudicationDeadlineTimestampSec
  ) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.adjudicationDeadlineTimestampSec must match casePackage.payload.adjudicationDeadlineTimestampSec",
    )
  }

  if (handoff.payload.scopeKey !== deriveOpinionLedgerScopeKey(casePackage)) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.scopeKey must match the committed adjudication case scope",
    )
  }

  if (handoff.payload.aggregatedAtTimestampSec < casePackage.payload.juryDeadlineTimestampSec) {
    throw new Error(
      "ownerAdjudicationHandoff.payload.aggregatedAtTimestampSec must be at or after the jury deadline",
    )
  }

  if (handoff.payload.receivedVoteCount !== TOTAL_JUROR_SLOT_COUNT) {
    throw new Error(
      `ownerAdjudicationHandoff.payload.receivedVoteCount must be ${TOTAL_JUROR_SLOT_COUNT}`,
    )
  }

  if (payload.submissionId !== handoff.payload.submissionId) {
    throw new Error(
      "finalVerdict.submissionId must match ownerAdjudicationHandoff.payload.submissionId",
    )
  }

  if (payload.projectId !== handoff.payload.projectId) {
    throw new Error(
      "finalVerdict.projectId must match ownerAdjudicationHandoff.payload.projectId",
    )
  }

  if (payload.juryRoundId !== handoff.payload.juryRoundId) {
    throw new Error(
      "finalVerdict.juryRoundId must match ownerAdjudicationHandoff.payload.juryRoundId",
    )
  }

  if (payload.scopeKey !== handoff.payload.scopeKey) {
    throw new Error(
      "finalVerdict.scopeKey must match ownerAdjudicationHandoff.payload.scopeKey",
    )
  }

  if (payload.currentTimestampSec > handoff.payload.adjudicationDeadlineTimestampSec) {
    return buildOwnerAdjudicationExpiredEnvelope({
      submissionId: payload.submissionId,
      projectId: payload.projectId,
      juryRoundId: payload.juryRoundId,
      lifecycleStatus: "OWNER_ADJUDICATION_EXPIRED",
      resolution: "UNRESOLVED",
      scopeKey: payload.scopeKey,
      juryDeadlineTimestampSec: handoff.payload.juryDeadlineTimestampSec,
      adjudicationDeadlineTimestampSec:
        handoff.payload.adjudicationDeadlineTimestampSec,
      submittedAtTimestampSec: payload.currentTimestampSec,
      evidenceReportType: payload.evidenceReportType,
      oasisEnvelopeHash: payload.oasisEnvelopeHash,
      reason: `${OWNER_ADJUDICATION_EXPIRED_ERROR}: owner adjudication arrived after deadline; currentTimestamp=${payload.currentTimestampSec.toString()} adjudicationDeadlineTimestamp=${handoff.payload.adjudicationDeadlineTimestampSec.toString()}`,
    })
  }

  if (payload.evidenceReportType !== casePackage.payload.evidenceReportType) {
    throw new Error(
      "owner testimony contradicts the strict evidence package: evidenceReportType mismatch",
    )
  }

  if (payload.oasisEnvelopeHash !== casePackage.payload.oasisEnvelopeHash) {
    throw new Error(
      "owner testimony contradicts the strict evidence package: oasisEnvelopeHash mismatch",
    )
  }

  const trustedAggregation = deriveTrustedOpinionAggregationEnvelope({
    casePackage,
    opinionIngest: candidate.opinionIngest,
    aggregatedAtTimestampSec: handoff.payload.aggregatedAtTimestampSec,
  })
  if (trustedAggregation.reportType !== OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE) {
    throw new Error(
      "finalVerdict.handoff must be backed by trusted opinion aggregation that resolves to owner-adjudication-handoff/v1",
    )
  }

  if (
    deriveOwnerAdjudicationHandoffEnvelopeDigest(handoff) !==
    deriveOwnerAdjudicationHandoffEnvelopeDigest(trustedAggregation)
  ) {
    throw new Error(
      "finalVerdict.handoff must match the trusted opinion aggregation output",
    )
  }

  return {
    compatibility: "final-verdict-ready",
    submissionId: payload.submissionId,
    projectId: payload.projectId,
    juryRoundId: payload.juryRoundId,
    verdictSource: "OWNER",
    finalValidity: payload.finalValidity,
    rationale: payload.rationale,
    drainAmountWei: payload.drainAmountWei,
    ownerTestimonyDigest: buildOwnerAdjudicationTestimonyDigest({ payload }),
  }
}

function normalizeJuryConsensusCandidate(args: {
  casePackage: AdjudicationCaseEnvelope
  candidate: Extract<ParsedFinalVerdictCandidate, { kind: "jury-consensus" }>
}): NormalizedAdjudicationDecision {
  const { casePackage, candidate } = args
  const { consensus, payload } = candidate

  if (consensus.payload.submissionId !== casePackage.payload.submissionId) {
    throw new Error(
      "juryConsensus.payload.submissionId must match casePackage.payload.submissionId",
    )
  }

  if (consensus.payload.projectId !== casePackage.payload.projectId) {
    throw new Error(
      "juryConsensus.payload.projectId must match casePackage.payload.projectId",
    )
  }

  if (consensus.payload.juryRoundId !== casePackage.payload.juryRoundId) {
    throw new Error(
      "juryConsensus.payload.juryRoundId must match casePackage.payload.juryRoundId",
    )
  }

  if (
    consensus.payload.juryDeadlineTimestampSec !==
    casePackage.payload.juryDeadlineTimestampSec
  ) {
    throw new Error(
      "juryConsensus.payload.juryDeadlineTimestampSec must match casePackage.payload.juryDeadlineTimestampSec",
    )
  }

  if (
    consensus.payload.adjudicationDeadlineTimestampSec !==
    casePackage.payload.adjudicationDeadlineTimestampSec
  ) {
    throw new Error(
      "juryConsensus.payload.adjudicationDeadlineTimestampSec must match casePackage.payload.adjudicationDeadlineTimestampSec",
    )
  }

  if (consensus.payload.scopeKey !== deriveOpinionLedgerScopeKey(casePackage)) {
    throw new Error(
      "juryConsensus.payload.scopeKey must match the committed adjudication case scope",
    )
  }

  if (
    consensus.payload.aggregatedAtTimestampSec <
    casePackage.payload.juryDeadlineTimestampSec
  ) {
    throw new Error(
      "juryConsensus.payload.aggregatedAtTimestampSec must be at or after the jury deadline",
    )
  }

  const trustedAggregation = deriveTrustedOpinionAggregationEnvelope({
    casePackage,
    opinionIngest: candidate.opinionIngest,
    aggregatedAtTimestampSec: consensus.payload.aggregatedAtTimestampSec,
  })
  if (trustedAggregation.reportType !== JURY_CONSENSUS_REPORT_TYPE) {
    throw new Error(
      "finalVerdict.consensus must be backed by trusted opinion aggregation that resolves to jury-consensus/v1",
    )
  }

  if (
    deriveJuryConsensusEnvelopeDigest(consensus) !==
    deriveJuryConsensusEnvelopeDigest(trustedAggregation)
  ) {
    throw new Error(
      "finalVerdict.consensus must match the trusted opinion aggregation output",
    )
  }

  if (
    isAdjudicatedValidFinalValidity(consensus.payload.finalValidity) &&
    payload.drainAmountWei === 0n
  ) {
    throw new Error(
      "finalVerdict.drainAmountWei must be positive when juryConsensus.payload.finalValidity is HIGH or MEDIUM",
    )
  }

  if (
    consensus.payload.finalValidity === "INVALID" &&
    payload.drainAmountWei !== 0n
  ) {
    throw new Error(
      "finalVerdict.drainAmountWei must be zero when juryConsensus.payload.finalValidity is INVALID",
    )
  }

  return {
    compatibility: "final-verdict-ready",
    submissionId: consensus.payload.submissionId,
    projectId: consensus.payload.projectId,
    juryRoundId: consensus.payload.juryRoundId,
    verdictSource: "JURY",
    finalValidity: consensus.payload.finalValidity,
    rationale: consensus.payload.rationale,
    drainAmountWei: payload.drainAmountWei,
  }
}

function normalizeFinalVerdictCandidate(
  casePackage: AdjudicationCaseEnvelope,
  candidate: ParsedFinalVerdictCandidate,
): FinalPackageResolution {
  if (candidate.kind === "legacy-recommendation") {
    return {
      compatibility: "migration-only",
      submissionId: candidate.envelope.payload.submissionId,
      projectId: candidate.envelope.payload.projectId,
      verdictSource: "JURY",
      finalValidity: mapLegacyRecommendationToFinalValidity(
        candidate.envelope.payload.action,
      ),
      rationale: candidate.envelope.payload.rationale,
      drainAmountWei: 0n,
      legacyAction: candidate.envelope.payload.action,
    }
  }

  if (candidate.kind === "owner-adjudication") {
    return normalizeOwnerAdjudicationCandidate({
      casePackage,
      candidate,
    })
  }

  if (candidate.kind === "jury-consensus") {
    return normalizeJuryConsensusCandidate({
      casePackage,
      candidate,
    })
  }

  return {
    compatibility: "final-verdict-ready",
    submissionId: candidate.payload.submissionId,
    projectId: candidate.payload.projectId,
    juryRoundId: candidate.payload.juryRoundId,
    verdictSource: candidate.payload.verdictSource,
    finalValidity: candidate.payload.finalValidity,
    rationale: candidate.payload.rationale,
    drainAmountWei: candidate.payload.drainAmountWei,
    ownerTestimonyDigest: candidate.payload.ownerTestimonyDigest,
  }
}

function buildAdjudicationFinalPackage(args: {
  casePackage: AdjudicationCaseEnvelope
  finalVerdict: NormalizedAdjudicationDecision
}): AdjudicationFinalPackageEnvelope {
  const { casePackage, finalVerdict } = args
  const { payload } = casePackage

  if (payload.lifecycleStatus !== "JURY_PENDING") {
    throw new Error(
      "casePackage.payload.lifecycleStatus must remain JURY_PENDING before final packaging",
    )
  }

  if (payload.verdictSource !== "NONE") {
    throw new Error(
      "casePackage.payload.verdictSource must remain NONE before final packaging",
    )
  }

  if (payload.finalValidity !== "NONE") {
    throw new Error(
      "casePackage.payload.finalValidity must remain NONE before final packaging",
    )
  }

  if (finalVerdict.compatibility !== "final-verdict-ready") {
    throw new Error(
      "legacy recommendation-only payloads are migration-only and cannot emit final adjudication packages",
    )
  }

  if (finalVerdict.submissionId !== payload.submissionId) {
    throw new Error(
      "finalVerdict.submissionId must match casePackage.payload.submissionId",
    )
  }

  if (finalVerdict.projectId !== payload.projectId) {
    throw new Error(
      "finalVerdict.projectId must match casePackage.payload.projectId",
    )
  }

  if (finalVerdict.juryRoundId !== payload.juryRoundId) {
    throw new Error(
      "finalVerdict.juryRoundId must match casePackage.payload.juryRoundId",
    )
  }

  const isValid = isAdjudicatedValidFinalValidity(finalVerdict.finalValidity)
  if (isValid && finalVerdict.drainAmountWei === 0n) {
    throw new Error(
      "finalVerdict.drainAmountWei must be positive when finalValidity is HIGH or MEDIUM",
    )
  }

  if (!isValid && finalVerdict.drainAmountWei !== 0n) {
    throw new Error(
      "finalVerdict.drainAmountWei must be zero when finalValidity is INVALID",
    )
  }

  if (
    finalVerdict.verdictSource === "OWNER" &&
    finalVerdict.ownerTestimonyDigest === undefined
  ) {
    throw new Error(
      "finalVerdict.ownerTestimonyDigest is required when verdictSource is OWNER",
    )
  }

  if (
    finalVerdict.verdictSource === "JURY" &&
    finalVerdict.ownerTestimonyDigest !== undefined
  ) {
    throw new Error(
      "finalVerdict.ownerTestimonyDigest cannot be set when verdictSource is JURY",
    )
  }

  const finalPayload: AdjudicationFinalPackagePayload = {
    submissionId: payload.submissionId,
    projectId: payload.projectId,
    juryRoundId: payload.juryRoundId,
    lifecycleStatus: isValid ? "VERIFIED" : "INVALID",
    verdictSource: finalVerdict.verdictSource,
    finalValidity: finalVerdict.finalValidity,
    isValid,
    drainAmountWei: finalVerdict.drainAmountWei,
    rationale: finalVerdict.rationale,
    juryDeadlineTimestampSec: payload.juryDeadlineTimestampSec,
    adjudicationDeadlineTimestampSec: payload.adjudicationDeadlineTimestampSec,
    evidenceReportType: payload.evidenceReportType,
    juryLedgerDigest: payload.juryLedgerDigest,
    ownerTestimonyDigest: finalVerdict.ownerTestimonyDigest,
    sourceEventKey: payload.sourceEventKey,
    mappingFingerprint: payload.mappingFingerprint,
    syncId: payload.syncId,
    idempotencyKey: payload.idempotencyKey,
    cipherURI: payload.cipherURI,
    severity: payload.severity,
    chainSelectorName: payload.chainSelectorName,
    bountyHubAddress: payload.bountyHubAddress,
    oasisEnvelopeHash: payload.oasisEnvelopeHash,
    rosterCommitment: payload.rosterCommitment,
  }

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: ADJUDICATION_FINAL_REPORT_TYPE,
    payload: finalPayload,
  }
}

export function encodeJuryOrchestratorContractReport(
  report: AdjudicationFinalPackageEnvelope,
): `0x${string}` {
  const lifecycleStatus =
    report.payload.lifecycleStatus === "VERIFIED"
      ? BOUNTY_HUB_SUBMISSION_STATUS_VERIFIED
      : BOUNTY_HUB_SUBMISSION_STATUS_INVALID
  const verdictSource =
    report.payload.verdictSource === "JURY"
      ? BOUNTY_HUB_VERDICT_SOURCE_JURY
      : BOUNTY_HUB_VERDICT_SOURCE_OWNER
  const finalValidity =
    report.payload.finalValidity === "INVALID"
      ? BOUNTY_HUB_FINAL_VALIDITY_INVALID
      : BOUNTY_HUB_FINAL_VALIDITY_VALID
  const adjudicatedSeverity =
    report.payload.finalValidity === "HIGH"
      ? BOUNTY_HUB_SEVERITY_HIGH
      : report.payload.finalValidity === "MEDIUM"
        ? BOUNTY_HUB_SEVERITY_MEDIUM
        : BOUNTY_HUB_SEVERITY_NONE

  const payload = encodeAbiParameters(ADJUDICATION_FINAL_CONTRACT_REPORT_PARAMS, [
    report.payload.submissionId,
    report.payload.isValid,
    report.payload.drainAmountWei,
    false,
    "",
    "",
    false,
    "",
    "",
    0n,
    0n,
    lifecycleStatus,
    report.payload.juryDeadlineTimestampSec,
    report.payload.adjudicationDeadlineTimestampSec,
    verdictSource,
    finalValidity,
    report.payload.juryLedgerDigest,
    report.payload.ownerTestimonyDigest ?? ZERO_BYTES32,
    adjudicatedSeverity,
  ])

  return encodeAbiParameters(CONTRACT_TYPED_REPORT_ENVELOPE_PARAMS, [
    REPORT_ENVELOPE_MAGIC_HEX,
    CONTRACT_TYPED_REPORT_TYPE,
    payload,
  ])
}

function deriveOpinionLedgerScopeKey(casePackage: AdjudicationCaseEnvelope): `0x${string}` {
  return deriveStableDigest(JURY_LEDGER_SCOPE_VERSION, {
    submissionId: casePackage.payload.submissionId,
    juryRoundId: casePackage.payload.juryRoundId,
  })
}

function deriveOpinionLedgerRecordKey(args: {
  casePackage: AdjudicationCaseEnvelope
  slotIndex: number
}): `0x${string}` {
  return deriveStableDigest(JURY_LEDGER_RECORD_VERSION, {
    scopeKey: normalizeHexForDigest(deriveOpinionLedgerScopeKey(args.casePackage)),
    role: "sealed_opinion",
    roleSlot: args.slotIndex,
  })
}

function deriveOpinionLedgerSlotId(args: {
  casePackage: AdjudicationCaseEnvelope
  slotIndex: number
}): string {
  const scopeKey = deriveOpinionLedgerScopeKey(args.casePackage)
  const recordKey = deriveOpinionLedgerRecordKey(args)
  return `${JURY_LEDGER_SLOT_PREFIX}/${scopeKey}/sealed-opinion/slot-${String(args.slotIndex).padStart(4, "0")}/${recordKey}`
}

function ingestJurorOpinions(
  parsed: ParsedOpinionIngestPipelineInput,
): OpinionIngestEnvelope {
  const scopeKey = deriveOpinionLedgerScopeKey(parsed.casePackage)
  const records = new Map<`0x${string}`, SealedJurorOpinionRecord>()

  for (const opinion of parsed.sealedOpinions) {
    const authorizedSlot = assertOpinionIngestRosterSlotAuthorized(parsed.casePackage, {
      slotIndex: opinion.slotIndex,
      cohort: opinion.cohort,
      jurorId: opinion.jurorId,
    })
    const recordKey = deriveOpinionLedgerRecordKey({
      casePackage: parsed.casePackage,
      slotIndex: authorizedSlot.slotIndex,
    })

    if (records.has(recordKey)) {
      throw new Error(
        `${JURY_LEDGER_APPEND_ONLY_ERROR}: role=sealed_opinion recordKey=${recordKey}`,
      )
    }

    records.set(recordKey, {
      slotIndex: authorizedSlot.slotIndex,
      cohort: authorizedSlot.cohort,
      cohortSlotIndex: authorizedSlot.cohortSlotIndex,
      jurorId: authorizedSlot.jurorId,
      finalValidity: opinion.finalValidity,
      rationaleDigest: opinion.rationaleDigest,
      testimonyDigest: opinion.testimonyDigest,
      ingestTimestampSec: opinion.ingestTimestampSec,
      scopeKey,
      recordKey,
      slotId: deriveOpinionLedgerSlotId({
        casePackage: parsed.casePackage,
        slotIndex: authorizedSlot.slotIndex,
      }),
    })
  }

  const sortedRecords = [...records.values()].sort(
    (left, right) => left.slotIndex - right.slotIndex,
  )

  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: JURY_OPINION_INGEST_REPORT_TYPE,
    payload: {
      submissionId: parsed.casePackage.payload.submissionId,
      projectId: parsed.casePackage.payload.projectId,
      juryRoundId: parsed.casePackage.payload.juryRoundId,
      scopeKey,
      recordCount: sortedRecords.length,
      records: sortedRecords,
    },
  }
}

function createTargetStateOpinionSupportBucket(): TargetStateOpinionSupportBucket {
  return {
    total: 0,
    LLM: 0,
    HUMAN: 0,
    records: [],
  }
}

function sortOpinionRecordsDeterministically(
  records: SealedJurorOpinionRecord[],
): SealedJurorOpinionRecord[] {
  return [...records].sort((left, right) => left.slotIndex - right.slotIndex)
}

function formatTargetStateOpinionSupport(args: {
  finalValidity: AdjudicationResolvedValidity
  bucket: TargetStateOpinionSupportBucket
}): string {
  return `${args.finalValidity}=${args.bucket.total} (LLM=${args.bucket.LLM}, HUMAN=${args.bucket.HUMAN})`
}

function selectDeterministicConsensusSupport(
  records: SealedJurorOpinionRecord[],
): SealedJurorOpinionRecord[] {
  return sortOpinionRecordsDeterministically(records).slice(
    0,
    TARGET_STATE_REQUIRED_CONSENSUS_COUNT,
  )
}

function buildJuryConsensusEnvelope(
  payload: JuryConsensusPayload,
): JuryConsensusEnvelope {
  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: JURY_CONSENSUS_REPORT_TYPE,
    payload,
  }
}

function buildOwnerAdjudicationExpiredEnvelope(
  payload: OwnerAdjudicationExpiredPayload,
): OwnerAdjudicationExpiredEnvelope {
  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: OWNER_ADJUDICATION_EXPIRED_REPORT_TYPE,
    payload,
  }
}

function buildOwnerAdjudicationHandoffEnvelope(
  payload: OwnerAdjudicationHandoffPayload,
): OwnerAdjudicationHandoffEnvelope {
  return {
    magic: REPORT_ENVELOPE_MAGIC,
    reportType: OWNER_ADJUDICATION_HANDOFF_REPORT_TYPE,
    payload,
  }
}

function throwConfidentialJuryLedgerReadFailure(reason: string): never {
  throw new Error(`${CONFIDENTIAL_JURY_LEDGER_READ_FAILED_ERROR}: ${reason}`)
}

function assertOpinionAggregationReadAtOrAfterDeadline(args: {
  casePackage: AdjudicationCaseEnvelope
  currentTimestampSec: bigint
}): void {
  if (args.currentTimestampSec < args.casePackage.payload.juryDeadlineTimestampSec) {
    throw new Error(
      `${JURY_LEDGER_AGGREGATION_READ_BEFORE_DEADLINE_ERROR}: currentTimestamp=${args.currentTimestampSec.toString()} juryDeadlineTimestamp=${args.casePackage.payload.juryDeadlineTimestampSec.toString()}`,
    )
  }
}

function summarizeTargetStateOpinionSupport(
  records: SealedJurorOpinionRecord[],
): Record<AdjudicationResolvedValidity, TargetStateOpinionSupportBucket> {
  const support = {
    HIGH: createTargetStateOpinionSupportBucket(),
    MEDIUM: createTargetStateOpinionSupportBucket(),
    INVALID: createTargetStateOpinionSupportBucket(),
  } satisfies Record<AdjudicationResolvedValidity, TargetStateOpinionSupportBucket>

  for (const record of sortOpinionRecordsDeterministically(records)) {
    const bucket = support[record.finalValidity]
    bucket.total += 1
    bucket[record.cohort] += 1
    bucket.records.push(record)
  }

  return support
}

export function aggregateTargetStateOpinionRecords(args: {
  casePackage: AdjudicationCaseEnvelope
  currentTimestampSec: bigint | number | string
  records: SealedJurorOpinionRecord[]
}): JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope {
  const casePackage = parseAdjudicationCaseEnvelope(args.casePackage)
  const currentTimestampSec = requirePositiveBigIntLike(
    args.currentTimestampSec,
    "currentTimestampSec",
  )
  if (args.records.length === 0) {
    throw new Error("records must be a non-empty array of sealed juror opinions")
  }

  assertOpinionAggregationReadAtOrAfterDeadline({
    casePackage,
    currentTimestampSec,
  })

  const support = summarizeTargetStateOpinionSupport(args.records)
  const highQualifies =
    support.HIGH.total >= TARGET_STATE_REQUIRED_CONSENSUS_COUNT &&
    support.HIGH.LLM >= TARGET_STATE_REQUIRED_COHORT_COUNT &&
    support.HIGH.HUMAN >= TARGET_STATE_REQUIRED_COHORT_COUNT
  const mediumQualifies =
    support.MEDIUM.total >= TARGET_STATE_REQUIRED_CONSENSUS_COUNT &&
    support.MEDIUM.LLM >= TARGET_STATE_REQUIRED_COHORT_COUNT &&
    support.MEDIUM.HUMAN >= TARGET_STATE_REQUIRED_COHORT_COUNT
  const invalidQualifies =
    support.INVALID.total >= TARGET_STATE_REQUIRED_CONSENSUS_COUNT &&
    support.INVALID.LLM >= TARGET_STATE_REQUIRED_COHORT_COUNT &&
    support.INVALID.HUMAN >= TARGET_STATE_REQUIRED_COHORT_COUNT

  if (highQualifies || mediumQualifies || invalidQualifies) {
    const finalValidity = highQualifies
      ? "HIGH"
      : mediumQualifies
        ? "MEDIUM"
        : "INVALID"
    const winner = support[finalValidity]
    const consensusRecords = selectDeterministicConsensusSupport(winner.records)
    const llmAgreeingVoteCount = consensusRecords.filter(
      (record) => record.cohort === "LLM",
    ).length
    const humanAgreeingVoteCount = consensusRecords.length - llmAgreeingVoteCount

    return buildJuryConsensusEnvelope({
      submissionId: casePackage.payload.submissionId,
      projectId: casePackage.payload.projectId,
      juryRoundId: casePackage.payload.juryRoundId,
      verdictSource: "JURY",
      finalValidity,
      aggregatedAtTimestampSec: currentTimestampSec,
      juryDeadlineTimestampSec: casePackage.payload.juryDeadlineTimestampSec,
      adjudicationDeadlineTimestampSec:
        casePackage.payload.adjudicationDeadlineTimestampSec,
      scopeKey: deriveOpinionLedgerScopeKey(casePackage),
      consensusVoteCount: consensusRecords.length,
      llmAgreeingVoteCount,
      humanAgreeingVoteCount,
      supportingOpinionRecordKeys: consensusRecords.map((record) => record.recordKey),
      supportingRationaleDigests: consensusRecords.map(
        (record) => record.rationaleDigest,
      ),
      supportingTestimonyDigests: consensusRecords.map(
        (record) => record.testimonyDigest,
      ),
      rationale: `Jury reached the 8/10 + 3-per-cohort consensus threshold for ${finalValidity}. Counts: ${formatTargetStateOpinionSupport({ finalValidity: "HIGH", bucket: support.HIGH })}, ${formatTargetStateOpinionSupport({ finalValidity: "MEDIUM", bucket: support.MEDIUM })}, ${formatTargetStateOpinionSupport({ finalValidity: "INVALID", bucket: support.INVALID })}.`,
    })
  }

  const leadingFinalValidity =
    support.HIGH.total > support.MEDIUM.total &&
    support.HIGH.total > support.INVALID.total
      ? "HIGH"
      : support.MEDIUM.total > support.HIGH.total &&
          support.MEDIUM.total > support.INVALID.total
        ? "MEDIUM"
        : support.INVALID.total > support.HIGH.total &&
            support.INVALID.total > support.MEDIUM.total
          ? "INVALID"
          : undefined
  const leadingBucket =
    leadingFinalValidity === undefined
      ? createTargetStateOpinionSupportBucket()
      : support[leadingFinalValidity]
  const reason =
    leadingFinalValidity !== undefined &&
    leadingBucket.total >= TARGET_STATE_REQUIRED_CONSENSUS_COUNT &&
    (leadingBucket.LLM < TARGET_STATE_REQUIRED_COHORT_COUNT ||
      leadingBucket.HUMAN < TARGET_STATE_REQUIRED_COHORT_COUNT)
      ? `Owner review required because 8/10 support for ${leadingFinalValidity} did not satisfy the three-per-cohort minimum. Counts: ${formatTargetStateOpinionSupport({ finalValidity: "HIGH", bucket: support.HIGH })}, ${formatTargetStateOpinionSupport({ finalValidity: "MEDIUM", bucket: support.MEDIUM })}, ${formatTargetStateOpinionSupport({ finalValidity: "INVALID", bucket: support.INVALID })}.`
      : leadingFinalValidity === undefined
        ? `Owner review required because jury aggregation ended without a deterministic leader. Counts: ${formatTargetStateOpinionSupport({ finalValidity: "HIGH", bucket: support.HIGH })}, ${formatTargetStateOpinionSupport({ finalValidity: "MEDIUM", bucket: support.MEDIUM })}, ${formatTargetStateOpinionSupport({ finalValidity: "INVALID", bucket: support.INVALID })}.`
        : `Owner review required because ${leadingFinalValidity} reached only ${leadingBucket.total}/10 votes instead of the required 8/10. Counts: ${formatTargetStateOpinionSupport({ finalValidity: "HIGH", bucket: support.HIGH })}, ${formatTargetStateOpinionSupport({ finalValidity: "MEDIUM", bucket: support.MEDIUM })}, ${formatTargetStateOpinionSupport({ finalValidity: "INVALID", bucket: support.INVALID })}.`

  return buildOwnerAdjudicationHandoffEnvelope({
    submissionId: casePackage.payload.submissionId,
    projectId: casePackage.payload.projectId,
    juryRoundId: casePackage.payload.juryRoundId,
    lifecycleStatus: "AWAITING_OWNER_ADJUDICATION",
    aggregatedAtTimestampSec: currentTimestampSec,
    juryDeadlineTimestampSec: casePackage.payload.juryDeadlineTimestampSec,
    adjudicationDeadlineTimestampSec:
      casePackage.payload.adjudicationDeadlineTimestampSec,
    scopeKey: deriveOpinionLedgerScopeKey(casePackage),
    receivedVoteCount: args.records.length,
    requiredConsensusCount: TARGET_STATE_REQUIRED_CONSENSUS_COUNT,
    requiredCohortCount: TARGET_STATE_REQUIRED_COHORT_COUNT,
    leadingFinalValidity,
    leadingVoteCount: leadingBucket.total,
    leadingLLMVoteCount: leadingBucket.LLM,
    leadingHumanVoteCount: leadingBucket.HUMAN,
    supportingOpinionRecordKeys: leadingBucket.records.map(
      (record) => record.recordKey,
    ),
    supportingRationaleDigests: leadingBucket.records.map(
      (record) => record.rationaleDigest,
    ),
    supportingTestimonyDigests: leadingBucket.records.map(
      (record) => record.testimonyDigest,
    ),
    reason,
  })
}

function assertOpinionAggregationReadConsistency(args: {
  casePackage: AdjudicationCaseEnvelope
  opinionIngest: OpinionIngestEnvelope
}): SealedJurorOpinionRecord[] {
  const expectedScopeKey = deriveOpinionLedgerScopeKey(args.casePackage)
  const effectiveSlots = resolveEffectiveRosterSlots(
    args.casePackage.payload.rosterCommitment,
  )

  if (args.opinionIngest.payload.recordCount !== args.opinionIngest.payload.records.length) {
    throwConfidentialJuryLedgerReadFailure(
      "recordCount did not match the number of ledger records returned",
    )
  }

  if (args.opinionIngest.payload.submissionId !== args.casePackage.payload.submissionId) {
    throwConfidentialJuryLedgerReadFailure(
      "submission scope did not match the committed adjudication case",
    )
  }

  if (args.opinionIngest.payload.projectId !== args.casePackage.payload.projectId) {
    throwConfidentialJuryLedgerReadFailure(
      "project scope did not match the committed adjudication case",
    )
  }

  if (args.opinionIngest.payload.juryRoundId !== args.casePackage.payload.juryRoundId) {
    throwConfidentialJuryLedgerReadFailure(
      "jury round scope did not match the committed adjudication case",
    )
  }

  if (args.opinionIngest.payload.scopeKey !== expectedScopeKey) {
    throwConfidentialJuryLedgerReadFailure(
      "opinion ledger scopeKey did not match the committed adjudication case",
    )
  }

  const seenRecordKeys = new Set<`0x${string}`>()
  const seenSlotIndices = new Set<number>()
  const validatedRecords: SealedJurorOpinionRecord[] = []

  for (const record of sortOpinionRecordsDeterministically(
    args.opinionIngest.payload.records,
  )) {
    if (record.scopeKey !== args.opinionIngest.payload.scopeKey) {
      throwConfidentialJuryLedgerReadFailure(
        "record scopeKey did not match the opinion-ingest envelope",
      )
    }

    if (seenRecordKeys.has(record.recordKey) || seenSlotIndices.has(record.slotIndex)) {
      throwConfidentialJuryLedgerReadFailure(
        `duplicate juror slot detected at slotIndex=${record.slotIndex}`,
      )
    }

    if (record.ingestTimestampSec > args.casePackage.payload.juryDeadlineTimestampSec) {
      throwConfidentialJuryLedgerReadFailure(
        `late juror vote detected at slotIndex=${record.slotIndex}`,
      )
    }

    const committedSlot = effectiveSlots.find(
      (candidate) => candidate.slotIndex === record.slotIndex,
    )
    if (
      !committedSlot ||
      committedSlot.cohort !== record.cohort ||
      committedSlot.cohortSlotIndex !== record.cohortSlotIndex ||
      committedSlot.jurorId !== record.jurorId
    ) {
      throwConfidentialJuryLedgerReadFailure(
        `record at slotIndex=${record.slotIndex} did not match the committed roster`,
      )
    }

    const expectedRecordKey = deriveOpinionLedgerRecordKey({
      casePackage: args.casePackage,
      slotIndex: record.slotIndex,
    })
    if (record.recordKey !== expectedRecordKey) {
      throwConfidentialJuryLedgerReadFailure(
        `recordKey mismatch detected at slotIndex=${record.slotIndex}`,
      )
    }

    const expectedSlotId = deriveOpinionLedgerSlotId({
      casePackage: args.casePackage,
      slotIndex: record.slotIndex,
    })
    if (record.slotId !== expectedSlotId) {
      throwConfidentialJuryLedgerReadFailure(
        `slotId mismatch detected at slotIndex=${record.slotIndex}`,
      )
    }

    seenRecordKeys.add(record.recordKey)
    seenSlotIndices.add(record.slotIndex)
    validatedRecords.push(record)
  }

  if (seenSlotIndices.size !== effectiveSlots.length) {
    throwConfidentialJuryLedgerReadFailure("missing committed juror vote")
  }

  return validatedRecords
}

function aggregateOpinionIngestEnvelopeAfterDeadline(
  parsed: ParsedOpinionAggregationPipelineInput,
): JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope {
  return deriveTrustedOpinionAggregationEnvelope({
    casePackage: parsed.casePackage,
    opinionIngest: parsed.opinionIngest,
    aggregatedAtTimestampSec: parsed.currentTimestampSec,
  })
}

function inferJuryPipelineMode(
  source: Record<string, unknown>,
): JuryPipelineMode {
  if (Object.hasOwn(source, "sealedOpinions")) {
    return "opinion-ingest"
  }

  if (Object.hasOwn(source, "opinionIngest") || Object.hasOwn(source, "currentTimestampSec")) {
    return "aggregate-opinions"
  }

  if (Object.hasOwn(source, "casePackage") || Object.hasOwn(source, "finalVerdict")) {
    return "final-package"
  }

  if (
    Object.hasOwn(source, "juryRoundId") ||
    Object.hasOwn(source, "juryDeadlineTimestampSec") ||
    Object.hasOwn(source, "adjudicationDeadlineTimestampSec")
  ) {
    return "case-initialization"
  }

  if (Object.hasOwn(source, "recommendation") || Object.hasOwn(source, "ownerTestimony")) {
    return "owner-testimony"
  }

  if (Object.hasOwn(source, "recommendations")) {
    return "aggregate-recommendations"
  }

  return "derive-recommendation"
}

function parseJuryPipelineMode(
  source: Record<string, unknown>,
): JuryPipelineMode {
  if (source.mode === undefined) {
    return inferJuryPipelineMode(source)
  }

  const mode = requireNonEmptyString(source.mode, "mode")
  if (
    mode !== "derive-recommendation" &&
    mode !== "aggregate-recommendations" &&
    mode !== "aggregate-opinions" &&
    mode !== "owner-testimony" &&
    mode !== "opinion-ingest" &&
    mode !== "case-initialization" &&
    mode !== "final-package"
  ) {
    throw new Error("mode must be a supported jury pipeline mode")
  }

  return mode
}

function parseRecommendationPipelineInput(
  source: Record<string, unknown>,
): ParsedRecommendationPipelineInput {
  assertExactKeys(source, RECOMMENDATION_PIPELINE_INPUT_KEYS, "jury pipeline input")

  return {
    config: parseJuryWorkflowConfig(source.config),
    verifiedReport: parseVerifiedReportEnvelope(source.verifiedReport),
  }
}

function parseRecommendationAggregationPipelineInput(
  source: Record<string, unknown>,
): ParsedRecommendationAggregationPipelineInput {
  assertExactKeys(
    source,
    RECOMMENDATION_AGGREGATION_INPUT_KEYS,
    "jury pipeline input",
  )

  return {
    config: parseJuryWorkflowConfig(source.config),
    recommendations: parseJuryRecommendationEnvelopes(source.recommendations),
    requiredQuorum: requirePositiveSafeInteger(
      source.requiredQuorum,
      "requiredQuorum",
    ),
    timedOut: requireOptionalBoolean(source.timedOut, "timedOut") ?? false,
  }
}

function parseOwnerTestimonyPipelineInput(
  source: Record<string, unknown>,
): ParsedOwnerTestimonyPipelineInput {
  assertExactKeys(source, OWNER_TESTIMONY_INPUT_KEYS, "jury pipeline input")

  return {
    config: parseJuryWorkflowConfig(source.config),
    recommendation: parseJuryRecommendationEnvelope(source.recommendation),
    ownerTestimony: parseOwnerTestimonyPayload(source.ownerTestimony),
    verifiedReport:
      source.verifiedReport === undefined
        ? undefined
        : parseVerifiedReportEnvelope(source.verifiedReport),
  }
}

function parseCaseInitializationPipelineInput(
  source: Record<string, unknown>,
): ParsedCaseInitializationPipelineInput {
  assertExactKeys(source, CASE_INITIALIZATION_INPUT_KEYS, "jury pipeline input")

  return {
    config: parseJuryWorkflowConfig(source.config),
    verifiedReport: parseVerifiedReportEnvelope(source.verifiedReport),
    juryRoundId: requirePositiveBigIntLike(source.juryRoundId, "juryRoundId"),
    rosterSelection: parseRosterSelectionInput(source.rosterSelection),
  }
}

function parseOpinionIngestPipelineInput(
  source: Record<string, unknown>,
): ParsedOpinionIngestPipelineInput {
  assertExactKeys(source, OPINION_INGEST_INPUT_KEYS, "jury pipeline input")

  return {
    config: parseJuryWorkflowConfig(source.config),
    casePackage: parseAdjudicationCaseEnvelope(source.casePackage),
    sealedOpinions: parseSealedOpinionInputs(source.sealedOpinions),
  }
}

function parseOpinionAggregationPipelineInput(
  source: Record<string, unknown>,
): ParsedOpinionAggregationPipelineInput {
  assertExactKeys(source, OPINION_AGGREGATION_INPUT_KEYS, "jury pipeline input")

  return {
    config: parseJuryWorkflowConfig(source.config),
    casePackage: parseAdjudicationCaseEnvelope(source.casePackage),
    opinionIngest: parseOpinionIngestEnvelope(source.opinionIngest),
    currentTimestampSec: requirePositiveBigIntLike(
      source.currentTimestampSec,
      "currentTimestampSec",
    ),
  }
}

function parseFinalPackagePipelineInput(
  source: Record<string, unknown>,
): ParsedFinalPackagePipelineInput {
  assertExactKeys(source, FINAL_PACKAGE_INPUT_KEYS, "jury pipeline input")

  return {
    config: parseJuryWorkflowConfig(source.config),
    casePackage: parseAdjudicationCaseEnvelope(source.casePackage),
    finalVerdict: parseFinalVerdictCandidate(source.finalVerdict),
  }
}

export function runJuryRecommendationPipeline(
  input: never,
): JuryPipelineOutput
export function runJuryRecommendationPipeline(
  input: JuryRecommendationPipelineInput,
): JuryTypedReportEnvelope
export function runJuryRecommendationPipeline(
  input: JuryConsensusPipelineInput,
): JuryTypedReportEnvelope
export function runJuryRecommendationPipeline(
  input: OpinionAggregationPipelineInput,
): JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope
export function runJuryRecommendationPipeline(
  input: JuryOwnerTestimonyPipelineInput,
): JuryTypedReportEnvelope
export function runJuryRecommendationPipeline(
  input: OpinionIngestPipelineInput,
): OpinionIngestEnvelope
export function runJuryRecommendationPipeline(
  input: AdjudicationCaseInitializationPipelineInput,
): AdjudicationCaseEnvelope
export function runJuryRecommendationPipeline(
  input: FinalAdjudicationPackagePipelineInput,
): AdjudicationFinalPackageEnvelope | OwnerAdjudicationExpiredEnvelope
export function runJuryRecommendationPipeline(
  input: JuryPipelineInput,
): JuryPipelineOutput {
  const inputSource = requireObject(input, "jury pipeline input")
  const mode = parseJuryPipelineMode(inputSource)

  if (mode === "case-initialization") {
    const parsed = parseCaseInitializationPipelineInput(inputSource)
    void parsed.config
    return buildAdjudicationCaseEnvelope(
      normalizeStrictFailEvidenceToCase(parsed),
    )
  }

  if (mode === "opinion-ingest") {
    const parsed = parseOpinionIngestPipelineInput(inputSource)
    void parsed.config
    return ingestJurorOpinions(parsed)
  }

  if (mode === "aggregate-opinions") {
    const parsed = parseOpinionAggregationPipelineInput(inputSource)
    void parsed.config
    return aggregateOpinionIngestEnvelopeAfterDeadline(parsed)
  }

  if (mode === "final-package") {
    const parsed = parseFinalPackagePipelineInput(inputSource)
    void parsed.config
    const resolution = normalizeFinalVerdictCandidate(
      parsed.casePackage,
      parsed.finalVerdict,
    )

    if ("reportType" in resolution) {
      return resolution
    }

    return buildAdjudicationFinalPackage({
      casePackage: parsed.casePackage,
      finalVerdict: resolution,
    })
  }

  if (mode === "owner-testimony") {
    const parsed = parseOwnerTestimonyPipelineInput(inputSource)
    void parsed.config
    return ingestOwnerTestimony(parsed)
  }

  if (mode === "aggregate-recommendations") {
    const parsed = parseRecommendationAggregationPipelineInput(inputSource)
    void parsed.config
    return buildJuryRecommendationEnvelope(
      aggregateJuryRecommendationEnvelopes({
        recommendations: parsed.recommendations,
        requiredQuorum: parsed.requiredQuorum,
        timedOut: parsed.timedOut,
      }),
    )
  }

  const parsed = parseRecommendationPipelineInput(inputSource)
  void parsed.config
  return buildJuryRecommendationEnvelope(
    buildRecommendationPayloadFromVerifiedReport(parsed.verifiedReport),
  )
}

export async function main(
  input: JuryRecommendationPipelineInput,
): Promise<JuryTypedReportEnvelope>
export async function main(
  input: JuryConsensusPipelineInput,
): Promise<JuryTypedReportEnvelope>
export async function main(
  input: OpinionAggregationPipelineInput,
): Promise<JuryConsensusEnvelope | OwnerAdjudicationHandoffEnvelope>
export async function main(
  input: JuryOwnerTestimonyPipelineInput,
): Promise<JuryTypedReportEnvelope>
export async function main(
  input: OpinionIngestPipelineInput,
): Promise<OpinionIngestEnvelope>
export async function main(
  input: AdjudicationCaseInitializationPipelineInput,
): Promise<AdjudicationCaseEnvelope>
export async function main(
  input: FinalAdjudicationPackagePipelineInput,
): Promise<AdjudicationFinalPackageEnvelope | OwnerAdjudicationExpiredEnvelope>
export async function main(
  input: JuryPipelineInput,
): Promise<JuryPipelineOutput> {
  return runJuryRecommendationPipeline(input as never)
}

export function executeJuryPipeline(
  input: JuryPipelineInput,
): JuryPipelineOutput {
  return runJuryRecommendationPipeline(input)
}
