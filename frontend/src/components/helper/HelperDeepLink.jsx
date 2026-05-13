import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Styled internal navigation chip emitted by the helper assistant.
 * Renders as a chip-shaped React Router `<Link>` — never `window.open` or
 * a raw `<a>` for internal routes.
 */
export default function HelperDeepLink({ to, children, className }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5',
        'bg-accent/10 text-accent hover:bg-accent/20',
        'text-sm font-medium no-underline transition-colors',
        'align-middle',
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <ArrowUpRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
    </Link>
  )
}
