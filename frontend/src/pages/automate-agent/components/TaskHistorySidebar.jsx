import { Trash2, Plus, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '../../../utils/cn'
import { fmtDistanceToNow } from '../../../utils/dateLocale'

const STATUS_STYLES = {
  pending:    'bg-warn/15 text-warn border-warn/30',
  running:    'bg-accent/15 text-accent border-accent/30',
  completed:  'bg-ok/15 text-ok border-ok/30',
  error:      'bg-err/15 text-err border-err/30',
  stopped:    'bg-fg-3/15 text-fg-2 border-fg-3/30',
  timed_out:  'bg-warn/15 text-warn border-warn/30',
}

function TaskItem({ task, isActive, onLoad, onDelete }) {
  const { t } = useTranslation('automate')
  const relativeTime = task.created_at
    ? fmtDistanceToNow(new Date(task.created_at), { addSuffix: true })
    : ''

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm(t('sidebar.deleteConfirm'))) {
      onDelete(task._id)
    }
  }

  return (
    <div
      onClick={() => onLoad(task._id)}
      className={cn(
        'group flex flex-col gap-1.5 p-3 rounded-lg cursor-pointer border transition-all',
        isActive
          ? 'border-accent bg-accent-muted'
          : 'border-transparent hover:border-border hover:bg-background-tertiary'
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <Badge variant="outline" className={cn('text-xs capitalize shrink-0', STATUS_STYLES[task.status] || STATUS_STYLES.stopped)}>
          {task.status}
        </Badge>
        <button
          onClick={handleDelete}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-foreground-tertiary hover:text-error p-0.5 rounded"
          title={t('sidebar.deleteTitle')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="text-sm text-foreground line-clamp-2 leading-snug">
        {task.task_text}
      </p>

      {relativeTime && (
        <div className="flex items-center gap-1 text-xs text-foreground-tertiary">
          <Clock className="h-3 w-3" />
          {relativeTime}
        </div>
      )}
    </div>
  )
}

export default function TaskHistorySidebar({ tasks, currentTask, onNewTask, onLoadTask, onDeleteTask }) {
  const { t } = useTranslation('automate')
  return (
    <div className="flex flex-col h-full bg-background-secondary border-e border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{t('sidebar.title')}</h2>
        <Button size="sm" variant="ghost" onClick={onNewTask} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          {t('sidebar.new')}
        </Button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tasks.length === 0 ? (
          <p className="text-xs text-foreground-tertiary text-center py-6">{t('sidebar.noTasks')}</p>
        ) : (
          tasks.map((task) => (
            <TaskItem
              key={task._id}
              task={task}
              isActive={currentTask?._id === task._id}
              onLoad={onLoadTask}
              onDelete={onDeleteTask}
            />
          ))
        )}
      </div>
    </div>
  )
}
