import { cn } from '@/utils/cn'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Empty-state card with icon + title + hint.
 *
 * @param {object} props
 * @param {React.ComponentType<{className?: string}>} [props.icon]
 * @param {string} props.title
 * @param {React.ReactNode} [props.hint]
 * @param {'muted'|'destructive'} [props.tone='muted']
 * @param {string} [props.className]
 * @param {React.ReactNode} [props.children]
 */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  tone = 'muted',
  className,
  children,
}) {
  return (
    <Card className={cn('border-dashed bg-background-elevated/40', className)}>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        {Icon && (
          <span
            className={cn(
              'grid size-10 place-items-center rounded-full',
              tone === 'destructive'
                ? 'bg-error/10 text-error'
                : 'bg-background-tertiary text-foreground-secondary'
            )}
          >
            <Icon className="size-5" />
          </span>
        )}
        <p
          className={cn(
            'text-sm font-medium',
            tone === 'destructive' ? 'text-error' : 'text-foreground'
          )}
        >
          {title}
        </p>
        {hint && (
          <p className="max-w-sm text-xs leading-6 text-foreground-secondary">
            {hint}
          </p>
        )}
        {children}
      </CardContent>
    </Card>
  )
}
