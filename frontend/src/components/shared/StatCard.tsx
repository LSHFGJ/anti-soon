interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  color?: string
}

export function StatCard({ label, value, subValue, color = 'var(--color-primary)' }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color }}>{value}</div>
      {subValue && <div className="stat-sub">{subValue}</div>}
    </div>
  )
}
