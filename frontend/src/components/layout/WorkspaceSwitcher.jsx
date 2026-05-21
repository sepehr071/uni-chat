import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  ChevronsUpDown,
  Check,
  Plus,
  Building2,
  Settings,
  UserPlus,
  Lock,
  LayoutDashboard,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { canCreateCompany } from '@/utils/auth'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { makeSwitchTo } from '@/utils/navHelpers'

// Member-role enum is `owner | editor | viewer` only — legacy `admin`,
// `billing-admin`, `guest` were collapsed (CLAUDE.md "Holding model"). Keep
// the holding-level `manager` pill: that role lives on `users.role`, not on
// `workspace_members`, but the switcher still surfaces it for CEO-promoted
// users that aren't workspace members yet.
const ROLE_PILL = {
  owner: 'bg-role-owner-bg text-role-owner-fg border border-role-owner-line',
  editor: 'bg-role-editor-bg text-role-editor-fg border border-role-editor-line',
  viewer: 'bg-role-viewer-bg text-role-viewer-fg border border-role-viewer-line',
  manager: 'bg-role-editor-bg text-role-editor-fg border border-role-editor-line',
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

function memberMeta(ws, t) {
  if (!ws) return ''
  if (ws.type === 'personal') return t('workspaceSwitcher.justYou')
  const count = ws.member_count ?? ws.members_count
  if (typeof count === 'number') {
    return count === 1
      ? t('workspaceSwitcher.members', { count })
      : t('workspaceSwitcher.membersPlural', { count })
  }
  return ''
}

function RolePill({ role }) {
  const pillClass = role ? ROLE_PILL[role] ?? ROLE_PILL.viewer : null
  if (!pillClass) return null
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide flex-shrink-0 font-medium',
        pillClass,
      )}
    >
      {role}
    </span>
  )
}

export default function WorkspaceSwitcher({ collapsed = false, pill = false }) {
  const { t } = useTranslation('layout')
  const { user } = useAuth()
  const wsCtx = useWorkspace()
  const { workspaces, currentWorkspace, setActiveWorkspace } = wsCtx

  const [localOpen, setLocalOpen] = useState(false)
  const open = wsCtx?.switcherOpen ?? localOpen
  const setOpen = wsCtx?.setSwitcherOpen ?? setLocalOpen

  const inputRef = useRef(null)
  const nav = useNavigate()
  const location = useLocation()

  // Switching company while on a wid-scoped route should re-target that route
  // to the new workspace; otherwise the URL keeps the stale id and BillingTab /
  // OverviewPage / SettingsPage all keep showing the old company's data.
  // P1.20: helper factored to @/utils/navHelpers so other callers
  // (CreateWorkspacePage / OnboardingWizard / AcceptInvitePage /
  // WorkspaceInvitesPanel) get the same behaviour instead of bare
  // setActiveWorkspace + stale URL.
  const switchTo = useCallback(
    (w) =>
      makeSwitchTo({
        setActiveWorkspace,
        currentWorkspaceId: currentWorkspace?._id,
        navigate: nav,
        location,
      })(w),
    [currentWorkspace?._id, location, nav, setActiveWorkspace],
  )

  const role = currentWorkspace?.member_role
  const isOwner = role === 'owner'
  const canCreate = canCreateCompany(user)

  const otherWorkspaces = useMemo(
    () => workspaces.filter((w) => w._id !== currentWorkspace?._id),
    [workspaces, currentWorkspace?._id],
  )

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = e.target?.tagName
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable
      if (isTyping) return
      const k = e.key?.toLowerCase()
      if (k === 'w' && canCreate) {
        e.preventDefault()
        setOpen(false)
        nav('/workspaces/new')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, nav, canCreate])

  return (
    <TooltipProvider>
      <Popover open={open} onOpenChange={setOpen}>
        {pill ? (
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              aria-label={t('header.openCompanySwitcher')}
              className="inline-flex items-center gap-1.5 px-2 hover:bg-bg-2 transition text-sm h-8 min-w-0"
            >
              <Ptile
                size="sm"
                gradient
                color={workspaceColor(currentWorkspace)}
                letter={firstLetter(currentWorkspace?.name)}
                className="!w-5 !h-5 !text-[10px]"
              />
              <span className="font-medium text-fg-0 truncate max-w-[140px] hidden md:inline">
                {currentWorkspace?.name || t('workspaceSwitcher.noWorkspace')}
              </span>
              <ChevronsUpDown className="h-3 w-3 text-fg-4 flex-shrink-0" />
            </button>
          </PopoverTrigger>
        ) : collapsed ? (
          <Tooltip delayDuration={0}>
            <PopoverTrigger asChild>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={open}
                  aria-label={t('header.openCompanySwitcher')}
                  className="rounded-lg hover:opacity-90 transition-opacity"
                >
                  <Ptile
                    size="md"
                    gradient
                    color={workspaceColor(currentWorkspace)}
                    letter={firstLetter(currentWorkspace?.name)}
                  />
                </button>
              </TooltipTrigger>
            </PopoverTrigger>
            <TooltipContent side="right">
              {currentWorkspace?.name || t('workspaceSwitcher.noWorkspace')}
            </TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              className="w-full flex items-center gap-2 bg-bg-2 border border-line rounded-lg px-3 py-2 hover:border-line-2 hover:bg-bg-3 transition cursor-pointer min-h-[56px] text-start"
            >
              <Ptile
                size="sm"
                gradient
                color={workspaceColor(currentWorkspace)}
                letter={firstLetter(currentWorkspace?.name)}
              />
              <span className="text-sm font-semibold text-fg-0 truncate flex-1">
                {currentWorkspace?.name || t('workspaceSwitcher.noWorkspace')}
              </span>
              {role && <RolePill role={role} />}
              <ChevronsUpDown className="h-3.5 w-3.5 text-fg-3 flex-shrink-0" />
            </button>
          </PopoverTrigger>
        )}

        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-[280px] p-0 bg-bg-1 border border-line-2 shadow-lg rounded-xl overflow-hidden"
        >
          {/* Current company */}
          {currentWorkspace && (
            <div className="px-3 pt-3 pb-2">
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 ps-1.5 mb-2">
                {t('workspaceSwitcher.currentWorkspace')}
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
                    background: `linear-gradient(135deg, ${workspaceColor(currentWorkspace)}, #a78bfa)`,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {firstLetter(currentWorkspace.name)}
                </span>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-fg-0 truncate">
                    {currentWorkspace.name}
                  </span>
                  <span className="text-[11px] text-fg-3 truncate">
                    {[memberMeta(currentWorkspace, t), role ? t('workspaceSwitcher.youAre', { role }) : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
                {role && <RolePill role={role} />}
                <Check className="h-4 w-4 flex-shrink-0" style={{ color: 'hsl(var(--accent))' }} />
              </div>
            </div>
          )}

          {/* Other companies */}
          {otherWorkspaces.length > 0 && (
            <div className="px-1.5 pt-1 pb-2.5 border-t border-line">
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-2 pt-2 pb-1">
                {t('workspaceSwitcher.otherWorkspaces')}
              </div>
              <div className="flex flex-col gap-px">
                {otherWorkspaces.map((w) => (
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
                    meta={memberMeta(w, t)}
                    badge={
                      w.sso_enforced ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          <Lock className="h-2.5 w-2.5" />
                          {t('workspaceSwitcher.sso')}
                        </span>
                      ) : null
                    }
                    onClick={() => {
                      switchTo(w)
                      setOpen(false)
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex flex-col gap-1 p-2 bg-bg-2 border-t border-line">
            {canCreate && (
              <SwitcherAction
                icon={<Plus className="h-3.5 w-3.5" />}
                label={t('workspaceSwitcher.newWorkspace')}
                hotkey="W"
                onClick={() => {
                  setOpen(false)
                  nav('/workspaces/new')
                }}
              />
            )}
            {currentWorkspace && (
              <SwitcherAction
                icon={<Settings className="h-3.5 w-3.5" />}
                label={t('workspaceSwitcher.workspaceSettings')}
                onClick={() => {
                  setOpen(false)
                  nav(`/workspaces/${currentWorkspace._id}/settings`)
                }}
              />
            )}
            {currentWorkspace && isOwner && (
              <SwitcherAction
                icon={<UserPlus className="h-3.5 w-3.5" />}
                label={t('workspaceSwitcher.inviteMembers')}
                onClick={() => {
                  setOpen(false)
                  nav(`/workspaces/${currentWorkspace._id}/settings?tab=members`)
                }}
              />
            )}
            {user?.role === 'admin' && (
              <SwitcherAction
                icon={<Building2 className="h-3.5 w-3.5" />}
                label={t('sidebar.companies')}
                onClick={() => {
                  setOpen(false)
                  nav('/admin/companies')
                }}
              />
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}

function SwitcherRow({ icon, label, meta, selected, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-md text-start w-full transition-colors',
        'hover:bg-bg-3',
        selected ? 'bg-bg-3' : 'bg-transparent',
      )}
    >
      {icon}
      <span
        className={cn(
          'flex-1 truncate text-[13px]',
          selected ? 'font-medium text-fg-0' : 'text-fg-1',
        )}
      >
        {label}
      </span>
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
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-start w-full text-[12.5px] text-fg-2 hover:bg-bg-3 hover:text-fg-1 transition-colors"
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
