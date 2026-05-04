import * as Lucide from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_CLASSES = {
  sm: 'w-6 h-6 rounded-md text-[11px]',
  md: 'w-8 h-8 rounded-lg text-sm',
  lg: 'w-10 h-10 rounded-xl text-base',
}

const ICON_SIZES = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

function resolveIcon(iconName) {
  if (!iconName || typeof iconName !== 'string') return null
  // Map design-token names to lucide-react PascalCase exports.
  const direct = Lucide[iconName]
  if (direct) return direct
  const pascal = iconName
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  return Lucide[pascal] || null
}

/**
 * Ptile — colored project tile with letter or icon.
 * Matches design parts/shell.jsx ptile / ptile-sm / ptile-lg styles.
 *
 * @param {string} color  Solid CSS color used as fill.
 * @param {string|React.ComponentType} icon  Lucide icon name (string) or component.
 * @param {string} letter  Single character / short label fallback when no icon.
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} gradient  If true, render a 135deg gradient from color to color+cc.
 * @param {string} className
 */
export default function Ptile({
  color = 'hsl(var(--accent))',
  icon,
  letter,
  size = 'md',
  gradient = false,
  className,
}) {
  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.md
  const iconSizeCls = ICON_SIZES[size] || ICON_SIZES.md

  const IconComp =
    typeof icon === 'function' ? icon : resolveIcon(icon)

  const background = gradient
    ? `linear-gradient(135deg, ${color}, ${color}cc)`
    : color

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center font-semibold text-white flex-shrink-0',
        sizeCls,
        className,
      )}
      style={{
        background,
        letterSpacing: '-0.02em',
      }}
    >
      {IconComp ? (
        <IconComp className={iconSizeCls} strokeWidth={2} />
      ) : (
        letter || ''
      )}
    </span>
  )
}
