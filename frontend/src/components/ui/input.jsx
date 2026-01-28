import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-lg border bg-background text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-foreground-tertiary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-border focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
        ghost: "border-transparent bg-background-tertiary focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20",
        error: "border-error focus-visible:border-error focus-visible:ring-2 focus-visible:ring-error/20",
      },
      size: {
        sm: "h-8 px-3 py-1 text-xs",
        default: "h-10 px-4 py-2 text-sm",
        lg: "h-12 px-4 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Input = React.forwardRef(({ className, type, variant, size, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(inputVariants({ variant, size }), className)}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input, inputVariants }
