import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import Ptile from '@/components/teams/Ptile'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * AccessRow — workspace access row used inside ProjectAccessTab.
 * Matches design parts/project-settings.jsx:177.
 *
 * @param {string} icon         Lucide icon name (string, e.g. "Globe", "Layers").
 * @param {string} iconBg       CSS color used as the Ptile background.
 * @param {React.ReactNode} title
 * @param {React.ReactNode} sub
 * @param {string} value        Right-side dropdown trigger label.
 * @param {string} badge        Optional small "default" tag next to title.
 * @param {Array<{value, label, danger?}>} options  Dropdown options. If omitted,
 *                                                   trigger renders as static.
 * @param {(option) => void} onChange  Fired when an option is picked.
 * @param {boolean} disabled    When true, dropdown is non-interactive.
 * @param {string} className
 */
export default function AccessRow({
  icon,
  iconBg = '#5c9aed',
  title,
  sub,
  value,
  badge,
  options,
  onChange,
  disabled = false,
  className,
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const interactive = !disabled && Array.isArray(options) && options.length > 0

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-line bg-bg-2 px-3 py-2.5',
        className,
      )}
    >
      <Ptile size="sm" color={iconBg} icon={icon} />

      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg-0 truncate">{title}</span>
          {badge && (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 leading-tight">
              {badge}
            </Badge>
          )}
        </div>
        {sub && <span className="text-[11px] text-fg-3 truncate">{sub}</span>}
      </div>

      <div ref={wrapRef} className="relative flex-shrink-0">
        <button
          type="button"
          onClick={() => interactive && setOpen(o => !o)}
          disabled={!interactive}
          className={cn(
            'flex items-center gap-1 rounded-md border border-line-2 bg-bg-3 px-3 py-1 text-xs',
            interactive
              ? 'cursor-pointer hover:bg-bg-4 text-fg-1'
              : 'cursor-not-allowed text-fg-2',
          )}
        >
          <span>{value}</span>
          <ChevronDown className="h-3 w-3 text-fg-3" />
        </button>

        {open && interactive && (
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded-md border border-line bg-bg-2 shadow-lg overflow-hidden">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onChange?.(opt)
                }}
                className={cn(
                  'block w-full px-3 py-1.5 text-left text-xs hover:bg-bg-3',
                  opt.danger ? 'text-red-400' : 'text-fg-1',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
