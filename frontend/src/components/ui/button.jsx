import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-accent text-white shadow hover:bg-accent-hover",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: "border border-border bg-background shadow-sm hover:bg-background-tertiary hover:text-foreground",
        secondary: "bg-background-tertiary text-foreground shadow-sm hover:bg-background-elevated border border-border",
        ghost: "hover:bg-background-tertiary hover:text-foreground text-foreground-secondary",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// Motion animation presets
const motionPresets = {
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
}

const fastTransition = {
  duration: 0.15,
  ease: "easeOut",
}

const Button = React.forwardRef(({
  className,
  variant,
  size,
  asChild = false,
  animated = true,
  ...props
}, ref) => {
  // If asChild, use Slot (no animation wrapper)
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }

  // If animated, use motion.button
  if (animated) {
    return (
      <motion.button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        whileHover={props.disabled ? undefined : motionPresets.hover}
        whileTap={props.disabled ? undefined : motionPresets.tap}
        transition={fastTransition}
        {...props}
      />
    )
  }

  // Regular button
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button, buttonVariants }
