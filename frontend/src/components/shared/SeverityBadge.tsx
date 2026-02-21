import { SEVERITY_LABELS } from '../../types'

interface SeverityBadgeProps {
  severity: number
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const label = SEVERITY_LABELS[severity] || 'NONE'
  const className = label.toLowerCase()
  
  if (severity === 0) return <span className="text-[var(--color-text-dim)]">-</span>
  
  return (
    <span className={`severity-badge ${className}`}>
      {label}
    </span>
  )
}
