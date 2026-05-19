import { useCallback } from 'react'
import { Bot, CheckCircle2, XCircle, AlertCircle, StopCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '../../utils/cn'
import { useAutomateAgentState } from './hooks/useAutomateAgentState'
import TaskInput from './components/TaskInput'
import LiveBrowserFrame from './components/LiveBrowserFrame'
import EventStream from './components/EventStream'
import TaskHistorySidebar from './components/TaskHistorySidebar'
import { useDlpConfirm } from '../../hooks/useDlpConfirm'

export default function AutomateAgentPage() {
  const { t } = useTranslation('automate')
  const state = useAutomateAgentState()
  const {
    currentTask, status, liveUrl, messages, taskHistory,
    selectedModel, taskInput, error,
    setSelectedModel, setTaskInput,
    runTask, stopTask, loadTask, deleteTask, newTask,
  } = state

  // DLP pre-flight + violation modal (workspace Content Safety policy).
  const { scan: dlpScan, dlpModal } = useDlpConfirm({ source: 'automate' })

  // Wrap `runTask` so the task text is scanned before the SSE stream opens.
  const guardedRunTask = useCallback(async () => {
    const decision = await dlpScan(taskInput)
    if (decision === null) return // blocked / cancelled — keep input intact
    await runTask({ dlpConfirmed: decision.confirmed })
  }, [dlpScan, runTask, taskInput])

  const STATUS_META = {
    idle:       { label: null },
    pending:    { label: t('status.starting'),   cls: 'bg-warn/15 text-warn border-warn/30' },
    running:    { label: t('status.running'),    cls: 'bg-accent/15 text-accent border-accent/30' },
    completed:  { label: t('status.completed'),  cls: 'bg-ok/15 text-ok border-ok/30', Icon: CheckCircle2 },
    error:      { label: t('status.error'),      cls: 'bg-err/15 text-err border-err/30',       Icon: XCircle },
    stopped:    { label: t('status.stopped'),    cls: 'bg-fg-3/15 text-fg-2 border-fg-3/30',    Icon: StopCircle },
    timed_out:  { label: t('status.timedOut'),   cls: 'bg-warn/15 text-warn border-warn/30', Icon: AlertCircle },
  }

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
                <h1 className="text-2xl font-bold text-foreground">{t('page.title')}</h1>
                {statusMeta.label && (
                  <Badge variant="outline" className={cn('text-xs capitalize', statusMeta.cls)}>
                    {statusMeta.Icon && <statusMeta.Icon className="h-3 w-3 me-1" />}
                    {statusMeta.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-foreground-secondary">
                {t('page.subtitle')}
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
          onRun={guardedRunTask}
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

      {/* DLP violation modal */}
      {dlpModal}
    </div>
  )
}
