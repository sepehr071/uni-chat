import { useState } from 'react'
import { Star, Pencil, Trash2, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'

/**
 * Card component for displaying a knowledge item
 */
export default function KnowledgeCard({
  item,
  onEdit,
  onDelete,
  onToggleFavorite,
  onTagClick
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleDelete = () => {
    if (deleteConfirm) {
      onDelete(item._id)
      setDeleteConfirm(false)
    } else {
      setDeleteConfirm(true)
      // Auto-clear confirm state after 3 seconds
      setTimeout(() => setDeleteConfirm(false), 3000)
    }
  }

  return (
    <div className="bg-background-secondary border border-border rounded-xl overflow-hidden hover:border-border-hover transition-colors group">
      {/* Content */}
      <div className="p-4">
        {/* Header with title and favorite */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-medium text-foreground line-clamp-1" title={item.title}>
            {item.title}
          </h3>
          <button
            onClick={() => onToggleFavorite(item._id)}
            className={cn(
              'p-1 rounded transition-colors flex-shrink-0',
              item.is_favorite
                ? 'text-yellow-500 hover:text-yellow-400'
                : 'text-foreground-tertiary hover:text-foreground-secondary'
            )}
            title={item.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Star className={cn('h-4 w-4', item.is_favorite && 'fill-current')} />
          </button>
        </div>

        {/* Content preview */}
        <p className="text-sm text-foreground-secondary line-clamp-3 mb-3 whitespace-pre-wrap">
          {item.content}
        </p>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.tags.map((tag) => (
              <button
                key={tag}
                onClick={() => onTagClick?.(tag)}
                className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full hover:bg-accent/20 transition-colors"
              >
                #{tag}
              </button>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-2 text-xs text-foreground-tertiary">
          {item.source_type && (
            <span className="capitalize">{item.source_type}</span>
          )}
          {item.created_at && (
            <>
              <span>-</span>
              <span>{format(new Date(item.created_at), 'MMM d, yyyy')}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 py-2 border-t border-border bg-background-tertiary/30 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.source_id && (
          <a
            href={`/chat/${item.source_id}`}
            className="flex items-center gap-1 px-2 py-1 text-xs text-foreground-secondary hover:text-foreground rounded hover:bg-background-tertiary transition-colors"
            title="Go to source conversation"
          >
            <ExternalLink className="h-3 w-3" />
            Source
          </a>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 rounded text-foreground-secondary hover:text-foreground hover:bg-background-tertiary transition-colors"
          title="Edit"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleDelete}
          className={cn(
            'p-1.5 rounded transition-colors',
            deleteConfirm
              ? 'bg-error/10 text-error hover:bg-error/20'
              : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
          )}
          title={deleteConfirm ? 'Click again to confirm' : 'Delete'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
