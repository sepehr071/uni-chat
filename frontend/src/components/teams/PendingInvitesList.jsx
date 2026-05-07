import { useState } from 'react'
import { Copy, X, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import RoleBadge from './RoleBadge'
import { workspaceService } from '@/services/workspaceService'

export default function PendingInvitesList({ invites, onRevoke, onResend, wid }) {
  const { t } = useTranslation('projects')
  const [resendingTokens, setResendingTokens] = useState(new Set())

  async function handleResend(token) {
    if (!wid) return
    setResendingTokens((prev) => new Set(prev).add(token))
    try {
      const result = await workspaceService.resendInvite(wid, token)
      if (result?.email_sent === false) {
        toast(t('workspaceSettings.invites.resentLink'), { duration: 5000 })
      } else {
        toast.success(t('workspaceSettings.invites.resentEmail'))
      }
      if (onResend && result?.invite) {
        onResend({ old_token: token, invite: result.invite })
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to resend invite')
    } finally {
      setResendingTokens((prev) => {
        const next = new Set(prev)
        next.delete(token)
        return next
      })
    }
  }

  function relativeTime(isoString) {
    if (!isoString) return ''
    const ms = new Date(isoString) - Date.now()
    const abs = Math.abs(ms)
    const minutes = Math.floor(abs / 60000)
    const hours = Math.floor(abs / 3600000)
    const days = Math.floor(abs / 86400000)

    if (ms < 0) return t('workspaceSettings.invites.expired')
    if (days >= 1) return t('workspaceSettings.invites.expiresIn', { time: `${days}d` })
    if (hours >= 1) return t('workspaceSettings.invites.expiresIn', { time: `${hours}h` })
    if (minutes >= 1) return t('workspaceSettings.invites.expiresIn', { time: `${minutes}m` })
    return t('workspaceSettings.invites.expiresIn', { time: '<1m' })
  }

  if (!invites || invites.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">{t('workspaceSettings.invites.noInvites')}</p>
    )
  }

  function copyLink(token) {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url).then(() => {
      // Clipboard write succeeded silently
    }).catch(() => {
      // Fallback: prompt user
      window.prompt('Copy invite link:', url)
    })
  }

  return (
    <div className="space-y-1">
      {invites.map((invite) => (
        <div
          key={invite.token}
          className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-zinc-900/50 border border-zinc-800"
        >
          <div className="flex-1 min-w-0">
            <span className="text-sm text-zinc-200 truncate block">
              {invite.email}
            </span>
            <span className="text-xs text-zinc-500">
              {relativeTime(invite.expires_at)}
            </span>
          </div>

          <RoleBadge role={invite.role} />

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
            onClick={() => copyLink(invite.token)}
            title="Copy invite link"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          {wid && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-zinc-400 hover:text-blue-400"
              onClick={() => handleResend(invite.token)}
              disabled={resendingTokens.has(invite.token)}
              title={t('workspaceSettings.invites.resend')}
            >
              <RotateCw className={`h-3.5 w-3.5 ${resendingTokens.has(invite.token) ? 'animate-spin' : ''}`} />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
            onClick={() => onRevoke(invite.token)}
            title="Revoke invite"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  )
}
