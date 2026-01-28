import { useState, useEffect } from 'react'
import { Folder, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {editFolder ? 'Edit Folder' : 'Create Folder'}
          </DialogTitle>
          <DialogDescription>
            {editFolder ? 'Update your folder details' : 'Create a new folder to organize your knowledge'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all hover:scale-110',
                    color === presetColor && 'ring-2 ring-offset-2 ring-offset-background ring-foreground scale-110'
                  )}
                  style={{ backgroundColor: presetColor }}
                  title={presetColor}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Preview</Label>
            <Badge variant="secondary" className="px-3 py-2 h-auto gap-2">
              <Folder className="h-4 w-4" style={{ color }} />
              <span className="text-foreground">{name || 'Folder name'}</span>
            </Badge>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {editFolder ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                <>
                  <Folder className="h-4 w-4 mr-2" />
                  {editFolder ? 'Save' : 'Create'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
