import { ChevronRight } from 'lucide-react'
import { Fragment } from 'react'
import { cn } from '@/lib/utils'

/**
 * PageHeader — breadcrumbs + title + actions row.
 * Matches design parts/shell.jsx:150.
 *
 * @param {Array<React.ReactNode>} crumbs
 * @param {React.ReactNode} title
 * @param {React.ReactNode} subtitle
 * @param {React.ReactNode} actions
 * @param {string} className
 */
export default function PageHeader({
  crumbs = [],
  title,
  subtitle,
  actions,
  className,
}) {
  return (
    <div
      className={cn(
        'flex-shrink-0 border-b border-line bg-bg-0',
        className,
      )}
      style={{ padding: '14px 24px' }}
    >
      {crumbs.length > 0 && (
        <div className="mb-2 flex items-center gap-2 text-[11px] text-fg-3">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span
                className={cn(
                  'truncate',
                  i === crumbs.length - 1 ? 'text-fg-1' : 'text-fg-3',
                )}
              >
                {c}
              </span>
            </Fragment>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="m-0 font-semibold text-fg-0"
            style={{ fontSize: 22, letterSpacing: '-0.022em' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="m-0 mt-1 text-[12.5px] text-fg-3"
            >
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
