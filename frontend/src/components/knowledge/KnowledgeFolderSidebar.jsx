import { useState } from 'react'
import { Folder, FolderPlus, MoreHorizontal, Pencil, Trash2, FileText } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * Folder sidebar for Knowledge Vault
 */
export default function KnowledgeFolderSidebar({
  folders = [],
  unfiledCount = 0,
  selectedFolder,
  onSelectFolder,
  onCreateFolder,
  onEditFolder,
  onDeleteFolder,
  isLoading
}) {
  const [contextMenu, setContextMenu] = useState(null)

  const handleContextMenu = (e, folder) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      folderId: folder._id,
      folderName: folder.name,
      x: e.clientX,
      y: e.clientY
    })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleEditClick = () => {
    if (contextMenu) {
      onEditFolder?.(contextMenu.folderId)
      setContextMenu(null)
    }
  }

  const handleDeleteClick = () => {
    if (contextMenu && window.confirm(`Delete folder "${contextMenu.folderName}"? Items will be moved to root.`)) {
      onDeleteFolder?.(contextMenu.folderId)
      setContextMenu(null)
    }
  }

  // Close context menu on click outside
  const handleBackdropClick = () => {
    setContextMenu(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider">
          Folders
        </h3>
        <button
          onClick={onCreateFolder}
          className="p-1 rounded hover:bg-background-tertiary text-foreground-tertiary hover:text-foreground transition-colors"
          title="Create folder"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </div>

      {/* Folder list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {/* All items */}
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left',
            selectedFolder === null
              ? 'bg-accent/10 text-accent'
              : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
          )}
        >
          <FileText className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate">All items</span>
        </button>

        {/* Unfiled items */}
        <button
          onClick={() => onSelectFolder('root')}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left',
            selectedFolder === 'root'
              ? 'bg-accent/10 text-accent'
              : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
          )}
        >
          <FileText className="h-4 w-4 flex-shrink-0 opacity-50" />
          <span className="flex-1 truncate">Unfiled</span>
          {unfiledCount > 0 && (
            <span className="text-xs text-foreground-tertiary">{unfiledCount}</span>
          )}
        </button>

        {/* Divider */}
        {folders.length > 0 && (
          <div className="border-t border-border my-2" />
        )}

        {/* Folders */}
        {folders.map((folder) => (
          <button
            key={folder._id}
            onClick={() => onSelectFolder(folder._id)}
            onContextMenu={(e) => handleContextMenu(e, folder)}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors text-left group',
              selectedFolder === folder._id
                ? 'bg-accent/10 text-accent'
                : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
            )}
          >
            <Folder
              className="h-4 w-4 flex-shrink-0"
              style={{ color: folder.color }}
            />
            <span className="flex-1 truncate">{folder.name}</span>
            {folder.item_count > 0 && (
              <span className="text-xs text-foreground-tertiary">{folder.item_count}</span>
            )}
            <button
              onClick={(e) => handleContextMenu(e, folder)}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-background-tertiary transition-opacity"
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-foreground-tertiary" />
            </button>
          </button>
        ))}

        {/* Empty state */}
        {!isLoading && folders.length === 0 && (
          <p className="text-xs text-foreground-tertiary text-center py-4 px-2">
            No folders yet. Create one to organize your knowledge.
          </p>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleBackdropClick}
          />
          <div
            className="fixed z-50 bg-background-elevated border border-border rounded-lg shadow-lg py-1 min-w-[140px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={handleEditClick}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
            <button
              onClick={handleDeleteClick}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-error hover:bg-error/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}
