import { useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Inbox, Sparkles } from 'lucide-react'
import Ptile from '@/components/teams/Ptile'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import { useRailData } from '@/context/RailDataContext'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import ProjectSwitcher from './ProjectSwitcher'
import { ModelList } from '@/components/chat/ModelChip'
import { cn } from '@/utils/cn'

const MODEL_RELEVANT_ROUTES = [
  '/chat',
  '/arena',
  '/debate',
  '/workflow',
  '/automate-agent',
  '/image-studio',
  '/meetings',
]

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
 * Global header scope bar — three pills (Company / Project / Model) separated
 * by hairline dividers. Each pill is its own popover trigger:
 *   - Company → <WorkspaceSwitcher pill /> (existing switcher in pill mode)
 *   - Project → <ProjectSwitcher pill />
 *   - Model   → Radix Popover wrapping <ModelList> (chat composer's picker)
 *
 * Mobile (`< sm`): collapses to a single Ptile + project-dot chip that
 * triggers the company switcher (project + model stay reachable from inside
 * that popover and from the chat composer respectively).
 *
 * Model pill hidden when the current route is not LLM-relevant
 * (`MODEL_RELEVANT_ROUTES`).
 */
export default function ScopePillBar() {
  const { t } = useTranslation('layout')
  const location = useLocation()
  const { currentWorkspace, setSwitcherOpen: setWsSwitcherOpen } = useWorkspace()
  const { currentProject } = useProject()
  const rail = useRailData()
  const [modelOpen, setModelOpen] = useState(false)

  const modelRelevant = useMemo(
    () => MODEL_RELEVANT_ROUTES.some((p) => location.pathname.startsWith(p)),
    [location.pathname],
  )

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

        {/* Model pill — only LLM-relevant routes; binds to ChatPage's
            RailDataContext so selection is live. */}
        {modelRelevant && (
          <>
            <span className="w-px bg-line my-1.5" aria-hidden />
            <Popover open={modelOpen} onOpenChange={setModelOpen}>
              <Tooltip delayDuration={250}>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 px-2 hover:bg-bg-2 transition text-sm min-w-0"
                      aria-label={t('scopePillBar.modelTooltip')}
                    >
                      <Sparkles className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                      <span className="text-fg-1 truncate max-w-[140px] hidden md:inline">
                        {rail.selectedConfig?.name || t('header.modelHidden')}
                      </span>
                      <ChevronDown className="h-3 w-3 text-fg-4 flex-shrink-0" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('header.modelPillTooltip')}</TooltipContent>
              </Tooltip>
              <PopoverContent
                align="start"
                sideOffset={6}
                className="p-0 w-auto border-0 bg-transparent shadow-none"
              >
                <ModelList
                  configs={rail.configs || []}
                  selectedConfigId={rail.selectedConfigId}
                  onSelectConfig={(id) => {
                    rail.onSelectConfig?.(id)
                    setModelOpen(false)
                  }}
                  onClose={() => setModelOpen(false)}
                />
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>
    </TooltipProvider>
  )
}
