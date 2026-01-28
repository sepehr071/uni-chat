import { useState, useEffect } from 'react'
import { X, Plus, Save, Loader2, Folder } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeService } from '../../services/knowledgeService'
import toast from 'react-hot-toast'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal content */}
      <div className="relative w-full max-w-2xl bg-background border border-border rounded-xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-semibold text-foreground">Edit Knowledge Item</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Title input */}
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title"
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              maxLength={200}
            />
          </div>

          {/* Folder selection */}
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1">
              Folder
            </label>
            <div className="relative">
              <Folder className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent appearance-none"
              >
                <option value="">No folder (Unfiled)</option>
                {folders.map((folder) => (
                  <option key={folder._id} value={folder._id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Content preview (read-only) */}
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1">
              Content (read-only)
            </label>
            <div className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-foreground-secondary text-sm max-h-40 overflow-y-auto whitespace-pre-wrap">
              {content}
            </div>
          </div>

          {/* Tags input */}
          <div>
            <label className="block text-sm font-medium text-foreground-secondary mb-1">
              Tags
            </label>
            <div className="flex gap-2">
              <input
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
                className="flex-1 px-3 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent text-sm"
                maxLength={30}
              />
              <button
                onClick={handleAddTag}
                disabled={!newTag.trim()}
                className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:bg-background-tertiary disabled:text-foreground-tertiary text-white rounded-lg transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {/* Selected tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded-full text-xs"
                  >
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="p-0.5 hover:bg-accent/20 rounded-full"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateMutation.isPending || !title.trim()}
            className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
