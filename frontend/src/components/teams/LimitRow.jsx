import { cn } from '@/lib/utils'

/**
 * LimitRow — labeled progress row for budgets/limits.
 *
 * @param {string} label
 * @param {number} used
 * @param {number} cap
 * @param {string} unit  prefix unit (e.g. '$', '€'). Default '$'. Use '' for token counts etc.
 * @param {string} className
 */
export default function LimitRow({ label, used = 0, cap = 0, unit = '$', className }) {
  const safeCap = cap > 0 ? cap : 1
  const pct = Math.min(100, (used / safeCap) * 100)
  const fillCls =
    pct > 80 ? 'bg-err' : pct > 60 ? 'bg-warn' : 'bg-ok'

  const fmt = (n) => {
    if (typeof n !== 'number') return n
    return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-fg-1">{label}</span>
        <span className="font-mono text-[11px] text-fg-3">
          {unit}
          {fmt(used)} / {unit}
          {fmt(cap)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-3">
        <div
          className={cn('h-full transition-[width] duration-200', fillCls)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
