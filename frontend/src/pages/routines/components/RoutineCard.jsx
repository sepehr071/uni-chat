import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Play, Loader2, Clock } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '../../../utils/cn'
import { routinesService } from '../../../services/routinesService'
import toast from 'react-hot-toast'

const STATUS_BADGE = {
  success: { label: 'Success', className: 'bg-success/15 text-success border-success/30' },
  failed: { label: 'Failed', className: 'bg-error/15 text-error border-error/30' },
  running: { label: 'Running', className: 'bg-accent/15 text-accent border-accent/30' },
  skipped: { label: 'Skipped', className: 'bg-foreground-tertiary/15 text-foreground-tertiary border-foreground-tertiary/30' },
  never: { label: 'Never run', className: 'bg-border text-foreground-tertiary border-border' },
}

function scheduleLabel(schedule) {
  if (!schedule) return '—'
  if (schedule.kind === 'one_shot') {
    if (schedule.run_at) {
      try {
        return 'One-shot · ' + formatDistanceToNow(parseISO(schedule.run_at), { addSuffix: true })
      } catch {
        return 'One-shot'
      }
    }
    return 'One-shot'
  }
  // cron presets → friendly label
  const PRESET_LABELS = {
    '0 * * * *': 'Hourly',
    '0 9 * * *': 'Daily 9 AM',
    '0 9 * * 1-5': 'Weekdays 9 AM',
    '0 9 * * 1': 'Weekly Mon 9 AM',
    '0 9 1 * *': 'Monthly 1st',
  }
  return PRESET_LABELS[schedule.cron_expr] || schedule.cron_expr || '—'
}

export default function RoutineCard({ routine, onEdit }) {
  const queryClient = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: () => routinesService.toggleRoutine(routine._id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routines'] }),
    onError: () => toast.error('Failed to toggle routine'),
  })

  const runNowMutation = useMutation({
    mutationFn: () => routinesService.runNow(routine._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      queryClient.invalidateQueries({ queryKey: ['routine-runs', routine._id] })
      toast.success('Routine queued')
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to run routine'),
  })

  const statusKey = routine.last_run_status || 'never'
  const badge = STATUS_BADGE[statusKey] || STATUS_BADGE.never

  const nextRun = routine.next_run_at
    ? (() => {
        try { return formatDistanceToNow(parseISO(routine.next_run_at), { addSuffix: true }) }
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-foreground truncate">{routine.name}</span>
          <Badge variant="outline" className={cn('text-xs flex-shrink-0', badge.className)}>
            {badge.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          <span className="text-xs text-foreground-tertiary flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {scheduleLabel(routine.schedule)}
          </span>
          {nextRun && routine.enabled && (
            <span className="text-xs text-foreground-tertiary">Next {nextRun}</span>
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
          <TooltipContent>Run now</TooltipContent>
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
