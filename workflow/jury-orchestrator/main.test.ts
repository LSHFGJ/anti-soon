import { describe, expect, it } from "bun:test"
import {
  assertNoAuthorityBypass,
  BOUNTY_HUB_FINALIZE_SELECTOR,
  BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR,
  buildJuryRecommendationEnvelope,
  type JuryRecommendationPayload,
} from "./main"

describe("jury-orchestrator scaffold authority boundary", () => {
  it("rejects direct finalize selector usage", () => {
    expect(() =>
      assertNoAuthorityBypass(`${BOUNTY_HUB_FINALIZE_SELECTOR}0000000000000000000000000000000000000000000000000000000000000001`),
    ).toThrow("Forbidden authority call selector")
  })

  it("rejects direct resolveDispute selector usage", () => {
    expect(() =>
      assertNoAuthorityBypass(`${BOUNTY_HUB_RESOLVE_DISPUTE_SELECTOR}00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001`),
    ).toThrow("Forbidden authority call selector")
  })

  it("allows non-authority selector payloads for recommendation-only scaffold", () => {
    expect(() => assertNoAuthorityBypass("0xdeadbeef")).not.toThrow()
  })

  it("builds typed recommendation envelope without settlement fields", () => {
    const payload: JuryRecommendationPayload = {
      submissionId: 9n,
      projectId: 2n,
      action: "NEEDS_OWNER_REVIEW",
      rationale: "Escalate disputed evidence to project owner review",
    }

    const envelope = buildJuryRecommendationEnvelope(payload)

    expect(envelope.magic).toBe("ASRP")
    expect(envelope.reportType).toBe("jury-recommendation/v1")
    expect(envelope.payload).toEqual(payload)
    expect(Object.hasOwn(envelope as object, "payoutAmount")).toBe(false)
    expect(Object.hasOwn(envelope as object, "overturn")).toBe(false)
  })
})
