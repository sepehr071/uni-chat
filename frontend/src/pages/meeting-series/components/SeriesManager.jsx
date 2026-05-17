import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import EmptyState from '@/pages/meetings/components/EmptyState'
import {
  acceptKeyterm,
  addKeyterm,
  createSeries,
  deleteSeries,
  listKeyterms,
  listSeries,
  listSeriesSpeakerNames,
  rejectKeyterm,
  updateSeries,
} from '@/services/meetingSeriesService'
import { cn } from '@/utils/cn'
import { dirOf } from '@/utils/rtl'

export default function SeriesManager() {
  const { t } = useTranslation('meetings_series')
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [newName, setNewName] = useState('')

  const { data: seriesList } = useQuery({
    queryKey: ['series'],
    queryFn: listSeries,
  })

  const create = useMutation({
    mutationFn: () => createSeries({ name: newName.trim() }),
    onSuccess: (s) => {
      setNewName('')
      qc.invalidateQueries({ queryKey: ['series'] })
      setSelectedId(s._id ?? s.id)
      toast.success(t('form.seriesCreated'))
    },
    onError: (e) => toast.error(String(e)),
  })

  const items = seriesList ?? []
  const selected = items.find((s) => (s._id ?? s.id) === selectedId)

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-3">
        <div className="space-y-2 rounded-xl border border-border bg-background-elevated p-3">
          <p className="text-[11px] font-medium text-foreground-secondary">
            {t('form.newSeriesLabel')}
          </p>
          <div className="flex gap-2">
            <Input
              dir="auto"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('form.namePlaceholder')}
              className="h-9 border-border"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) create.mutate()
              }}
            />
            <Button
              size="sm"
              onClick={() => create.mutate()}
              disabled={!newName.trim() || create.isPending}
              className="h-9"
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        {items.length === 0 ? (
          <EmptyState icon={Layers} title={t('empty.title')} hint={t('empty.hint')} />
        ) : (
          <ul className="space-y-1">
            {items.map((s) => {
              const id = s._id ?? s.id
              const active = selectedId === id
              return (
                <li key={id}>
                  <button
                    onClick={() => setSelectedId(id)}
                    className={cn(
                      'w-full rounded-md px-3 py-2 text-start text-sm transition-colors',
                      active
                        ? 'bg-accent/10 font-semibold text-accent'
                        : 'text-foreground-secondary hover:bg-background-tertiary'
                    )}
                    dir={dirOf(s.name)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{s.name}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-mono tabular-nums',
                          active
                            ? 'bg-background-elevated text-foreground-secondary'
                            : 'bg-background-tertiary text-foreground-tertiary'
                        )}
                      >
                        {s.meeting_count ?? 0}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      {selected ? (
        <SeriesDetail
          series={selected}
          onDeleted={() => setSelectedId(null)}
        />
      ) : (
        <EmptyState
          icon={Layers}
          title={t('empty.selectPrompt')}
          hint={t('empty.selectPromptHint')}
        />
      )}
    </div>
  )
}

function SeriesDetail({ series, onDeleted }) {
  const { t } = useTranslation('meetings_series')
  const qc = useQueryClient()
  const seriesId = series._id ?? series.id

  const update = useMutation({
    mutationFn: (patch) => updateSeries(seriesId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series'] })
      toast.success(t('form.saved'))
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteSeries(seriesId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['series'] })
      onDeleted()
      toast.success(t('form.deleted'))
    },
  })

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-background-elevated p-5">
        <div className="mb-4">
          <h2
            dir={dirOf(series.name)}
            className="text-[18px] font-bold tracking-tight text-foreground"
          >
            {series.name}
          </h2>
          <p className="mt-0.5 text-xs text-foreground-secondary">
            {t('form.meetingCount', { count: series.meeting_count ?? 0 })}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto]">
          <SeriesNameField
            series={series}
            onSave={(name) => update.mutate({ name })}
          />
          <ToneSelector
            value={series.email_tone}
            onChange={(tone) => update.mutate({ email_tone: tone })}
          />
          <DeleteSeriesButton
            seriesName={series.name}
            disabled={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </div>
      </section>

      <Tabs defaultValue="keyterms">
        <TabsList>
          <TabsTrigger value="keyterms">{t('tabs.glossary')}</TabsTrigger>
          <TabsTrigger value="suggested">{t('tabs.suggested')}</TabsTrigger>
          <TabsTrigger value="speakers">{t('tabs.speakers')}</TabsTrigger>
        </TabsList>
        <TabsContent value="keyterms" className="pt-3">
          <KeytermsList seriesId={seriesId} source="active" />
        </TabsContent>
        <TabsContent value="suggested" className="pt-3">
          <KeytermsList seriesId={seriesId} source="suggested" />
        </TabsContent>
        <TabsContent value="speakers" className="pt-3">
          <SpeakerNamesList seriesId={seriesId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SeriesNameField({ series, onSave }) {
  const { t } = useTranslation('meetings_series')
  const [value, setValue] = useState(series.name)
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-foreground-secondary">
        {t('form.nameLabel')}
      </label>
      <div className="flex gap-2">
        <Input
          dir="auto"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-9 border-border"
        />
        <Button
          variant="outline"
          onClick={() => onSave(value.trim())}
          disabled={!value.trim() || value.trim() === series.name}
          className="h-9 border-border"
        >
          {t('form.save')}
        </Button>
      </div>
    </div>
  )
}

function ToneSelector({ value, onChange }) {
  const { t } = useTranslation('meetings_series')
  const TONES = [
    { id: 'formal', label: t('form.toneFormal') },
    { id: 'casual', label: t('form.toneCasual') },
  ]
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium text-foreground-secondary">
        {t('form.toneLabel')}
      </label>
      <div className="inline-flex h-9 rounded-lg border border-border bg-background-secondary p-0.5">
        {TONES.map((tone) => (
          <button
            key={tone.id}
            type="button"
            onClick={() => onChange(tone.id)}
            className={cn(
              'rounded-md px-3 text-xs font-medium transition-colors',
              value === tone.id
                ? 'bg-background-elevated text-foreground shadow-card'
                : 'text-foreground-secondary hover:text-foreground'
            )}
          >
            {tone.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function DeleteSeriesButton({ seriesName, disabled, onConfirm }) {
  const { t } = useTranslation('meetings_series')
  return (
    <div className="flex flex-col items-end justify-end gap-1.5">
      <span className="invisible text-[11px]">.</span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            size="sm"
            className="h-9 border-border"
          >
            <Trash2 className="size-4 text-error" />
            <span>{t('form.delete')}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('form.deleteTitle', { name: seriesName })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('form.deleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('form.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm} className="bg-error hover:bg-error/90">
              {t('form.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function KeytermsList({ seriesId, source }) {
  const { t } = useTranslation('meetings_series')
  const qc = useQueryClient()
  const [newTerm, setNewTerm] = useState('')

  const manualQ = useQuery({
    queryKey: ['keyterms', seriesId, 'manual'],
    queryFn: () => listKeyterms(seriesId, 'manual'),
    enabled: source === 'active',
  })
  const acceptedQ = useQuery({
    queryKey: ['keyterms', seriesId, 'accepted'],
    queryFn: () => listKeyterms(seriesId, 'accepted'),
    enabled: source === 'active',
  })
  const suggestedQ = useQuery({
    queryKey: ['keyterms', seriesId, 'suggested'],
    queryFn: () => listKeyterms(seriesId, 'suggested'),
    enabled: source === 'suggested',
  })

  const add = useMutation({
    mutationFn: () => addKeyterm(seriesId, newTerm.trim()),
    onSuccess: () => {
      setNewTerm('')
      qc.invalidateQueries({ queryKey: ['keyterms', seriesId] })
      toast.success(t('keyterms.added'))
    },
    onError: (e) => toast.error(String(e)),
  })

  const accept = useMutation({
    mutationFn: (id) => acceptKeyterm(seriesId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keyterms', seriesId] }),
  })

  const reject = useMutation({
    mutationFn: (id) => rejectKeyterm(seriesId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keyterms', seriesId] }),
  })

  if (source === 'suggested') {
    const items = suggestedQ.data ?? []
    if (items.length === 0) {
      return (
        <div className="rounded-xl border border-border bg-background-elevated px-5 py-8 text-center text-sm text-foreground-tertiary">
          {t('empty.noSuggestions')}
        </div>
      )
    }
    return (
      <div className="space-y-2 rounded-xl border border-border bg-background-elevated p-4">
        {items.map((item) => {
          const id = item._id ?? item.id
          return (
            <div
              key={id}
              className="flex items-center justify-between rounded-lg border border-border-light bg-background-secondary px-3.5 py-2"
              dir={dirOf(item.term)}
            >
              <span className="text-sm text-foreground">{item.term}</span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="default" onClick={() => accept.mutate(id)}>
                  {t('keyterms.accept')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => reject.mutate(id)}>
                  {t('keyterms.reject')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const manualItems = manualQ.data ?? []
  const acceptedItems = acceptedQ.data ?? []

  return (
    <div className="space-y-5 rounded-xl border border-border bg-background-elevated p-5">
      <div className="flex gap-2">
        <Input
          dir="auto"
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          placeholder={t('keyterms.addPlaceholder')}
          className="h-9 border-border"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newTerm.trim()) add.mutate()
          }}
        />
        <Button
          onClick={() => add.mutate()}
          disabled={!newTerm.trim() || add.isPending}
          className="h-9"
        >
          <Plus className="size-4" />
          <span>{t('keyterms.add')}</span>
        </Button>
      </div>
      <KeytermGroup
        label={t('keyterms.manual')}
        items={manualItems}
        toneClass="bg-foreground text-background border-foreground"
        onRemove={(id) => reject.mutate(id)}
      />
      <KeytermGroup
        label={t('keyterms.accepted')}
        items={acceptedItems}
        toneClass="bg-success/10 text-success border-success/30"
        onRemove={(id) => reject.mutate(id)}
      />
    </div>
  )
}

function KeytermGroup({ label, items, toneClass, onRemove }) {
  const { t } = useTranslation('meetings_series')
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-foreground-secondary">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-xs text-foreground-tertiary">{t('keyterms.empty')}</span>
        ) : (
          items.map((item) => {
            const id = item._id ?? item.id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onRemove(id)}
                title={t('keyterms.removeHint')}
                dir={dirOf(item.term)}
                className={cn(
                  'group inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-opacity hover:opacity-80',
                  toneClass
                )}
              >
                <span>{item.term}</span>
                <X className="size-3 opacity-60" />
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function SpeakerNamesList({ seriesId }) {
  const { t } = useTranslation('meetings_series')
  const { data } = useQuery({
    queryKey: ['speaker-names', seriesId],
    queryFn: () => listSeriesSpeakerNames(seriesId),
  })
  const items = data ?? []
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-background-elevated px-5 py-8 text-center text-sm leading-7 text-foreground-tertiary">
        {t('empty.noSpeakers')}
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-border bg-background-elevated p-5">
      <div className="flex flex-wrap gap-1.5">
        {items.map((name) => (
          <span
            key={name}
            dir={dirOf(name)}
            className="rounded-full border border-border bg-background-secondary px-2.5 py-0.5 text-xs text-foreground-secondary"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  )
}
