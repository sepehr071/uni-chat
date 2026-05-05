import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Eye } from 'lucide-react'
import Section from '@/components/teams/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { workspaceService } from '@/services/workspaceService'

const ACTION_OPTIONS = [
  { value: '__all__', label: 'All actions' },
  { value: 'workspace_invite', label: 'Workspace invite' },
  { value: 'project_create', label: 'Project create' },
  { value: 'project_update', label: 'Project update' },
  { value: 'project_archive', label: 'Project archive' },
  { value: 'project_share', label: 'Project share' },
  { value: 'group_join', label: 'Group join' },
  { value: 'invite_rotate', label: 'Invite rotate' },
  { value: 'member_role_change', label: 'Member role change' },
]

const ACTION_BADGE_TONES = {
  workspace_invite: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  project_create: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  project_update: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  project_archive: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  project_share: 'bg-violet/15 text-violet border-violet/30',
  group_join: 'bg-pink/15 text-pink border-pink/30',
  invite_rotate: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  member_role_change: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name, email) {
  if (name) return name.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

function ActionBadge({ action }) {
  const tone =
    ACTION_BADGE_TONES[action] ||
    'bg-zinc-500/15 text-zinc-300 border-zinc-500/30'
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${tone}`}
    >
      {action || 'unknown'}
    </span>
  )
}

function DetailsCell({ details }) {
  if (!details || typeof details !== 'object') {
    return <span className="text-fg-3">—</span>
  }
  const keys = Object.keys(details)
  if (keys.length === 0) return <span className="text-fg-3">—</span>
  // Render up to 3 key:value pairs as compact muted text.
  const shown = keys.slice(0, 3).map((k) => {
    const v = details[k]
    let val = v
    if (v && typeof v === 'object') val = JSON.stringify(v)
    if (typeof val === 'string' && val.length > 40) val = val.slice(0, 40) + '…'
    return (
      <span key={k} className="text-[11px]">
        <span className="text-fg-3">{k}:</span>{' '}
        <span className="text-fg-2">{String(val)}</span>
      </span>
    )
  })
  return (
    <div className="flex flex-col gap-0.5 max-w-[260px] truncate">{shown}</div>
  )
}

/**
 * AuditTab — workspace-scoped activity feed.
 * Wired to GET /api/workspaces/<wid>/audit (admin-gated).
 */
export default function AuditTab({ wid, members = [] }) {
  const [entries, setEntries] = useState([])
  const [nextBefore, setNextBefore] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionFilter, setActionFilter] = useState('__all__')
  const [actorFilter, setActorFilter] = useState('__all__')
  const [sinceFilter, setSinceFilter] = useState('')

  const memberOptions = useMemo(() => {
    return (members || [])
      .filter((m) => m.user)
      .map((m) => ({
        value: String(m.user._id || m.user.id),
        label:
          m.user.display_name ||
          m.user.email ||
          (m.user._id ? `User ${m.user._id.slice(0, 6)}` : 'Unknown'),
      }))
  }, [members])

  const buildParams = useCallback(
    (before = null) => {
      const params = { limit: 50 }
      if (before) params.before = before
      if (actionFilter && actionFilter !== '__all__')
        params.action = actionFilter
      if (actorFilter && actorFilter !== '__all__')
        params.actor_id = actorFilter
      if (sinceFilter) {
        // Convert YYYY-MM-DD → ISO at start of day.
        try {
          const d = new Date(`${sinceFilter}T00:00:00`)
          if (!Number.isNaN(d.getTime())) params.since = d.toISOString()
        } catch {
          // ignore
        }
      }
      return params
    },
    [actionFilter, actorFilter, sinceFilter],
  )

  const load = useCallback(
    async (mode = 'reset') => {
      if (mode === 'reset') {
        setLoading(true)
      } else {
        setLoadingMore(true)
      }
      try {
        const before = mode === 'append' ? nextBefore : null
        const data = await workspaceService.getAudit(wid, buildParams(before))
        const newEntries = data?.entries || []
        if (mode === 'append') {
          setEntries((prev) => [...prev, ...newEntries])
        } else {
          setEntries(newEntries)
        }
        setNextBefore(data?.next_before || null)
      } catch (err) {
        const status = err.response?.status
        if (status === 403) {
          toast.error('You do not have permission to view the audit log')
        } else {
          toast.error('Failed to load audit log')
        }
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [wid, buildParams, nextBefore],
  )

  // Initial load + reload on filter change.
  useEffect(() => {
    load('reset')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, actionFilter, actorFilter, sinceFilter])

  return (
    <div style={{ maxWidth: 920 }} className="space-y-4">
      <Section
        title="Audit log"
        hint="All workspace activity, most recent first."
      >
        {/* Filter row */}
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-fg-3">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px] h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-fg-3">Actor</Label>
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger className="w-[200px] h-8 text-[12px]">
                <SelectValue placeholder="Any actor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Any actor</SelectItem>
                {memberOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <Label className="text-[11px] text-fg-3" htmlFor="audit-since">
              Since
            </Label>
            <Input
              id="audit-since"
              type="date"
              value={sinceFilter}
              onChange={(e) => setSinceFilter(e.target.value)}
              className="w-[160px] h-8 text-[12px]"
            />
          </div>

          {(actionFilter !== '__all__' ||
            actorFilter !== '__all__' ||
            sinceFilter) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                setActionFilter('__all__')
                setActorFilter('__all__')
                setSinceFilter('')
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="px-4 py-6 text-sm text-fg-3">Loading audit log...</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <Eye className="h-6 w-6 text-fg-3" />
            <p className="text-sm text-fg-2">No matching audit entries.</p>
            <p className="text-[11.5px] text-fg-3 max-w-md">
              Workspace activity will appear here once members start invites,
              project changes, or role updates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-start text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
                  <th className="px-3 py-2 whitespace-nowrap">When</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const actor = e.actor || {}
                  const display =
                    actor.display_name || actor.email || 'System'
                  return (
                    <tr
                      key={e._id}
                      className="border-b border-line last:border-0 align-top"
                    >
                      <td className="px-3 py-2 text-fg-2 whitespace-nowrap">
                        {fmtDateTime(e.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Avatar size="sm">
                            {actor.avatar_url && (
                              <AvatarImage
                                src={actor.avatar_url}
                                alt={display}
                              />
                            )}
                            <AvatarFallback className="text-[10px]">
                              {getInitials(actor.display_name, actor.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col min-w-0">
                            <span className="text-fg-1 truncate">
                              {display}
                            </span>
                            {actor.display_name && actor.email && (
                              <span className="text-[11px] text-fg-3 truncate">
                                {actor.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <ActionBadge action={e.action} />
                      </td>
                      <td className="px-3 py-2 text-fg-2">
                        {e.target_type ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11.5px] capitalize">
                              {e.target_type.replace(/_/g, ' ')}
                            </span>
                            {e.target_id && (
                              <span className="font-mono text-[10.5px] text-fg-3 truncate max-w-[160px]">
                                {String(e.target_id)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <DetailsCell details={e.details} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Load more */}
        {nextBefore && (
          <div className="mt-3 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={() => load('append')}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </Section>
    </div>
  )
}
