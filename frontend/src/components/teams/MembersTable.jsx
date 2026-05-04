import { Trash2, ShieldCheck, Key, MoreHorizontal } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import RoleBadge from './RoleBadge'
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

const ROLE_OPTIONS = [
  { value: 'owner', label: 'owner' },
  { value: 'admin', label: 'admin' },
  { value: 'billing-admin', label: 'billing admin' },
  { value: 'editor', label: 'editor' },
  { value: 'viewer', label: 'viewer' },
  { value: 'guest', label: 'guest' },
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
}) {
  const isOwnerOrAdmin =
    currentUserRole === 'owner' || currentUserRole === 'admin'

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
        <td className="py-3 pr-2 align-middle w-8">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-line-2 bg-bg-2 accent-accent"
            disabled={isPending}
          />
        </td>
        <td className="py-3 pr-3 align-middle min-w-[200px]">
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
                    (you)
                  </span>
                )}
              </span>
              {name && (
                <span className="text-[11px] text-fg-3 truncate">{email}</span>
              )}
            </div>
          </div>
        </td>
        <td className="py-3 pr-3 align-middle">
          {isOwnerOrAdmin && !isPending && !isSelf ? (
            <Select
              value={member.role}
              onValueChange={(val) => onRoleChange(uid, val)}
            >
              <SelectTrigger className="h-7 w-[124px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <RoleBadge role={member.role} />
          )}
        </td>
        <td className="py-3 pr-3 align-middle">
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
        <td className="py-3 pr-3 align-middle">
          <span className="text-[11px] text-fg-3">
            {formatRelative(member.last_active_at)}
          </span>
        </td>
        <td className="py-3 pr-3 align-middle">
          <span className="text-[11px] text-fg-3">
            {formatJoined(member.joined_at || member.created_at)}
          </span>
        </td>
        <td className="py-3 pr-3 align-middle">
          {isPending ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/30 px-2 py-0.5 text-[10.5px] text-fg-2">
              Pending
            </span>
          ) : authMethod === 'sso' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-[10.5px] text-blue-300">
              <ShieldCheck className="h-3 w-3" />
              SSO
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/30 px-2 py-0.5 text-[10.5px] text-fg-2">
              <Key className="h-3 w-3" />
              Password
            </span>
          )}
        </td>
        <td className="py-3 pl-2 align-middle text-right w-10">
          {isOwnerOrAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-7 w-7 p-0 text-fg-3 hover:text-red-400',
                isPending && 'pointer-events-none opacity-40',
              )}
              onClick={() => onRemove(uid)}
              disabled={isPending}
              title="Remove member"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </td>
      </tr>
    )
  }

  if (active.length === 0 && pending.length === 0) {
    return (
      <p className="text-sm text-fg-3 px-4 py-6">No members found.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
            <th className="px-4 py-2.5 w-8">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-line-2 bg-bg-2 accent-accent"
              />
            </th>
            <th className="px-4 py-2.5">Name</th>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Groups</th>
            <th className="px-4 py-2.5">Last active</th>
            <th className="px-4 py-2.5">Joined</th>
            <th className="px-4 py-2.5">Auth</th>
            <th className="px-4 py-2.5 w-10"></th>
          </tr>
        </thead>
        <tbody className="[&>tr>td]:px-4">
          {active.map(renderRow)}
          {pending.map(renderRow)}
        </tbody>
      </table>
    </div>
  )
}
