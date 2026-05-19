import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, StopCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import ActionItemsView from './components/ActionItemsView'
import DecisionsView from './components/DecisionsView'
import DiscussView from './components/DiscussView'
import EmailDraftView from './components/EmailDraftView'
import MeetingSidebar from './components/MeetingSidebar'
import MinutesView from './components/MinutesView'
import OpenQuestionsView from './components/OpenQuestionsView'
import QaView from './components/QaView'
import SummaryView from './components/SummaryView'
import TranscriptView from './components/TranscriptView'
import { CANCELLED_SENTINEL, IN_FLIGHT } from './components/MeetingStatus'
import {
  cancelMeeting,
  getMeeting,
  getSummary,
  regenerate,
  streamMeetingStatus,
} from '@/services/meetingsService'

function formatDuration(seconds) {
  if (seconds == null) return null
  const total = Math.max(0, Math.round(seconds))
  const mm = Math.floor(total / 60).toString().padStart(2, '0')
  const ss = (total % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}

function Panel({ tab, meetingId, meetingReady }) {
  switch (tab) {
    case 'summary':
      return <SummaryView meetingId={meetingId} />
    case 'actions':
      return <ActionItemsView meetingId={meetingId} />
    case 'decisions':
      return <DecisionsView meetingId={meetingId} />
    case 'qa':
      return <QaView meetingId={meetingId} />
    case 'open':
      return <OpenQuestionsView meetingId={meetingId} />
    case 'email':
      return <EmailDraftView meetingId={meetingId} />
    case 'minutes':
      return <MinutesView meetingId={meetingId} />
    case 'transcript':
      return <TranscriptView meetingId={meetingId} />
    case 'discuss':
      return <DiscussView meetingId={meetingId} meetingReady={meetingReady} />
    default:
      return null
  }
}

export default function MeetingDetailPage() {
  const { t } = useTranslation('meetings')
  const params = useParams()
  const id = params.id
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('summary')

  const meetingQ = useQuery({
    queryKey: ['meeting', id],
    queryFn: () => getMeeting(id),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && IN_FLIGHT.has(s) ? 2000 : false
    },
  })

  const summaryQ = useQuery({
    queryKey: ['summary', id],
    queryFn: () => getSummary(id),
    enabled: meetingQ.data?.status === 'done',
    retry: false,
  })

  const regenerateMut = useMutation({
    mutationFn: () => regenerate(id),
    onMutate: () => {
      queryClient.setQueryData(['meeting', id], (old) =>
        old ? { ...old, status: 'summarizing' } : old
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
      toast.success(t('detail.regenerateStarted'))
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'error'
      toast.error(`${t('detail.regenerateFailed')}: ${message}`)
    },
  })

  const cancelMut = useMutation({
    mutationFn: () => cancelMeeting(id),
    onMutate: () => {
      queryClient.setQueryData(['meeting', id], (old) =>
        old
          ? { ...old, status: 'failed', error_message: CANCELLED_SENTINEL }
          : old
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meeting', id] })
      toast.success(t('detail.cancelled'))
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'error'
      toast.error(`${t('detail.cancelFailed')}: ${message}`)
      queryClient.invalidateQueries({ queryKey: ['meeting', id] })
    },
  })

  const meeting = meetingQ.data
  const title = meeting?.title?.trim() || meeting?.original_filename || ''
  const duration = formatDuration(meeting?.duration_s ?? null)
  const status = meeting?.status

  // SSE wiring: subscribe while in-flight; invalidate caches on each event.
  useEffect(() => {
    if (!id) return undefined
    if (!status || !IN_FLIGHT.has(status)) return undefined
    const ac = new AbortController()
    const stream = streamMeetingStatus(id, {
      onEvent: ({ event }) => {
        if (event === 'phase_change' || event === 'transcript_complete') {
          queryClient.invalidateQueries({ queryKey: ['meeting', id] })
          queryClient.invalidateQueries({ queryKey: ['transcript', id] })
        } else if (event === 'artifact_complete') {
          queryClient.invalidateQueries({ queryKey: ['summary', id] })
        } else if (event === 'meeting_complete' || event === 'error') {
          queryClient.invalidateQueries({ queryKey: ['meeting', id] })
          queryClient.invalidateQueries({ queryKey: ['transcript', id] })
          queryClient.invalidateQueries({ queryKey: ['summary', id] })
        }
      },
      onError: (err) => {
        // Silent: react-query refetchInterval is the fallback.
        console.warn('[meeting-sse] stream error', err)
      },
      signal: ac.signal,
    })
    return () => {
      ac.abort()
      stream.cancel?.()
    }
  }, [id, status, queryClient])

  // Also: when transitioning into terminal status, invalidate caches once.
  useEffect(() => {
    if (status === 'done' || status === 'failed') {
      queryClient.invalidateQueries({ queryKey: ['meeting', id] })
      queryClient.invalidateQueries({ queryKey: ['transcript', id] })
      queryClient.invalidateQueries({ queryKey: ['summary', id] })
    }
  }, [status, id, queryClient])

  const inFlight = !!(status && IN_FLIGHT.has(status))
  const isCancelled =
    status === 'failed' && meeting?.error_message === CANCELLED_SENTINEL

  const counts = useMemo(() => {
    const s = summaryQ.data
    return {
      summary: null,
      actions: s?.action_items?.length ?? null,
      decisions: s?.decisions?.length ?? null,
      qa: s?.qa?.length ?? null,
      open: s?.open_questions?.length ?? null,
      email: null,
      minutes: s?.minutes?.length ?? null,
      transcript: null,
    }
  }, [summaryQ.data])

  function handleShare() {
    if (typeof navigator === 'undefined') return
    const url = window.location.href
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success(t('detail.shareLinkCopied')))
      .catch(() => toast.error(t('detail.shareLinkFailed')))
  }

  return (
    <div className="flex h-full min-h-0">
      <MeetingSidebar
        meetingId={id}
        title={title}
        duration={duration}
        speakerCount={meeting?.speakers?.length ?? null}
        createdAt={meeting?.created_at ?? null}
        active={tab}
        onSelect={setTab}
        counts={counts}
        initialStatus={meeting?.status}
        onShare={handleShare}
        onRegenerate={() => regenerateMut.mutate()}
        regenDisabled={
          regenerateMut.isPending || !meeting || status !== 'done'
        }
        regenPending={regenerateMut.isPending}
        discussDisabled={status !== 'done'}
      />
      <main className={tab === 'discuss' ? 'flex-1 min-h-0 bg-background' : 'flex-1 overflow-y-auto bg-background scroll-thin'}>
        {tab === 'discuss' && status !== 'failed' ? (
          <Panel tab={tab} meetingId={id} meetingReady={status === 'done'} />
        ) : (
          <div className="mx-auto max-w-[880px] px-10 py-9 pb-20">
            {inFlight && (
              <div
                className="mb-6 flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent"
                aria-live="polite"
              >
                <span
                  className="size-2 shrink-0 rounded-full bg-accent animate-pulse-dot"
                  aria-hidden="true"
                />
                <span className="flex-1">
                  {t(`processing.${status}`, { defaultValue: t('processing.default') })}
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelMut.mutate()}
                  disabled={cancelMut.isPending}
                  className="gap-1.5"
                >
                  <StopCircle
                    className={cancelMut.isPending ? 'animate-pulse' : undefined}
                  />
                  {t('processing.cancelStop')}
                </Button>
              </div>
            )}

            {status === 'failed' ? (
              isCancelled ? (
                <div className="rounded-2xl border border-border bg-background-elevated p-6">
                  <p className="text-base font-semibold text-foreground">
                    {t('processing.cancelledTitle')}
                  </p>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    {t('processing.cancelledHint')}
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl border border-error/30 bg-error/5 p-5">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-error" />
                  <div>
                    <p className="text-sm font-semibold text-error">
                      {t('processing.errorTitle')}
                    </p>
                    <p className="mt-1 text-sm text-foreground-secondary">
                      {meeting?.error_message || t('processing.errorUnknown')}
                    </p>
                  </div>
                </div>
              )
            ) : (
              <Panel tab={tab} meetingId={id} meetingReady={status === 'done'} />
            )}
          </div>
        )}
      </main>
    </div>
  )
}
