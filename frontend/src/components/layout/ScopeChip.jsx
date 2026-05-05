import { ChevronRight, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Ptile from '@/components/teams/Ptile'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/ui/tooltip'
import { cn } from '@/utils/cn'

function firstLetter(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

export default function ScopeChip() {
  const { t } = useTranslation('layout')
  const { currentWorkspace, setSwitcherOpen } = useWorkspace()
  const { currentProject } = useProject()

  if (!currentWorkspace) return null

  const handleClick = () => {
    if (typeof setSwitcherOpen === 'function') setSwitcherOpen(true)
  }
  const unfiledLabel = t('scopeChip.unfiled')
  const path = `${currentWorkspace.name} › ${currentProject?.name ?? unfiledLabel}`

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              'inline-flex items-center gap-2 px-2.5 py-1 rounded-md',
              'border border-transparent hover:bg-bg-2 hover:border-line transition',
              'text-sm',
            )}
            aria-label={t('scopeChip.openWorkspaceSwitcher')}
          >
            <Ptile
              size="sm"
              gradient
              color="#5c9aed"
              letter={firstLetter(currentWorkspace.name)}
              className="!w-5 !h-5 !text-[10px]"
            />
            <span className="font-medium text-fg-0 truncate max-w-[160px] hidden sm:inline">
              {currentWorkspace.name}
            </span>
            <ChevronRight className="h-3 w-3 text-fg-4 flex-shrink-0" />
            {currentProject ? (
              <>
                <span
                  style={{ background: currentProject.color || '#5c9aed' }}
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                />
                <span className="text-fg-1 truncate max-w-[160px] hidden sm:inline">
                  {currentProject.name}
                </span>
              </>
            ) : (
              <>
                <Inbox className="h-3 w-3 text-fg-3 flex-shrink-0" />
                <span className="text-fg-3 italic hidden sm:inline">{unfiledLabel}</span>
              </>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{path}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
