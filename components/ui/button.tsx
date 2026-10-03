import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-[0.9375rem] font-semibold tracking-[-0.005em] ring-offset-background transition-[color,background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-signal text-signal-foreground hover:bg-signal/90 active:bg-signal/80",
        ink: "bg-foreground text-background hover:bg-foreground/90 active:bg-foreground/80",
        outline:
          "border border-border bg-surface text-foreground hover:bg-surface-2 active:bg-surface-2",
        ghost: "bg-transparent text-foreground hover:bg-surface-2 active:bg-surface-2",
        secondary:
          "bg-surface-2 text-foreground hover:bg-border/70 active:bg-border",
        destructive: "bg-gate-red text-white hover:bg-gate-red/90 active:bg-gate-red/80",
        link: "text-signal underline-offset-4 hover:underline",
      },
      size: {
        default: "h-12 px-5",
        sm: "h-10 rounded-md px-4 text-sm",
        lg: "h-14 rounded-lg px-7 text-base",
        touch: "h-14 w-full rounded-lg px-6 text-base",
        icon: "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
