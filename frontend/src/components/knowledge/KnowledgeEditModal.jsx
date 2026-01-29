import { useState, useEffect } from 'react'
import { X, Plus, Save, Loader2, Folder } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeService } from '../../services/knowledgeService'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * Modal for editing a knowledge item
 */
export default function KnowledgeEditModal({ item, folders = [], onClose }) {
  const [title, setTitle] = useState(item?.title || '')
  const [content, setContent] = useState(item?.content || '')
  const [tags, setTags] = useState(item?.tags || [])
  const [folderId, setFolderId] = useState(item?.folder_id || '')
  const [newTag, setNewTag] = useState('')
  const queryClient = useQueryClient()

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => knowledgeService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
      queryClient.invalidateQueries(['knowledge-tags'])
      queryClient.invalidateQueries(['knowledge-folders'])
      toast.success('Knowledge item updated')
      onClose()
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update')
    }
  })

  // Reset form when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title || '')
      setContent(item.content || '')
      setTags(item.tags || [])
      setFolderId(item.folder_id || '')
    }
  }, [item])

  const handleAddTag = () => {
    const tag = newTag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag])
    }
    setNewTag('')
  }

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }

    updateMutation.mutate({
      id: item._id,
      data: {
        title: title.trim(),
        tags,
        folder_id: folderId || null
      }
    })
  }

  if (!item) return null

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Knowledge Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 py-4">
          {/* Title input */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title"
              maxLength={200}
            />
          </div>

          {/* Folder selection */}
          <div className="space-y-2">
            <Label htmlFor="folder">Folder</Label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger id="folder" className="w-full">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="No folder (Unfiled)" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No folder (Unfiled)</SelectItem>
                {folders.map((folder) => (
                  <SelectItem key={folder._id} value={folder._id}>
                    {folder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Content preview (read-only) */}
          <div className="space-y-2">
            <Label>Content (read-only)</Label>
            <div className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-muted-foreground text-sm max-h-40 overflow-y-auto whitespace-pre-wrap">
              {content}
            </div>
          </div>

          {/* Tags input */}
          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag()
                  }
                }}
                placeholder="Add a tag..."
                maxLength={30}
                className="flex-1"
              />
              <Button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                size="icon"
                variant="default"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Selected tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="p-0.5 hover:bg-accent/20 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !title.trim()}
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
