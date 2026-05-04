import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Settings,
  Users,
  Layers,
  Send,
  CreditCard,
  Shield,
  Eye,
  AlertTriangle,
  Copy,
  RefreshCw,
  Search,
  Link as LinkIcon,
} from 'lucide-react'
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
import PageHeader from '@/components/teams/PageHeader'
import Section from '@/components/teams/Section'
import RoleBadge from '@/components/teams/RoleBadge'
import MembersTable from '@/components/teams/MembersTable'
import PendingInvitesList from '@/components/teams/PendingInvitesList'
import DangerZone from '@/components/teams/DangerZone'
import GroupsTab from './components/GroupsTab'
import BillingTab from './components/BillingTab'
import SecurityTab from './components/SecurityTab'
import AuditTab from './components/AuditTab'
import { workspaceService } from '@/services/workspaceService'
import groupService from '@/services/groupService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const TAB_DEFS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'members', label: 'Members', icon: Users, countKey: 'members' },
  { id: 'groups', label: 'Groups', icon: Layers, countKey: 'groups' },
  { id: 'invites', label: 'Invites', icon: Send, countKey: 'invites' },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'audit', label: 'Audit', icon: Eye },
  { id: 'danger', label: 'Danger', icon: AlertTriangle },
]

const VALID_TABS = TAB_DEFS.map((t) => t.id)

const INVITE_ROLE_OPTIONS = [
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'admin', label: 'Admin' },
  { value: 'billing-admin', label: 'Billing admin' },
  { value: 'guest', label: 'Guest' },
]

export default function WorkspaceSettingsPage() {
  const { wid } = useParams()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { refresh: refreshWorkspaces } = useWorkspace()

  const requestedTab = searchParams.get('tab')
  const activeTab = VALID_TABS.includes(requestedTab) ? requestedTab : 'general'

  const [workspace, setWorkspace] = useState(null)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [groupCount, setGroupCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // General
  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)

  // Members tab — search + status seg
  const [memberSearch, setMemberSearch] = useState('')
  const [memberStatus, setMemberStatus] = useState('all')

  // Invite row state
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteGroup, setInviteGroup] = useState('__none__')
  const [inviteSending, setInviteSending] = useState(false)

  // Group dropdown source for invite row.
  const [groupOptions, setGroupOptions] = useState([])

  const currentUserId = user?.id
  const currentUserRole = workspace?.member_role
  const isOwner = currentUserRole === 'owner'
  const isOwnerOrAdmin = isOwner || currentUserRole === 'admin'
  const isTeam = workspace?.type === 'team'

  const loadWorkspace = useCallback(async () => {
    try {
      const ws = await workspaceService.get(wid)
      setWorkspace(ws)
      setName(ws.name || '')
    } catch (err) {
      const status = err.response?.status
      if (status === 403 || status === 404) {
        nav('/chat', { replace: true })
        return
      }
      toast.error('Failed to load workspace')
    }
  }, [wid, nav])

  const loadMembers = useCallback(async () => {
    try {
      const list = await workspaceService.members(wid)
      setMembers(list)
    } catch {
      // silently fail
    }
  }, [wid])

  const loadInvites = useCallback(async () => {
    try {
      const list = await workspaceService.listInvites(wid)
      setInvites(list)
    } catch {
      // non-owners won't have access
    }
  }, [wid])

  const loadGroupOptions = useCallback(async () => {
    if (!isTeam) return
    try {
      const list = await groupService.list(wid)
      setGroupOptions(list)
      setGroupCount(list.length)
    } catch {
      // viewer+ should be able to read; if not, leave empty
    }
  }, [wid, isTeam])

  useEffect(() => {
    async function init() {
      setLoading(true)
      await loadWorkspace()
      await Promise.all([loadMembers(), loadInvites()])
      setLoading(false)
    }
    init()
  }, [loadWorkspace, loadMembers, loadInvites])

  useEffect(() => {
    if (workspace?.type === 'team') {
      loadGroupOptions()
    }
  }, [workspace?.type, loadGroupOptions])

  function setTab(id) {
    if (!VALID_TABS.includes(id)) return
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
  }

  async function handleSaveName(e) {
    e.preventDefault()
    if (!name.trim() || name.trim() === workspace?.name) return
    setNameSaving(true)
    try {
      const updated = await workspaceService.update(wid, { name: name.trim() })
      setWorkspace((prev) => ({ ...prev, ...updated }))
      await refreshWorkspaces()
      toast.success('Workspace renamed')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save')
    } finally {
      setNameSaving(false)
    }
  }

  async function handleRoleChange(uid, role) {
    try {
      await workspaceService.updateMember(wid, uid, role)
      await loadMembers()
      toast.success('Role updated')
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'last_owner_protected') {
        toast.error('Cannot demote the last owner')
      } else {
        toast.error(err.response?.data?.error || 'Failed to update role')
      }
    }
  }

  async function handleRemoveMember(uid) {
    try {
      await workspaceService.removeMember(wid, uid)
      await loadMembers()
      toast.success('Member removed')
    } catch (err) {
      const code = err.response?.data?.code
      if (code === 'last_owner_protected') {
        toast.error('Cannot remove the last owner')
      } else {
        toast.error(err.response?.data?.error || 'Failed to remove member')
      }
    }
  }

  async function handleSendInvite(e) {
    e?.preventDefault?.()
    const email = inviteEmail.trim()
    if (!email) return
    setInviteSending(true)
    try {
      const payload = { email, role: inviteRole }
      if (inviteGroup && inviteGroup !== '__none__') {
        payload.group_id = inviteGroup
      }
      await workspaceService.invite(wid, payload)
      await loadInvites()
      toast.success(`Invite sent to ${email}`)
      setInviteEmail('')
      setInviteRole('editor')
      setInviteGroup('__none__')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send invite')
    } finally {
      setInviteSending(false)
    }
  }

  async function handleRevokeInvite(token) {
    try {
      await workspaceService.revokeInvite(wid, token)
      await loadInvites()
      toast.success('Invite revoked')
    } catch {
      toast.error('Failed to revoke invite')
    }
  }

  async function handleDeleteWorkspace() {
    await workspaceService.delete(wid)
    localStorage.removeItem('active_workspace_id')
    await refreshWorkspaces()
    nav('/chat', { replace: true })
  }

  function copyInviteOrigin() {
    const url = `${window.location.origin}/invite/`
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Invite link copied'))
      .catch(() => toast.error('Could not copy'))
  }

  // Counts for tab-rail badges.
  const memberCount = useMemo(
    () => members.filter((m) => m.status !== 'pending').length,
    [members],
  )
  const pendingCount = useMemo(
    () => invites.filter((i) => !i.accepted_at).length,
    [invites],
  )

  const filteredMembers = useMemo(() => {
    let list = members
    if (memberStatus === 'pending') {
      list = list.filter((m) => m.status === 'pending')
    } else if (memberStatus === 'active') {
      list = list.filter((m) => m.status !== 'pending')
    } else if (memberStatus === 'suspended') {
      list = list.filter((m) => m.status === 'suspended')
    }
    if (memberSearch.trim()) {
      const q = memberSearch.toLowerCase()
      list = list.filter((m) => {
        const n = m.user?.display_name || ''
        const e = m.user?.email || m.invited_email || ''
        return n.toLowerCase().includes(q) || e.toLowerCase().includes(q)
      })
    }
    return list
  }, [members, memberSearch, memberStatus])

  const counts = {
    members: memberCount,
    groups: groupCount,
    invites: pendingCount,
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!workspace) return null

  // Filter the tab list — personal workspaces don't get team-only tabs.
  const visibleTabs = TAB_DEFS.filter((t) => {
    if (!isTeam && (t.id === 'invites' || t.id === 'groups' || t.id === 'audit'))
      return false
    return true
  })

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-0">
      <PageHeader
        crumbs={[workspace.name, 'Settings']}
        title="Workspace settings"
        subtitle="Manage members, groups, billing, and security policies"
        actions={
          currentUserRole ? (
            <RoleBadge role={currentUserRole} />
          ) : null
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* Left rail */}
        <nav
          className="flex flex-col gap-1 border-r border-line bg-bg-1 p-3 flex-shrink-0"
          style={{ width: 220 }}
        >
          {visibleTabs.map((t) => {
            const Icon = t.icon
            const isActive = t.id === activeTab
            const count = t.countKey ? counts[t.countKey] : undefined
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors text-left',
                  isActive
                    ? 'bg-bg-3 text-fg-0'
                    : 'text-fg-2 hover:bg-bg-2',
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="grow truncate">{t.label}</span>
                {count !== undefined && count > 0 && (
                  <span className="font-mono text-[11px] text-fg-3">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Right pane */}
        <div className="flex-1 overflow-auto p-6 bg-bg-0">
          {activeTab === 'general' && (
            <div style={{ maxWidth: 920 }} className="space-y-4">
              <Section
                title="Workspace details"
                hint="Public name and identity for this workspace"
              >
                <form onSubmit={handleSaveName} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ws-name">Name</Label>
                    <Input
                      id="ws-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={100}
                      placeholder="Workspace name"
                      disabled={!isOwnerOrAdmin}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-[12px] text-fg-3">Type:</Label>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-medium border',
                        isTeam
                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
                      )}
                    >
                      {workspace.type}
                    </span>
                  </div>
                  {isOwnerOrAdmin && (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        nameSaving || !name.trim() || name.trim() === workspace.name
                      }
                    >
                      {nameSaving ? 'Saving...' : 'Save name'}
                    </Button>
                  )}
                </form>
              </Section>
            </div>
          )}

          {activeTab === 'members' && (
            <div style={{ maxWidth: 920 }} className="space-y-4">
              {isTeam && isOwnerOrAdmin && (
                <Section
                  title="Invite members"
                  hint="Send invites by email or paste a list. New invites use SSO when enforced."
                >
                  <form
                    onSubmit={handleSendInvite}
                    className="flex flex-col gap-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="email"
                        placeholder="Add by email — name@acme.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="flex-1 min-w-[240px]"
                        required
                      />
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITE_ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={inviteGroup} onValueChange={setInviteGroup}>
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="No group" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No group</SelectItem>
                          {groupOptions.map((g) => (
                            <SelectItem key={g._id} value={g._id}>
                              {g.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="submit"
                        disabled={inviteSending || !inviteEmail.trim()}
                        className="gap-1.5"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {inviteSending ? 'Sending...' : 'Send invite'}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-fg-3">
                        <LinkIcon className="h-3 w-3" />
                        Invite link
                      </span>
                      <code className="font-mono text-[11px] flex-1 px-2 py-1 bg-bg-2 border border-line rounded text-fg-2 truncate">
                        {window.location.origin}/invite/...
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={copyInviteOrigin}
                        className="h-7 gap-1 text-xs"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => toast('Rotation coming soon', { icon: '🛠️' })}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Rotate
                      </Button>
                    </div>
                  </form>
                </Section>
              )}

              <Section
                title="Members"
                hint={`${memberCount} active · ${pendingCount} pending${
                  workspace.seats_total
                    ? ` · ${Math.max(0, workspace.seats_total - memberCount)} seats remaining`
                    : ''
                }`}
                padded={false}
                action={
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-[220px] items-center gap-1 rounded-md border border-line-2 bg-bg-0 px-2">
                      <Search className="h-3 w-3 text-fg-3" />
                      <input
                        type="search"
                        placeholder="Search members..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="flex-1 bg-transparent text-[12px] text-fg-1 placeholder:text-fg-3 outline-none"
                      />
                    </div>
                    <div className="inline-flex items-center gap-0.5 rounded-md border border-line bg-bg-2 p-0.5">
                      {['all', 'active', 'pending', 'suspended'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setMemberStatus(s)}
                          className={cn(
                            'rounded px-2 py-1 text-[11px] capitalize transition-colors',
                            memberStatus === s
                              ? 'bg-bg-4 text-fg-0'
                              : 'text-fg-3 hover:text-fg-1',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                }
              >
                <MembersTable
                  members={filteredMembers}
                  currentUserId={currentUserId}
                  currentUserRole={currentUserRole}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemoveMember}
                />
              </Section>
            </div>
          )}

          {activeTab === 'groups' && isTeam && (
            <GroupsTab
              wid={wid}
              members={members}
              canManage={isOwnerOrAdmin}
              onCountChange={setGroupCount}
            />
          )}

          {activeTab === 'invites' && isTeam && (
            <div style={{ maxWidth: 920 }}>
              <Section
                title="Pending invites"
                hint={`${pendingCount} awaiting response`}
              >
                <PendingInvitesList
                  invites={invites}
                  onRevoke={handleRevokeInvite}
                />
              </Section>
            </div>
          )}

          {activeTab === 'billing' && (
            <BillingTab
              wid={wid}
              workspace={workspace}
              isOwner={isOwner}
              onUpdated={(updated) =>
                setWorkspace((prev) => ({ ...prev, ...updated }))
              }
            />
          )}

          {activeTab === 'security' && (
            <SecurityTab
              wid={wid}
              workspace={workspace}
              isOwner={isOwner}
              onUpdated={(updated) =>
                setWorkspace((prev) => ({ ...prev, ...updated }))
              }
            />
          )}

          {activeTab === 'audit' && isTeam && (
            <AuditTab wid={wid} members={members} />
          )}

          {activeTab === 'danger' && (
            <div style={{ maxWidth: 920 }}>
              <Section
                title="Danger zone"
                hint="Irreversible actions for this workspace"
              >
                <DangerZone
                  title="Delete workspace"
                  description={
                    isTeam
                      ? `Permanently delete "${workspace.name}". Members will lose access. Conversations become unfiled.`
                      : 'This workspace cannot be deleted.'
                  }
                  confirmText={workspace.name}
                  disabled={!isTeam}
                  disabledReason={
                    !isTeam ? 'Personal workspaces cannot be deleted.' : undefined
                  }
                  onConfirm={handleDeleteWorkspace}
                />
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
