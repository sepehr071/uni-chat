import { useState, useRef, useEffect } from 'react'
import { GitBranch, ChevronDown, Trash2, Check, Pencil } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function BranchSelector({ branches, activeBranch, onSwitch, onDelete, onRename }) {
  const [isOpen, setIsOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editingBranch, setEditingBranch] = useState(null)
  const [editName, setEditName] = useState('')
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setDeleteConfirm(null)
        setEditingBranch(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when editing starts
  useEffect(() => {
    if (editingBranch && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingBranch])

  const handleSwitch = (branchId) => {
    if (editingBranch) return // Don't switch while editing
    if (branchId !== activeBranch?.id) {
      onSwitch(branchId)
    }
    setIsOpen(false)
  }

  const handleDeleteClick = (e, branchId) => {
    e.stopPropagation()
    if (deleteConfirm === branchId) {
      onDelete(branchId)
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(branchId)
      setEditingBranch(null) // Cancel editing if deleting
    }
  }

  const handleEditClick = (e, branch) => {
    e.stopPropagation()
    setEditingBranch(branch.id)
    setEditName(branch.name)
    setDeleteConfirm(null) // Cancel delete confirm if editing
  }

  const handleEditSave = (e) => {
    e?.stopPropagation()
    if (editingBranch && editName.trim() && onRename) {
      onRename(editingBranch, editName.trim())
    }
    setEditingBranch(null)
    setEditName('')
  }

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleEditSave(e)
    } else if (e.key === 'Escape') {
      setEditingBranch(null)
      setEditName('')
    }
  }

  // Find active branch name
  const activeBranchName = activeBranch?.name || 'main'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-tertiary hover:bg-background-elevated transition-colors text-sm"
      >
        <GitBranch className="h-4 w-4 text-accent" />
        <span className="font-medium text-foreground">{activeBranchName}</span>
        <ChevronDown className={cn(
          "h-4 w-4 text-foreground-tertiary transition-transform",
          isOpen && "rotate-180"
        )} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider">
              Branches ({branches.length})
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {branches.map((branch) => {
              const isActive = branch.id === activeBranch?.id
              const isMain = branch.name === 'main' || branch.id === 'main'
              const isConfirming = deleteConfirm === branch.id
              const isEditing = editingBranch === branch.id

              return (
                <div
                  key={branch.id}
                  onClick={() => handleSwitch(branch.id)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <GitBranch className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isActive ? "text-accent" : "text-foreground-tertiary"
                    )} />
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={handleEditSave}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 px-1 py-0.5 text-sm font-medium bg-background-tertiary border border-border rounded focus:outline-none focus:border-accent"
                        maxLength={50}
                      />
                    ) : (
                      <>
                        <span className="truncate font-medium">{branch.name}</span>
                        {isActive && (
                          <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                        )}
                      </>
                    )}
                  </div>

                  {!isMain && !isEditing && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {onRename && (
                        <button
                          onClick={(e) => handleEditClick(e, branch)}
                          className="p-1 rounded transition-colors text-foreground-tertiary hover:text-accent hover:bg-accent/10"
                          title="Rename branch"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDeleteClick(e, branch.id)}
                        className={cn(
                          "p-1 rounded transition-colors",
                          isConfirming
                            ? "bg-error/20 text-error"
                            : "text-foreground-tertiary hover:text-error hover:bg-error/10"
                        )}
                        title={isConfirming ? "Click again to confirm" : "Delete branch"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {branches.length === 0 && (
            <div className="px-3 py-4 text-center text-sm text-foreground-tertiary">
              No branches yet
            </div>
          )}
        </div>
      )}
    </div>
  )
}
