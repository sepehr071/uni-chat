import { useState } from 'react'
import { Trash2, ShieldCheck, Key, MoreHorizontal, ArrowRightLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import RoleBadge from './RoleBadge'
import { workspaceService } from '@/services/workspaceService'
import { cn } from '@/lib/utils'

function getInitials(name, email) {
  if (name) return name.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

function formatRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (days < 30) return `${days}d`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatJoined(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  })
}

const ROLE_OPTION_KEYS = [
  { value: 'owner', key: 'roles.owner' },
  { value: 'editor', key: 'roles.editor' },
  { value: 'viewer', key: 'roles.viewer' },
]

/**
 * MembersTable — workspace member listing with extended columns.
 *
 * Extended columns (Phase 7):
 *   - Groups       : optional `member.groups` array (`[{_id, name, color}]`).
 *   - Last active  : optional `member.last_active_at` ISO string.
 *   - Joined       : `member.joined_at` (or `created_at` fallback).
 *   - Auth         : optional `member.auth_method` ('sso' | 'password').
 *                    Defaults to SSO badge for non-guests, Password for guests.
 *
 * All extended columns degrade gracefully when the backend doesn't provide
 * the data — they render `—` rather than blanks.
 */
export default function MembersTable({
  members,
  currentUserId,
  currentUserRole,
  onRoleChange,
  onRemove,
  wid,
  onRefresh,
}) {
  const { t } = useTranslation('projects')
  const isOwnerOrAdmin =
    currentUserRole === 'owner' || currentUserRole === 'admin'
  const isOwner = currentUserRole === 'owner'

  const [transferTarget, setTransferTarget] = useState(null)
  const [transferBusy, setTransferBusy] = useState(false)

  async function handleTransferOwnership() {
    if (!wid || !transferTarget) return
    setTransferBusy(true)
    try {
      await workspaceService.transferOwnership(wid, transferTarget.user?.id)
      toast.success(t('workspaceSettings.members.transferDone'))
      setTransferTarget(null)
      await onRefresh?.()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to transfer ownership')
    } finally {
      setTransferBusy(false)
    }
  }

  const active = members.filter((m) => m.status !== 'pending')
  const pending = members.filter((m) => m.status === 'pending')

  function renderRow(member) {
    const uid = member.user?.id
    const name = member.user?.display_name
    const email = member.user?.email || member.invited_email || ''
    const isSelf = uid === currentUserId
    const isPending = member.status === 'pending'
    const groups = Array.isArray(member.groups) ? member.groups : []
    const authMethod =
      member.auth_method ||
      (member.role === 'guest' ? 'password' : 'sso')

    return (
      <tr
        key={member._id}
        className="border-b border-line last:border-0 hover:bg-bg-2/40 transition-colors"
      >
        <td className="py-3 pe-2 align-middle w-8">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-line-2 bg-bg-2 accent-accent"
            disabled={isPending}
          />
        </td>
        <td className="py-3 pe-3 align-middle min-w-[200px]">
          <div className="flex items-center gap-2.5">
            <Avatar size="sm">
              {member.user?.avatar_url && (
                <AvatarImage src={member.user.avatar_url} alt={name || email} />
              )}
              <AvatarFallback className="text-[10px]">
                {getInitials(name, email)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-fg-0 truncate">
                {name || email}
                {isSelf && (
                  <span className="text-[11px] font-normal text-fg-3">
                    {t('workspaceSettings.members.you')}
                  </span>
                )}
              </span>
              {name && (
                <span className="text-[11px] text-fg-3 truncate">{email}</span>
              )}
            </div>
          </div>
        </td>
        <td className="py-3 pe-3 align-middle">
          {isOwnerOrAdmin && !isPending && !isSelf ? (
            <Select
              value={member.role}
              onValueChange={(val) => onRoleChange(uid, val)}
            >
              <SelectTrigger className="h-7 w-[124px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTION_KEYS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <RoleBadge role={member.role} />
          )}
        </td>
        <td className="py-3 pe-3 align-middle">
          {groups.length === 0 ? (
            <span className="text-[11px] text-fg-3">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {groups.slice(0, 2).map((g) => (
                <span
                  key={g._id || g.id || g.name}
                  className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-bg-2 px-2 py-0.5 text-[10.5px] text-fg-1"
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: g.color || '#5c9aed' }}
                  />
                  {g.name}
                </span>
              ))}
              {groups.length > 2 && (
                <span className="text-[10.5px] text-fg-3">
                  +{groups.length - 2}
                </span>
              )}
            </div>
          )}
        </td>
        <td className="py-3 pe-3 align-middle">
          <span className="text-[11px] text-fg-3">
            {formatRelative(member.last_active_at)}
          </span>
        </td>
        <td className="py-3 pe-3 align-middle">
          <span className="text-[11px] text-fg-3">
            {formatJoined(member.joined_at || member.created_at)}
          </span>
        </td>
        <td className="py-3 pe-3 align-middle">
          {isPending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/30 px-2 py-0.5 text-[10.5px] text-fg-2">
              {t('status.pending')}
            </span>
          ) : authMethod === 'sso' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[10.5px] text-blue-300">
              <ShieldCheck className="h-3 w-3" />
              {t('auth.sso')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/30 px-2 py-0.5 text-[10.5px] text-fg-2">
              <Key className="h-3 w-3" />
              {t('auth.password')}
            </span>
          )}
        </td>
        <td className="py-3 ps-2 align-middle text-end w-10">
          {isOwnerOrAdmin && !isPending && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-fg-3 hover:text-fg-1"
                  aria-label="Member actions"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwner && !isSelf && member.role !== 'owner' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => setTransferTarget(member)}
                      className="gap-2"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      {t('workspaceSettings.members.transferOwnership')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  onClick={() => onRemove(uid)}
                  className="gap-2 text-err focus:text-err"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </td>
      </tr>
    )
  }

  if (active.length === 0 && pending.length === 0) {
    return (
      <p className="text-sm text-fg-3 px-4 py-6">{t('workspaceSettings.members.noMembers')}</p>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <thead>
            <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
              <th className="px-4 py-2.5 w-8">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-line-2 bg-bg-2 accent-accent"
                />
              </th>
              <th className="px-4 py-2.5">{t('workspaceSettings.members.headers.name')}</th>
              <th className="px-4 py-2.5">{t('workspaceSettings.members.headers.role')}</th>
              <th className="px-4 py-2.5">{t('workspaceSettings.members.headers.groups')}</th>
              <th className="px-4 py-2.5">{t('workspaceSettings.members.headers.lastActive')}</th>
              <th className="px-4 py-2.5">{t('workspaceSettings.members.headers.joined')}</th>
              <th className="px-4 py-2.5">{t('workspaceSettings.members.headers.auth')}</th>
              <th className="px-4 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody className="[&>tr>td]:px-4">
            {active.map(renderRow)}
            {pending.map(renderRow)}
          </tbody>
        </table>
      </div>

      {/* Transfer ownership confirm dialog */}
      <Dialog open={!!transferTarget} onOpenChange={(open) => !open && setTransferTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workspaceSettings.members.transferConfirmTitle')}</DialogTitle>
            <DialogDescription>
              {transferTarget?.user?.display_name || transferTarget?.user?.email}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-fg-2">
            {t('workspaceSettings.members.transferConfirmBody')}
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTransferTarget(null)}
              disabled={transferBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleTransferOwnership}
              disabled={transferBusy}
            >
              {transferBusy ? '...' : t('workspaceSettings.members.transferConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
