import { useState, useRef, useEffect } from 'react'
import { Eye, MoreHorizontal, FileText, FileJson, Trash2, Pencil, GitBranch, Check } from 'lucide-react'
import { cn } from '../../utils/cn'
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

// Inline chip for a single branch
function BranchChip({ branch, isActive, onSwitch, onRename, onDelete }) {
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
        <span className="flex items-center gap-0.5 ml-0.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setEditing(true); setDeleteConfirm(false) }}
            className="p-0.5 rounded hover:text-accent"
            title="Rename"
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
            title={deleteConfirm ? 'Confirm delete' : 'Delete'}
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
}) {
  const MAX_VISIBLE = 3
  const visibleBranches = branches.length > 1 ? branches.slice(0, MAX_VISIBLE) : []
  const overflowBranches = branches.length > MAX_VISIBLE + 1 ? branches.slice(MAX_VISIBLE) : []

  return (
    <div className="flex items-center gap-2 px-4 h-12 min-h-[48px] border-b border-border shrink-0">
      {/* Title */}
      {conversation?.title && (
        <span className="text-sm font-semibold text-foreground truncate max-w-[420px]">
          {conversation.title}
        </span>
      )}

      {/* Branch count label */}
      {branches.length > 1 && (
        <span className="text-xs text-foreground-tertiary whitespace-nowrap shrink-0">
          · {branches.length} branches
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
                  +{overflowBranches.length} more
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
        title={isFocusMode ? 'Disable focus mode' : 'Enable focus mode'}
      >
        <Eye className="h-3.5 w-3.5" />
        <span>{isFocusMode ? 'Focus on' : 'Focus'}</span>
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
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportJson} className="gap-2 cursor-pointer">
            <FileJson className="h-4 w-4" />
            Export as JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="gap-2 text-foreground-tertiary">
            <Pencil className="h-4 w-4" />
            Rename conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
