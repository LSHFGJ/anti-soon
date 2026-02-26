export type TimedDecryptPolicyInput = {
  submitter: string
  requester: string
  currentTimestamp: number
  submissionDeadlineTimestamp: number
}

export type TimedDecryptPhase = "pre_deadline" | "post_deadline"

export type TimedDecryptDecisionReason =
  | "submitter_pre_deadline"
  | "non_submitter_pre_deadline_denied"
  | "post_deadline_public"

export type TimedDecryptDecision = {
  allowed: boolean
  phase: TimedDecryptPhase
  reason: TimedDecryptDecisionReason
  submitter: string
  requester: string
  currentTimestamp: number
  submissionDeadlineTimestamp: number
}

function normalizeAddress(value: string): string {
  return value.toLowerCase()
}

export function evaluateTimedDecryptPolicy(input: TimedDecryptPolicyInput): TimedDecryptDecision {
  const submitter = normalizeAddress(input.submitter)
  const requester = normalizeAddress(input.requester)
  const currentTimestamp = Math.floor(input.currentTimestamp)
  const submissionDeadlineTimestamp = Math.floor(input.submissionDeadlineTimestamp)

  if (currentTimestamp < submissionDeadlineTimestamp) {
    const allowed = requester === submitter
    return {
      allowed,
      phase: "pre_deadline",
      reason: allowed ? "submitter_pre_deadline" : "non_submitter_pre_deadline_denied",
      submitter,
      requester,
      currentTimestamp,
      submissionDeadlineTimestamp,
    }
  }

  return {
    allowed: true,
    phase: "post_deadline",
    reason: "post_deadline_public",
    submitter,
    requester,
    currentTimestamp,
    submissionDeadlineTimestamp,
  }
}
