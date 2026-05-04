import { useState, useEffect, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Cpu, Thermometer } from 'lucide-react'
import Section from '@/components/teams/Section'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import projectService from '@/services/projectService'
import { configService } from '@/services/chatService'
import { QUICK_MODELS } from '@/constants/models'

/**
 * DefaultsTab — project-level default model + temperature.
 *
 * Owner-only writes; editors/viewers see read-only fields.
 */
export default function DefaultsTab({ project, onSaved }) {
  const [defaultModel, setDefaultModel] = useState(project?.default_model || '__none__')
  const [defaultTemp, setDefaultTemp] = useState(
    typeof project?.default_temperature === 'number'
      ? project.default_temperature
      : 0.7,
  )
  const [hasTempOverride, setHasTempOverride] = useState(
    typeof project?.default_temperature === 'number',
  )
  const [assistants, setAssistants] = useState([])
  const [busy, setBusy] = useState(false)

  const isOwner = project?.member_role === 'owner'

  useEffect(() => {
    setDefaultModel(project?.default_model || '__none__')
    if (typeof project?.default_temperature === 'number') {
      setDefaultTemp(project.default_temperature)
      setHasTempOverride(true)
    } else {
      setDefaultTemp(0.7)
      setHasTempOverride(false)
    }
  }, [project])

  // Load user's assistants for inclusion in the model picker.
  useEffect(() => {
    let alive = true
    async function loadAssistants() {
      try {
        const data = await configService.getConfigs()
        const list = Array.isArray(data) ? data : data?.configs || []
        if (alive) setAssistants(list)
      } catch {
        // No-op — fall back to quick models only.
      }
    }
    loadAssistants()
    return () => {
      alive = false
    }
  }, [])

  const modelOptions = useMemo(() => {
    const out = QUICK_MODELS.map((m) => ({
      value: m.id,
      label: m.name,
      hint: m.description,
      group: 'Quick models',
    }))
    if (Array.isArray(assistants)) {
      assistants.forEach((a) => {
        if (a.model) {
          out.push({
            value: a.model,
            label: a.name || a.model,
            hint: 'Custom assistant',
            group: 'Assistants',
          })
        }
      })
    }
    return out
  }, [assistants])

  async function handleSave() {
    if (!isOwner) return
    setBusy(true)
    try {
      const payload = {
        default_model:
          defaultModel === '__none__' ? null : defaultModel,
        default_temperature: hasTempOverride ? Number(defaultTemp) : null,
      }
      const updated = await projectService.update(project._id, payload)
      toast.success('Defaults saved')
      onSaved?.(updated)
    } catch (ex) {
      toast.error(ex.response?.data?.error || 'Failed to save defaults')
    } finally {
      setBusy(false)
    }
  }

  const disabled = !isOwner

  return (
    <div className="max-w-[920px] space-y-4">
      <Section
        title="Default model"
        hint="Used for new chats inside this project. Members can override per chat."
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-fg-2" />
            <Label className="text-[13px] font-medium text-fg-1">
              Default model
            </Label>
          </div>
          <Select
            value={defaultModel}
            onValueChange={setDefaultModel}
            disabled={disabled}
          >
            <SelectTrigger className="w-full max-w-[420px]">
              <SelectValue placeholder="No default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No default — user picks</SelectItem>
              {modelOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex flex-col">
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="text-[11px] text-fg-3">
                        {opt.hint}
                      </span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11.5px] text-fg-3">
            Currently:{' '}
            <span className="font-mono text-fg-2">
              {project?.default_model || 'none'}
            </span>
          </p>
        </div>
      </Section>

      <Section
        title="Default temperature"
        hint="Sampling temperature for new chats in this project. 0 = deterministic, 2 = wild."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-fg-2" />
            <Label className="text-[13px] font-medium text-fg-1">
              Temperature
            </Label>
            <span className="ml-auto font-mono text-[13px] text-fg-1">
              {hasTempOverride ? defaultTemp.toFixed(1) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Slider
              value={[defaultTemp]}
              onValueChange={(v) => {
                setDefaultTemp(v[0])
                setHasTempOverride(true)
              }}
              min={0}
              max={2}
              step={0.1}
              disabled={disabled}
              className="flex-1"
            />
            {hasTempOverride && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setHasTempOverride(false)
                  setDefaultTemp(0.7)
                }}
              >
                Clear
              </Button>
            )}
          </div>
          <p className="text-[11.5px] text-fg-3">
            Leave unset to inherit the model default.
          </p>
        </div>
      </Section>

      <div className="flex justify-end pt-1">
        <Button
          onClick={handleSave}
          disabled={busy || disabled}
          title={disabled ? 'Owner only' : undefined}
        >
          {busy ? 'Saving...' : 'Save defaults'}
        </Button>
      </div>
    </div>
  )
}
