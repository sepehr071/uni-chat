import { useCallback, useMemo, useState, createElement } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { dlpService } from '../services/dlpService'
import { useWorkspace } from '../context/WorkspaceContext'
import { useProject } from '../context/ProjectContext'
import DLPViolationModal from '../components/dlp/DLPViolationModal'

/**
 * Shared DLP pre-flight confirmation hook.
 *
 * Centralises the chat/helper pattern for surfaces (arena, debate,
 * automate-agent) that don't have the chat composer's bespoke state
 * machine but still need to honour workspace Content Safety policy.
 *
 * Usage:
 *
 *   const { scan, dlpModal } = useDlpConfirm({ source: 'arena' })
 *   const ok = await scan(userText)
 *   if (!ok) return                 // user dismissed / blocked
 *   await streamArena({ ..., dlp_confirmed: ok.confirmed }, handlers)
 *   // render in JSX:
 *   { dlpModal }
 *
 * `scan` returns:
 *   - `{ confirmed: false }` on `allow`/`warn` (warn surfaces a toast only)
 *   - `{ confirmed: true }`  after user clicks "Send anyway" on `require_confirm`
 *   - `null`                 if user closed / clicked "Modify" / hit `block`
 *
 * Scan-endpoint failures resolve to `{ confirmed: false }` — the backend
 * `dlp_gate` is the authoritative defence-in-depth fallback.
 *
 * @param {Object} opts
 * @param {'arena'|'debate'|'automate'} opts.source - Backend source tag.
 */
export function useDlpConfirm({ source }) {
  const { t } = useTranslation('dlp')
  const { currentWorkspace } = useWorkspace()
  const { currentProject } = useProject()
  const workspaceId = currentWorkspace?._id || null
  const projectId = currentProject?._id || null

  // Pending modal carries the matches, highest action, and a `resolve` so the
  // caller's awaited promise unblocks once the user dismisses or confirms.
  const [modal, setModal] = useState(null)

  const scan = useCallback(
    async (text) => {
      const value = (text || '').trim()
      if (!value) return { confirmed: false }
      if (!workspaceId) return { confirmed: false }

      let result
      try {
        const res = await dlpService.scan(value, workspaceId, source, projectId)
        result = res?.result
      } catch (err) {
        // Best-effort — backend dlp_gate covers the gap.
        if (typeof console !== 'undefined' && console?.error) {
          console.error('DLP pre-flight scan failed:', err)
        }
        return { confirmed: false }
      }

      const action = result?.highest_action
      if (!action || action === 'allow' || !result?.matches?.length) {
        return { confirmed: false }
      }

      if (action === 'warn') {
        // Non-blocking — surface a toast then proceed.
        toast(t('action.warn'), { icon: 'i' })
        return { confirmed: false }
      }

      // block / require_confirm — show the modal and await the user's choice.
      return new Promise((resolve) => {
        setModal({
          matches: result.matches,
          highestAction: action,
          resolve,
        })
      })
    },
    [workspaceId, projectId, source, t],
  )

  const handleClose = useCallback(() => {
    setModal((current) => {
      if (current) current.resolve(null)
      return null
    })
  }, [])

  const handleModify = useCallback(() => {
    setModal((current) => {
      if (current) current.resolve(null)
      return null
    })
  }, [])

  const handleSendAnyway = useCallback(() => {
    setModal((current) => {
      if (!current) return null
      if (current.highestAction === 'block') {
        // Safety — button is disabled but guard anyway.
        current.resolve(null)
        return null
      }
      current.resolve({ confirmed: true })
      return null
    })
  }, [])

  // Render the modal as JSX the page can drop into its tree.
  const dlpModal = useMemo(
    () =>
      createElement(DLPViolationModal, {
        isOpen: !!modal,
        onClose: handleClose,
        onModify: handleModify,
        onSendAnyway: handleSendAnyway,
        matches: modal?.matches || [],
        highestAction: modal?.highestAction || 'warn',
      }),
    [modal, handleClose, handleModify, handleSendAnyway],
  )

  return { scan, dlpModal }
}

export default useDlpConfirm
