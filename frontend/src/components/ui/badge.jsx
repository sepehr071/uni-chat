import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-accent/20 text-accent",
        secondary: "bg-background-tertiary text-foreground-secondary border border-border",
        destructive: "bg-destructive/20 text-destructive",
        success: "bg-success/20 text-success",
        warning: "bg-warning/20 text-warning",
        outline: "border border-border text-foreground-secondary",
        accent: "bg-accent text-white",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
