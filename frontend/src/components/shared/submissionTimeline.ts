import type { TimelineStep } from '../../types'

export function getSubmissionTimeline(
  status: number,
  commitTimestamp: bigint,
  revealTimestamp: bigint,
  hasActiveDispute: boolean
): TimelineStep[] {
  const steps: TimelineStep[] = [
    { label: 'Committed', completed: status >= 0, active: status === 0, timestamp: commitTimestamp },
    { label: 'Revealed', completed: status >= 1, active: status === 1, timestamp: revealTimestamp },
  ]

  if (hasActiveDispute) {
    steps.push({ label: 'Disputed', completed: status >= 3, active: status === 3, timestamp: undefined })
  } else {
    steps.push({ label: 'Verified', completed: status >= 2, active: status === 2, timestamp: undefined })
  }

  steps.push({ label: 'Finalized', completed: status === 4, active: false, timestamp: undefined })

  return steps
}
