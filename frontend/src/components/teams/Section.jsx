import { cn } from '@/lib/utils'

/**
 * Section — bordered card with header (title + optional hint + optional action) and body.
 * Matches design parts/shell.jsx:177.
 *
 * @param {React.ReactNode} title
 * @param {React.ReactNode} hint
 * @param {React.ReactNode} action
 * @param {React.ReactNode} children
 * @param {boolean} padded  Whether to pad the body region. Default true.
 * @param {string} className
 * @param {string} bodyClassName
 */
export default function Section({
  title,
  hint,
  action,
  children,
  padded = true,
  className,
  bodyClassName,
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-bg-1',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          {title && (
            <h3 className="text-[13px] font-semibold leading-tight text-fg-1">
              {title}
            </h3>
          )}
          {hint && (
            <span className="text-[11px] text-fg-3 truncate">{hint}</span>
          )}
        </div>
        {action && <div className="flex items-center gap-2 flex-shrink-0">{action}</div>}
      </div>
      <div className={cn(padded ? 'p-4' : '', bodyClassName)}>{children}</div>
    </div>
  )
}
