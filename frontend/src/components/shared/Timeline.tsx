import type { TimelineStep } from '../../types'

interface TimelineProps {
  steps: TimelineStep[]
}

export function Timeline({ steps }: TimelineProps) {
  return (
    <div className="timeline">
      {steps.map((step, index) => (
        <div key={step.label} className="timeline-step-container contents">
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
