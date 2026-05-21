import { useTranslation } from 'react-i18next'
import { GitBranch, Check } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Shared sub-components used by BranchesPanel + AttachmentsPanel.
 * Section header, branch row, stats grid — kept slim so the tab bodies
 * remain pure layout.
 */

export function RailSection({ title, count, children, className }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
        <span className="text-xs font-semibold text-foreground-tertiary tracking-wider">
          {title}
          {count != null && (
            <span className="ms-1 text-foreground-tertiary/60">({count})</span>
          )}
        </span>
      </div>
      <div className="px-3">{children}</div>
    </div>
  )
}

export function BranchRow({ branch, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs transition-colors text-start',
        isActive
          ? 'bg-accent/15 text-accent'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
      )}
    >
      <GitBranch className="h-3 w-3 flex-shrink-0" />
      <span className="truncate flex-1">{branch.name}</span>
      {isActive && <Check className="h-3 w-3 flex-shrink-0" />}
    </button>
  )
}

export function StatGrid({ stats, messages = [], conversation }) {
  const { t } = useTranslation('chat')
  const turnCount = messages.filter((m) => m.role === 'user').length
  const totalTokens = messages.reduce((sum, m) => sum + (m.token_count || m.tokens || 0), 0)

  const startedAt = conversation?.created_at
    ? new Date(conversation.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  const items = [
    { label: t('contextRail.statTokens'), value: stats?.tokens ?? (totalTokens > 0 ? totalTokens.toLocaleString() : '—') },
    { label: t('contextRail.statTurns'), value: stats?.turns ?? turnCount },
    { label: t('contextRail.statStarted'), value: stats?.started ?? startedAt },
  ]

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map(({ label, value }) => (
        <div key={label} className="flex flex-col gap-0.5">
          <span className="text-[10px] text-foreground-tertiary uppercase tracking-wide">{label}</span>
          <span className="text-xs font-mono text-foreground">{value}</span>
        </div>
      ))}
    </div>
  )
}
