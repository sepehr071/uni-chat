import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Folder, Building2, ChevronDown, Check, AlertTriangle } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import ConfigSelector from './ConfigSelector'
import { useProject } from '@/context/ProjectContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useModelCatalog } from '@/hooks/useModelCatalog'

/**
 * PillBar — 3 inline chip-style dropdowns (Model | Project | Workspace),
 * mirroring the hoosh prototype's chat-header pattern. Sky-tinted, hairline
 * `·` separators between pills. Each pill opens its own contextual control
 * (Popover w/ ConfigSelector for model, DropdownMenu for project/workspace).
 *
 * Props match the existing ChatHeader call site so we keep that surface
 * additive — no breaking API changes.
 */
function ModelAvatar({ selectedConfig, size = 16 }) {
  if (!selectedConfig) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-semibold shrink-0"
        style={{ height: size, width: size }}
      >
        AI
      </span>
    )
  }
  const isEmoji = selectedConfig.avatar?.type === 'emoji'
  if (isEmoji) {
    return (
      <span
        className="flex items-center justify-center rounded-full bg-primary/10 text-[10px] shrink-0"
        style={{ height: size, width: size }}
      >
        {selectedConfig.avatar.value}
      </span>
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-semibold shrink-0"
      style={{ height: size, width: size }}
    >
      {(selectedConfig.name?.[0] || 'A').toUpperCase()}
    </span>
  )
}

function Divider() {
  return (
    <span className="text-foreground-tertiary/40 select-none px-0.5" aria-hidden>
      ·
    </span>
  )
}

export default function PillBar({
  // Model picker props (mirrors ChatHeader / ModelChip)
  selectedConfig,
  configs = [],
  selectedConfigId,
  onSelectConfig,
  // Conversation's bound project (read-only display when present)
  conversationProject,
  // When true, project pill is rendered as inert info chip (conv already filed)
  projectReadOnly = false,
}) {
  const { t } = useTranslation('chat')
  const nav = useNavigate()
  const { getById } = useModelCatalog()
  const { projects, currentProject, setActiveProject } = useProject()
  const { workspaces, currentWorkspace, setActiveWorkspace } = useWorkspace()
  const [modelOpen, setModelOpen] = useState(false)

  const underlyingModelId = selectedConfigId?.startsWith('quick:')
    ? selectedConfigId.slice('quick:'.length)
    : selectedConfig?.model_id || null
  const catalogEntry = underlyingModelId ? getById(underlyingModelId) : null
  const isDeprecated = Boolean(catalogEntry?.expiration_date)

  // Resolve project pill display: prefer conversation's own project (read-only
  // breadcrumb), else fall back to the active context project.
  const displayProject = conversationProject || currentProject
  const projectLabel = displayProject?.name || t('header.unfiled')
  const projectColor = displayProject?.color || undefined

  // Workspace pill — active scope. Switches via setActiveWorkspace +
  // localStorage (ProjectContext re-fetches on change).
  const workspaceLabel = currentWorkspace?.name || ''

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {/* MODEL pill */}
      {onSelectConfig && (
        <Popover open={modelOpen} onOpenChange={setModelOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t('modelChip.selectModel')}
              className={cn(
                'inline-flex items-center gap-1.5 ps-1.5 pe-2.5 h-7 rounded-full',
                'bg-primary/5 hover:bg-primary/10 transition-colors',
                'text-xs font-medium text-foreground',
                'border border-primary/10',
                'focus:outline-none focus:ring-2 focus:ring-primary/30',
              )}
            >
              <ModelAvatar selectedConfig={selectedConfig} size={16} />
              <span className="max-w-[140px] truncate">
                {selectedConfig?.name || t('modelChip.selectAi')}
              </span>
              {isDeprecated && (
                <AlertTriangle
                  size={12}
                  className="text-warn shrink-0"
                  aria-label={t('configSelector.deprecated')}
                />
              )}
              <ChevronDown size={11} className="text-foreground-tertiary shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={8}
            className="p-0 w-auto border-0 bg-transparent shadow-none"
          >
            <ConfigSelector
              configs={configs}
              selectedConfigId={selectedConfigId}
              onSelect={(id) => {
                onSelectConfig?.(id)
                setModelOpen(false)
              }}
              onClose={() => setModelOpen(false)}
            />
          </PopoverContent>
        </Popover>
      )}

      <Divider />

      {/* PROJECT pill */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('pillBar.changeProject')}
            className={cn(
              'inline-flex items-center gap-1.5 ps-2 pe-2.5 h-7 rounded-full',
              'bg-primary/5 hover:bg-primary/10 transition-colors',
              'text-xs font-medium text-foreground',
              'border border-primary/10',
              'focus:outline-none focus:ring-2 focus:ring-primary/30',
            )}
          >
            <Folder
              size={13}
              className="shrink-0"
              style={projectColor ? { color: projectColor } : undefined}
            />
            <span className="max-w-[140px] truncate" style={projectColor ? { color: projectColor } : undefined}>
              {projectLabel}
            </span>
            <ChevronDown size={11} className="text-foreground-tertiary shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-[60vh]">
          <DropdownMenuLabel>{t('pillBar.projectMenuLabel')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {projectReadOnly && conversationProject && (
            <div className="px-3 py-2 text-[11px] text-foreground-tertiary">
              {t('pillBar.conversationFiledHint', { name: conversationProject.name })}
            </div>
          )}
          {projects.length === 0 ? (
            <div className="px-3 py-2 text-sm text-foreground-tertiary">
              {t('pillBar.noProjects')}
            </div>
          ) : (
            projects.map((p) => (
              <DropdownMenuItem
                key={p._id}
                onClick={() => setActiveProject(p)}
                className="gap-2 cursor-pointer"
              >
                <Folder
                  className="h-4 w-4"
                  style={p.color ? { color: p.color } : undefined}
                />
                <span className="flex-1 truncate">{p.name}</span>
                {currentProject?._id === p._id && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => nav('/projects')}
            className="gap-2 cursor-pointer text-foreground-tertiary"
          >
            <Folder className="h-4 w-4" />
            {t('pillBar.manageProjects')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Divider />

      {/* WORKSPACE pill */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('pillBar.changeWorkspace')}
            className={cn(
              'inline-flex items-center gap-1.5 ps-2 pe-2.5 h-7 rounded-full',
              'bg-primary/5 hover:bg-primary/10 transition-colors',
              'text-xs font-medium text-foreground',
              'border border-primary/10',
              'focus:outline-none focus:ring-2 focus:ring-primary/30',
            )}
          >
            <Building2 size={13} className="shrink-0 text-primary" />
            <span className="max-w-[140px] truncate">
              {workspaceLabel || t('pillBar.noWorkspace')}
            </span>
            <ChevronDown size={11} className="text-foreground-tertiary shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 max-h-[60vh]">
          <DropdownMenuLabel>{t('pillBar.workspaceMenuLabel')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.length === 0 ? (
            <div className="px-3 py-2 text-sm text-foreground-tertiary">
              {t('pillBar.noWorkspaces')}
            </div>
          ) : (
            workspaces.map((w) => (
              <DropdownMenuItem
                key={w._id}
                onClick={() => setActiveWorkspace(w)}
                className="gap-2 cursor-pointer"
              >
                <Building2 className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate">{w.name}</span>
                {currentWorkspace?._id === w._id && (
                  <Check className="h-3.5 w-3.5 text-primary" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
