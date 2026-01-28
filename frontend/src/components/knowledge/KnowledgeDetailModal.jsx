import { useState } from 'react'
import { X, Copy, Check, Star, Pencil, Folder, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import MarkdownRenderer from '../chat/MarkdownRenderer'
import { cn } from '../../utils/cn'

/**
 * Modal for viewing full knowledge item content with markdown rendering
 */
export default function KnowledgeDetailModal({ item, folders = [], onClose, onEdit }) {
  const [copied, setCopied] = useState(false)

  if (!item) return null

  // Find folder name if item has folder_id
  const folder = item.folder_id
    ? folders.find(f => f._id === item.folder_id)
    : null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleEdit = () => {
    onClose()
    onEdit?.(item)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-full max-w-4xl bg-background border border-border rounded-xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h3 className="font-semibold text-foreground truncate" title={item.title}>
              {item.title}
            </h3>
            {item.is_favorite && (
              <Star className="h-4 w-4 text-yellow-500 fill-current flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopy}
              className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
              title="Copy content"
            >
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            {onEdit && (
              <button
                onClick={handleEdit}
                className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Metadata bar */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-background-secondary/50 flex-shrink-0 flex-wrap">
          {item.source?.type && (
            <span className="text-xs text-foreground-tertiary capitalize">
              From {item.source.type}
            </span>
          )}
          {folder && (
            <span className="flex items-center gap-1 text-xs text-foreground-tertiary">
              <Folder className="h-3 w-3" style={{ color: folder.color }} />
              {folder.name}
            </span>
          )}
          {item.created_at && (
            <span className="text-xs text-foreground-tertiary">
              {format(new Date(item.created_at), 'MMM d, yyyy \'at\' HH:mm')}
            </span>
          )}
          {item.source?.conversation_id && (
            <a
              href={`/chat/${item.source.conversation_id}`}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover transition-colors"
              title="Go to source conversation"
            >
              <ExternalLink className="h-3 w-3" />
              View source
            </a>
          )}
        </div>

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-border flex-shrink-0">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs bg-accent/10 text-accent rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="markdown-content prose prose-invert max-w-none">
            <MarkdownRenderer content={item.content} />
          </div>
        </div>

        {/* Notes section (if present) */}
        {item.notes && (
          <div className="px-4 py-3 border-t border-border bg-background-secondary/30 flex-shrink-0">
            <div className="text-xs font-medium text-foreground-tertiary mb-1">Notes</div>
            <p className="text-sm text-foreground-secondary whitespace-pre-wrap">
              {item.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
