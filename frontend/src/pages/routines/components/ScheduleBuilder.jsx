import { useState, useMemo, useEffect } from 'react'
import { parseISO } from 'date-fns'
import cronstrue from 'cronstrue'
import { Loader2, Calendar, Wand2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/utils/cn'
import { fmtDate } from '../../../utils/dateLocale'
import { routinesService } from '../../../services/routinesService'
import {
  FREQUENCIES,
  WEEKDAYS,
  PRESETS,
  buildCron,
  parseCron,
} from './cronBuilder'
import toast from 'react-hot-toast'

function describeCron(cron) {
  if (!cron) return ''
  try {
    return cronstrue.toString(cron, { use24HourTimeFormat: false })
  } catch {
    return 'Invalid cron expression'
  }
}

export default function ScheduleBuilder({ value, onChange, timezone }) {
  const { t } = useTranslation('routines')
  // value shape: { kind: 'cron'|'one_shot', cron_expr, cron_source, natural_input, run_at }
  const isOneShot = value?.kind === 'one_shot'
  const cronExpr = value?.cron_expr || ''

  const initialTab = useMemo(() => {
    if (isOneShot) return 'simple'
    if (value?.cron_source === 'natural') return 'describe'
    if (value?.cron_source === 'raw') return 'advanced'
    return 'simple'
  }, [])
  const [tab, setTab] = useState(initialTab)

  const inferred = useMemo(() => parseCron(cronExpr), [cronExpr])
  const [frequency, setFrequency] = useState(inferred?.frequency || 'daily')
  const [time, setTime] = useState(inferred?.time || '09:00')
  const [hourlyMinute, setHourlyMinute] = useState(
    inferred?.frequency === 'hourly' ? inferred.minute : 0,
  )
  const [daysOfWeek, setDaysOfWeek] = useState(
    inferred?.frequency === 'weekly' ? inferred.daysOfWeek : [1, 2, 3, 4, 5],
  )
  const [dayOfMonth, setDayOfMonth] = useState(
    inferred?.frequency === 'monthly' ? inferred.dayOfMonth : 1,
  )

  const [nlText, setNlText] = useState(value?.natural_input || '')
  const [isParsing, setIsParsing] = useState(false)
  const [previewTimes, setPreviewTimes] = useState([])

  useEffect(() => {
    if (tab !== 'simple' || isOneShot) return
    const next = buildCron({
      frequency,
      time,
      daysOfWeek,
      dayOfMonth,
      minute: hourlyMinute,
    })
    if (next !== cronExpr) {
      onChange({
        ...value,
        kind: 'cron',
        cron_expr: next,
        cron_source: 'preset',
        natural_input: null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, frequency, time, daysOfWeek, dayOfMonth, hourlyMinute, isOneShot])

  const toggleDay = (id) => {
    setDaysOfWeek((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    )
  }

  const handleOneShotToggle = (checked) => {
    if (checked) {
      const defaultRunAt = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16)
      onChange({ kind: 'one_shot', run_at: defaultRunAt })
      setPreviewTimes([])
    } else {
      onChange({
        kind: 'cron',
        cron_expr: '0 9 * * *',
        cron_source: 'preset',
        natural_input: null,
      })
      setTab('simple')
      setFrequency('daily')
      setTime('09:00')
    }
  }

  const handleRunAtChange = (e) => {
    onChange({ ...value, run_at: e.target.value })
  }

  const handlePreset = (cron) => {
    onChange({
      ...value,
      kind: 'cron',
      cron_expr: cron,
      cron_source: 'preset',
      natural_input: null,
    })
    const inf = parseCron(cron)
    if (inf) {
      setFrequency(inf.frequency)
      setTime(inf.time)
      if (inf.frequency === 'weekly') setDaysOfWeek(inf.daysOfWeek)
      if (inf.frequency === 'monthly') setDayOfMonth(inf.dayOfMonth)
      if (inf.frequency === 'hourly') setHourlyMinute(inf.minute)
    }
    setPreviewTimes([])
  }

  const handleParse = async () => {
    if (!nlText.trim()) return
    setIsParsing(true)
    try {
      const result = await routinesService.parseSchedule({
        text: nlText,
        timezone: timezone || 'UTC',
      })
      onChange({
        ...value,
        kind: 'cron',
        cron_expr: result.cron_expr,
        cron_source: 'natural',
        natural_input: nlText,
      })
      setPreviewTimes(result.preview || [])
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to parse schedule')
    } finally {
      setIsParsing(false)
    }
  }

  const handleCronRawEdit = (e) => {
    onChange({ ...value, cron_expr: e.target.value, cron_source: 'raw' })
    setPreviewTimes([])
  }

  const formatPreview = (iso) => {
    try {
      return fmtDate(parseISO(iso), 'EEE, MMM d yyyy · h:mm a')
    } catch {
      return iso
    }
  }

  const cronReadout = cronExpr && !isOneShot && (
    <div className="rounded-lg border border-border bg-background-tertiary px-3 py-2 space-y-1">
      <p className="text-xs text-foreground-secondary">{describeCron(cronExpr)}</p>
      <p className="text-[11px] font-mono text-foreground-tertiary">
        {cronExpr}{' '}
        <span className="text-foreground-tertiary">· {timezone || 'UTC'}</span>
      </p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* One-shot toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">{t('schedule.oneShotLabel')}</Label>
          <p className="text-xs text-foreground-tertiary">{t('schedule.oneShotHint')}</p>
        </div>
        <Switch checked={isOneShot} onCheckedChange={handleOneShotToggle} />
      </div>

      {isOneShot ? (
        <div className="space-y-2">
          <Label htmlFor="run-at">{t('schedule.runAt')}</Label>
          <Input
            id="run-at"
            type="datetime-local"
            value={value?.run_at ? value.run_at.slice(0, 16) : ''}
            onChange={handleRunAtChange}
          />
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="simple" className="flex-1">{t('schedule.tabs.simple')}</TabsTrigger>
            <TabsTrigger value="describe" className="flex-1">{t('schedule.tabs.describe')}</TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1">{t('schedule.tabs.advanced')}</TabsTrigger>
          </TabsList>

          {/* ── Simple ─────────────────────────────────────────────── */}
          <TabsContent value="simple" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>{t('schedule.simple.quickPresets')}</Label>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.cron}
                    type="button"
                    size="sm"
                    variant={cronExpr === p.cron ? 'default' : 'outline'}
                    onClick={() => handlePreset(p.cron)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('schedule.simple.frequency')}</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {frequency === 'hourly' ? (
              <div className="space-y-2">
                <Label htmlFor="hourly-minute">{t('schedule.simple.atMinute')}</Label>
                <Input
                  id="hourly-minute"
                  type="number"
                  min={0}
                  max={59}
                  value={hourlyMinute}
                  onChange={(e) => setHourlyMinute(Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  className="w-24"
                />
                <p className="text-xs text-foreground-tertiary">{t('schedule.simple.atMinuteHint')}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="time-of-day">{t('schedule.simple.timeOfDay')}</Label>
                <Input
                  id="time-of-day"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-32"
                />
              </div>
            )}

            {frequency === 'weekly' && (
              <div className="space-y-2">
                <Label>{t('schedule.simple.daysOfWeek')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const active = daysOfWeek.includes(d.id)
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => toggleDay(d.id)}
                        className={cn(
                          'h-8 px-3 rounded-full text-xs font-medium transition-colors border',
                          active
                            ? 'bg-accent text-white border-accent'
                            : 'bg-background border-border text-foreground-secondary hover:bg-background-tertiary',
                        )}
                      >
                        {d.short}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {frequency === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="day-of-month">{t('schedule.simple.dayOfMonth')}</Label>
                <Input
                  id="day-of-month"
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="w-24"
                />
              </div>
            )}

            {cronReadout}
          </TabsContent>

          {/* ── Describe it ────────────────────────────────────────── */}
          <TabsContent value="describe" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="nl-schedule">{t('schedule.describe.label')}</Label>
              <div className="flex gap-2">
                <Textarea
                  id="nl-schedule"
                  value={nlText}
                  onChange={(e) => setNlText(e.target.value)}
                  placeholder={t('schedule.describe.placeholder')}
                  rows={2}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleParse}
                  disabled={isParsing || !nlText.trim()}
                  className="self-end"
                >
                  {isParsing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 me-1.5" />
                      {t('schedule.describe.parse')}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-foreground-tertiary">
                {t('schedule.describe.aiHint')}
              </p>
            </div>

            {value?.cron_source === 'natural' && cronExpr && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  {t('schedule.describe.parsedSchedule')}
                  <Badge variant="secondary" className="text-xs">AI</Badge>
                </Label>
                {cronReadout}
              </div>
            )}

            {previewTimes.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5 text-xs text-foreground-secondary">
                  <Calendar className="h-3.5 w-3.5" />
                  {t('schedule.describe.next5Fires')}
                </Label>
                <ul className="space-y-1">
                  {previewTimes.map((iso, i) => (
                    <li key={i} className="text-xs text-foreground-secondary font-mono bg-background-tertiary px-2 py-1 rounded">
                      {formatPreview(iso)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          {/* ── Advanced ───────────────────────────────────────────── */}
          <TabsContent value="advanced" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="cron-raw">{t('schedule.advanced.cronLabel')}</Label>
              <Input
                id="cron-raw"
                value={cronExpr}
                onChange={handleCronRawEdit}
                placeholder={t('schedule.advanced.cronPlaceholder')}
                className="font-mono text-sm"
              />
              <p className="text-xs text-foreground-tertiary">
                {t('schedule.advanced.cronHint', { timezone: timezone || 'UTC' })}
                {' '}<code className="font-mono">min hr dom mon dow</code>
              </p>
            </div>
            {cronReadout}
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}
