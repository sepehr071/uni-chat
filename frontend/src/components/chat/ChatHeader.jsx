import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, MoreHorizontal, FileText, FileJson, Trash2, Pencil, GitBranch, Check, Folder, FolderInput } from 'lucide-react'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import ModelChip from './ModelChip'

// Inline chip for a single branch
function BranchChip({ branch, isActive, onSwitch, onRename, onDelete }) {
  const { t } = useTranslation('chat')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(branch.name)
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const saveEdit = () => {
    if (editName.trim() && onRename) onRename(branch.id, editName.trim())
    setEditing(false)
  }

  const isMain = branch.name === 'main' || branch.id === 'main'

  return (
    <span
      onClick={() => !editing && onSwitch(branch.id)}
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium cursor-pointer transition-colors select-none',
        isActive
          ? 'bg-accent/15 text-accent'
          : 'bg-background-tertiary text-foreground-secondary hover:text-foreground'
      )}
    >
      <GitBranch className="h-3 w-3 flex-shrink-0" />
      {editing ? (
        <input
          ref={inputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit()
            if (e.key === 'Escape') { setEditing(false); setEditName(branch.name) }
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-20 bg-transparent border-b border-accent outline-none text-xs"
        />
      ) : (
        <span className="max-w-[80px] truncate">{branch.name}</span>
      )}
      {isActive && !editing && <Check className="h-2.5 w-2.5 flex-shrink-0" />}
      {!isMain && !editing && (
        <span className="flex items-center gap-0.5 ms-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setEditing(true); setDeleteConfirm(false) }}
            className="p-0.5 rounded hover:text-accent"
            title={t('branch.rename')}
          >
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button
            onClick={() => {
              if (deleteConfirm) { onDelete(branch.id); setDeleteConfirm(false) }
              else setDeleteConfirm(true)
            }}
            className={cn(
              'p-0.5 rounded',
              deleteConfirm ? 'text-red-500' : 'hover:text-red-400'
            )}
            title={deleteConfirm ? t('branch.confirmDelete') : t('branch.delete')}
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </span>
      )}
    </span>
  )
}

export default function ChatHeader({
  conversation,
  branches = [],
  activeBranch,
  onSwitchBranch,
  onDeleteBranch,
  onRenameBranch,
  isFocusMode,
  onToggleFocus,
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
  const MAX_VISIBLE = 3
  const visibleBranches = branches.length > 1 ? branches.slice(0, MAX_VISIBLE) : []
  const overflowBranches = branches.length > MAX_VISIBLE + 1 ? branches.slice(MAX_VISIBLE) : []

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

      {/* Branch count label */}
      {branches.length > 1 && (
        <span className="text-xs text-foreground-tertiary whitespace-nowrap shrink-0">
          · {t('header.branchCount', { count: branches.length })}
        </span>
      )}

      {/* Branch chips */}
      {visibleBranches.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {visibleBranches.map((branch) => (
            <BranchChip
              key={branch.id}
              branch={branch}
              isActive={branch.id === activeBranch?.id}
              onSwitch={onSwitchBranch}
              onRename={onRenameBranch}
              onDelete={onDeleteBranch}
            />
          ))}

          {overflowBranches.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="px-2 py-0.5 rounded-md text-xs font-medium bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors">
                  {t('header.overflowBranches', { count: overflowBranches.length })}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="flex flex-col gap-1">
                  {overflowBranches.map((branch) => (
                    <BranchChip
                      key={branch.id}
                      branch={branch}
                      isActive={branch.id === activeBranch?.id}
                      onSwitch={onSwitchBranch}
                      onRename={onRenameBranch}
                      onDelete={onDeleteBranch}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Focus mode toggle */}
      <button
        onClick={() => onToggleFocus?.(!isFocusMode)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
          isFocusMode
            ? 'bg-accent/15 text-accent'
            : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground'
        )}
        title={isFocusMode ? t('header.focusDisable') : t('header.focusEnable')}
      >
        <Eye className="h-3.5 w-3.5" />
        <span>{isFocusMode ? t('header.focusOn') : t('header.focus')}</span>
      </button>

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
