import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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

export default function CreateFolderModal({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  editFolder = null,
}) {
  const { t } = useTranslation('knowledge')
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
            {editFolder ? t('create_folder.title_edit') : t('create_folder.title_create')}
          </DialogTitle>
          <DialogDescription>
            {editFolder ? t('create_folder.desc_edit') : t('create_folder.desc_create')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-2">
            <Label htmlFor="folder-name">{t('create_folder.name_label')}</Label>
            <Input
              id="folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('create_folder.name_placeholder')}
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Color picker */}
          <div className="space-y-2">
            <Label>{t('create_folder.color_label')}</Label>
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
            <Label>{t('create_folder.preview_label')}</Label>
            <Badge variant="secondary" className="px-3 py-2 h-auto gap-2">
              <Folder className="h-4 w-4" style={{ color }} />
              <span className="text-foreground">{name || t('create_folder.folder_name_placeholder')}</span>
            </Badge>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('create_folder.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  {editFolder ? t('create_folder.saving') : t('create_folder.creating')}
                </>
              ) : (
                <>
                  <Folder className="h-4 w-4 me-2" />
                  {editFolder ? t('create_folder.save') : t('create_folder.create')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
