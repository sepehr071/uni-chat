/**
 * Section header for meeting detail panels.
 *
 * @param {object} props
 * @param {string} props.kicker
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.actions]
 */
export default function PanelHeader({ kicker, title, subtitle, actions }) {
  return (
    <header className="mb-6">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-accent">
            {kicker}
          </p>
          <h1 className="mt-1 text-[28px] font-bold leading-[1.25] tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[13.5px] text-foreground-secondary">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
