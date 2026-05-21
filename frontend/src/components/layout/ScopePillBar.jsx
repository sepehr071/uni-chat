import { useTranslation } from 'react-i18next'
import { ChevronDown, Inbox } from 'lucide-react'
import Ptile from '@/components/teams/Ptile'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import ProjectSwitcher from './ProjectSwitcher'
import { cn } from '@/utils/cn'

const WS_PALETTE = ['#5c9aed', '#10b981', '#f59e0b', '#a78bfa', '#f472b6', '#2dd4bf', '#ef4444']

function firstLetter(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function workspaceColor(ws) {
  if (!ws?._id) return '#5c9aed'
  if (ws.type === 'personal') return '#10b981'
  let h = 0
  for (let i = 0; i < ws._id.length; i++) h = (h * 31 + ws._id.charCodeAt(i)) >>> 0
  return WS_PALETTE[h % WS_PALETTE.length]
}

/**
 * Global header scope bar — two pills (Company / Project) separated by a
 * hairline divider. Each pill is its own popover trigger:
 *   - Company → <WorkspaceSwitcher pill />
 *   - Project → <ProjectSwitcher pill />
 *
 * Mobile (`< sm`): collapses to a single Ptile + project-dot chip that
 * triggers the company switcher.
 *
 * The model picker lives per-surface (ChatHeader / ChatInput / Arena / Debate)
 * — the global header has no per-conversation context to drive it.
 */
export default function ScopePillBar() {
  const { t } = useTranslation('layout')
  const { currentWorkspace, setSwitcherOpen: setWsSwitcherOpen } = useWorkspace()
  const { currentProject } = useProject()

  if (!currentWorkspace) return null

  const wsLetter = firstLetter(currentWorkspace.name)
  const wsColor = workspaceColor(currentWorkspace)
  const handleCompanyClick = () => {
    if (typeof setWsSwitcherOpen === 'function') setWsSwitcherOpen(true)
  }

  return (
    <TooltipProvider>
      {/* Mobile condensed chip — opens company switcher (which itself drills
          into project switching). */}
      <button
        type="button"
        onClick={handleCompanyClick}
        className={cn(
          'sm:hidden inline-flex items-center gap-1.5 px-2 py-1 rounded-md',
          'border border-transparent hover:bg-bg-2 hover:border-line transition text-sm',
        )}
        aria-label={t('header.openCompanySwitcher')}
      >
        <Ptile
          size="sm"
          gradient
          color={wsColor}
          letter={wsLetter}
          className="!w-5 !h-5 !text-[10px]"
        />
        {currentProject ? (
          <span
            style={{ background: currentProject.color || '#5c9aed' }}
            className="w-2 h-2 rounded-sm flex-shrink-0"
          />
        ) : (
          <Inbox className="h-3 w-3 text-fg-3 flex-shrink-0" />
        )}
        <ChevronDown className="h-3 w-3 text-fg-4 flex-shrink-0" />
      </button>

      {/* Desktop / tablet pill-bar */}
      <div
        className={cn(
          'hidden sm:inline-flex items-stretch h-8 rounded-lg overflow-hidden',
          'border border-transparent hover:border-line transition',
        )}
        role="group"
        aria-label={t('scopePillBar.label')}
      >
        {/* Company pill — WorkspaceSwitcher in pill trigger mode */}
        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <WorkspaceSwitcher pill />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('scopePillBar.companyTooltip')}</TooltipContent>
        </Tooltip>

        <span className="w-px bg-line my-1.5" aria-hidden />

        {/* Project pill — ProjectSwitcher in pill trigger mode */}
        <Tooltip delayDuration={250}>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <ProjectSwitcher pill />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('scopePillBar.projectTooltip')}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
