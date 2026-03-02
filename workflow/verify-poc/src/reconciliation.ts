export const ORPHAN_REASON_SAPPHIRE_WRITTEN_NOT_COMMITTED =
  "ORPHAN_SAPPHIRE_WRITTEN_NOT_COMMITTED" as const
export const ORPHAN_REASON_COMMITTED_NOT_REVEALED_RETRY_REVEAL =
  "ORPHAN_COMMITTED_NOT_REVEALED_RETRY_REVEAL" as const
export const ORPHAN_REASON_REVEALED_NOT_REPORT_WRITTEN_RETRY_REPORT =
  "ORPHAN_REVEALED_NOT_REPORT_WRITTEN_RETRY_REPORT" as const

export type VerifyPocOrphanClass =
  | "SAPPHIRE_WRITTEN_NOT_COMMITTED"
  | "COMMITTED_NOT_REVEALED"
  | "REVEALED_NOT_REPORT_WRITTEN"

export type VerifyPocReconciliationAction = "RESUMED" | "QUARANTINED"

export type VerifyPocReconciliationReasonCode =
  | typeof ORPHAN_REASON_SAPPHIRE_WRITTEN_NOT_COMMITTED
  | typeof ORPHAN_REASON_COMMITTED_NOT_REVEALED_RETRY_REVEAL
  | typeof ORPHAN_REASON_REVEALED_NOT_REPORT_WRITTEN_RETRY_REPORT

export type VerifyPocReconciliationRecord = {
  syncId: string
  sapphireWritten: boolean
  sepoliaCommitted: boolean
  sepoliaRevealed: boolean
  reportWritten: boolean
}

export type VerifyPocReconciliationOutcome = {
  syncId: string
  orphanClass: VerifyPocOrphanClass
  action: VerifyPocReconciliationAction
  reasonCode: VerifyPocReconciliationReasonCode
}

export type VerifyPocReconciliationHandlers = {
  onResumed?: (outcome: VerifyPocReconciliationOutcome) => void
  onQuarantined?: (outcome: VerifyPocReconciliationOutcome) => void
  onPayoutMutation?: (syncId: string) => void
  onDisputeMutation?: (syncId: string) => void
  onSeverityMutation?: (syncId: string) => void
}

export type VerifyPocReconciliationScanResult = {
  totalScanned: number
  totalOrphans: number
  outcomes: VerifyPocReconciliationOutcome[]
}

function classifyOrphan(
  record: VerifyPocReconciliationRecord,
): VerifyPocOrphanClass | null {
  if (record.sapphireWritten && !record.sepoliaCommitted) {
    return "SAPPHIRE_WRITTEN_NOT_COMMITTED"
  }

  if (record.sepoliaCommitted && !record.sepoliaRevealed) {
    return "COMMITTED_NOT_REVEALED"
  }

  if (record.sepoliaRevealed && !record.reportWritten) {
    return "REVEALED_NOT_REPORT_WRITTEN"
  }

  return null
}

function resolveOrphan(
  syncId: string,
  orphanClass: VerifyPocOrphanClass,
): VerifyPocReconciliationOutcome {
  if (orphanClass === "SAPPHIRE_WRITTEN_NOT_COMMITTED") {
    return {
      syncId,
      orphanClass,
      action: "QUARANTINED",
      reasonCode: ORPHAN_REASON_SAPPHIRE_WRITTEN_NOT_COMMITTED,
    }
  }

  if (orphanClass === "COMMITTED_NOT_REVEALED") {
    return {
      syncId,
      orphanClass,
      action: "RESUMED",
      reasonCode: ORPHAN_REASON_COMMITTED_NOT_REVEALED_RETRY_REVEAL,
    }
  }

  return {
    syncId,
    orphanClass,
    action: "RESUMED",
    reasonCode: ORPHAN_REASON_REVEALED_NOT_REPORT_WRITTEN_RETRY_REPORT,
  }
}

export function reconcileVerifyPocOrphans(
  records: readonly VerifyPocReconciliationRecord[],
  handlers: VerifyPocReconciliationHandlers = {},
): VerifyPocReconciliationScanResult {
  const outcomes: VerifyPocReconciliationOutcome[] = []

  for (const record of records) {
    const orphanClass = classifyOrphan(record)
    if (!orphanClass) {
      continue
    }

    const outcome = resolveOrphan(record.syncId, orphanClass)
    outcomes.push(outcome)

    if (outcome.action === "RESUMED") {
      handlers.onResumed?.(outcome)
      continue
    }

    handlers.onQuarantined?.(outcome)
  }

  return {
    totalScanned: records.length,
    totalOrphans: outcomes.length,
    outcomes,
  }
}
