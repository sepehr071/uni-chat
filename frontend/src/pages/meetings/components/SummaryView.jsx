import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckSquare,
  AlertCircle,
  FileText,
  Gavel,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import EmptyState from './EmptyState'
import PanelHeader from './PanelHeader'
import { getSummary } from '@/services/meetingsService'
import { formatJalali } from '@/utils/rtl'

function isNotFound(err) {
  if (!err) return false
  const status = err?.response?.status
  if (status === 404) return true
  return err instanceof Error && err.message?.startsWith('404 ')
}

function firstSentence(text) {
  const s = text.trim()
  const m = s.match(/^[^.!?؟]+[.!?؟]?/)
  if (!m) return s.slice(0, 120)
  return m[0].length < 6 ? s.slice(0, 120) : m[0]
}

function InsightTile({ icon, toneClass, value, label, sub }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-background-elevated p-5">
      <span
        className={`grid size-8 place-items-center rounded-lg ${toneClass}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div>
        <div className="text-[28px] font-bold leading-none tracking-tight text-foreground">
          {value}
        </div>
        <div className="mt-1 text-[13px] font-medium text-foreground">{label}</div>
        {sub && (
          <div className="mt-0.5 text-[11.5px] text-foreground-tertiary">
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

export default function SummaryView({ meetingId }) {
  const { t } = useTranslation('meetings')
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['summary', meetingId],
    queryFn: () => getSummary(meetingId),
    retry: false,
  })

  if (isLoading) {
    return (
      <>
        <PanelHeader kicker={t('panels.summary.kicker')} title="…" />
        <div className="space-y-2">
          <div className="h-7 w-3/4 rounded animate-shimmer" />
          <div className="h-7 w-full rounded animate-shimmer" />
          <div className="h-7 w-5/6 rounded animate-shimmer" />
        </div>
      </>
    )
  }

  if (isError) {
    if (isNotFound(error)) {
      return (
        <EmptyState
          icon={FileText}
          title={t('panels.summary.notReady')}
          hint={t('panels.summary.notReadyHint')}
        />
      )
    }
    return (
      <EmptyState
        icon={AlertTriangle}
        title={t('panels.summary.error')}
        tone="destructive"
      />
    )
  }

  if (!data) return null

  const exec = (data.exec_summary ?? '').trim()
  const headline = exec ? firstSentence(exec) : t('panels.summary.fallbackTitle')

  const actionItems = data.action_items ?? []
  const decisions = data.decisions ?? []
  const openQuestions = data.open_questions ?? []
  const datedActions = actionItems.filter((a) => a?.due_date).length

  return (
    <>
      <PanelHeader kicker={t('panels.summary.kicker')} title={headline} />

      <div className="mb-6 flex items-center gap-2 text-xs text-foreground-secondary">
        <span className="grid size-[18px] place-items-center rounded-md bg-accent text-white">
          <Sparkles className="size-2.5" />
        </span>
        <span>{t('panels.summary.generatedBy')}</span>
        <span className="font-mono text-foreground-tertiary" dir="ltr">
          {data.model}
        </span>
        <span>·</span>
        <span>{formatJalali(data.created_at)}</span>
      </div>

      <div className="mb-7 rounded-2xl border border-border bg-background-elevated p-6">
        {exec ? (
          <p className="whitespace-pre-wrap text-[14.5px] leading-[2.1] text-foreground">
            {exec}
          </p>
        ) : (
          <p className="text-[13.5px] text-foreground-tertiary">
            {t('panels.summary.noSummary')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InsightTile
          icon={<CheckSquare className="size-4" />}
          toneClass="bg-success/10 text-success"
          value={actionItems.length}
          label={t('panels.summary.actionItemsTile')}
          sub={
            actionItems.length > 0
              ? t('panels.summary.actionItemsSub', { count: datedActions })
              : undefined
          }
        />
        <InsightTile
          icon={<Gavel className="size-4" />}
          toneClass="bg-accent/10 text-accent"
          value={decisions.length}
          label={t('panels.summary.decisionsTile')}
        />
        <InsightTile
          icon={<AlertCircle className="size-4" />}
          toneClass="bg-warning/10 text-warning"
          value={openQuestions.length}
          label={t('panels.summary.openQuestionsTile')}
          sub={
            openQuestions.length > 0
              ? t('panels.summary.openQuestionsSub')
              : undefined
          }
        />
      </div>
    </>
  )
}
