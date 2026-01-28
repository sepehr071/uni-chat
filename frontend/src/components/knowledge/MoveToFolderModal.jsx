import { useState } from 'react'
import { X, Folder, FileText, Loader2, Check } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Modal for moving knowledge items to a folder
 */
export default function MoveToFolderModal({
  isOpen,
  onClose,
  onMove,
  folders = [],
  itemCount = 1,
  isLoading
}) {
  const [selectedFolder, setSelectedFolder] = useState(null) // null = root/unfiled

  const handleMove = () => {
    onMove(selectedFolder)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-background border border-border rounded-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">
            Move {itemCount > 1 ? `${itemCount} items` : 'item'} to folder
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {/* Root/Unfiled option */}
            <button
              onClick={() => setSelectedFolder(null)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                selectedFolder === null
                  ? 'bg-accent/10 text-accent'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
              )}
            >
              <FileText className="h-5 w-5 flex-shrink-0 opacity-50" />
              <span className="flex-1">Unfiled (no folder)</span>
              {selectedFolder === null && (
                <Check className="h-4 w-4" />
              )}
            </button>

            {/* Folders */}
            {folders.map((folder) => (
              <button
                key={folder._id}
                onClick={() => setSelectedFolder(folder._id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left',
                  selectedFolder === folder._id
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
                )}
              >
                <Folder
                  className="h-5 w-5 flex-shrink-0"
                  style={{ color: folder.color }}
                />
                <span className="flex-1 truncate">{folder.name}</span>
                {selectedFolder === folder._id && (
                  <Check className="h-4 w-4" />
                )}
              </button>
            ))}

            {/* Empty state */}
            {folders.length === 0 && (
              <p className="text-sm text-foreground-tertiary text-center py-4">
                No folders yet. Create a folder first to organize items.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMove}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Moving...
              </>
            ) : (
              'Move'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
