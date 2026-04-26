import { Trash2, Plus, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '../../../utils/cn'

const STATUS_STYLES = {
  pending:    'bg-yellow-500/15 text-yellow-600 border-yellow-200',
  running:    'bg-blue-500/15 text-blue-600 border-blue-200',
  completed:  'bg-green-500/15 text-green-600 border-green-200',
  error:      'bg-red-500/15 text-red-600 border-red-200',
  stopped:    'bg-gray-500/15 text-gray-500 border-gray-200',
  timed_out:  'bg-orange-500/15 text-orange-600 border-orange-200',
}

function TaskItem({ task, isActive, onLoad, onDelete }) {
  const relativeTime = task.created_at
    ? formatDistanceToNow(new Date(task.created_at), { addSuffix: true })
    : ''

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm('Delete this task?')) {
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
          title="Delete task"
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
  return (
    <div className="flex flex-col h-full bg-background-secondary border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Task History</h2>
        <Button size="sm" variant="ghost" onClick={onNewTask} className="gap-1.5 h-8 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {tasks.length === 0 ? (
          <p className="text-xs text-foreground-tertiary text-center py-6">No tasks yet</p>
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
