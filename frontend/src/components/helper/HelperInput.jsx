import { useRef, useEffect, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Send, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui/button'
import { streamHelper } from '../../services/helperService'
import { dlpService } from '../../services/dlpService'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useProject } from '../../context/ProjectContext'
import DLPViolationModal from '../dlp/DLPViolationModal'
import { cn } from '../../utils/cn'

/**
 * Composer for the helper rail.
 *
 * Textarea auto-resizes between 40px and 160px. Enter sends, Shift+Enter
 * inserts a newline. Disabled while a request is streaming.
 *
 * DLP integration mirrors the chat composer (see
 * `frontend/src/pages/chat/hooks/useChatStream.js`):
 *
 *   1. Pre-flight `POST /api/dlp/scan` BEFORE calling `streamHelper`.
 *   2. `action=allow`             -> stream directly.
 *   3. `action=warn`              -> non-blocking toast, stream.
 *   4. `action=require_confirm`   -> modal w/ "Send anyway" -> resubmit with
 *                                    `dlp_confirmed: true`.
 *   5. `action=block`             -> modal w/ "Send anyway" disabled, no stream.
 *   6. Server-side `dlp_block` / `dlp_confirm_required` events (in case the
 *      client bypassed pre-flight) surface the same modal flow.
 *
 * Scan failure is non-fatal — never block the user on infra outages.
 */
export default function HelperInput({
  value,
  onChange,
  onMessageStart,
  onMessageChunk,
  onMessageComplete,
  onMessageError,
  onDlpBlock,
  onDlpConfirmRequired,
  streaming,
  disabled,
  abortRef,
}) {
  const { t } = useTranslation('helper')
  const location = useLocation()
  const textareaRef = useRef(null)

  const { currentWorkspace } = useWorkspace()
  const { currentProject } = useProject()
  const workspaceId = currentWorkspace?._id || null
  const projectId = currentProject?._id || null

  // DLP modal state — owned here so a single component handles pre-flight +
  // server-side dlp events uniformly.
  const [dlpModal, setDlpModal] = useState({
    open: false,
    matches: [],
    highestAction: 'warn',
    pendingText: '',
  })

  // Manual auto-resize (avoids pulling in react-textarea-autosize for a single
  // textarea). Capped so the composer never devours the rail.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  // Run the actual stream with optional dlp_confirmed flag. Extracted so both
  // the initial submit path and the "Send anyway" resubmit can call it.
  const runStream = useCallback(
    async (text, dlpConfirmed) => {
      const page_context = { route: location.pathname }

      const { abort } = await streamHelper(
        { message: text, page_context, dlp_confirmed: dlpConfirmed },
        (event) => {
          switch (event.type) {
            case 'message_start':
              // Server confirmed; nothing extra to do — rail already showed the user bubble.
              break
            case 'message_chunk':
              onMessageChunk?.(event)
              break
            case 'message_complete':
              onMessageComplete?.(event)
              break
            case 'dlp_block':
              // Defensive — server rejected after we already streamed
              // optimistically. Surface modal in block mode.
              setDlpModal({
                open: true,
                matches: event.matches || [],
                highestAction: 'block',
                pendingText: '',
              })
              onDlpBlock?.(event)
              break
            case 'dlp_confirm_required':
              setDlpModal({
                open: true,
                matches: event.matches || [],
                highestAction: 'require_confirm',
                pendingText: text,
              })
              onDlpConfirmRequired?.(event)
              break
            case 'message_error':
            case 'error':
              onMessageError?.(event)
              break
            default:
              // Forward unknown event types for forward-compat
              break
          }
        },
      )

      if (abortRef) {
        abortRef.current = abort
      }
    },
    [
      location.pathname,
      onMessageChunk,
      onMessageComplete,
      onMessageError,
      onDlpBlock,
      onDlpConfirmRequired,
      abortRef,
    ],
  )

  const submit = useCallback(async () => {
    const text = (value || '').trim()
    if (!text || streaming || disabled) return

    // ---- Pre-flight DLP scan ------------------------------------------
    // Best-effort: a scan failure (infra outage, 5xx) should NOT block the
    // user. The backend `dlp_gate` is the defense-in-depth fallback.
    if (workspaceId) {
      try {
        const scanRes = await dlpService.scan(text, workspaceId, 'helper', projectId)
        const result = scanRes?.result
        const action = result?.highest_action
        if (action && action !== 'allow' && result?.matches?.length) {
          if (action === 'warn') {
            toast(t('dlp.warn'), { icon: 'i' })
            // proceed without modal
          } else {
            // block or require_confirm — show modal and stop. The modal's
            // onSendAnyway will resubmit with dlp_confirmed for require_confirm.
            setDlpModal({
              open: true,
              matches: result.matches,
              highestAction: action,
              pendingText: text,
            })
            return
          }
        }
      } catch (err) {
        // Swallow — backend dlp_gate is the authoritative fallback.
        if (typeof console !== 'undefined' && console?.error) {
          console.error('DLP pre-flight scan failed:', err)
        }
      }
    }

    onMessageStart?.(text)
    await runStream(text, false)
  }, [
    value,
    streaming,
    disabled,
    workspaceId,
    projectId,
    t,
    onMessageStart,
    runStream,
  ])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // Modal handlers ------------------------------------------------------
  const closeDlpModal = useCallback(() => {
    setDlpModal((prev) => ({ ...prev, open: false }))
  }, [])

  const handleDlpModify = useCallback(() => {
    // Keep the text in the composer for the user to edit; just dismiss.
    closeDlpModal()
  }, [closeDlpModal])

  const handleDlpSendAnyway = useCallback(async () => {
    if (dlpModal.highestAction === 'block') return // safety — button is disabled anyway
    const text = dlpModal.pendingText
    closeDlpModal()
    if (!text) return
    onMessageStart?.(text)
    await runStream(text, true)
  }, [dlpModal.highestAction, dlpModal.pendingText, closeDlpModal, onMessageStart, runStream])

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className="flex items-end gap-2 border-t border-line bg-background-elevated p-3"
      >
        <textarea
          ref={textareaRef}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled || streaming}
          placeholder={t('placeholder')}
          className={cn(
            'flex-1 resize-none rounded-lg border border-line bg-background px-3 py-2',
            'text-sm text-foreground placeholder:text-foreground-muted',
            'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'min-h-[40px] max-h-[160px]',
          )}
          aria-label={t('placeholder')}
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || streaming || !(value || '').trim()}
          aria-label={t('send')}
          className="h-10 w-10 flex-shrink-0"
          animated={false}
        >
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>

      <DLPViolationModal
        isOpen={dlpModal.open}
        onClose={closeDlpModal}
        matches={dlpModal.matches}
        highestAction={dlpModal.highestAction}
        onModify={handleDlpModify}
        onSendAnyway={handleDlpSendAnyway}
      />
    </>
  )
}
