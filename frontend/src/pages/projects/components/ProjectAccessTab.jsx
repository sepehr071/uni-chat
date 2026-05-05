import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Lock, MoreHorizontal, User as UserIcon, Layers } from 'lucide-react'
import toast from 'react-hot-toast'

import Section from '@/components/teams/Section'
import RoleBadge from '@/components/teams/RoleBadge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import api from '@/services/api'
import projectService from '@/services/projectService'
import workspaceService from '@/services/workspaceService'

import AccessRow from './AccessRow'

const ROLE_OPTIONS_GROUP = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'remove', label: 'Remove access', danger: true },
]

const ROLE_OPTIONS_DIRECT = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'owner', label: 'Owner' },
]

function roleLabel(role) {
  if (!role) return 'No access'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function formatExpires(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

function getInitials(name, email) {
  if (name) return name.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

export default function ProjectAccessTab({ project, workspace }) {
  const [access, setAccess] = useState({ groups: [], direct_members: [] })
  const [groups, setGroups] = useState([])
  const [wsMembers, setWsMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [addMemberOpen, setAddMemberOpen] = useState(false)

  const wid = project.workspace_id
  const pid = project._id

  const loadAccess = useCallback(async () => {
    try {
      const data = await projectService.getAccess(pid)
      setAccess(data || { groups: [], direct_members: [] })
    } catch (ex) {
      toast.error(ex.response?.data?.error || 'Failed to load access')
    }
  }, [pid])

  const loadGroups = useCallback(async () => {
    if (!wid) return
    try {
      const r = await api.get(`/workspaces/${wid}/groups/list`)
      setGroups(r.data?.groups || [])
    } catch {
      // viewer-level may not always succeed; non-fatal
      setGroups([])
    }
  }, [wid])

  const loadWsMembers = useCallback(async () => {
    if (!wid) return
    try {
      const list = await workspaceService.members(wid)
      setWsMembers((list || []).filter(m => m.status === 'active'))
    } catch {
      setWsMembers([])
    }
  }, [wid])

  useEffect(() => {
    let mounted = true
    async function init() {
      setLoading(true)
      await Promise.all([loadAccess(), loadGroups(), loadWsMembers()])
      if (mounted) setLoading(false)
    }
    init()
    return () => { mounted = false }
  }, [loadAccess, loadGroups, loadWsMembers])

  const wsName = workspace?.name || 'this workspace'
  const wsMemberCount = wsMembers.length

  // ---------------------------------------------------------------
  // Group access actions
  // ---------------------------------------------------------------
  async function handleGroupChange(grant, opt) {
    if (opt.value === 'remove') {
      try {
        await projectService.removeGroupAccess(pid, grant.group_id)
        await loadAccess()
        toast.success('Group access removed')
      } catch (ex) {
        toast.error(ex.response?.data?.error || 'Could not remove access')
      }
      return
    }
    try {
      await projectService.setGroupAccess(pid, grant.group_id, opt.value)
      await loadAccess()
      toast.success('Group role updated')
    } catch (ex) {
      toast.error(ex.response?.data?.error || 'Could not update role')
    }
  }

  // ---------------------------------------------------------------
  // Direct member actions (delegates to existing project member API)
  // ---------------------------------------------------------------
  async function handleMemberRoleChange(uid, role) {
    if (role === 'remove') {
      try {
        await projectService.removeMember(pid, uid)
        await loadAccess()
        toast.success('Member removed')
      } catch (ex) {
        const code = ex.response?.data?.code
        if (code === 'last_owner_protected') {
          toast.error('Cannot remove the last owner')
        } else {
          toast.error(ex.response?.data?.error || 'Could not remove member')
        }
      }
      return
    }
    try {
      await projectService.updateMember(pid, uid, role)
      await loadAccess()
      toast.success('Role updated')
    } catch (ex) {
      const code = ex.response?.data?.code
      if (code === 'last_owner_protected') {
        toast.error('Cannot demote the last owner')
      } else {
        toast.error(ex.response?.data?.error || 'Could not update role')
      }
    }
  }

  // Groups already granted, used to filter Add-group modal.
  const grantedGroupIds = useMemo(
    () => new Set((access.groups || []).map(g => g.group_id)),
    [access.groups],
  )

  // Workspace members not yet in direct_members, used to filter Add-member modal.
  const directIds = useMemo(
    () => new Set((access.direct_members || []).map(m => m.user_id)),
    [access.direct_members],
  )

  return (
    <div className="max-w-[920px]">
      {/* ------------------------------------------------------------- */}
      {/* Workspace access                                              */}
      {/* ------------------------------------------------------------- */}
      <Section
        title="Workspace access"
        hint="Who in the workspace can see and edit this project. Workspace owners always have full access."
      >
        <div className="flex flex-col gap-3">
          <AccessRow
            icon="Globe"
            iconBg="#5c9aed"
            title={`Everyone in ${wsName}`}
            sub={`All ${wsMemberCount} workspace member${wsMemberCount === 1 ? '' : 's'}`}
            value="No access"
            disabled
          />

          {(access.groups || []).map(g => {
            const expires = formatExpires(g.expires_at)
            const value = expires
              ? `${roleLabel(g.role)} · expires ${expires}`
              : roleLabel(g.role)
            return (
              <AccessRow
                key={g.group_id}
                icon="Layers"
                iconBg={g.color || '#a78bfa'}
                title={`${g.name} group`}
                sub={`Group access · role ${g.role}`}
                value={value}
                options={ROLE_OPTIONS_GROUP}
                onChange={opt => handleGroupChange(g, opt)}
              />
            )
          })}

          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddGroupOpen(true)}
              disabled={loading}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add group access
            </Button>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------- */}
      {/* Direct members                                                */}
      {/* ------------------------------------------------------------- */}
      <div className="mt-4">
        <Section
          title="Direct members"
          hint="Individuals with explicit access on top of group permissions"
          padded={false}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddMemberOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add member
            </Button>
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-start text-[11px] uppercase tracking-wide text-fg-3">
                <th className="px-4 py-2 font-medium">Member</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Role on project</th>
                <th className="px-4 py-2 font-medium">Last active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(access.direct_members || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-xs text-fg-3">
                    No explicit project members yet. Workspace owners always have access.
                  </td>
                </tr>
              )}
              {(access.direct_members || []).map(m => {
                const source = m.source || 'direct'
                const isDirect = source === 'direct'
                const viaGroup = !isDirect && source.startsWith('via_')
                  ? source.slice(4)
                  : null
                return (
                  <tr key={m.user_id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar size="sm">
                          {m.avatar_url && (
                            <AvatarImage src={m.avatar_url} alt={m.name || m.email} />
                          )}
                          <AvatarFallback className="text-[10px]">
                            {getInitials(m.name, m.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="text-fg-0 font-medium truncate">
                            {m.name || m.email || 'Unknown'}
                          </span>
                          {m.email && m.name && (
                            <span className="text-[11px] text-fg-3 truncate">
                              {m.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isDirect ? (
                        <Badge
                          variant="default"
                          className="bg-violet/15 text-violet border border-violet/30 gap-1"
                        >
                          <UserIcon className="h-3 w-3" />
                          Direct
                        </Badge>
                      ) : (
                        <Badge
                          variant="default"
                          className="bg-pink/15 text-pink border border-pink/30 gap-1"
                        >
                          <Layers className="h-3 w-3" />
                          via {viaGroup || 'group'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={m.role || 'viewer'} />
                    </td>
                    <td className="px-4 py-3 text-[11px] text-fg-3">
                      {m.last_active || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleMemberRoleChange(m.user_id, 'remove')}
                        className="text-fg-3 hover:text-fg-1"
                        title="Remove from project"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* Sharing                                                        */}
      {/* ------------------------------------------------------------- */}
      <div className="mt-4">
        <Section
          title="Sharing"
          hint="Public sharing is disabled at workspace level. Request from an admin to enable."
        >
          <div className="flex items-center gap-3 opacity-60">
            <Lock className="h-5 w-5 text-fg-3 flex-shrink-0" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium text-fg-0">Public link</span>
              <span className="text-[11px] text-fg-3">
                Disabled by {wsName} workspace policy.
              </span>
            </div>
            <Switch checked={false} disabled />
          </div>
        </Section>
      </div>

      <AddGroupAccessDialog
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        groups={groups.filter(g => !grantedGroupIds.has(g._id))}
        onSubmit={async ({ group_id, role, expires_at }) => {
          try {
            await projectService.setGroupAccess(pid, group_id, role, expires_at || null)
            await loadAccess()
            setAddGroupOpen(false)
            toast.success('Group access added')
          } catch (ex) {
            toast.error(ex.response?.data?.error || 'Could not add group access')
          }
        }}
      />

      <AddDirectMemberDialog
        open={addMemberOpen}
        onOpenChange={setAddMemberOpen}
        candidates={wsMembers.filter(m => !directIds.has(String(m.user?.id || m.user_id)))}
        onSubmit={async ({ user_id, role }) => {
          try {
            await projectService.addMember(pid, { user_id, role })
            await loadAccess()
            setAddMemberOpen(false)
            toast.success('Member added')
          } catch (ex) {
            toast.error(ex.response?.data?.error || 'Could not add member')
          }
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------
// Add group access modal
// ---------------------------------------------------------------------
function AddGroupAccessDialog({ open, onOpenChange, groups, onSubmit }) {
  const [groupId, setGroupId] = useState('')
  const [role, setRole] = useState('viewer')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setGroupId('')
      setRole('viewer')
      setExpiresAt('')
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!groupId) return
    setBusy(true)
    try {
      await onSubmit({
        group_id: groupId,
        role,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grant group access</DialogTitle>
          <DialogDescription>
            Pick a workspace group and a role for this project. Optionally set an expiry.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Group</Label>
            {groups.length === 0 ? (
              <p className="text-xs text-fg-3">
                No groups available. Create one in workspace settings first.
              </p>
            ) : (
              <Select value={groupId} onValueChange={setGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select group..." />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g._id} value={g._id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Expires (optional)</Label>
            <Input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!groupId || busy}>
              {busy ? 'Granting...' : 'Grant access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------
// Add direct member modal
// ---------------------------------------------------------------------
function AddDirectMemberDialog({ open, onOpenChange, candidates, onSubmit }) {
  const [uid, setUid] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setUid('')
      setRole('editor')
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!uid) return
    setBusy(true)
    try {
      await onSubmit({ user_id: uid, role })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add direct member</DialogTitle>
          <DialogDescription>
            Pick a workspace member and assign them an explicit role on this project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Workspace member</Label>
            {candidates.length === 0 ? (
              <p className="text-xs text-fg-3">All workspace members are already in this project.</p>
            ) : (
              <Select value={uid} onValueChange={setUid}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member..." />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map(m => {
                    const id = m.user?.id || m.user_id
                    const label = m.user?.display_name || m.user?.email || id
                    return (
                      <SelectItem key={id} value={id}>
                        {label}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS_DIRECT.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={!uid || busy}>
              {busy ? 'Adding...' : 'Add member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
