import { describe, expect, it } from "bun:test"
import {
  ORPHAN_REASON_COMMITTED_NOT_REVEALED_RETRY_REVEAL,
  ORPHAN_REASON_REVEALED_NOT_REPORT_WRITTEN_RETRY_REPORT,
  ORPHAN_REASON_SAPPHIRE_WRITTEN_NOT_COMMITTED,
  reconcileVerifyPocOrphans,
  type VerifyPocReconciliationRecord,
} from "./reconciliation"

const seededOrphanFixtures: VerifyPocReconciliationRecord[] = [
  {
    syncId: "sync-sapphire-only",
    sapphireWritten: true,
    sepoliaCommitted: false,
    sepoliaRevealed: false,
    reportWritten: false,
  },
  {
    syncId: "sync-committed-only",
    sapphireWritten: true,
    sepoliaCommitted: true,
    sepoliaRevealed: false,
    reportWritten: false,
  },
  {
    syncId: "sync-revealed-no-report",
    sapphireWritten: true,
    sepoliaCommitted: true,
    sepoliaRevealed: true,
    reportWritten: false,
  },
  {
    syncId: "sync-complete",
    sapphireWritten: true,
    sepoliaCommitted: true,
    sepoliaRevealed: true,
    reportWritten: true,
  },
]

describe("verify-poc orphan reconciliation", () => {
  it("identifies all three orphan classes from seeded fixtures", () => {
    const result = reconcileVerifyPocOrphans(seededOrphanFixtures)

    expect(result.totalScanned).toBe(4)
    expect(result.totalOrphans).toBe(3)

    const orphanClasses = result.outcomes.map((outcome) => outcome.orphanClass).sort()
    expect(orphanClasses).toEqual([
      "COMMITTED_NOT_REVEALED",
      "REVEALED_NOT_REPORT_WRITTEN",
      "SAPPHIRE_WRITTEN_NOT_COMMITTED",
    ])
  })

  it("resolves every reconciled orphan to RESUMED or QUARANTINED with deterministic reason codes", () => {
    const result = reconcileVerifyPocOrphans(seededOrphanFixtures)

    for (const outcome of result.outcomes) {
      expect(outcome.action === "RESUMED" || outcome.action === "QUARANTINED").toBe(
        true,
      )
      expect(outcome.reasonCode.length > 0).toBe(true)
    }

    const bySyncId = new Map(result.outcomes.map((outcome) => [outcome.syncId, outcome]))

    expect(bySyncId.get("sync-sapphire-only")).toEqual({
      syncId: "sync-sapphire-only",
      orphanClass: "SAPPHIRE_WRITTEN_NOT_COMMITTED",
      action: "QUARANTINED",
      reasonCode: ORPHAN_REASON_SAPPHIRE_WRITTEN_NOT_COMMITTED,
    })

    expect(bySyncId.get("sync-committed-only")).toEqual({
      syncId: "sync-committed-only",
      orphanClass: "COMMITTED_NOT_REVEALED",
      action: "RESUMED",
      reasonCode: ORPHAN_REASON_COMMITTED_NOT_REVEALED_RETRY_REVEAL,
    })

    expect(bySyncId.get("sync-revealed-no-report")).toEqual({
      syncId: "sync-revealed-no-report",
      orphanClass: "REVEALED_NOT_REPORT_WRITTEN",
      action: "RESUMED",
      reasonCode: ORPHAN_REASON_REVEALED_NOT_REPORT_WRITTEN_RETRY_REPORT,
    })
  })

  it("enforces guardrail: reconciliation never calls payout, dispute, or severity mutation paths", () => {
    let resumedCount = 0
    let quarantinedCount = 0
    let payoutMutationCalls = 0
    let disputeMutationCalls = 0
    let severityMutationCalls = 0

    const result = reconcileVerifyPocOrphans(seededOrphanFixtures, {
      onResumed: () => {
        resumedCount += 1
      },
      onQuarantined: () => {
        quarantinedCount += 1
      },
      onPayoutMutation: () => {
        payoutMutationCalls += 1
      },
      onDisputeMutation: () => {
        disputeMutationCalls += 1
      },
      onSeverityMutation: () => {
        severityMutationCalls += 1
      },
    })

    expect(result.totalOrphans).toBe(3)
    expect(resumedCount).toBe(2)
    expect(quarantinedCount).toBe(1)
    expect(payoutMutationCalls).toBe(0)
    expect(disputeMutationCalls).toBe(0)
    expect(severityMutationCalls).toBe(0)
  })

  it("ignores intentionally suppressed strict-fail no-write records during orphan scanning", () => {
    const result = reconcileVerifyPocOrphans([
      {
        syncId: "sync-strict-fail-no-write",
        sapphireWritten: true,
        sepoliaCommitted: true,
        sepoliaRevealed: true,
        reportWritten: false,
        strictFailedNoWrite: true,
      } as VerifyPocReconciliationRecord,
    ])

    expect(result.totalScanned).toBe(1)
    expect(result.totalOrphans).toBe(0)
    expect(result.outcomes).toEqual([])
  })
})
