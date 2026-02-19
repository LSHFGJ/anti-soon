import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-mono font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
        success:
          "border-transparent bg-[#00ff9d]/20 text-[#00ff9d] border-[#00ff9d]/30",
        warning:
          "border-transparent bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/30",
        error:
          "border-transparent bg-[#ff003c]/20 text-[#ff003c] border-[#ff003c]/30",
        info:
          "border-transparent bg-[#00f0ff]/20 text-[#00f0ff] border-[#00f0ff]/30",
        critical:
          "border-transparent bg-[#ff003c]/20 text-[#ff003c] border-[#ff003c]/30",
        high:
          "border-transparent bg-[#ff8800]/20 text-[#ff8800] border-[#ff8800]/30",
        medium:
          "border-transparent bg-[#ffff00]/20 text-[#ffff00] border-[#ffff00]/30",
        low:
          "border-transparent bg-[#88ff88]/20 text-[#88ff88] border-[#88ff88]/30",
        unique:
          "border-transparent bg-[#00ff9d] text-[#0a0a0a]",
        multi:
          "border-transparent bg-[#00f0ff] text-[#0a0a0a]",
        open:
          "border-[#00ff9d]/50 bg-[#00ff9d]/10 text-[#00ff9d]",
        reveal:
          "border-[#00f0ff]/50 bg-[#00f0ff]/10 text-[#00f0ff]",
        closed:
          "border-[#ff003c]/50 bg-[#ff003c]/10 text-[#ff003c]",
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
