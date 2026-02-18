import type { TimelineStep } from '../../types'

interface TimelineProps {
  steps: TimelineStep[]
}

export function Timeline({ steps }: TimelineProps) {
  return (
    <div className="timeline">
      {steps.map((step, index) => (
        <div key={step.label} className="timeline-step-container" style={{ display: 'contents' }}>
          <div className={`timeline-step ${step.completed ? 'completed' : ''} ${step.active ? 'active' : ''}`}>
            <div className="timeline-dot">
              {step.completed ? '✓' : index + 1}
            </div>
            <div className="timeline-label">{step.label}</div>
          </div>
          {index < steps.length - 1 && (
            <div className={`timeline-connector ${step.completed ? 'completed' : ''}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export function getSubmissionTimeline(
  status: number, 
  commitTimestamp: bigint, 
  revealTimestamp: bigint, 
  challenged: boolean
): TimelineStep[] {
  const steps: TimelineStep[] = [
    { label: 'Committed', completed: status >= 0, active: status === 0, timestamp: commitTimestamp },
    { label: 'Revealed', completed: status >= 1, active: status === 1, timestamp: revealTimestamp },
  ]
  
  if (challenged) {
    steps.push({ label: 'Disputed', completed: status >= 3, active: status === 3, timestamp: undefined })
  } else {
    steps.push({ label: 'Verified', completed: status >= 2, active: status === 2, timestamp: undefined })
  }
  
  steps.push({ label: 'Finalized', completed: status === 4, active: false, timestamp: undefined })
  
  return steps
}
