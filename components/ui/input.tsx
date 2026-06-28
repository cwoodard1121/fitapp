import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // text-base on mobile keeps inputs ≥16px so iOS Safari never
          // auto-zooms on focus; desktop drops back to the denser text-sm.
          "flex h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-base sm:text-sm text-foreground ring-offset-background transition-colors placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground motion-reduce:transition-none",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
