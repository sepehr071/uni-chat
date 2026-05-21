import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, FileText, FileJson, Pencil, Folder, FolderInput } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useProject } from '../../context/ProjectContext'
import MoveChatToProjectModal from './MoveChatToProjectModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import ModelChip from './ModelChip'

export default function ChatHeader({
  conversation,
  onExportMarkdown,
  onExportJson,
  // Model picker props
  selectedConfig,
  configs = [],
  selectedConfigId,
  onSelectConfig,
  onConversationMoved,
}) {
  const { t } = useTranslation('chat')
  const [moveOpen, setMoveOpen] = useState(false)

  const { projects, currentProject } = useProject()
  const convoProjectId = conversation?.project_id || null
  const convoProject = convoProjectId
    ? (projects.find(p => p._id === convoProjectId) || null)
    : null
  const projectScopeMismatch = !!conversation && convoProjectId !== (currentProject?._id || null)

  return (
    <div className="flex items-center gap-2 px-4 h-12 min-h-[48px] border-b border-border shrink-0">
      {/* Model picker chip — primary control */}
      {onSelectConfig && (
        <ModelChip
          selectedConfig={selectedConfig}
          configs={configs}
          selectedConfigId={selectedConfigId}
          onSelectConfig={onSelectConfig}
          side="bottom"
          align="start"
        />
      )}

      {/* Project breadcrumb */}
      {conversation && (
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap',
            projectScopeMismatch
              ? 'bg-warn/15 text-warn border border-warn/30'
              : 'bg-background-tertiary text-foreground-secondary'
          )}
          style={convoProject ? { color: convoProject.color || undefined } : undefined}
          title={projectScopeMismatch ? t('header.scopeMismatch') : undefined}
        >
          <Folder className="h-3 w-3" />
          {convoProject?.name || t('header.unfiled')}
        </span>
      )}

      {/* Title */}
      {conversation?.title && (
        <span className="text-sm font-semibold text-foreground truncate max-w-[420px]">
          {conversation.title}
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Overflow menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-1.5 rounded-md text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onExportMarkdown} className="gap-2 cursor-pointer">
            <FileText className="h-4 w-4" />
            {t('header.exportMarkdown')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportJson} className="gap-2 cursor-pointer">
            <FileJson className="h-4 w-4" />
            {t('header.exportJson')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {conversation && (
            <DropdownMenuItem onClick={() => setMoveOpen(true)} className="gap-2 cursor-pointer">
              <FolderInput className="h-4 w-4" />
              {t('header.moveToProject')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled className="gap-2 text-foreground-tertiary">
            <Pencil className="h-4 w-4" />
            {t('header.renameConversation')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {conversation && (
        <MoveChatToProjectModal
          open={moveOpen}
          onOpenChange={setMoveOpen}
          conversationId={conversation._id}
          currentProjectId={conversation.project_id || null}
          onMoved={(pid) => onConversationMoved?.(pid)}
        />
      )}
    </div>
  )
}
