interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  color?: string
}

export function StatCard({ label, value, subValue, color = 'var(--color-primary)' }: StatCardProps) {
  const colorClass = color === 'var(--color-primary)' ? 'text-primary' :
                     color === 'var(--color-secondary)' ? 'text-secondary' :
                     color === 'var(--color-warning)' ? 'text-[var(--color-warning)]' :
                     color === 'var(--color-error)' ? 'text-error' :
                     color === 'var(--color-text)' ? 'text-[var(--color-text)]' :
                     'text-primary';

  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${colorClass}`}>{value}</div>
      {subValue && <div className="stat-sub">{subValue}</div>}
    </div>
  )
}
