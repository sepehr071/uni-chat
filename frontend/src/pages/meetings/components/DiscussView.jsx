import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Send, Square, MessageSquare, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'

import { spawnConversation } from '@/services/meetingsService'
import { chatService } from '@/services/chatService'
import { streamChat, cancelChat } from '@/services/streamService'
import MarkdownRenderer from '@/components/chat/MarkdownRenderer'
import { dirOf } from '@/utils/rtl'
import { cn } from '@/utils/cn'

/**
 * Slim in-page chat for a single meeting. Talks to the regular chat SSE
 * endpoint (`POST /chat/stream`) against the conversation that
 * `/meetings/<id>/spawn-conversation` returns (now idempotent — same convId
 * across reopens of the Discuss tab).
 *
 * Excluded by design: file attachments, slash commands, branching, model
 * picker, code canvas. The seeded `system` message carries the meeting's
 * transcript + summary; the model is locked to `quick:<MEETING_DISCUSSION_MODEL>`
 * via the conversation's `config_id`.
 */
export default function DiscussView({ meetingId, meetingReady }) {
  const { t } = useTranslation('meetings')
  const queryClient = useQueryClient()

  const [conversationId, setConversationId] = useState(null)
  const [draft, setDraft] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [streamingMessageId, setStreamingMessageId] = useState(null)
  const [pendingMessages, setPendingMessages] = useState([])

  const abortRef = useRef(null)
  const scrollerRef = useRef(null)
  const textareaRef = useRef(null)

  // Step 1: ensure the meeting conversation exists. Idempotent server-side.
  const spawnMut = useMutation({
    mutationFn: () => spawnConversation(meetingId),
    onSuccess: (resp) => {
      const id = resp?.conversation_id ?? resp?._id ?? resp?.id
      if (id) setConversationId(String(id))
    },
  })

  useEffect(() => {
    if (!meetingReady) return
    if (conversationId) return
    if (spawnMut.isPending || spawnMut.isError) return
    spawnMut.mutate()
    // mutate only fires once until success — the guards above prevent loop.
  }, [meetingReady, conversationId, spawnMut])

  // Step 2: load persisted messages for that conversation.
  const messagesQ = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatService.getConversation(conversationId),
    enabled: !!conversationId,
    staleTime: 30_000,
  })

  // Surface visible messages (drop the system seed; users see chat only).
  const visibleMessages = useMemo(() => {
    const persisted = messagesQ.data?.messages || []
    const all = [...persisted, ...pendingMessages]
    return all.filter((m) => m.role !== 'system')
  }, [messagesQ.data, pendingMessages])

  // Reconcile: once the conversation refetch returns the saved assistant turn,
  // drop any pending placeholders whose content matches a persisted message.
  useEffect(() => {
    if (!messagesQ.data?.messages?.length) return
    const persistedIds = new Set(messagesQ.data.messages.map((m) => String(m._id)))
    setPendingMessages((prev) => prev.filter((m) => !persistedIds.has(String(m._id))))
  }, [messagesQ.data])

  // Auto-scroll to bottom on new content.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [visibleMessages.length, streamingContent])

  // Cleanup any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [])

  const conversation = messagesQ.data?.conversation
  const configId = conversation?.config_id

  async function handleSend() {
    const message = draft.trim()
    if (!message || !conversationId || !configId || isStreaming) return

    const tempUserId = `temp-user-${Date.now()}`
    const tempAssistantId = `temp-asst-${Date.now()}`
    setPendingMessages((prev) => [
      ...prev,
      {
        _id: tempUserId,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      },
    ])
    setDraft('')
    setIsStreaming(true)
    setStreamingContent('')
    setStreamingMessageId(tempAssistantId)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        {
          conversation_id: conversationId,
          config_id: configId,
          message,
          attachments: [],
        },
        {
          onMessageSaved: (data) => {
            // Swap optimistic user msg with saved one.
            setPendingMessages((prev) =>
              prev.map((m) =>
                m._id === tempUserId && data?.message?.role === 'user'
                  ? data.message
                  : m
              )
            )
          },
          onMessageStart: (data) => {
            if (data?.message_id) setStreamingMessageId(data.message_id)
          },
          onMessageChunk: (data) => {
            setStreamingContent((prev) => prev + (data?.content || ''))
          },
          onMessageComplete: (data) => {
            const newAssistant = {
              _id: data?.message_id || tempAssistantId,
              role: 'assistant',
              content: data?.content || '',
              metadata: data?.metadata,
              created_at: new Date().toISOString(),
            }
            setPendingMessages((prev) => [...prev, newAssistant])
            setIsStreaming(false)
            setStreamingMessageId(null)
            setStreamingContent('')
            // Refetch so the persisted thread becomes the source of truth.
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
          },
          onMessageError: (data) => {
            toast.error(data?.error || t('detail.discussFailed'))
            // Roll back optimistic user message on hard failure.
            setPendingMessages((prev) => prev.filter((m) => m._id !== tempUserId))
            setIsStreaming(false)
            setStreamingMessageId(null)
            setStreamingContent('')
          },
        }
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('detail.discussFailed'))
      setPendingMessages((prev) => prev.filter((m) => m._id !== tempUserId))
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')
    } finally {
      abortRef.current = null
    }
  }

  async function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (streamingMessageId && !String(streamingMessageId).startsWith('temp-')) {
      try {
        await cancelChat(streamingMessageId)
      } catch {
        // best-effort
      }
    }
    setIsStreaming(false)
    setStreamingMessageId(null)
    setStreamingContent('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Auto-grow textarea up to ~5 lines.
  function handleDraftChange(e) {
    setDraft(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`
    }
  }

  // --- render branches -----------------------------------------------------

  if (!meetingReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <MessageSquare className="size-9 text-foreground-tertiary" />
          <p className="text-sm text-foreground-secondary">
            {t('detail.discussNotReady')}
          </p>
        </div>
      </div>
    )
  }

  if (spawnMut.isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <AlertTriangle className="size-9 text-error" />
          <p className="text-sm text-foreground-secondary">
            {t('detail.discussFailed')}
          </p>
          <button
            type="button"
            onClick={() => spawnMut.reset()}
            className="rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-background-tertiary"
          >
            {t('detail.discussRetry')}
          </button>
        </div>
      </div>
    )
  }

  if (!conversationId || messagesQ.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-2.5 text-foreground-secondary">
          <Loader2 className="size-6 animate-spin text-accent" />
          <p className="text-sm">{t('detail.discussLoading')}</p>
        </div>
      </div>
    )
  }

  const showEmptyState = visibleMessages.length === 0 && !isStreaming

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto scroll-thin px-1 pb-2"
      >
        {showEmptyState ? (
          <div className="flex h-full flex-col items-center justify-center gap-5 px-6 py-10 text-center">
            <div className="rounded-full bg-accent/10 p-3 text-accent">
              <MessageSquare className="size-6" />
            </div>
            <p className="max-w-md text-sm text-foreground-secondary">
              {t('detail.discussEmpty')}
            </p>
            <div className="flex max-w-md flex-wrap items-center justify-center gap-2">
              {['discussSampleQ1', 'discussSampleQ2', 'discussSampleQ3'].map((key) => {
                const q = t(`detail.${key}`)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraft(q)}
                    className="rounded-full border border-border bg-background-elevated px-3 py-1.5 text-xs text-foreground-secondary transition-colors hover:bg-background-tertiary hover:text-foreground"
                  >
                    {q}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[760px] flex-col gap-5 py-6">
            {visibleMessages.map((m) => (
              <MessageBubble key={String(m._id)} message={m} />
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl bg-background-elevated px-4 py-3 text-sm text-foreground">
                  {streamingContent ? (
                    <MarkdownRenderer content={streamingContent} />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-foreground-tertiary">
                      <Loader2 className="size-3.5 animate-spin" />
                      …
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-background px-4 py-3">
        <div className="mx-auto flex max-w-[760px] items-end gap-2">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleKeyDown}
            placeholder={t('detail.discussPlaceholder')}
            dir={draft ? dirOf(draft) : undefined}
            rows={1}
            disabled={isStreaming || !configId}
            className={cn(
              'flex-1 resize-none rounded-xl border border-border bg-background-elevated px-3.5 py-2.5 text-sm text-foreground',
              'placeholder:text-foreground-tertiary',
              'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
              'disabled:cursor-not-allowed disabled:opacity-60'
            )}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-error/40 bg-error/10 px-3.5 text-xs font-semibold text-error transition-colors hover:bg-error/20"
            >
              <Square className="size-3.5" />
              {t('detail.discussStop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!draft.trim() || !configId}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-accent px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="size-3.5" />
              {t('detail.discussSend')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-4 py-3 text-sm',
          isUser
            ? 'bg-accent text-white'
            : 'bg-background-elevated text-foreground'
        )}
        dir={message.content ? dirOf(message.content) : undefined}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content || ''} />
        )}
      </div>
    </div>
  )
}
