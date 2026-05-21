import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Plus,
  Filter,
  Upload,
  Search,
  Star,
  Folder,
  LayoutGrid,
  List,
  Users,
  MoreHorizontal,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import projectService from '@/services/projectService'
import groupService from '@/services/groupService'
import { fmtDistanceToNow } from '@/utils/dateLocale'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import CreateProjectModal from '@/components/projects/CreateProjectModal'
import ProjectCard from '@/components/projects/ProjectCard'
import EmptyState from '@/components/ui/empty-state'
import PageHeader from '@/components/teams/PageHeader'
import Ptile from '@/components/teams/Ptile'
import AvatarStack from '@/components/teams/AvatarStack'
import RoleBadge from '@/components/teams/RoleBadge'
import { cn } from '@/lib/utils'

function formatRelative(date) {
  if (!date) return '—'
  const then = new Date(date)
  if (isNaN(then.getTime())) return '—'
  return fmtDistanceToNow(then, { addSuffix: true })
}

function Seg({ items, value, onChange }) {
  return (
    <div className="inline-flex items-center rounded-md border border-line-2 bg-bg-0 p-0.5">
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium transition-colors',
              active
                ? 'bg-bg-3 text-fg-0'
                : 'text-fg-3 hover:text-fg-1',
            )}
          >
            {it.icon}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

const ACTIVITY_OPTION_DEFS = [
  { value: 'all', key: 'projectsPage.activity.any', days: null },
  { value: '7d', key: 'projectsPage.activity.week', days: 7 },
  { value: '30d', key: 'projectsPage.activity.month', days: 30 },
  { value: '90d', key: 'projectsPage.activity.inactive', days: 90 },
]

export default function ProjectsPage() {
  const { t } = useTranslation('projects')
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspace()
  const { projects: ctxProjects, refresh, setActiveProject } = useProject()
  const [open, setOpen] = useState(params.get('new') === '1')
  const [editing, setEditing] = useState(null)
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'grid'
    return localStorage.getItem('projects_view') || 'grid'
  })
  // Optimistic-pin overlay: { [projectId]: bool }
  const [pinOverrides, setPinOverrides] = useState({})
  const [groups, setGroups] = useState([])
  const [groupPopOpen, setGroupPopOpen] = useState(false)
  const [tagPopOpen, setTagPopOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)
  const nav = useNavigate()

  // Strip ?new=1 once consumed.
  useEffect(() => {
    if (open && params.get('new') === '1') {
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const search = (params.get('q') || '').trim()
  const filter = params.get('filter') || 'all'
  const sort = params.get('sort') || 'recent'
  const groupFilter = params.get('group') || ''
  const tagFilter = params.get('tag') || ''
  const createdByFilter = params.get('created_by') || ''
  const activityFilter = params.get('activity') || 'all'
  const hasTagsFilter = params.get('has_tags') === '1'

  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(() => {
    try {
      return localStorage.getItem('projectsAdvancedFiltersOpen') === 'true'
    } catch {
      return false
    }
  })

  function toggleAdvancedFilters() {
    setAdvancedFiltersOpen((prev) => {
      const next = !prev
      try { localStorage.setItem('projectsAdvancedFiltersOpen', String(next)) } catch { /* noop */ }
      return next
    })
  }

  const setParam = useCallback((key, value) => {
    const next = new URLSearchParams(params)
    if (value == null || value === '') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }, [params, setParams])

  const setViewPersist = useCallback((v) => {
    setView(v)
    try { localStorage.setItem('projects_view', v) } catch { /* noop */ }
  }, [])

  // Apply optimistic overrides on top of context list.
  const projects = useMemo(() => {
    if (!Object.keys(pinOverrides).length) return ctxProjects
    return ctxProjects.map(p =>
      pinOverrides[p._id] != null ? { ...p, pinned: pinOverrides[p._id] } : p,
    )
  }, [ctxProjects, pinOverrides])

  // Load workspace groups once per workspace.
  useEffect(() => {
    if (!currentWorkspace?._id) {
      setGroups([])
      return
    }
    let cancelled = false
    groupService
      .list(currentWorkspace._id)
      .then((list) => {
        if (!cancelled) setGroups(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load workspace groups:', err)
          setGroups([])
        }
      })
    return () => { cancelled = true }
  }, [currentWorkspace?._id])

  // Distinct tags across all projects (sorted).
  const allTags = useMemo(() => {
    const set = new Set()
    for (const p of projects) {
      for (const t of p.tags || []) {
        if (t) set.add(t)
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [projects])

  // Distinct created_by ids → label as "User <shortid>".
  const createdByOptions = useMemo(() => {
    const seen = new Map()
    for (const p of projects) {
      const id = typeof p.created_by === 'string'
        ? p.created_by
        : p.created_by?.$oid || p.created_by?._id || null
      if (!id) continue
      if (!seen.has(id)) {
        const label = p.created_by_name || `User ${String(id).slice(-6)}`
        seen.set(id, label)
      }
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label }))
  }, [projects])

  const userId = user?.id || user?._id || null

  const filtered = useMemo(() => {
    let list = projects.slice()

    // Preset filter.
    if (filter === 'mine') {
      list = list.filter(p =>
        p.member_role === 'owner' ||
        (userId && (p.created_by === userId || p.created_by?.$oid === userId)),
      )
    } else if (filter === 'pinned') {
      list = list.filter(p => p.pinned)
    } else if (filter === 'archived') {
      list = list.filter(p => p.archived)
    } else {
      list = list.filter(p => !p.archived)
    }

    // Search.
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => (t || '').toLowerCase().includes(q)),
      )
    }

    // Group filter.
    if (groupFilter) {
      list = list.filter(p => p.group === groupFilter)
    }

    // Tag filter.
    if (tagFilter) {
      list = list.filter(p => (p.tags || []).includes(tagFilter))
    }

    // Advanced filters.
    if (createdByFilter) {
      list = list.filter(p => {
        const id = typeof p.created_by === 'string'
          ? p.created_by
          : p.created_by?.$oid || p.created_by?._id || null
        return id === createdByFilter
      })
    }
    if (hasTagsFilter) {
      list = list.filter(p => (p.tags || []).length > 0)
    }
    if (activityFilter && activityFilter !== 'all') {
      const opt = ACTIVITY_OPTION_DEFS.find(o => o.value === activityFilter)
      if (opt?.days != null) {
        const cutoff = Date.now() - opt.days * 86400000
        list = list.filter(p => {
          const t = p.last_activity_at ? new Date(p.last_activity_at).getTime() : 0
          return t >= cutoff
        })
      }
    }

    // Sort.
    if (sort === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else if (sort === 'members') {
      list.sort((a, b) => (b.member_count || 0) - (a.member_count || 0))
    } else {
      list.sort((a, b) => {
        const da = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0
        const db = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0
        return db - da
      })
    }
    return list
  }, [
    projects, filter, search, sort, userId,
    groupFilter, tagFilter, createdByFilter, hasTagsFilter, activityFilter,
  ])

  const allActive = useMemo(() => projects.filter(p => !p.archived), [projects])
  const archivedAll = useMemo(() => projects.filter(p => p.archived), [projects])
  const memberCount = currentWorkspace?.member_count ?? currentWorkspace?.members_count ?? 0

  const hasAnyExtraFilter =
    !!groupFilter || !!tagFilter || !!createdByFilter || !!hasTagsFilter ||
    (activityFilter && activityFilter !== 'all')

  const clearAllFilters = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('group')
    next.delete('tag')
    next.delete('created_by')
    next.delete('activity')
    next.delete('has_tags')
    setParams(next, { replace: true })
  }, [params, setParams])

  const clearAllFiltersAndSearch = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('q')
    next.delete('filter')
    next.delete('group')
    next.delete('tag')
    next.delete('created_by')
    next.delete('activity')
    next.delete('has_tags')
    setParams(next, { replace: true })
  }, [params, setParams])

  async function handleSubmit(data) {
    if (editing) {
      await projectService.update(editing._id, data)
    } else {
      await projectService.create({ ...data, workspace_id: currentWorkspace._id })
    }
    await refresh()
    setEditing(null)
  }

  const handleTogglePin = useCallback(async (p) => {
    const next = !p.pinned
    setPinOverrides(prev => ({ ...prev, [p._id]: next }))
    try {
      await projectService.setPinned(p._id, next)
      await refresh()
      setPinOverrides(prev => {
        const { [p._id]: _, ...rest } = prev
        return rest
      })
    } catch (err) {
      setPinOverrides(prev => {
        const { [p._id]: _, ...rest } = prev
        return rest
      })
      console.error('Failed to toggle pin:', err)
    }
  }, [refresh])

  const handleOpen = useCallback((p) => {
    setActiveProject(p)
    nav('/chat')
  }, [nav, setActiveProject])

  const handleMenu = useCallback((p) => {
    if (p.member_role === 'owner') {
      nav(`/projects/${p._id}/settings`)
    }
  }, [nav])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so the same file can be re-picked
    if (!file || !currentWorkspace?._id) return

    setImporting(true)
    let entries
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) {
        throw new Error(t('projectsPage.import.parseExpectedArray'))
      }
      entries = parsed
    } catch (err) {
      console.error('Import parse failed:', err)
      window.alert(t('projectsPage.import.parseError', { error: err.message || t('projectsPage.import.parseFallback') }))
      setImporting(false)
      return
    }

    let success = 0
    let failed = 0
    const errors = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || !entry.name) {
        failed++
        errors.push(t('projectsPage.import.skippedNoName'))
        continue
      }
      try {
        await projectService.create({
          name: entry.name,
          color: entry.color,
          icon: entry.icon,
          description: entry.description,
          tags: Array.isArray(entry.tags) ? entry.tags : undefined,
          workspace_id: currentWorkspace._id,
        })
        success++
      } catch (err) {
        failed++
        errors.push(`${entry.name}: ${err?.response?.data?.error || err.message || 'unknown'}`)
      }
    }

    try {
      await refresh()
    } catch { /* noop */ }
    setImporting(false)

    const summary = t('projectsPage.import.summary', { count: success }) +
      (failed ? t('projectsPage.import.summaryFailures', { count: failed }) : t('projectsPage.import.summarySuffix'))
    if (failed && errors.length) {
      window.alert(`${summary}\n\n${errors.slice(0, 5).join('\n')}`)
    } else {
      window.alert(summary)
    }
  }, [currentWorkspace?._id, refresh, t])

  if (!currentWorkspace) {
    return <div className="p-8 text-fg-3">{t('projectsPage.noWorkspaceSelected')}</div>
  }

  const pinnedFiltered = filtered.filter(p => p.pinned)
  const restFiltered = filtered.filter(p => !p.pinned)

  const selectedGroup = groups.find(g => g.name === groupFilter) || null

  return (
    <div className="flex flex-col h-full bg-bg-0 text-fg-1">
      <PageHeader
        crumbs={[currentWorkspace.name, t('projectsPage.title')]}
        title={t('projectsPage.title')}
        subtitle={t('projectsPage.subtitle', {
          active: allActive.length,
          archived: archivedAll.length,
          members: t('projectsPage.memberCount', { count: memberCount }),
        })}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleImportClick}
              disabled={importing}
            >
              <Upload className="h-3.5 w-3.5" />
              {importing ? t('projectsPage.importing') : t('projectsPage.importProject')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => { setEditing(null); setOpen(true) }}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('projectsPage.newProject')}
            </Button>
          </>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0 border-b border-line bg-bg-1 px-6 py-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {/* Search */}
          <div className="flex h-8 w-[280px] items-center gap-1.5 rounded-md border border-line-2 bg-bg-0 px-2.5">
            <Search className="h-3.5 w-3.5 text-fg-3 flex-shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder={t('projectsPage.searchPlaceholder')}
              className="flex-1 min-w-0 bg-transparent text-[12.5px] text-fg-1 placeholder:text-fg-3 outline-none border-none"
            />
          </div>

          {/* Group filter chip */}
          <Popover open={groupPopOpen} onOpenChange={setGroupPopOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  groupFilter
                    ? 'border-line-2 bg-bg-0 text-fg-1'
                    : 'border-line-2 bg-bg-3 text-fg-2 hover:text-fg-1',
                )}
              >
                {selectedGroup?.color ? (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: selectedGroup.color }}
                  />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                <span>{groupFilter ? t('projectsPage.groupChip.label', { name: groupFilter }) : t('projectsPage.groupChip.labelAny')}</span>
                {groupFilter && (
                  <X
                    className="h-3 w-3 text-fg-3 hover:text-fg-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      setParam('group', null)
                    }}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput placeholder={t('projectsPage.groupChip.filterPlaceholder')} className="text-[12px]" />
                <CommandList>
                  <CommandEmpty>{t('projectsPage.groupChip.empty')}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setParam('group', null)
                        setGroupPopOpen(false)
                      }}
                      className="text-[12px]"
                    >
                      <span className="text-fg-2">{t('projectsPage.groupChip.anyOption')}</span>
                      {!groupFilter && <Check className="ms-auto h-3.5 w-3.5" />}
                    </CommandItem>
                    {groups.map((g) => (
                      <CommandItem
                        key={g._id || g.id || g.name}
                        value={g.name}
                        onSelect={(v) => {
                          setParam('group', v)
                          setGroupPopOpen(false)
                        }}
                        className="text-[12px]"
                      >
                        {g.color ? (
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: g.color }}
                          />
                        ) : (
                          <Users className="h-3.5 w-3.5 text-fg-3" />
                        )}
                        <span className="truncate">{g.name}</span>
                        {groupFilter === g.name && <Check className="ms-auto h-3.5 w-3.5" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Status filter */}
          <Seg
            value={filter}
            onChange={(v) => setParam('filter', v === 'all' ? null : v)}
            items={[
              { value: 'all', label: t('projectsPage.filters.all') },
              { value: 'pinned', label: t('projectsPage.filters.pinned') },
              { value: 'archived', label: t('status.archived') },
            ]}
          />

          {/* Advanced filters toggle */}
          <button
            type="button"
            onClick={toggleAdvancedFilters}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
              advancedFiltersOpen || hasAnyExtraFilter
                ? 'border-line-2 bg-bg-0 text-fg-1'
                : 'border-line-2 bg-bg-3 text-fg-2 hover:text-fg-1',
            )}
          >
            <Filter className="h-3 w-3" />
            {t('projectsPage.advancedFilters')}
            {hasAnyExtraFilter && (
              <span className="ms-1 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] text-fg-3">{t('projectsPage.sortLabel')}</span>
          <Seg
            value={sort}
            onChange={(v) => setParam('sort', v === 'recent' ? null : v)}
            items={[
              { value: 'recent', label: t('projectsPage.sortOptions.recent') },
              { value: 'name', label: t('projectsPage.sortOptions.az') },
              { value: 'members', label: t('projectsPage.sortOptions.members') },
            ]}
          />
          <Seg
            value={view}
            onChange={setViewPersist}
            items={[
              { value: 'grid', label: '', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
              { value: 'list', label: '', icon: <List className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>
      </div>

      {/* Advanced filter row — collapsed by default */}
      {advancedFiltersOpen && (
        <div className="flex flex-wrap items-center gap-3 flex-shrink-0 border-b border-line bg-bg-1 px-6 py-2.5">
          {/* Tag filter chip */}
          <Popover open={tagPopOpen} onOpenChange={setTagPopOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  tagFilter
                    ? 'border-line-2 bg-bg-0 text-fg-1'
                    : 'border-line-2 bg-bg-3 text-fg-2 hover:text-fg-1',
                )}
              >
                <span className="font-mono">#</span>
                <span className="ms-0.5">{tagFilter ? t('projectsPage.tagChip.label', { name: tagFilter }) : t('projectsPage.tagChip.labelAny')}</span>
                {tagFilter && (
                  <X
                    className="h-3 w-3 text-fg-3 hover:text-fg-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      setParam('tag', null)
                    }}
                  />
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[220px] p-0" align="start">
              <Command>
                <CommandInput placeholder={t('projectsPage.tagChip.filterPlaceholder')} className="text-[12px]" />
                <CommandList>
                  <CommandEmpty>{t('projectsPage.tagChip.empty')}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => {
                        setParam('tag', null)
                        setTagPopOpen(false)
                      }}
                      className="text-[12px]"
                    >
                      <span className="text-fg-2">{t('projectsPage.tagChip.anyOption')}</span>
                      {!tagFilter && <Check className="ms-auto h-3.5 w-3.5" />}
                    </CommandItem>
                    {allTags.map((t) => (
                      <CommandItem
                        key={t}
                        value={t}
                        onSelect={(v) => {
                          setParam('tag', v)
                          setTagPopOpen(false)
                        }}
                        className="text-[12px]"
                      >
                        <span className="font-mono text-fg-3">#</span>
                        <span className="truncate">{t}</span>
                        {tagFilter === t && <Check className="ms-auto h-3.5 w-3.5" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Created by */}
          <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-3">
            {t('projectsPage.createdByLabel')}
            <select
              value={createdByFilter}
              onChange={(e) => setParam('created_by', e.target.value || null)}
              className="h-7 rounded-md border border-line-2 bg-bg-0 px-2 text-[11.5px] text-fg-1 outline-none focus:border-fg-3"
            >
              <option value="">{t('projectsPage.createdByAnyone')}</option>
              {createdByOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>

          {/* Activity */}
          <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-3">
            {t('projectsPage.activityShort')}
            <select
              value={activityFilter}
              onChange={(e) => setParam('activity', e.target.value === 'all' ? null : e.target.value)}
              className="h-7 rounded-md border border-line-2 bg-bg-0 px-2 text-[11.5px] text-fg-1 outline-none focus:border-fg-3"
            >
              {ACTIVITY_OPTION_DEFS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.key)}</option>
              ))}
            </select>
          </label>

          {/* Has tags toggle chip */}
          <button
            type="button"
            onClick={() => setParam('has_tags', hasTagsFilter ? null : '1')}
            aria-pressed={hasTagsFilter}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
              hasTagsFilter
                ? 'border-line-2 bg-bg-0 text-fg-1'
                : 'border-line-2 bg-bg-3 text-fg-2 hover:text-fg-1',
            )}
          >
            <span className="font-mono">#</span>
            {t('projectsPage.hasTags')}
            {hasTagsFilter && <Check className="h-3 w-3" />}
          </button>

          <div className="flex-1" />

          {hasAnyExtraFilter && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-[11.5px]"
              onClick={clearAllFilters}
            >
              <X className="h-3 w-3" />
              {t('projectsPage.resetFilters')}
            </Button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto bg-bg-0 p-6">
        {filtered.length === 0 ? (
          (search || hasAnyExtraFilter) ? (
            <EmptyState
              icon={Folder}
              title={t('projectsPage.noResults')}
              description={t('projectsPage.noProjectsDesc')}
              primaryCta={{
                label: t('projectsPage.clearFilters'),
                icon: X,
                onClick: clearAllFiltersAndSearch,
              }}
            />
          ) : filter === 'archived' ? (
            <EmptyState
              icon={Folder}
              title={t('projectsPage.empty.archived')}
              description={t('projectsPage.noProjectsDesc')}
            />
          ) : filter === 'pinned' ? (
            <EmptyState
              icon={Folder}
              title={t('projectsPage.empty.pinned')}
              description={t('projectsPage.noProjectsDesc')}
            />
          ) : (
            <EmptyState
              icon={Folder}
              title={t('projectsPage.emptyState.title')}
              description={t('projectsPage.emptyState.description')}
              primaryCta={{
                label: t('projectsPage.emptyState.cta'),
                icon: Plus,
                onClick: () => { setEditing(null); setOpen(true) },
              }}
            />
          )
        ) : view === 'grid' ? (
          <>
            {pinnedFiltered.length > 0 && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <Star className="h-3.5 w-3.5 text-warn fill-warn" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-2">
                    {t('projectsPage.groupsBucket.pinned')}
                  </span>
                  <div className="flex-1 border-t border-line" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {pinnedFiltered.map(p => (
                    <ProjectCard
                      key={p._id}
                      p={p}
                      onPin={handleTogglePin}
                      onClick={handleOpen}
                      onMenu={handleMenu}
                      members={[]}
                    />
                  ))}
                </div>
              </>
            )}
            <div className="flex items-center gap-2 mb-3">
              <Folder className="h-3.5 w-3.5 text-fg-3" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-2">
                {t('projectsPage.groupsBucket.allProjects')}
              </span>
              <span className="text-[11px] text-fg-3">· {restFiltered.length}</span>
              <div className="flex-1 border-t border-line" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {restFiltered.map(p => (
                <ProjectCard
                  key={p._id}
                  p={p}
                  onPin={handleTogglePin}
                  onClick={handleOpen}
                  onMenu={handleMenu}
                  members={[]}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-bg-1">
            <table className="w-full text-start">
              <thead>
                <tr className="bg-bg-1 border-b border-line">
                  <th style={{ width: 36 }} className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold"></th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold">{t('projectsPage.projectLabel')}</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold">{t('projectsPage.groupLabel')}</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold">{t('projectsPage.membersLabel')}</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold">{t('projectsPage.activityLabel')}</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold">{t('projectsPage.lastEditLabel')}</th>
                  <th className="px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-fg-3 font-semibold">{t('projectsPage.yourRoleLabel')}</th>
                  <th style={{ width: 36 }} className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const groupLabel = p.group || currentWorkspace?.name || ''
                  const role = p.member_role || 'editor'
                  return (
                    <tr
                      key={p._id}
                      className="border-b border-line last:border-b-0 cursor-pointer hover:bg-bg-2 transition-colors"
                      onClick={() => handleOpen(p)}
                    >
                      <td className="px-3 py-2 align-middle">
                        <button
                          type="button"
                          aria-label={p.pinned ? t('projectCard.unpinAriaLabel') : t('projectCard.pinAriaLabel')}
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(p) }}
                          className="inline-flex items-center justify-center rounded p-0.5 hover:bg-bg-3"
                        >
                          {p.pinned
                            ? <Star className="h-3.5 w-3.5 text-warn fill-warn" />
                            : <Star className="h-3.5 w-3.5 text-fg-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-2 min-w-0">
                          <Ptile
                            color={p.color || '#5c9aed'}
                            icon={p.icon}
                            letter={(p.name || '?').charAt(0).toUpperCase()}
                            size="sm"
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium text-fg-0 text-[13px] truncate">{p.name}</span>
                            {p.description && (
                              <span className="text-[11px] text-fg-3 truncate">{p.description}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        {groupLabel && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-line-2 bg-bg-3 px-2 py-0.5 text-[11px] text-fg-2">
                            <Users className="h-3 w-3" />
                            <span className="truncate max-w-[120px]">{groupLabel}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <AvatarStack users={[]} max={4} size="sm" />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="text-[11px] text-fg-3">
                          {t('projectsPage.list.chatsAndDocs', {
                            chatsLabel: t('projectsPage.list.chats', { count: Number(p.chats_count ?? 0) }),
                            docsLabel: t('projectsPage.list.docs', { count: Number(p.knowledge_count ?? 0) }),
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <span className="text-[11px] text-fg-3">{formatRelative(p.last_activity_at)}</span>
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <RoleBadge role={role} />
                      </td>
                      <td className="px-3 py-2 align-middle">
                        <button
                          type="button"
                          aria-label={t('projectCard.actionsAriaLabel')}
                          onClick={(e) => { e.stopPropagation(); handleMenu(p) }}
                          className="inline-flex items-center justify-center rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg-1"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateProjectModal
        open={open}
        onOpenChange={setOpen}
        onSubmit={handleSubmit}
        editProject={editing}
      />
    </div>
  )
}
