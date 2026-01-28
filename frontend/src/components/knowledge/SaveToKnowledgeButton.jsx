import { useState, useEffect } from 'react'
import { Bookmark, X, Plus, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeService } from '../../services/knowledgeService'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

/**
 * Button to save a message to Knowledge Vault
 * Opens a modal for title input and tag selection
 */
export default function SaveToKnowledgeButton({
  message,
  conversationId,
  sourceType = 'chat',
  className
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState([])
  const [newTag, setNewTag] = useState('')
  const queryClient = useQueryClient()

  // Fetch existing tags for suggestions
  const { data: tagsData } = useQuery({
    queryKey: ['knowledge-tags'],
    queryFn: knowledgeService.getTags,
    enabled: isOpen, // Only fetch when modal is open
    staleTime: 60000 // Cache for 1 minute
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: knowledgeService.create,
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
      queryClient.invalidateQueries(['knowledge-tags'])
      toast.success('Saved to Knowledge Vault')
      handleClose()
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to save')
    }
  })

  // Generate a default title from the content
  useEffect(() => {
    if (isOpen && !title && message?.content) {
      // Use first line or first 50 chars as default title
      const firstLine = message.content.split('\n')[0]
      const defaultTitle = firstLine.length > 50
        ? firstLine.substring(0, 50) + '...'
        : firstLine
      setTitle(defaultTitle)
    }
  }, [isOpen, message?.content, title])

  const handleClose = () => {
    setIsOpen(false)
    setTitle('')
    setTags([])
    setNewTag('')
  }

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

  const handleSelectSuggestedTag = (tag) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag])
    }
  }

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Please enter a title')
      return
    }

    createMutation.mutate({
      source_type: sourceType,
      source_id: conversationId,
      message_id: message._id,
      content: message.content,
      title: title.trim(),
      tags
    })
  }

  const existingTags = tagsData?.tags || []
  const suggestedTags = existingTags.filter(t => !tags.includes(t)).slice(0, 8)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'p-1.5 rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors',
          className
        )}
        title="Save to Knowledge Vault"
      >
        <Bookmark className="h-3.5 w-3.5" />
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-md bg-background border border-border rounded-xl shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-foreground">Save to Knowledge Vault</h3>
              <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
              {/* Content preview */}
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
                  Content Preview
                </label>
                <div className="p-3 bg-background-secondary rounded-lg text-sm text-foreground-secondary max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {message?.content?.substring(0, 300)}
                  {message?.content?.length > 300 && '...'}
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter a title for this knowledge"
                  className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
                  maxLength={200}
                />
              </div>

              {/* Tags input */}
              <div>
                <label className="block text-xs font-medium text-foreground-secondary mb-1">
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

                {/* Suggested tags */}
                {suggestedTags.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-foreground-tertiary">Suggestions: </span>
                    <div className="inline-flex flex-wrap gap-1 mt-1">
                      {suggestedTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => handleSelectSuggestedTag(tag)}
                          className="px-2 py-0.5 bg-background-tertiary text-foreground-secondary text-xs rounded-full hover:bg-accent/10 hover:text-accent transition-colors"
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createMutation.isPending || !title.trim()}
                className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4" />
                    Save
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
