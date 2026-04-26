import { Bot, CheckCircle2, XCircle, AlertCircle, StopCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '../../utils/cn'
import { useAutomateAgentState } from './hooks/useAutomateAgentState'
import TaskInput from './components/TaskInput'
import LiveBrowserFrame from './components/LiveBrowserFrame'
import EventStream from './components/EventStream'
import TaskHistorySidebar from './components/TaskHistorySidebar'

const STATUS_META = {
  idle:       { label: null },
  pending:    { label: 'Starting',   cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-200' },
  running:    { label: 'Running',    cls: 'bg-blue-500/15 text-blue-600 border-blue-200' },
  completed:  { label: 'Completed',  cls: 'bg-green-500/15 text-green-600 border-green-200', Icon: CheckCircle2 },
  error:      { label: 'Error',      cls: 'bg-red-500/15 text-red-600 border-red-200',       Icon: XCircle },
  stopped:    { label: 'Stopped',    cls: 'bg-gray-500/15 text-gray-500 border-gray-200',    Icon: StopCircle },
  timed_out:  { label: 'Timed Out',  cls: 'bg-orange-500/15 text-orange-600 border-orange-200', Icon: AlertCircle },
}

export default function AutomateAgentPage() {
  const state = useAutomateAgentState()
  const {
    currentTask, status, liveUrl, messages, taskHistory,
    selectedModel, taskInput, error,
    setSelectedModel, setTaskInput,
    runTask, stopTask, loadTask, deleteTask, newTask,
  } = state

  const statusMeta = STATUS_META[status] || STATUS_META.idle

  return (
    <div className="h-full flex">
      {/* History sidebar — hidden on mobile */}
      <div className="hidden md:flex flex-col w-[280px] shrink-0">
        <TaskHistorySidebar
          tasks={taskHistory}
          currentTask={currentTask}
          onNewTask={newTask}
          onLoadTask={loadTask}
          onDeleteTask={deleteTask}
        />
      </div>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Page header */}
        <div className="flex-shrink-0 p-4 md:p-6 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Bot className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-foreground">Automate Agent</h1>
                {statusMeta.label && (
                  <Badge variant="outline" className={cn('text-xs capitalize', statusMeta.cls)}>
                    {statusMeta.Icon && <statusMeta.Icon className="h-3 w-3 mr-1" />}
                    {statusMeta.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-foreground-secondary">
                Runs tasks in a cloud browser — powered by browser-use
              </p>
            </div>
          </div>
        </div>

        {/* Task input bar */}
        <TaskInput
          taskInput={taskInput}
          setTaskInput={setTaskInput}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          status={status}
          onRun={runTask}
          onStop={stopTask}
        />

        {/* Error banner */}
        {error && status === 'error' && (
          <div className="flex-shrink-0 mx-4 mt-3 p-3 rounded-lg bg-error/10 border border-error/30 text-sm text-error flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Live browser + event stream timeline */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            <LiveBrowserFrame liveUrl={liveUrl} status={status} />
            <EventStream messages={messages} status={status} currentTask={currentTask} />
          </div>
        </div>
      </div>
    </div>
  )
}
