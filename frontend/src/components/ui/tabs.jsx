import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { motion, useReducedMotion } from "motion/react"

import { cn } from "@/lib/utils"

/**
 * Each <Tabs> root broadcasts its current value + a stable layoutId so
 * <TabsTrigger> children can render an animated underline only on the
 * active trigger. Framer auto-tweens the underline between triggers via
 * shared layoutId.
 */
const TabsCtx = React.createContext({ activeValue: undefined, layoutId: "tab-active" })

const Tabs = React.forwardRef(
  ({ value, defaultValue, onValueChange, children, ...props }, ref) => {
    const layoutIdSuffix = React.useId()
    const isControlled = value !== undefined
    const [internalValue, setInternalValue] = React.useState(defaultValue)
    const activeValue = isControlled ? value : internalValue

    const handleValueChange = React.useCallback(
      (next) => {
        if (!isControlled) setInternalValue(next)
        onValueChange?.(next)
      },
      [isControlled, onValueChange]
    )

    const ctx = React.useMemo(
      () => ({ activeValue, layoutId: `tab-active-${layoutIdSuffix}` }),
      [activeValue, layoutIdSuffix]
    )

    return (
      <TabsCtx.Provider value={ctx}>
        <TabsPrimitive.Root
          ref={ref}
          value={value}
          defaultValue={defaultValue}
          onValueChange={handleValueChange}
          {...props}
        >
          {children}
        </TabsPrimitive.Root>
      </TabsCtx.Provider>
    )
  }
)
Tabs.displayName = "Tabs"

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props} />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(({ className, children, value, ...props }, ref) => {
  const { activeValue, layoutId } = React.useContext(TabsCtx)
  const reduce = useReducedMotion()
  const isActive = activeValue !== undefined && activeValue === value

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      className={cn(
        // relative + overflow-visible so the motion underline can sit on the bottom edge.
        "relative inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className
      )}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
      {isActive && (
        <motion.span
          aria-hidden="true"
          layoutId={layoutId}
          transition={
            reduce
              ? { duration: 0 }
              : { type: "spring", stiffness: 500, damping: 40, duration: 0.2 }
          }
          className="pointer-events-none absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent"
        />
      )}
    </TabsPrimitive.Trigger>
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
