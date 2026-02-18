import { SEVERITY_LABELS, SEVERITY_COLORS } from '../../types'

interface SeverityBadgeProps {
  severity: number
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const label = SEVERITY_LABELS[severity] || 'NONE'
  const color = SEVERITY_COLORS[label]
  const className = label.toLowerCase()
  
  if (severity === 0) return <span style={{ color: 'var(--color-text-dim)' }}>-</span>
  
  return (
    <span className={`severity-badge ${className}`} style={{ color }}>
      {label}
    </span>
  )
}
