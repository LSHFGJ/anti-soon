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
    magic: "ASRP",
    reportType: "jury-recommendation/v1",
    payload,
  }
}

export async function main(): Promise<void> {
  return
}
