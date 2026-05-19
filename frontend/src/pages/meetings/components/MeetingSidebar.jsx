import { Link } from 'react-router-dom'
import {
  ArrowRight,
  CheckSquare,
  ClipboardList,
  FileText,
  Gavel,
  HelpCircle,
  AlertCircle,
  Mail,
  MessageSquare,
  RefreshCw,
  Share2,
  Sparkles,
  Users,
  Clock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import MeetingStatus from './MeetingStatus'
import { cn } from '@/utils/cn'
import { dirOf, formatJalali } from '@/utils/rtl'

const ICON_MAP = {
  sparkles: Sparkles,
  check: CheckSquare,
  gavel: Gavel,
  help: HelpCircle,
  circleQ: AlertCircle,
  mail: Mail,
  doc: ClipboardList,
  list: FileText,
  chat: MessageSquare,
}

/**
 * Left rail for meeting detail. Tabs: summary, actions, decisions, qa, open,
 * email, minutes, transcript, discuss. Selecting `discuss` swaps the main pane
 * for an embedded chat seeded with this meeting's transcript+artifacts (no
 * navigation away from /meetings/:id).
 */
export default function MeetingSidebar({
  meetingId,
  title,
  duration,
  speakerCount,
  createdAt,
  active,
  onSelect,
  counts,
  initialStatus,
  onShare,
  onRegenerate,
  regenDisabled,
  regenPending,
  discussDisabled,
}) {
  const { t } = useTranslation('meetings')

  const GROUPS = [
    {
      label: t('sidebar.groupInsights'),
      items: [
        { id: 'summary', label: t('sidebar.summary'), icon: 'sparkles' },
        { id: 'actions', label: t('sidebar.actions'), icon: 'check' },
        { id: 'decisions', label: t('sidebar.decisions'), icon: 'gavel' },
        { id: 'qa', label: t('sidebar.qa'), icon: 'help' },
        { id: 'open', label: t('sidebar.open'), icon: 'circleQ' },
      ],
    },
    {
      label: t('sidebar.groupOutputs'),
      items: [
        { id: 'email', label: t('sidebar.email'), icon: 'mail' },
        { id: 'minutes', label: t('sidebar.minutes'), icon: 'doc' },
      ],
    },
    {
      label: t('sidebar.groupSources'),
      items: [
        { id: 'transcript', label: t('sidebar.transcript'), icon: 'list' },
      ],
    },
    {
      label: t('sidebar.groupExplore'),
      items: [
        {
          id: 'discuss',
          label: t('sidebar.discuss'),
          icon: 'chat',
          disabled: discussDisabled,
        },
      ],
    },
  ]

  return (
    <aside className="flex w-64 shrink-0 flex-col border-e border-border bg-background-elevated">
      <div className="border-b border-border px-4 py-4">
        <Link
          to="/meetings"
          className="inline-flex items-center gap-1.5 text-[11.5px] text-foreground-secondary transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-3 rtl:rotate-180" />
          {t('detail.allMeetings')}
        </Link>
        <h2
          dir={title ? dirOf(title) : undefined}
          className="mt-2 line-clamp-2 text-[15px] font-bold leading-snug tracking-tight text-foreground"
        >
          {title || '—'}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-foreground-tertiary">
          {duration && (
            <span
              className="inline-flex items-center gap-1 font-mono tabular-nums"
              dir="ltr"
            >
              <Clock className="size-3" />
              {duration}
            </span>
          )}
          {speakerCount != null && (
            <>
              <span aria-hidden="true">•</span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                {t('card.speakerCount', { count: speakerCount })}
              </span>
            </>
          )}
          {createdAt && (
            <>
              <span aria-hidden="true">•</span>
              <span>{formatJalali(createdAt)}</span>
            </>
          )}
        </div>
        <div className="mt-2.5">
          <MeetingStatus meetingId={meetingId} initialStatus={initialStatus} />
        </div>
      </div>

      <nav
        className="flex-1 overflow-y-auto px-2.5 py-3 scroll-thin"
        aria-label={t('sidebar.groupInsights')}
      >
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-2.5">
            <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-tertiary">
              {group.label}
            </div>
            <div className="flex flex-col gap-px">
              {group.items.map((tab) => {
                const Icon = ICON_MAP[tab.icon]
                const isActive = active === tab.id
                const count = counts?.[tab.id]
                const isDisabled = !!tab.disabled
                return (
                  <button
                    key={tab.id}
                    onClick={() => !isDisabled && onSelect(tab.id)}
                    disabled={isDisabled}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-start text-[13px] transition-colors',
                      isActive
                        ? 'bg-accent/10 font-semibold text-accent'
                        : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                      isDisabled && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-foreground-secondary'
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="flex-1">{tab.label}</span>
                    {count != null && count > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums',
                          isActive
                            ? 'bg-background-elevated text-foreground-secondary'
                            : 'bg-background-tertiary text-foreground-tertiary'
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex gap-1.5 border-t border-border p-3">
        <button
          type="button"
          onClick={onShare}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background-secondary text-xs text-foreground-secondary transition-colors hover:bg-background-tertiary"
        >
          <Share2 className="size-3" />
          {t('sidebar.share')}
        </button>
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenDisabled}
          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background-secondary text-xs text-foreground-secondary transition-colors hover:bg-background-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={cn('size-3', regenPending && 'animate-spin')} />
          {t('sidebar.regenerate')}
        </button>
      </div>
    </aside>
  )
}
