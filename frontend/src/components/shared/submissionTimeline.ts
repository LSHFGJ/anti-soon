import type { TimelineStep } from '../../types'
import { getActualStatus } from '../../lib/status'

export function getSubmissionTimeline(
  status: number,
  commitTimestamp: bigint,
  revealTimestamp: bigint,
  hasActiveDispute: boolean,
  lifecycleStatus?: number
): TimelineStep[] {
  const actualStatus = getActualStatus(status, lifecycleStatus)

  const steps: TimelineStep[] = [
    { label: 'Committed', completed: actualStatus >= 0, active: actualStatus === 0, timestamp: commitTimestamp },
    { label: 'Revealed', completed: actualStatus >= 1, active: actualStatus === 1, timestamp: revealTimestamp },
  ]

  if (actualStatus === 5) {
    steps.push({ label: 'Invalid', completed: true, active: false, timestamp: undefined })
    return steps
  }

  if (actualStatus === 6) {
    steps.push({ label: 'Pending Review', completed: false, active: true, timestamp: undefined })
    steps.push({ label: 'Jury Phase', completed: false, active: false, timestamp: undefined })
    return steps
  }

  if (actualStatus === 7) {
    steps.push({ label: 'Pending Review', completed: false, active: true, timestamp: undefined })
    steps.push({ label: 'Adjudication', completed: false, active: false, timestamp: undefined })
    return steps
  }

  if (hasActiveDispute || actualStatus === 3) {
    steps.push({ label: 'Disputed', completed: actualStatus >= 4, active: actualStatus === 3, timestamp: undefined })
  } else {
    steps.push({ label: 'Verified', completed: actualStatus >= 2, active: actualStatus === 2, timestamp: undefined })
  }

  steps.push({ label: 'Finalized', completed: actualStatus === 4, active: false, timestamp: undefined })

  return steps
}
