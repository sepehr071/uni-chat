import { cn } from '@/lib/utils'

/**
 * StatTile — labeled stat card with optional accent halo.
 * Matches design parts/shell.jsx:194.
 *
 * @param {string} label
 * @param {React.ReactNode} value
 * @param {React.ReactNode} hint
 * @param {string} accent  CSS color string for the blurred halo (e.g. 'hsl(var(--accent))')
 * @param {string} className
 */
export default function StatTile({ label, value, hint, accent, className }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-bg-1 p-4',
        className,
      )}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
        {label}
      </div>
      <div
        className="mt-1.5 font-semibold text-fg-0"
        style={{ fontSize: 26, letterSpacing: '-0.02em', lineHeight: 1.1 }}
      >
        {value}
      </div>
      {hint && (
        <div className="mt-2 text-[11px] text-fg-3">{hint}</div>
      )}
      {accent && (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            right: -20,
            top: -20,
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: accent,
            opacity: 0.08,
            filter: 'blur(20px)',
          }}
        />
      )}
    </div>
  )
}
