"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useDragDismissRef } from "@/components/ui/drag-dismiss"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-[color:var(--scrim)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none",
      className
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  "fixed z-50 gap-4 bg-surface text-foreground shadow-[0_-8px_32px_rgb(var(--text-rgb)/0.12)] transition ease-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:animate-none motion-reduce:transition-none motion-reduce:data-[state=closed]:duration-0 motion-reduce:data-[state=open]:duration-0",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b border-border data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[92svh] overflow-y-auto overscroll-contain rounded-t-xl border-t border-border data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r border-border data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right:
          "inset-y-0 right-0 h-full w-3/4 border-l border-border data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
      },
    },
    defaultVariants: {
      side: "bottom",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "bottom", className, children, ...props }, ref) => {
  const closeRef = React.useRef<HTMLButtonElement>(null)
  const contentRef = useDragDismissRef(ref, closeRef, {
    enabled: side === "bottom",
  })
  return (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={contentRef}
      className={cn(
        sheetVariants({ side }),
        "p-6",
        // Bottom sheets sit on the home indicator — pad the trailing edge so
        // their last control never tucks under it. Components that take over
        // padding (p-0) opt out and handle the inset on their own footer.
        side === "bottom" &&
          "pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className,
      )}
      {...props}
    >
      {side === "bottom" ? (
        <div
          aria-hidden
          className="mx-auto -mt-3 mb-3 h-1.5 w-10 rounded-full bg-border"
        />
      ) : null}
      {children}
      <SheetPrimitive.Close
        ref={closeRef}
        className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted ring-offset-background transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 disabled:pointer-events-none"
      >
        <X className="size-[1.125rem]" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-left", className)}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl font-bold tracking-[-0.01em] text-foreground",
      className
    )}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted", className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
