"use client"

import * as React from "react"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

// Dark-only app: pin the theme rather than depending on next-themes.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      richColors
      closeButton
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:rounded-md",
          description: "group-[.toast]:text-muted",
          actionButton:
            "group-[.toast]:bg-signal group-[.toast]:text-signal-foreground group-[.toast]:rounded-md",
          cancelButton:
            "group-[.toast]:bg-border group-[.toast]:text-foreground group-[.toast]:rounded-md",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
