import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Sparkles, Trash2, MessageSquare } from 'lucide-react'
import { Button } from '../ui/button'
import {
  getHelperHistory,
  clearHelper,
} from '../../services/helperService'
import HelperMessage from './HelperMessage'
import HelperInput from './HelperInput'

/**
 * Helper assistant tab body.
 *
 * No outer shell, no width / collapse chrome — RightRail owns that. This
 * component is the helper conversation column: small header strip (title +
 * clear), scrollable message list, composer at the bottom.
 *
 * `active` indicates whether the Helper tab is the currently-visible tab. We
 * cancel any in-flight stream when switching tabs OR routes so a slow
 * helper response doesn't keep streaming into a hidden panel.
 */
export default function HelperPanel({ active = true }) {
  const { t } = useTranslation('helper')
  const location = useLocation()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingId, setStreamingId] = useState(null)
  const abortRef = useRef(null)
  const scrollRef = useRef(null)

  // Load history once on mount
  useEffect(() => {
    let alive = true
    getHelperHistory()
      .then((rows) => {
        if (!alive) return
        setMessages(
          (rows || []).map((m, idx) => ({
            id: m._id || `${idx}-${m.created_at || ''}`,
            role: m.role,
            content: m.content || '',
          })),
        )
      })
      .catch(() => {
        // History fetch is best-effort — silently fall back to empty state.
        if (alive) setMessages([])
      })
    return () => {
      alive = false
    }
  }, [])

  // Autoscroll to bottom on new content
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  // Cancel in-flight stream on route change OR tab switch — a slow response
  // shouldn't keep streaming into a panel the user can no longer see.
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        try {
          abortRef.current()
        } catch {
          /* ignore */
        }
        abortRef.current = null
      }
    }
  }, [location.pathname, active])

  const handleClear = useCallback(async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(t('clearConfirm'))) return
    try {
      await clearHelper()
    } catch {
      // best-effort — UI still wipes
    }
    setMessages([])
  }, [t])

  const handleMessageStart = useCallback((text) => {
    const userId = `u-${Date.now()}`
    const assistantId = `a-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '' },
    ])
    setStreamingId(assistantId)
    setStreaming(true)
    setInput('')
  }, [])

  const handleMessageChunk = useCallback((event) => {
    const chunk = event?.content || ''
    if (!chunk) return
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const next = prev.slice()
      const last = next[next.length - 1]
      if (last?.role === 'assistant') {
        next[next.length - 1] = { ...last, content: (last.content || '') + chunk }
      }
      return next
    })
  }, [])

  const handleMessageComplete = useCallback((event) => {
    const final = event?.content
    if (typeof final === 'string') {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const next = prev.slice()
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = { ...last, content: final }
        }
        return next
      })
    }
    setStreaming(false)
    setStreamingId(null)
    abortRef.current = null
  }, [])

  const handleMessageError = useCallback(
    (event) => {
      setMessages((prev) => {
        if (prev.length === 0) return prev
        const next = prev.slice()
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && !last.content) {
          next[next.length - 1] = {
            ...last,
            content: event?.error || t('errorStreaming'),
            isError: true,
          }
        }
        return next
      })
      setStreaming(false)
      setStreamingId(null)
      abortRef.current = null
    },
    [t],
  )

  // DLP block / require-confirm: HelperInput owns its own modal now; we just
  // surface a short inline error here so streaming state doesn't get stuck.
  const handleDlpBlock = useCallback(() => {
    handleMessageError({ error: t('dlp.block') })
  }, [handleMessageError, t])
  const handleDlpConfirmRequired = useCallback(() => {
    handleMessageError({ error: t('dlp.confirm') })
  }, [handleMessageError, t])

  const hasMessages = messages.length > 0

  return (
    <div className="flex h-full flex-col">
      {/* Header strip */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
        <Sparkles className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
        <h2 className="flex-1 truncate text-sm font-semibold text-foreground">
          {t('title')}
        </h2>
        {hasMessages && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            aria-label={t('clear')}
            title={t('clear')}
            className="h-8 w-8 text-foreground-muted hover:text-error"
            animated={false}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {!hasMessages && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">
              {t('empty.title')}
            </h3>
            <p className="text-xs text-foreground-muted leading-relaxed">
              {t('empty.body')}
            </p>
          </div>
        )}

        {hasMessages &&
          messages.map((m) => (
            <HelperMessage key={m.id} role={m.role} content={m.content} />
          ))}

        {streaming && streamingId && (() => {
          const last = messages[messages.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            return (
              <div className="text-xs text-foreground-muted ps-1">
                {t('loading')}
              </div>
            )
          }
          return null
        })()}
      </div>

      {/* Composer */}
      <HelperInput
        value={input}
        onChange={setInput}
        streaming={streaming}
        onMessageStart={handleMessageStart}
        onMessageChunk={handleMessageChunk}
        onMessageComplete={handleMessageComplete}
        onMessageError={handleMessageError}
        onDlpBlock={handleDlpBlock}
        onDlpConfirmRequired={handleDlpConfirmRequired}
        abortRef={abortRef}
      />
    </div>
  )
}
