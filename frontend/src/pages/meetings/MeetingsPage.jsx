import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar,
  Clock,
  Inbox,
  Search,
  SearchX,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import EmptyState from './components/EmptyState'
import MeetingStatus from './components/MeetingStatus'
import UploadSection from './components/UploadSection'
import { listMeetings } from '@/services/meetingsService'
import { listSeries } from '@/services/meetingSeriesService'
import { cn } from '@/utils/cn'
import { dirOf } from '@/utils/rtl'

const RELATIVE_EN = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

function relative(iso) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSeconds = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSeconds)
  if (abs < 60) return RELATIVE_EN.format(diffSeconds, 'second')
  if (abs < 3600) return RELATIVE_EN.format(Math.round(diffSeconds / 60), 'minute')
  if (abs < 86_400) return RELATIVE_EN.format(Math.round(diffSeconds / 3600), 'hour')
  if (abs < 86_400 * 30)
    return RELATIVE_EN.format(Math.round(diffSeconds / 86_400), 'day')
  if (abs < 86_400 * 365)
    return RELATIVE_EN.format(Math.round(diffSeconds / (86_400 * 30)), 'month')
  return RELATIVE_EN.format(Math.round(diffSeconds / (86_400 * 365)), 'year')
}

function formatDuration(seconds) {
  if (seconds == null) return null
  const total = Math.max(0, Math.round(seconds))
  const mm = Math.floor(total / 60).toString().padStart(2, '0')
  const ss = (total % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

function MeetingRow({ meeting, series, t }) {
  const meetingId = meeting._id ?? meeting.id
  const label = meeting.title?.trim() || meeting.original_filename
  const duration = formatDuration(meeting.duration_s)
  return (
    <Link
      to={`/meetings/${meetingId}`}
      className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40"
    >
      <article className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-border bg-background-elevated px-4 py-3.5 transition-all group-hover:-translate-y-px group-hover:border-foreground-tertiary group-hover:shadow-card">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <h3
              dir={dirOf(label)}
              className="truncate text-[14.5px] font-semibold leading-tight text-foreground"
            >
              {label}
            </h3>
            <MeetingStatus meetingId={meetingId} initialStatus={meeting.status} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-foreground-secondary">
            {series && (
              <span
                className="inline-flex items-center gap-1.5"
                dir={dirOf(series.name)}
              >
                <span
                  className="size-[5px] rounded-full bg-accent"
                  aria-hidden="true"
                />
                <span className="truncate">{series.name}</span>
              </span>
            )}
            {duration && (
              <span
                className="inline-flex items-center gap-1 font-mono tabular-nums"
                dir="ltr"
              >
                <Clock className="size-3" />
                <span>{duration}</span>
              </span>
            )}
            {meeting.num_speakers != null && (
              <span className="inline-flex items-center gap-1">
                <Users className="size-3" />
                <span>{t('card.speakerCount', { count: meeting.num_speakers })}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3" />
              <span>{relative(meeting.created_at)}</span>
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}

function SeriesChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-all',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'border-border bg-background-elevated text-foreground-secondary hover:border-foreground-tertiary'
      )}
      dir={dirOf(label)}
    >
      <span>{label}</span>
      {count != null && (
        <span
          className={cn(
            'rounded-full px-1.5 text-[10px] font-mono tabular-nums',
            active ? 'bg-white/20 text-background' : 'bg-background-secondary text-foreground-tertiary'
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export default function MeetingsPage() {
  const { t } = useTranslation('meetings')
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''
  const [seriesId, setSeriesId] = useState(null)
  const [q, setQ] = useState(initialQ)

  // Sync URL ?q= changes
  useEffect(() => {
    const next = searchParams.get('q') ?? ''
    setQ(next)
  }, [searchParams])

  const { data: seriesList } = useQuery({
    queryKey: ['series'],
    queryFn: listSeries,
  })

  const seriesById = useMemo(() => {
    const map = {}
    for (const s of seriesList ?? []) map[s._id ?? s.id] = s
    return map
  }, [seriesList])

  const filterKey = [seriesId ?? '', q.trim()]
  const { data, isLoading, isError } = useQuery({
    queryKey: ['meetings', ...filterKey],
    queryFn: () =>
      listMeetings({
        series_id: seriesId,
        q: q.trim() || null,
      }),
  })

  const meetings = data ?? []
  const filtersActive = !!(seriesId || q.trim())
  const count = meetings.length

  function syncQ(value) {
    setQ(value)
    const next = new URLSearchParams(searchParams)
    if (value.trim()) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl px-6 py-8">
        <header>
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            {t('page.title')}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-foreground-secondary">
            {t('page.subtitle')}
          </p>
        </header>

        <div className="mt-7">
          <UploadSection />
        </div>

        <section className="mt-7">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-[17px] font-semibold tracking-tight text-foreground">
              {t('page.recent')}
            </h2>
            {!isLoading && (
              <span className="text-xs text-foreground-tertiary">
                {t('page.count', { count })}
              </span>
            )}
            <div className="ms-auto flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground-tertiary" />
                <Input
                  dir="auto"
                  value={q}
                  onChange={(e) => syncQ(e.target.value)}
                  placeholder={t('page.searchPlaceholder')}
                  className="h-8 w-56 border-border bg-background-elevated pe-8 text-xs"
                />
              </div>
            </div>
          </div>

          {(seriesList ?? []).length > 0 && (
            <div
              className="mb-4 -mx-1 flex gap-1.5 overflow-x-auto scrollbar-none px-1"
              role="tablist"
            >
              <SeriesChip
                label={t('page.all')}
                active={seriesId === null}
                onClick={() => setSeriesId(null)}
              />
              {(seriesList ?? []).map((s) => {
                const id = s._id ?? s.id
                return (
                  <SeriesChip
                    key={id}
                    label={s.name}
                    count={s.meeting_count}
                    active={seriesId === id}
                    onClick={() => setSeriesId(seriesId === id ? null : id)}
                  />
                )
              })}
            </div>
          )}

          {isLoading ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[78px] rounded-xl border border-border-light bg-background-secondary animate-shimmer"
                />
              ))}
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-error/30 bg-error/5 p-5 text-center text-sm text-error">
              {t('errors.loadList')}
            </div>
          ) : meetings.length === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={SearchX}
                title={t('empty.noResults')}
                hint={t('empty.noResultsHint')}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={t('empty.noMeetings')}
                hint={t('empty.noMeetingsHint')}
              />
            )
          ) : (
            <div className="grid gap-2">
              {meetings.map((m) => (
                <MeetingRow
                  key={m._id ?? m.id}
                  meeting={m}
                  series={m.series_id ? seriesById[m.series_id] : undefined}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
