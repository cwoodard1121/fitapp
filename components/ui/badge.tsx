import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-1 text-xs font-semibold leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-signal text-signal-foreground",
        secondary: "border-transparent bg-surface-2 text-foreground",
        outline: "border-border bg-transparent text-foreground",
        muted: "border-transparent bg-surface-2 text-muted",
        destructive: "border-transparent bg-gate-red text-white",
        signal: "border-transparent bg-signal/10 text-signal",
        success: "border-transparent bg-gate-green/10 text-gate-green",
        warning: "border-transparent bg-gate-yellow/15 text-gate-yellow",
        danger: "border-transparent bg-gate-red/10 text-gate-red",
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
