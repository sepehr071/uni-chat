import * as React from "react"
import * as AvatarPrimitive from "@radix-ui/react-avatar"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const avatarVariants = cva(
  "relative flex shrink-0 overflow-hidden",
  {
    variants: {
      size: {
        sm: "h-8 w-8",
        default: "h-10 w-10",
        lg: "h-12 w-12",
        xl: "h-16 w-16",
      },
      shape: {
        circle: "rounded-full",
        square: "rounded-lg",
      },
    },
    defaultVariants: {
      size: "default",
      shape: "circle",
    },
  }
)

const Avatar = React.forwardRef(({ className, size, shape, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(avatarVariants({ size, shape }), className)}
    {...props}
  />
))
Avatar.displayName = AvatarPrimitive.Root.displayName

const AvatarImage = React.forwardRef(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
))
AvatarImage.displayName = AvatarPrimitive.Image.displayName

/**
 * Build a DiceBear initials SVG URL. Public HTTP API — no dep, no key, CORS-friendly.
 * Sky-blue background mirrors the Wave A primary token (#0ea5e9).
 */
function diceBearUrl(seed, { style = "initials", background = "0ea5e9", textColor = "ffffff" } = {}) {
  const s = encodeURIComponent(String(seed || "?"))
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${s}&backgroundColor=${background}&textColor=${textColor}`
}

/**
 * DiceBear-powered fallback. Renders an <img> sourced from DiceBear's public
 * HTTP API; on network error (or when no `seed` is supplied) it falls back to
 * the children (existing letter-circle pattern) so call sites stay
 * backwards-compatible.
 *
 * Cache strategy: relies on the natural HTTP cache via the <img> tag — the
 * DiceBear endpoint sets long cache headers + the URL is deterministic per
 * (seed, style, color), so re-mounts don't re-fetch. No SW/in-memory layer.
 *
 * Children passed in act as the letter fallback rendered when the SVG
 * fails or no seed is available — keeps the original API working.
 */
const AvatarFallback = React.forwardRef(
  (
    {
      className,
      children,
      seed,
      dicebear = true,
      dicebearStyle = "initials",
      background = "0ea5e9",
      textColor = "ffffff",
      ...props
    },
    ref
  ) => {
    const [errored, setErrored] = React.useState(false)
    // Default seed = stringified children (e.g. 'A' from an existing letter
    // fallback) so legacy call sites get DiceBear without modification.
    const resolvedSeed =
      seed != null
        ? seed
        : typeof children === "string" || typeof children === "number"
          ? String(children)
          : null
    const showDicebear = dicebear && !!resolvedSeed && !errored

    return (
      <AvatarPrimitive.Fallback
        ref={ref}
        className={cn(
          "flex h-full w-full items-center justify-center bg-accent/20 text-accent font-medium",
          className
        )}
        {...props}
      >
        {showDicebear ? (
          <img
            src={diceBearUrl(resolvedSeed, { style: dicebearStyle, background, textColor })}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
            draggable={false}
          />
        ) : (
          children
        )}
      </AvatarPrimitive.Fallback>
    )
  }
)
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName

export { Avatar, AvatarImage, AvatarFallback, avatarVariants, diceBearUrl }
