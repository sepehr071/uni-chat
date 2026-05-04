import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronsUpDown,
  Check,
  Search,
  Inbox,
  Star,
  Lock,
  Plus,
  Building2,
  Settings,
  UserPlus,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import Ptile from '@/components/teams/Ptile'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import { cn } from '@/lib/utils'

const ROLE_PILL = {
  owner: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  admin: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  'billing-admin': 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  editor: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  viewer: 'bg-zinc-500/15 text-zinc-400 border border-zinc-500/30',
  guest: 'bg-pink-500/15 text-pink-400 border border-pink-500/30',
}

const WS_PALETTE = ['#5c9aed', '#10b981', '#f59e0b', '#a78bfa', '#f472b6', '#2dd4bf', '#ef4444']
function workspaceColor(ws) {
  if (!ws?._id) return '#5c9aed'
  if (ws.type === 'personal') return '#10b981'
  let h = 0
  for (let i = 0; i < ws._id.length; i++) h = (h * 31 + ws._id.charCodeAt(i)) >>> 0
  return WS_PALETTE[h % WS_PALETTE.length]
}

function firstLetter(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function memberMeta(ws) {
  if (!ws) return ''
  if (ws.type === 'personal') return 'just you'
  const count = ws.member_count ?? ws.members_count
  if (typeof count === 'number') return `${count} member${count === 1 ? '' : 's'}`
  return ''
}

export default function WorkspaceSwitcher({ collapsed = false }) {
  const wsCtx = useWorkspace()
  const { workspaces, currentWorkspace, setActiveWorkspace } = wsCtx
  const { projects, currentProject, setActiveProject, setUnfiledView } = useProject()

  // Use context-driven popover state when available; defensive local fallback otherwise.
  const [localOpen, setLocalOpen] = useState(false)
  const open = wsCtx?.switcherOpen ?? localOpen
  const setOpen = wsCtx?.setSwitcherOpen ?? setLocalOpen

  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const nav = useNavigate()

  const role = currentWorkspace?.member_role
  const pillClass = role ? ROLE_PILL[role] ?? ROLE_PILL.viewer : null

  const isOwner = currentWorkspace?.member_role === 'owner'

  const activeProjects = useMemo(
    () => projects.filter((p) => !p.archived),
    [projects],
  )

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activeProjects
    return activeProjects.filter((p) => p.name?.toLowerCase().includes(q))
  }, [activeProjects, query])

  const otherWorkspaces = useMemo(
    () => workspaces.filter((w) => w._id !== currentWorkspace?._id),
    [workspaces, currentWorkspace?._id],
  )

  const filteredOtherWorkspaces = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return otherWorkspaces
    return otherWorkspaces.filter((w) => w.name?.toLowerCase().includes(q))
  }, [otherWorkspaces, query])

  // Reset search when popover closes; focus input on open.
  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const id = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(id)
  }, [open])

  // Hotkeys: 'n' New project, 'w' New workspace. Only when popover open and
  // focus isn't inside the search input.
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      const isTyping =
        tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable
      if (isTyping) return
      const k = e.key?.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        setOpen(false)
        nav('/projects?new=1')
      } else if (k === 'w') {
        e.preventDefault()
        setOpen(false)
        nav('/workspaces/new')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, nav])

  const visibleProjects = filteredProjects.slice(0, 5)
  const overflowCount = activeProjects.length

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <PopoverTrigger asChild>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={open}
                  aria-label="Open workspace switcher"
                  className="rounded-lg hover:opacity-90 transition-opacity"
                >
                  <Ptile
                    size="md"
                    gradient
                    color="#5c9aed"
                    letter={firstLetter(currentWorkspace?.name)}
                  />
                </button>
              </TooltipTrigger>
            </PopoverTrigger>
            <TooltipContent side="right">
              {currentWorkspace?.name || 'No workspace'} &rsaquo;{' '}
              {currentProject?.name || 'Unfiled'}
            </TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              className="w-full flex flex-col gap-1 bg-bg-2 border border-line rounded-lg p-2 hover:border-line-2 hover:bg-bg-3 transition cursor-pointer min-h-[52px] text-left"
            >
              {/* Row 1: workspace ptile + name + role pill + chevron */}
              <span className="flex items-center gap-2">
                <Ptile
                  size="sm"
                  gradient
                  color="#5c9aed"
                  letter={firstLetter(currentWorkspace?.name)}
                />
                <span className="text-sm font-semibold text-fg-0 truncate flex-1">
                  {currentWorkspace?.name || 'No workspace'}
                </span>
                {pillClass && (
                  <span
                    className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide flex-shrink-0 font-medium',
                      pillClass,
                    )}
                  >
                    {role}
                  </span>
                )}
                <ChevronsUpDown className="h-3.5 w-3.5 text-fg-3 flex-shrink-0" />
              </span>

              {/* Row 2: project color/icon + name OR Unfiled */}
              <span className="flex items-center gap-1.5 pl-7">
                {currentProject ? (
                  <>
                    <span
                      style={{ background: currentProject.color || '#5c9aed' }}
                      className="w-2 h-2 rounded-sm flex-shrink-0"
                    />
                    <span className="text-xs text-fg-2 truncate">
                      {currentProject.name}
                    </span>
                  </>
                ) : (
                  <>
                    <Inbox className="h-3 w-3 text-fg-3 flex-shrink-0" />
                    <span className="text-xs text-fg-3 italic">Unfiled</span>
                  </>
                )}
              </span>
            </button>
          </PopoverTrigger>
        )}

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[380px] p-0 bg-bg-1 border border-line-2 shadow-lg rounded-xl overflow-hidden"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line">
            <Search className="h-3.5 w-3.5 text-fg-3 flex-shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Switch workspace, project, or recent…"
              className="flex-1 bg-transparent border-none outline-none text-[13px] text-fg-0 placeholder:text-fg-3 font-sans"
            />
            <kbd className="text-[10px] font-mono text-fg-3">esc</kbd>
          </div>

          {/* Current workspace */}
          {currentWorkspace && (
            <div className="px-3 pt-3 pb-2">
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 pl-1.5 mb-2">
                Current workspace
              </div>
              <div
                className="flex items-center gap-3 p-2.5 rounded-lg border"
                style={{
                  background: 'hsl(var(--accent-soft))',
                  borderColor: 'hsl(var(--accent-line))',
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-semibold text-white flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #5c9aed, #a78bfa)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {firstLetter(currentWorkspace.name)}
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[13px] font-semibold text-fg-0 truncate">
                      {currentWorkspace.name}
                    </span>
                    {currentWorkspace.plan_tier === 'enterprise' && (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-violet/15 text-violet border border-violet/30 flex-shrink-0">
                        Enterprise
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-fg-3 truncate">
                    {[
                      currentWorkspace.domain,
                      memberMeta(currentWorkspace),
                      role ? `you are ${role}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                <Check className="h-4 w-4 flex-shrink-0" style={{ color: 'hsl(var(--accent))' }} />
              </div>
            </div>
          )}

          {/* Projects in <ws> */}
          {currentWorkspace && (
            <div className="px-1.5 pt-1 pb-2.5">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 truncate">
                  Projects in {currentWorkspace.name}
                </span>
                <span className="text-[11px] text-fg-3 flex-shrink-0">
                  {activeProjects.length}
                </span>
              </div>
              <div className="flex flex-col gap-px">
                {/* Unfiled chats */}
                <SwitcherRow
                  italic
                  selected={!currentProject}
                  icon={
                    <span className="inline-flex items-center justify-center w-[22px] h-[22px] flex-shrink-0 text-fg-3">
                      <Inbox className="h-3.5 w-3.5" />
                    </span>
                  }
                  label="Unfiled chats"
                  onClick={() => {
                    setUnfiledView()
                    setOpen(false)
                  }}
                />

                {visibleProjects.map((p) => (
                  <SwitcherRow
                    key={p._id}
                    selected={currentProject?._id === p._id}
                    pinned={!!p.pinned}
                    meta={p.last_activity_at_label}
                    icon={
                      <Ptile
                        size="sm"
                        color={p.color || '#5c9aed'}
                        icon={p.icon}
                        letter={firstLetter(p.name)}
                        className="!w-[22px] !h-[22px] !rounded-md !text-[10px]"
                      />
                    }
                    label={p.name}
                    onClick={() => {
                      setActiveProject(p)
                      setOpen(false)
                    }}
                  />
                ))}

                {filteredProjects.length === 0 && query && (
                  <div className="px-2 py-2 text-[12px] text-fg-3 italic">
                    No projects match “{query}”
                  </div>
                )}

                {overflowCount > 0 && (
                  <div className="px-2 pt-1.5">
                    <button
                      type="button"
                      className="text-[11px] text-fg-3 hover:text-fg-1 transition-colors"
                      onClick={() => {
                        setOpen(false)
                        nav('/projects')
                      }}
                    >
                      Show all {overflowCount} →
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Other workspaces */}
          {filteredOtherWorkspaces.length > 0 && (
            <div className="px-1.5 pt-1 pb-2.5 border-t border-line">
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-2 pt-2 pb-1">
                Other workspaces
              </div>
              <div className="flex flex-col gap-px">
                {filteredOtherWorkspaces.map((w) => (
                  <SwitcherRow
                    key={w._id}
                    icon={
                      <Ptile
                        size="sm"
                        color={workspaceColor(w)}
                        letter={firstLetter(w.name)}
                        className="!w-[22px] !h-[22px] !rounded-md !text-[10px]"
                      />
                    }
                    label={w.name}
                    meta={memberMeta(w)}
                    badge={
                      w.sso_enforced ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <Lock className="h-2.5 w-2.5" />
                          SSO
                        </span>
                      ) : null
                    }
                    onClick={() => {
                      setActiveWorkspace(w)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Footer: 2x2 grid */}
          <div className="grid grid-cols-2 gap-1 p-2 bg-bg-2 border-t border-line">
            <SwitcherAction
              icon={<Plus className="h-3.5 w-3.5" />}
              label="New project"
              hotkey="N"
              onClick={() => {
                setOpen(false)
                nav('/projects?new=1')
              }}
            />
            <SwitcherAction
              icon={<Building2 className="h-3.5 w-3.5" />}
              label="New workspace"
              hotkey="W"
              onClick={() => {
                setOpen(false)
                nav('/workspaces/new')
              }}
            />
            {currentWorkspace && (
              <SwitcherAction
                icon={<Settings className="h-3.5 w-3.5" />}
                label="Workspace settings"
                onClick={() => {
                  setOpen(false)
                  nav(`/workspaces/${currentWorkspace._id}/settings`)
                }}
              />
            )}
            {currentWorkspace && isOwner && (
              <SwitcherAction
                icon={<UserPlus className="h-3.5 w-3.5" />}
                label="Invite members"
                onClick={() => {
                  setOpen(false)
                  nav(`/workspaces/${currentWorkspace._id}/settings?tab=invites`)
                }}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}

function SwitcherRow({ icon, label, meta, italic, selected, pinned, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md text-left w-full transition-colors',
        'hover:bg-bg-3',
        selected ? 'bg-bg-3' : 'bg-transparent',
      )}
    >
      {icon}
      <span
        className={cn(
          'flex-1 truncate text-[13px]',
          italic ? 'italic text-fg-3' : 'text-fg-1',
          selected && !italic ? 'font-medium' : 'font-normal',
        )}
      >
        {label}
      </span>
      {pinned && (
        <Star className="h-3 w-3 flex-shrink-0" style={{ color: 'hsl(var(--warn))', fill: 'hsl(var(--warn))' }} />
      )}
      {badge}
      {meta && (
        <span className="text-[10.5px] font-mono text-fg-3 flex-shrink-0">{meta}</span>
      )}
      {selected && (
        <Check className="h-3 w-3 flex-shrink-0" style={{ color: 'hsl(var(--accent))' }} />
      )}
    </button>
  )
}

function SwitcherAction({ icon, label, hotkey, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left w-full text-[12.5px] text-fg-2 hover:bg-bg-3 hover:text-fg-1 transition-colors"
    >
      <span className="flex-shrink-0 text-fg-2">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hotkey && (
        <span className="px-1.5 text-[10px] font-mono text-fg-3 bg-bg-3 border border-line rounded-sm">
          {hotkey}
        </span>
      )}
    </button>
  )
}
