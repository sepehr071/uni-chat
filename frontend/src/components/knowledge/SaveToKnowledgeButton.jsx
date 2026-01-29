import { useState, useEffect } from 'react'
import { Bookmark, X, Plus, Loader2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { knowledgeService } from '../../services/knowledgeService'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

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
          'p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors',
          className
        )}
        title="Save to Knowledge Vault"
      >
        <Bookmark className="h-3.5 w-3.5" />
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save to Knowledge Vault</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Content preview */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Content Preview
              </Label>
              <ScrollArea className="h-24 rounded-lg border bg-muted/50 p-3">
                <div
                  dir="auto"
                  className="text-sm text-muted-foreground whitespace-pre-wrap break-words"
                >
                  {message?.content?.substring(0, 300)}
                  {message?.content?.length > 300 && '...'}
                </div>
              </ScrollArea>
            </div>

            {/* Title input */}
            <div className="space-y-2">
              <Label htmlFor="knowledge-title" className="text-xs text-muted-foreground">
                Title
              </Label>
              <Input
                id="knowledge-title"
                dir="auto"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a title for this knowledge"
                maxLength={200}
              />
            </div>

            {/* Tags input */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Tags
              </Label>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  placeholder="Add a tag..."
                  className="flex-1"
                  maxLength={30}
                />
                <Button
                  onClick={handleAddTag}
                  disabled={!newTag.trim()}
                  size="icon"
                  variant="secondary"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Selected tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      #{tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="p-0.5 hover:bg-background rounded-full ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Suggested tags */}
              {suggestedTags.length > 0 && (
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">Suggestions: </span>
                  <div className="inline-flex flex-wrap gap-1 mt-1">
                    {suggestedTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleSelectSuggestedTag(tag)}
                        className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || !title.trim()}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
