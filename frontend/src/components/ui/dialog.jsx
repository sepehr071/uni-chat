import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      // hoosh-style backdrop: subtle blur + soft foreground tint that reads
      // in both light and dark modes (foreground token flips per theme).
      "fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm",
      "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
      "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
      "motion-safe:duration-200",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef(({ className, children, showClose = true, ...props }, ref) => {
  const { t } = useTranslation('common')
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4",
          "border border-border bg-background-elevated rounded-xl p-6 shadow-dropdown",
          // hoosh-style scale-in panel: 0.95 -> 1 + slight downward offset, 0.2s.
          // tailwindcss-animate handles the mount/unmount lifecycle for us so we
          // don't have to fight Radix's portal-based controlled-open mounting.
          "motion-safe:duration-200",
          "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
          "motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=open]:zoom-in-95",
          "motion-safe:data-[state=closed]:slide-out-to-top-[52%] motion-safe:data-[state=open]:slide-in-from-top-[52%]",
          "motion-safe:data-[state=closed]:slide-out-to-left-1/2 motion-safe:data-[state=open]:slide-in-from-left-1/2",
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute end-4 top-4 rounded-lg p-1.5 text-foreground-tertiary opacity-70 transition-all hover:opacity-100 hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">{t('actions.close')}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col space-y-2 text-center sm:text-start", className)}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-foreground-secondary", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
