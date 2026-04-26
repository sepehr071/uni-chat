import { Play, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BROWSER_USE_MODELS } from '../../../constants/models'
import { cn } from '../../../utils/cn'

export default function TaskInput({ taskInput, setTaskInput, selectedModel, setSelectedModel, status, onRun, onStop }) {
  const isRunning = status === 'running'
  const isPending = status === 'pending'
  const isActive  = isRunning || isPending

  const handleKeyDown = (e) => {
    // Cmd/Ctrl+Enter submits
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !isActive) {
      e.preventDefault()
      onRun()
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 border-b border-border bg-background-secondary">
      <Textarea
        value={taskInput}
        onChange={(e) => setTaskInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe a task for the browser agent… (e.g. 'Find the top 5 Hacker News headlines')"
        className="min-h-[80px] resize-none text-sm"
        disabled={isActive}
      />

      <div className="flex items-center gap-3">
        <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isActive}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {BROWSER_USE_MODELS.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isActive ? (
          <Button
            variant="destructive"
            onClick={onStop}
            disabled={isPending}
            className="gap-2"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {isPending ? 'Starting…' : 'Stop'}
          </Button>
        ) : (
          <Button
            onClick={onRun}
            disabled={!taskInput.trim()}
            className={cn('gap-2', !taskInput.trim() && 'opacity-50 cursor-not-allowed')}
          >
            <Play className="h-4 w-4" />
            Run Task
          </Button>
        )}

        <span className="text-xs text-foreground-tertiary hidden sm:block">
          Ctrl+Enter to run
        </span>
      </div>
    </div>
  )
}
