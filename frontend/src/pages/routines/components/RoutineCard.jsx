import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Loader2, Clock } from 'lucide-react'
import { parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '../../../utils/cn'
import { fmtDistanceToNow } from '../../../utils/dateLocale'
import { routinesService } from '../../../services/routinesService'
import { useProject } from '../../../context/ProjectContext'
import toast from 'react-hot-toast'

function scheduleLabel(schedule, t) {
  if (!schedule) return '—'
  if (schedule.kind === 'one_shot') {
    if (schedule.run_at) {
      try {
        return t('card.scheduleLabels.oneShot', { time: fmtDistanceToNow(parseISO(schedule.run_at), { addSuffix: true }) })
      } catch {
        return t('card.scheduleLabels.oneShotPlain')
      }
    }
    return t('card.scheduleLabels.oneShotPlain')
  }
  const PRESET_KEYS = {
    '0 * * * *': 'hourly',
    '0 9 * * *': 'daily9am',
    '0 9 * * 1-5': 'weekdays9am',
    '0 9 * * 1': 'weeklyMon9am',
    '0 9 1 * *': 'monthly1st',
  }
  const key = PRESET_KEYS[schedule.cron_expr]
  if (key) return t(`card.scheduleLabels.${key}`)
  return schedule.cron_expr || '—'
}

export default function RoutineCard({ routine, onEdit }) {
  const { t } = useTranslation('routines')
  const queryClient = useQueryClient()
  const { projects } = useProject()

  const projectPill = (() => {
    if (!routine.project_id) return null
    const proj = projects.find(p => p._id === routine.project_id)
    const name = proj?.name || 'Team'
    const color = proj?.color || '#5c9aed'
    return { name, color }
  })()

  const STATUS_BADGE = {
    success: { labelKey: 'status.success', className: 'bg-success/15 text-success border-success/30' },
    failed: { labelKey: 'status.failed', className: 'bg-error/15 text-error border-error/30' },
    running: { labelKey: 'status.running', className: 'bg-accent/15 text-accent border-accent/30' },
    skipped: { labelKey: 'status.skipped', className: 'bg-foreground-tertiary/15 text-foreground-tertiary border-foreground-tertiary/30' },
    never: { labelKey: 'status.never', className: 'bg-border text-foreground-tertiary border-border' },
  }

  const toggleMutation = useMutation({
    mutationFn: () => routinesService.toggleRoutine(routine._id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
    onError: () => toast.error(t('editor.toasts.toggleError')),
  })

  const runNowMutation = useMutation({
    mutationFn: () => routinesService.runNow(routine._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      queryClient.invalidateQueries({ queryKey: ['routine-runs', routine._id] })
      toast.success(t('editor.toasts.runQueued'))
    },
    onError: (err) => toast.error(err.response?.data?.error || t('editor.toasts.runError')),
  })

  const statusKey = routine.last_run_status || 'never'
  const badge = STATUS_BADGE[statusKey] || STATUS_BADGE.never

  const nextRun = routine.next_run_at
    ? (() => {
        try { return fmtDistanceToNow(parseISO(routine.next_run_at), { addSuffix: true }) }
        catch { return null }
      })()
    : null

  return (
    <div
      onClick={onEdit}
      className={cn(
        'group flex items-center gap-3 px-4 py-3 rounded-xl border border-border',
        'bg-background-secondary hover:bg-background-tertiary transition-colors cursor-pointer',
        !routine.enabled && 'opacity-60'
      )}
    >
      {/* Main info */}
      <div className="flex-1 min-w-0">
        {projectPill && (
          <div className="mb-1">
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border"
              style={{
                color: projectPill.color,
                backgroundColor: `${projectPill.color}1a`,
                borderColor: `${projectPill.color}4d`,
              }}
            >
              {projectPill.name}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate">{routine.name}</span>
          <Badge variant="outline" className={cn('text-xs flex-shrink-0', badge.className)}>
            {t(badge.labelKey)}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-foreground-tertiary flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {scheduleLabel(routine.schedule, t)}
          </span>
          {nextRun && routine.enabled && (
            <span className="text-xs text-foreground-tertiary">{t('card.nextRun', { time: nextRun })}</span>
          )}
        </div>
      </div>

      {/* Controls — stop propagation so row click doesn't trigger */}
      <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={runNowMutation.isPending}
              onClick={() => runNowMutation.mutate()}
            >
              {runNowMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('card.runNow')}</TooltipContent>
        </Tooltip>

        <Switch
          checked={routine.enabled}
          onCheckedChange={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        />
      </div>
    </div>
  )
}
