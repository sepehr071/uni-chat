import { useState, useEffect } from 'react'
import { X, Folder, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

const PRESET_COLORS = [
  '#5c9aed', // Blue (default)
  '#22c55e', // Green
  '#eab308', // Yellow
  '#f97316', // Orange
  '#ef4444', // Red
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#6b7280', // Gray
]

/**
 * Modal for creating or editing a knowledge folder
 */
export default function CreateFolderModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  editFolder = null, // If provided, we're editing
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#5c9aed')

  // Reset form when modal opens or editFolder changes
  useEffect(() => {
    if (isOpen) {
      if (editFolder) {
        setName(editFolder.name || '')
        setColor(editFolder.color || '#5c9aed')
      } else {
        setName('')
        setColor('#5c9aed')
      }
    }
  }, [isOpen, editFolder])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return

    onSubmit({
      name: name.trim(),
      color
    })
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
            {editFolder ? 'Edit Folder' : 'Create Folder'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name input */}
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1.5">
              Folder Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1.5">
              Color
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={cn(
                    'w-7 h-7 rounded-full transition-transform hover:scale-110',
                    color === presetColor && 'ring-2 ring-offset-2 ring-offset-background ring-foreground'
                  )}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-xs font-medium text-foreground-secondary mb-1.5">
              Preview
            </label>
            <div className="flex items-center gap-2 px-3 py-2 bg-background-secondary rounded-lg">
              <Folder className="h-5 w-5" style={{ color }} />
              <span className="text-foreground">{name || 'Folder name'}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !name.trim()}
              className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {editFolder ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Folder className="h-4 w-4" />
                  {editFolder ? 'Save' : 'Create'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
