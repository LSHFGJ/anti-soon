import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type BannerVariant = 'info' | 'success' | 'warning' | 'error'

const bannerStyles: Record<BannerVariant, string> = {
  info: 'border-[var(--color-info)]/30 bg-[var(--color-info-dim)] text-[var(--color-info)] shadow-[0_0_15px_var(--color-info-dim)]',
  success: 'border-[var(--color-primary)]/30 bg-[var(--color-primary-dim)] text-[var(--color-primary)] shadow-[0_0_15px_var(--color-primary-dim)]',
  warning: 'border-[var(--color-warning)]/30 bg-[var(--color-warning-dim)] text-[var(--color-warning)] shadow-[0_0_15px_var(--color-warning-dim)]',
  error: 'border-[var(--color-error)]/30 bg-[var(--color-error-dim)] text-[var(--color-error)] shadow-[0_0_15px_var(--color-error-dim)]'
}

function isBannerVariant(value: string): value is BannerVariant {
  return value in bannerStyles
}

type PanelTone = 'default' | 'primary' | 'warning' | 'error'

const panelToneStyles: Record<PanelTone, string> = {
  default: 'border-[var(--color-bg-light)]',
  primary: 'border-[var(--color-primary)]',
  warning: 'border-[var(--color-warning)]',
  error: 'border-[var(--color-error)]'
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  suffix?: ReactNode
  rightSlot?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, suffix, rightSlot, className }: PageHeaderProps) {
  const hasMetaSlots = Boolean(suffix || rightSlot)

  return (
    <header className={cn('mb-6 flex-shrink-0', className)}>
      <div className="mb-2 flex flex-wrap items-end gap-x-4 gap-y-2 md:gap-y-1">
        <h1 className="text-2xl font-mono uppercase tracking-[0.1em] text-[var(--color-primary)] leading-none">
          {title}
        </h1>

        {hasMetaSlots ? (
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {suffix}
            {rightSlot}
          </div>
        ) : null}
      </div>
      <div className="h-0.5 bg-gradient-to-r from-[var(--color-primary)] to-transparent w-40" />
      {subtitle ? (
        <p className="text-[var(--color-text-dim)] mt-2 font-mono text-xs">{subtitle}</p>
      ) : null}
    </header>
  )
}

interface NeonPanelProps {
  children: ReactNode
  tone?: PanelTone
  className?: string
  contentClassName?: string
}

export function NeonPanel({ children, tone = 'default', className, contentClassName }: NeonPanelProps) {
  return (
    <Card
      className={cn(
        'bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800 shadow-[0_0_40px_rgba(124,58,237,0.4)] transition-all duration-200 ease-linear hover:border-neutral-800',
        panelToneStyles[tone],
        className
      )}
    >
      <CardContent className={cn('p-4', contentClassName)}>{children}</CardContent>
    </Card>
  )
}

interface StatusBannerProps {
  message: ReactNode
  variant?: BannerVariant | string
  className?: string
}

export function StatusBanner({ message, variant = 'info', className }: StatusBannerProps) {
  if (!isBannerVariant(variant)) {
    throw new Error(`Unknown StatusBanner variant: "${variant}". Expected one of: info, success, warning, error.`)
  }

  return (
    <Card
      data-testid="status-banner"
      data-status-variant={variant}
      className={cn('flex-shrink-0', bannerStyles[variant], className)}
    >
      <CardContent className="p-4 font-mono text-sm">{message}</CardContent>
    </Card>
  )
}

interface MetaRowProps {
  label: string
  value: ReactNode
  inline?: boolean
  className?: string
  labelClassName?: string
  valueClassName?: string
}

export function MetaRow({
  label,
  value,
  inline = false,
  className,
  labelClassName,
  valueClassName
}: MetaRowProps) {
  if (inline) {
    return (
      <div className={cn('flex justify-between items-center', className)}>
        <span className={cn('text-[var(--color-text-dim)]', labelClassName)}>{label}</span>
        <span className={cn('text-[var(--color-text)]', valueClassName)}>{value}</span>
      </div>
    )
  }

  return (
    <div className={className}>
      <span className={cn('text-[var(--color-text-dim)] block mb-1 text-xs uppercase tracking-wider', labelClassName)}>
        {label}
      </span>
      <span className={cn('text-[var(--color-text)]', valueClassName)}>{value}</span>
    </div>
  )
}
