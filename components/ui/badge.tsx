import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-signal text-signal-foreground",
        secondary: "border-border bg-surface text-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-border bg-surface text-muted",
        destructive: "border-transparent bg-gate-red text-background",
        // Tinted indicator styles — quiet fills that read like lit gauges.
        signal: "border-signal/40 bg-signal/10 text-signal",
        success: "border-gate-green/40 bg-gate-green/10 text-gate-green",
        warning: "border-gate-yellow/40 bg-gate-yellow/10 text-gate-yellow",
        danger: "border-gate-red/40 bg-gate-red/10 text-gate-red",
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
