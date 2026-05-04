import { Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import RoleBadge from './RoleBadge'

function relativeTime(isoString) {
  if (!isoString) return ''
  const ms = new Date(isoString) - Date.now()
  const abs = Math.abs(ms)
  const minutes = Math.floor(abs / 60000)
  const hours = Math.floor(abs / 3600000)
  const days = Math.floor(abs / 86400000)

  if (ms < 0) return 'expired'
  if (days >= 1) return `expires in ${days}d`
  if (hours >= 1) return `expires in ${hours}h`
  if (minutes >= 1) return `expires in ${minutes}m`
  return 'expires soon'
}

export default function PendingInvitesList({ invites, onRevoke }) {
  if (!invites || invites.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-4">No pending invites.</p>
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
