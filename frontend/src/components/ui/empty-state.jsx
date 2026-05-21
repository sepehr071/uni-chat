import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Canonical empty-state surface used by feature pages.
 *
 * Visual: centred column → large 48px icon tile → text-2xl title →
 * description → optional primary CTA → optional 2-col suggestion grid →
 * optional secondary link.
 *
 * Tokens only: `bg-background`, `text-foreground`, `border-border`,
 * `bg-accent/10`, etc. No new colour introduced.
 *
 * @param {object} props
 * @param {React.ComponentType<{className?: string}>} [props.icon]
 * @param {string} props.title
 * @param {React.ReactNode} [props.description]
 * @param {{label: string, onClick?: () => void, icon?: React.ComponentType<{className?: string}>, href?: string}} [props.primaryCta]
 * @param {Array<{label: string, icon?: React.ComponentType<{className?: string}>, onClick?: () => void}>} [props.suggestions]
 * @param {string} [props.secondaryHref]
 * @param {string} [props.secondaryLabel]
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  primaryCta,
  suggestions,
  secondaryHref,
  secondaryLabel,
  className,
  children,
}) {
  const items = (suggestions || []).slice(0, 4)
  const PrimaryIcon = primaryCta?.icon

  return (
    <div
      className={cn(
        'flex w-full flex-col items-center justify-center gap-5 px-6 py-16 text-center',
        className,
      )}
    >
      {Icon && (
        <div className="grid size-12 place-items-center rounded-2xl bg-accent/10 text-accent">
          <Icon className="size-6" />
        </div>
      )}

      <div className="flex max-w-md flex-col items-center gap-2">
        <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-sm leading-6 text-foreground-secondary">
            {description}
          </p>
        )}
      </div>

      {primaryCta && (
        primaryCta.href ? (
          <Button asChild>
            <a href={primaryCta.href}>
              {PrimaryIcon && <PrimaryIcon className="size-4" />}
              {primaryCta.label}
            </a>
          </Button>
        ) : (
          <Button onClick={primaryCta.onClick}>
            {PrimaryIcon && <PrimaryIcon className="size-4" />}
            {primaryCta.label}
          </Button>
        )
      )}

      {items.length > 0 && (
        <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((s, i) => {
            const SIcon = s.icon
            return (
              <button
                key={i}
                type="button"
                onClick={s.onClick}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border border-border bg-background',
                  'px-4 py-3 text-start text-sm text-foreground transition-colors',
                  'hover:border-foreground-tertiary hover:bg-background-tertiary',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                )}
              >
                {SIcon && (
                  <span className="grid size-7 place-items-center rounded-md bg-background-tertiary text-foreground-secondary group-hover:bg-background-elevated">
                    <SIcon className="size-3.5" />
                  </span>
                )}
                <span className="flex-1 leading-snug">{s.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {secondaryHref && (
        <a
          href={secondaryHref}
          className="text-xs text-foreground-secondary underline-offset-4 hover:text-foreground hover:underline"
        >
          {secondaryLabel || 'Learn more →'}
        </a>
      )}

      {children}
    </div>
  )
}
