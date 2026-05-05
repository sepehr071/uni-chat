import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import ConfigSelector from '../../../components/chat/ConfigSelector'
import api from '../../../services/api'
import { workflowService } from '../../../services/workflowService'
import { useProject } from '../../../context/ProjectContext'

async function fetchWorkflows(projectId) {
  const data = await workflowService.list(projectId || undefined)
  return data?.workflows || []
}

async function fetchConfigs(projectId) {
  const params = projectId ? { project_id: projectId } : undefined
  const res = await api.get('/configs/list', { params })
  return res.data?.configs || res.data || []
}

function ConfigPickerButton({ selectedConfigId, onSelect }) {
  const { t } = useTranslation('routines')
  const [open, setOpen] = useState(false)
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null
  const { data: configs = [] } = useQuery({
    queryKey: ['configs', { projectId }],
    queryFn: () => fetchConfigs(projectId),
  })

  const label = selectedConfigId
    ? selectedConfigId.startsWith('quick:')
      ? selectedConfigId.replace('quick:', '')
      : configs.find((c) => c._id === selectedConfigId)?.name || t('action.configCustom')
    : t('action.configLabel')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-foreground-tertiary" />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-foreground-tertiary flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[340px]">
        <ConfigSelector
          configs={configs}
          selectedConfigId={selectedConfigId}
          onSelect={(id) => { onSelect(id); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

export default function ActionBuilder({ value, onChange }) {
  const { t } = useTranslation('routines')
  // value shape: { kind: 'chat'|'workflow', prompt, config_id, workflow_id }
  const kind = value?.kind || 'chat'
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null

  const { data: workflows = [], isLoading: loadingWorkflows } = useQuery({
    queryKey: ['workflows-list', { projectId }],
    queryFn: () => fetchWorkflows(projectId),
  })

  const setKind = (k) => onChange({ ...value, kind: k })
  const setPrompt = (prompt) => onChange({ ...value, prompt })
  const setConfigId = (config_id) => onChange({ ...value, config_id })
  const setWorkflowId = (workflow_id) => onChange({ ...value, workflow_id })

  return (
    <Tabs value={kind} onValueChange={setKind}>
      <TabsList className="w-full">
        <TabsTrigger value="chat" className="flex-1">{t('action.tabs.chat')}</TabsTrigger>
        <TabsTrigger value="workflow" className="flex-1">{t('action.tabs.workflow')}</TabsTrigger>
      </TabsList>

      <TabsContent value="chat" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label htmlFor="action-prompt">{t('action.chat.promptLabel')}</Label>
          <Textarea
            id="action-prompt"
            value={value?.prompt || ''}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t('action.chat.promptPlaceholder')}
            rows={5}
          />
        </div>
        <div className="space-y-2">
          <Label>{t('action.chat.modelLabel')}</Label>
          <ConfigPickerButton
            selectedConfigId={value?.config_id || ''}
            onSelect={setConfigId}
          />
        </div>
      </TabsContent>

      <TabsContent value="workflow" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label>{t('action.workflow.label')}</Label>
          <Select value={value?.workflow_id || ''} onValueChange={setWorkflowId} disabled={loadingWorkflows}>
            <SelectTrigger>
              <SelectValue placeholder={loadingWorkflows ? t('action.workflow.loading') : t('action.workflow.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {workflows.length === 0 && !loadingWorkflows && (
                <SelectItem value="__none__" disabled>{t('action.workflow.none')}</SelectItem>
              )}
              {workflows.map((wf) => (
                <SelectItem key={wf._id} value={wf._id}>
                  {wf.name || t('action.workflow.untitled')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-foreground-tertiary">
            {t('action.workflow.hint')}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  )
}
