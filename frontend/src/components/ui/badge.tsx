import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-mono font-semibold transition-all duration-200 ease-linear focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 uppercase tracking-wider",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary/10 text-primary shadow-[0_0_10px_var(--color-primary-dim)] hover:bg-primary/20",
        secondary:
          "border-transparent bg-secondary/10 text-secondary shadow-[0_0_10px_var(--color-secondary-dim)] hover:bg-secondary/20",
        destructive:
          "border-transparent bg-destructive/10 text-destructive shadow-[0_0_10px_var(--color-error-dim)] hover:bg-destructive/20",
        outline: "text-foreground border-neutral-800 hover:border-violet-500/30",
        success:
          "border-transparent bg-[var(--color-primary-dim)] text-[var(--color-primary)] border-[var(--color-primary)]/30 shadow-[0_0_10px_var(--color-primary-dim)]",
        warning:
          "border-transparent bg-[var(--color-warning-dim)] text-[var(--color-warning)] border-[var(--color-warning)]/30 shadow-[0_0_10px_var(--color-warning-dim)]",
        error:
          "border-transparent bg-[var(--color-error-dim)] text-[var(--color-error)] border-[var(--color-error)]/30 shadow-[0_0_10px_var(--color-error-dim)]",
        info:
          "border-transparent bg-[var(--color-info-dim)] text-[var(--color-info)] border-[var(--color-info)]/30 shadow-[0_0_10px_var(--color-info-dim)]",
        critical:
          "border-transparent bg-[var(--color-error-dim)] text-[var(--color-error)] border-[var(--color-error)]/30 shadow-[0_0_10px_var(--color-error-dim)]",
        high:
          "border-transparent bg-[var(--color-warning-dim)] text-[var(--color-warning)] border-[var(--color-warning)]/30 shadow-[0_0_10px_var(--color-warning-dim)]",
        medium:
          "border-transparent bg-[var(--color-gold)]/10 text-[var(--color-gold)] border-[var(--color-gold)]/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]",
        low:
          "border-transparent bg-[var(--color-primary-dim)] text-[var(--color-primary)] border-[var(--color-primary)]/30 shadow-[0_0_10px_var(--color-primary-dim)]",
        unique:
          "border-transparent bg-[var(--color-primary)] text-[var(--color-bg)] shadow-[0_0_15px_var(--color-primary-glow)]",
        multi:
          "border-transparent bg-[var(--color-secondary)] text-[var(--color-bg)] shadow-[0_0_15px_var(--color-secondary-glow)]",
        open:
          "border-[var(--color-primary)]/50 bg-[var(--color-primary-dim)] text-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary-dim)]",
        reveal:
          "border-[var(--color-secondary)]/50 bg-[var(--color-secondary-dim)] text-[var(--color-secondary)] shadow-[0_0_10px_var(--color-secondary-dim)]",
        closed:
          "border-[var(--color-error)]/50 bg-[var(--color-error-dim)] text-[var(--color-error)] shadow-[0_0_10px_var(--color-error-dim)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
