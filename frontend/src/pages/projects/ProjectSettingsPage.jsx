import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Settings,
  Users,
  AlertTriangle,
  Cpu,
  Star,
  Share2,
  MessageSquare,
  Flame,
  ChevronDown,
  ChevronRight,
  BookOpen,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'

import projectService from '@/services/projectService'
import { useProject } from '@/context/ProjectContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useAuth } from '@/context/AuthContext'

import PageHeader from '@/components/teams/PageHeader'
import Ptile from '@/components/teams/Ptile'
import Section from '@/components/teams/Section'
import DangerZone from '@/components/teams/DangerZone'

import ProjectAccessTab from './components/ProjectAccessTab'
import DefaultsTab from './components/DefaultsTab'
import IntegrationsTab from './components/IntegrationsTab'

import { cn } from '@/lib/utils'

const COLORS = ['#5c9aed', '#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#84cc16']

const TAB_IDS = ['general', 'access', 'defaults', 'danger']

// ---------------------------------------------------------------------------
// General tab — wraps existing settings form in a Section.
// ---------------------------------------------------------------------------
function GeneralTab({ project, onSaved }) {
  const { t } = useTranslation('projects')
  const [name, setName] = useState(project.name)
  const [color, setColor] = useState(project.color || COLORS[0])
  const [description, setDescription] = useState(project.description || '')
  const [archived, setArchived] = useState(!!project.archived)
  const [busy, setBusy] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(() => {
    try {
      return localStorage.getItem('projectSettings.advancedOpen') === 'true'
    } catch {
      return false
    }
  })

  function toggleAdvanced() {
    setAdvancedOpen((prev) => {
      const next = !prev
      try { localStorage.setItem('projectSettings.advancedOpen', String(next)) } catch { /* noop */ }
      return next
    })
  }

  useEffect(() => {
    setName(project.name)
    setColor(project.color || COLORS[0])
    setDescription(project.description || '')
    setArchived(!!project.archived)
  }, [project])

  async function handleSave(e) {
    e.preventDefault()
    if (!name.trim()) { toast.error(t('projectSettings.toasts.nameRequired')); return }
    setBusy(true)
    try {
      await projectService.update(project._id, {
        name: name.trim(),
        color,
        description: description.trim() || null,
        archived,
      })
      toast.success(t('projectSettings.toasts.projectUpdated'))
      await onSaved()
    } catch (ex) {
      toast.error(ex.response?.data?.error || t('projectSettings.toasts.saveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-[920px] space-y-4">
      <Section title={t('projectSettings.tabs.general')} hint={t('projectSettings.general.hint')}>
        <form onSubmit={handleSave} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="ps-name">{t('projectSettings.general.nameLabel')}</Label>
            <Input
              id="ps-name"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t('projectSettings.general.colorLabel')}</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'w-7 h-7 rounded-md border-2 transition-transform hover:scale-110',
                    color === c ? 'border-white ring-2 ring-white/30' : 'border-transparent',
                  )}
                  style={{ background: c }}
                  aria-label={t('projectSettings.general.colorAriaLabel', { color: c })}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ps-desc">{t('projectSettings.general.descriptionLabel')}</Label>
            <textarea
              id="ps-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              placeholder={t('projectSettings.general.descriptionPlaceholder')}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="ps-archived"
              checked={archived}
              onCheckedChange={setArchived}
            />
            <Label htmlFor="ps-archived" className="cursor-pointer">
              {t('projectSettings.general.archivedLabel')}
              <span className="block text-xs text-fg-3 font-normal">{t('projectSettings.general.archivedDesc')}</span>
            </Label>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              asChild
            >
              <Link to="/knowledge">
                <BookOpen className="h-3.5 w-3.5" />
                {t('projectSettings.openKnowledge')}
              </Link>
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? t('projectSettings.general.saving') : t('projectSettings.general.saveChanges')}
            </Button>
          </div>
        </form>
      </Section>

      {/* Advanced expandable — contains Integrations */}
      <div className="rounded-lg border border-line bg-bg-1">
        <button
          type="button"
          onClick={toggleAdvanced}
          className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-medium text-fg-1 hover:bg-bg-2 transition-colors rounded-lg"
        >
          {advancedOpen
            ? <ChevronDown className="h-4 w-4 text-fg-3" />
            : <ChevronRight className="h-4 w-4 text-fg-3" />}
          {t('projectSettings.advanced')}
        </button>
        {advancedOpen && (
          <div className="border-t border-line px-4 pb-4 pt-2">
            <IntegrationsTab project={project} />
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Left-rail nav item
// ---------------------------------------------------------------------------
function NavItem({ id, label, Icon, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-start transition-colors',
        active
          ? 'bg-bg-3 text-fg-0'
          : 'text-fg-2 hover:bg-bg-2',
      )}
      aria-current={active ? 'page' : undefined}
      data-tab={id}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {typeof count === 'number' && (
        <span className="text-[11px] font-mono text-fg-3">{count}</span>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function ProjectSettingsPage() {
  const { t } = useTranslation('projects')
  const { pid } = useParams()
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { refresh: refreshProject, setActiveProject } = useProject()
  const { currentWorkspace, workspaces } = useWorkspace()
  const { user } = useAuth() // eslint-disable-line no-unused-vars

  const [project, setProject] = useState(null)
  const [memberCount, setMemberCount] = useState(null)
  const [loading, setLoading] = useState(true)

  const initialTab = TAB_IDS.includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'general'
  const [tab, setTab] = useState(initialTab)

  // Sync tab → URL.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (next.get('tab') !== tab) {
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const loadProject = useCallback(async () => {
    try {
      const data = await projectService.get(pid)
      setProject(data)
    } catch (ex) {
      const status = ex.response?.status
      if (status === 403 || status === 404) {
        toast.error(t('projectSettings.toasts.notFoundOrDenied'))
        nav('/projects', { replace: true })
      } else {
        toast.error(t('projectSettings.toasts.loadFailed'))
      }
    } finally {
      setLoading(false)
    }
  }, [pid, nav, t])

  const loadMemberCount = useCallback(async () => {
    try {
      const list = await projectService.listMembers(pid)
      setMemberCount(Array.isArray(list) ? list.length : 0)
    } catch {
      setMemberCount(null)
    }
  }, [pid])

  useEffect(() => {
    loadProject()
    loadMemberCount()
  }, [loadProject, loadMemberCount])

  // Resolve workspace doc for header context.
  const workspace = useMemo(() => {
    if (!project?.workspace_id) return null
    if (currentWorkspace?._id === project.workspace_id) return currentWorkspace
    return workspaces.find(w => w._id === project.workspace_id) || null
  }, [project?.workspace_id, currentWorkspace, workspaces])

  async function handleSaved() {
    await loadProject()
    await refreshProject()
  }

  async function handleDelete() {
    await projectService.delete(pid)
    const wid = project.workspace_id
    if (wid) {
      localStorage.removeItem(`active_project_id::${wid}`)
    }
    await refreshProject()
    nav('/projects', { replace: true })
  }

  // Pin toggle with optimistic update + revert.
  async function handleTogglePin() {
    if (!project) return
    const next = !project.pinned
    setProject(p => ({ ...p, pinned: next }))
    try {
      await projectService.setPinned(pid, next)
      await refreshProject()
      toast.success(next ? t('projectSettings.toasts.pinned') : t('projectSettings.toasts.unpinned'))
    } catch (ex) {
      setProject(p => ({ ...p, pinned: !next }))
      toast.error(ex.response?.data?.error || t('projectSettings.toasts.pinFailed'))
    }
  }

  function handleOpenChat() {
    if (project) setActiveProject(project)
    nav('/chat')
  }

  async function handleShare() {
    if (!project?._id) return
    const url = `${window.location.origin}/projects/${project._id}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('projectSettings.toasts.linkCopied'))
    } catch {
      toast.error(t('projectSettings.toasts.copyFailed'))
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (!project) return null

  const projectGroup = project.group || project.tags?.[0] || null

  // ----------------------------------------------------------------
  // Header
  // ----------------------------------------------------------------
  const titleNode = (
    <span className="flex items-center gap-3">
      <Ptile size="lg" color={project.color || '#5c9aed'} icon={project.icon || 'Folder'} />
      <span className="truncate">{project.name}</span>
      {projectGroup && (
        <Badge
          variant="default"
          className="bg-pink/15 text-pink border border-pink/30 gap-1"
        >
          <Flame className="h-3 w-3" />
          {projectGroup}
        </Badge>
      )}
      <Badge
        variant="default"
        className={cn(
          'gap-1 border',
          project.archived
            ? 'bg-warn/15 text-warn border-warn/30'
            : 'bg-ok/15 text-ok border-ok/30',
        )}
      >
        {project.archived ? t('status.archived') : t('status.active')}
      </Badge>
    </span>
  )

  const headerActions = (
    <>
      <Button
        variant={project.pinned ? 'default' : 'outline'}
        size="sm"
        onClick={handleTogglePin}
        className="gap-1.5"
      >
        <Star className={cn('h-3.5 w-3.5', project.pinned && 'fill-current')} />
        {project.pinned ? t('projectSettings.general.unpin') : t('projectSettings.general.pin')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleShare}
      >
        <Share2 className="h-3.5 w-3.5" />
        {t('projectSettings.general.share')}
      </Button>
      <Button size="sm" onClick={handleOpenChat} className="gap-1.5">
        <MessageSquare className="h-3.5 w-3.5" />
        {t('projectSettings.general.openChat')}
      </Button>
    </>
  )

  const crumbs = [
    workspace?.name || t('projectSettings.crumbs.workspace'),
    t('projectsPage.title'),
    project.name,
    t('projectSettings.crumbs.settings'),
  ]

  // ----------------------------------------------------------------
  // Tabs config
  // ----------------------------------------------------------------
  const tabs = [
    { id: 'general',  label: t('projectSettings.tabs.general'),  Icon: Settings },
    { id: 'access',   label: t('projectSettings.tabs.members'),  Icon: Users,         count: memberCount ?? undefined },
    { id: 'defaults', label: t('projectSettings.tabs.defaults'), Icon: Cpu },
    { id: 'danger',   label: t('projectSettings.tabs.danger'),   Icon: AlertTriangle },
  ]

  // ----------------------------------------------------------------
  // Tab content
  // ----------------------------------------------------------------
  let body = null
  if (tab === 'general') {
    body = <GeneralTab project={project} onSaved={handleSaved} />
  } else if (tab === 'access') {
    body = <ProjectAccessTab project={project} workspace={workspace} />
  } else if (tab === 'defaults') {
    body = <DefaultsTab project={project} onSaved={handleSaved} />
  } else if (tab === 'danger') {
    body = (
      <div className="max-w-[920px]">
        <DangerZone
          title={t('projectSettings.danger.deleteTitle')}
          confirmText={project.name}
          onConfirm={handleDelete}
          description={t('projectSettings.danger.deleteDescription', { name: project.name })}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        crumbs={crumbs}
        title={titleNode}
        subtitle={project.description}
        actions={headerActions}
      />

      <div className="flex flex-1 min-h-0">
        {/* Left rail */}
        <div className="w-[220px] flex-shrink-0 border-e border-line bg-bg-1 p-3">
          <div className="flex flex-col gap-1">
            {tabs.map(t => (
              <NavItem
                key={t.id}
                id={t.id}
                label={t.label}
                Icon={t.Icon}
                count={t.count}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
              />
            ))}
          </div>
        </div>

        {/* Right pane */}
        <div className="flex-1 overflow-auto bg-bg-0 p-6">
          {body}
        </div>
      </div>
    </div>
  )
}
