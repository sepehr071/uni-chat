import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parseISO } from 'date-fns'
import { ChevronDown, ChevronRight, Loader2, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import MarkdownRenderer from '../../../components/chat/MarkdownRenderer'
import { routinesService } from '../../../services/routinesService'
import { fmtDistanceToNow, fmtDate } from '../../../utils/dateLocale'
import { cn } from '../../../utils/cn'

const STATUS_STYLES = {
  success: 'bg-success/15 text-success border-success/30',
  failed: 'bg-error/15 text-error border-error/30',
  running: 'bg-accent/15 text-accent border-accent/30',
  skipped: 'bg-foreground-tertiary/15 text-foreground-tertiary border-foreground-tertiary/30',
}

function RunRow({ run }) {
  const { t } = useTranslation('routines')
  const [expanded, setExpanded] = useState(false)

  const startedAt = run.started_at ? parseISO(run.started_at) : null
  const timeLabel = startedAt
    ? fmtDistanceToNow(startedAt, { addSuffix: true })
    : '—'
  const fullDate = startedAt ? fmtDate(startedAt, 'MMM d, yyyy · h:mm a') : '—'

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-background-tertiary transition-colors text-start"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-foreground-tertiary flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-foreground-tertiary flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground-secondary font-mono" title={fullDate}>
              {timeLabel}
            </span>
            {run.result_meta?.model && (
              <span className="text-xs text-foreground-tertiary truncate hidden sm:block">
                {run.result_meta.model.split('/').pop()}
              </span>
            )}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn('text-xs capitalize flex-shrink-0', STATUS_STYLES[run.status] || STATUS_STYLES.skipped)}
        >
          {run.status}
        </Badge>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border bg-background-secondary/30">
          {run.status === 'failed' && run.error?.message && (
            <div className="mb-3 p-2 rounded bg-error/10 border border-error/20 text-xs text-error font-mono">
              {run.error.message}
            </div>
          )}
          {run.result_text ? (
            <div className="prose-sm text-sm text-foreground">
              <MarkdownRenderer content={run.result_text} />
            </div>
          ) : (
            <p className="text-xs text-foreground-tertiary italic">{t('history.noResultText')}</p>
          )}
          {run.delivered_to?.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-foreground-tertiary">{t('history.deliveredTo')}</span>
              {run.delivered_to.map((d) => (
                <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function RunHistoryPanel({ routineId }) {
  const { t } = useTranslation('routines')
  const { data, isLoading, error } = useQuery({
    queryKey: ['routine-runs', routineId],
    queryFn: () => routinesService.getRuns(routineId),
    enabled: !!routineId,
    staleTime: 30_000,
  })

  const runs = data?.runs || data || []

  if (!routineId) return null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-error py-4 text-center">{t('history.loadError')}</p>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
        <History className="h-8 w-8 text-foreground-tertiary" />
        <p className="text-sm text-foreground-secondary">{t('history.noRuns')}</p>
        <p className="text-xs text-foreground-tertiary">{t('history.noRunsHint')}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2 p-1">
        {runs.map((run) => (
          <RunRow key={run._id} run={run} />
        ))}
      </div>
    </ScrollArea>
  )
}
