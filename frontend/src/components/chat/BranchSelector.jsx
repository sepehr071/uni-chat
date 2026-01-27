import { useState, useRef, useEffect } from 'react'
import { GitBranch, ChevronDown, Trash2, Check } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function BranchSelector({ branches, activeBranch, onSwitch, onDelete }) {
  const [isOpen, setIsOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setDeleteConfirm(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSwitch = (branchId) => {
    if (branchId !== activeBranch?._id) {
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
              const isActive = branch._id === activeBranch?._id
              const isMain = branch.name === 'main'
              const isConfirming = deleteConfirm === branch._id

              return (
                <div
                  key={branch._id}
                  onClick={() => handleSwitch(branch._id)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 cursor-pointer transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className={cn(
                      "h-4 w-4 flex-shrink-0",
                      isActive ? "text-accent" : "text-foreground-tertiary"
                    )} />
                    <span className="truncate font-medium">{branch.name}</span>
                    {isActive && (
                      <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                    )}
                  </div>

                  {!isMain && (
                    <button
                      onClick={(e) => handleDeleteClick(e, branch._id)}
                      className={cn(
                        "p-1 rounded transition-colors flex-shrink-0",
                        isConfirming
                          ? "bg-error/20 text-error"
                          : "text-foreground-tertiary hover:text-error hover:bg-error/10"
                      )}
                      title={isConfirming ? "Click again to confirm" : "Delete branch"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
