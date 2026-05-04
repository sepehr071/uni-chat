import { useState, useEffect } from 'react'
import { Loader2, Save, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '../../../utils/cn'
import toast from 'react-hot-toast'
import ScheduleBuilder from './ScheduleBuilder'
import ActionBuilder from './ActionBuilder'
import OutputSelector from './OutputSelector'
import RunHistoryPanel from './RunHistoryPanel'
import { routinesService } from '../../../services/routinesService'
import { useAuth } from '../../../context/AuthContext'
import { useProject } from '../../../context/ProjectContext'

const DEFAULT_ROUTINE = {
  name: '',
  project_id: null,
  schedule: {
    kind: 'cron',
    cron_expr: '0 9 * * *',
    cron_source: 'preset',
    natural_input: null,
  },
  action: {
    kind: 'chat',
    prompt: '',
    config_id: 'quick:google/gemini-2.5-flash-lite',
  },
  outputs: {
    chat: { enabled: true },
    knowledge: { enabled: false },
    telegram: { enabled: false },
  },
}

function EditorForm({ routine, onSave, onDelete, isSaving, isDeleting, isNew, timezone, projects, currentProject }) {
  const defaultProjectId = routine?.project_id !== undefined
    ? routine.project_id
    : (currentProject?._id || null)

  const [form, setForm] = useState(() => ({
    ...(routine || DEFAULT_ROUTINE),
    project_id: defaultProjectId,
  }))

  useEffect(() => {
    const base = routine || DEFAULT_ROUTINE
    setForm({
      ...base,
      project_id: base.project_id !== undefined ? base.project_id : (currentProject?._id || null),
    })
  }, [routine])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    if (form.action.kind === 'chat' && !form.action.prompt?.trim()) {
      toast.error('Prompt is required for Chat action'); return
    }
    if (form.action.kind === 'workflow' && !form.action.workflow_id) {
      toast.error('Please select a workflow'); return
    }
    if (form.schedule.kind === 'cron' && !form.schedule.cron_expr) {
      toast.error('Cron expression is required'); return
    }
    if (form.schedule.kind === 'one_shot' && !form.schedule.run_at) {
      toast.error('Run-at date is required'); return
    }
    onSave(form)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <Tabs defaultValue="details" className="flex flex-col flex-1 overflow-hidden">
        <TabsList className="mx-0 flex-shrink-0 w-full border-b border-border rounded-none bg-transparent h-10 p-0 justify-start gap-0">
          <TabsTrigger
            value="details"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent h-full px-4"
          >
            Details
          </TabsTrigger>
          {!isNew && (
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent h-full px-4"
            >
              Run History
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="details" className="flex-1 overflow-hidden mt-0">
          <ScrollArea className="h-full">
            <div className="space-y-6 p-1 pb-4">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="routine-name">Name</Label>
                <Input
                  id="routine-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Daily news brief…"
                  autoFocus
                />
              </div>

              {/* Project scope */}
              <div className="space-y-2">
                <Label>Project scope</Label>
                <Select
                  value={form.project_id || '__personal__'}
                  onValueChange={(val) =>
                    setForm((f) => ({ ...f, project_id: val === '__personal__' ? null : val }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Personal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__personal__">Personal</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-foreground-tertiary">
                  Personal-scope routines can only use your own assistants/workflows. Project routines can use project resources.
                </p>
                {form.project_id && form.project_id !== (currentProject?._id || null) && (
                  <p className="text-xs text-amber-500">
                    Routine will run with that project's resources.
                  </p>
                )}
              </div>

              <Separator />

              {/* Action */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Action</h3>
                <ActionBuilder
                  value={form.action}
                  onChange={(action) => setForm((f) => ({ ...f, action }))}
                />
              </div>

              <Separator />

              {/* Schedule */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Schedule</h3>
                <ScheduleBuilder
                  value={form.schedule}
                  onChange={(schedule) => setForm((f) => ({ ...f, schedule }))}
                  timezone={timezone}
                />
              </div>

              <Separator />

              {/* Outputs */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Outputs</h3>
                <p className="text-xs text-foreground-tertiary -mt-1">
                  Where should the results be delivered?
                </p>
                <OutputSelector
                  value={form.outputs}
                  onChange={(outputs) => setForm((f) => ({ ...f, outputs }))}
                />
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {!isNew && (
          <TabsContent value="history" className="flex-1 overflow-hidden mt-0">
            <RunHistoryPanel routineId={routine?._id} />
          </TabsContent>
        )}
      </Tabs>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-4 border-t border-border flex-shrink-0">
        {!isNew && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-error hover:text-error hover:bg-error/10"
            onClick={onDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
        <Button type="submit" className="ml-auto" disabled={isSaving}>
          {isSaving ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
          ) : (
            <><Save className="h-4 w-4 mr-2" />Save</>
          )}
        </Button>
      </div>
    </form>
  )
}

export default function RoutineEditor({ open, onClose, routine, isNew }) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { projects, currentProject } = useProject()
  const timezone = user?.timezone || user?.ai_preferences?.timezone || 'UTC'
  const [isMobile] = useState(() => window.innerWidth < 640)

  const saveMutation = useMutation({
    mutationFn: (data) =>
      isNew ? routinesService.createRoutine(data) : routinesService.updateRoutine(routine._id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      toast.success(isNew ? 'Routine created' : 'Routine saved')
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to save routine'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => routinesService.deleteRoutine(routine._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] })
      toast.success('Routine deleted')
      onClose()
    },
    onError: () => toast.error('Failed to delete routine'),
  })

  const title = isNew ? 'New Routine' : 'Edit Routine'
  const desc = isNew
    ? 'Set up a scheduled LLM task'
    : `Last run: ${routine?.last_run_status || 'never'}`

  const formContent = (
    <EditorForm
      routine={routine}
      onSave={(data) => saveMutation.mutate(data)}
      onDelete={() => deleteMutation.mutate()}
      isSaving={saveMutation.isPending}
      isDeleting={deleteMutation.isPending}
      isNew={isNew}
      timezone={timezone}
      projects={projects}
      currentProject={currentProject}
    />
  )

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="h-[100dvh] max-w-full m-0 rounded-none flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{desc}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden px-4 pb-4 flex flex-col">
            {formContent}
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 gap-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{desc}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-hidden px-6 pb-6 flex flex-col pt-4">
          {formContent}
        </div>
      </SheetContent>
    </Sheet>
  )
}
