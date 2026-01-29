import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Bot,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  TrendingUp,
  X,
} from 'lucide-react'
import { adminService } from '../../services/adminService'
import { modelService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function TemplatesPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-templates'],
    queryFn: () => adminService.getTemplates(),
  })

  const templates = data?.templates || []
  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const deleteMutation = useMutation({
    mutationFn: adminService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
      toast.success('Template deleted')
    },
    onError: () => {
      toast.error('Failed to delete template')
    },
  })

  const handleDelete = (template) => {
    setPendingTemplate(template)
    setShowDeleteConfirm(true)
  }

  const handleConfirmDelete = () => {
    if (pendingTemplate) {
      deleteMutation.mutate(pendingTemplate._id)
      setPendingTemplate(null)
      setShowDeleteConfirm(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Templates</h1>
            <p className="text-foreground-secondary mt-1">
              Manage official AI configuration templates
            </p>
          </div>
          <Button
            onClick={() => {
              setEditingTemplate(null)
              setIsEditorOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Create Template
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
          <Input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Templates grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No matches found' : 'No templates yet'}
            </h3>
            <p className="text-foreground-secondary mb-4">
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first template to help users get started'}
            </p>
            {!searchQuery && (
              <Button
                onClick={() => {
                  setEditingTemplate(null)
                  setIsEditorOpen(true)
                }}
              >
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template._id}
                template={template}
                onEdit={() => {
                  setEditingTemplate(template)
                  setIsEditorOpen(true)
                }}
                onDelete={() => handleDelete(template)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Template Editor Modal */}
      {isEditorOpen && (
        <TemplateEditor
          template={editingTemplate}
          onClose={() => {
            setIsEditorOpen(false)
            setEditingTemplate(null)
          }}
          onSave={() => {
            setIsEditorOpen(false)
            setEditingTemplate(null)
            queryClient.invalidateQueries({ queryKey: ['admin-templates'] })
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTemplate
                ? `Are you sure you want to delete "${pendingTemplate.name}"? This action cannot be undone.`
                : 'Are you sure you want to delete this template?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowDeleteConfirm(false)
                setPendingTemplate(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function TemplateCard({ template, onEdit, onDelete }) {
  return (
    <Card className="hover:border-border-light transition-colors group">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {template.avatar?.type === 'emoji'
              ? template.avatar.value
              : <Bot className="h-6 w-6 text-accent" />}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="p-1.5 h-auto text-foreground-tertiary hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={onEdit} className="gap-2">
                <Edit2 className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="gap-2 text-error focus:text-error"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="font-semibold text-foreground mb-1">{template.name}</h3>
        <p className="text-sm text-foreground-secondary line-clamp-2 mb-3">
          {template.description || 'No description'}
        </p>

        <div className="flex items-center justify-between text-xs text-foreground-tertiary">
          <span className="truncate">{template.model_name || template.model_id}</span>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {template.stats?.uses_count || 0} uses
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TemplateEditor({ template, onClose, onSave }) {
  const isEditing = !!template

  const { data: modelsData } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelService.getModels(),
  })

  const models = modelsData?.models || []

  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    model_id: template?.model_id || '',
    model_name: template?.model_name || '',
    system_prompt: template?.system_prompt || '',
    avatar: template?.avatar || { type: 'emoji', value: '🤖' },
    parameters: template?.parameters || {
      temperature: 0.7,
      max_tokens: 2048,
    },
    tags: template?.tags || [],
  })

  const saveMutation = useMutation({
    mutationFn: isEditing
      ? (data) => adminService.updateTemplate(template._id, data)
      : adminService.createTemplate,
    onSuccess: () => {
      toast.success(isEditing ? 'Template updated' : 'Template created')
      onSave()
    },
    onError: () => {
      toast.error('Failed to save template')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name || !formData.model_id) {
      toast.error('Name and model are required')
      return
    }
    saveMutation.mutate(formData)
  }

  const emojiOptions = ['🤖', '🧠', '💡', '🎯', '📚', '✍️', '🎨', '🔬', '💻', '🌟']

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Template' : 'Create Template'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 space-y-6 pr-2">
          {/* Avatar & Name */}
          <div className="flex gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Avatar</label>
              <div className="flex flex-wrap gap-2">
                {emojiOptions.map((emoji) => (
                  <Button
                    key={emoji}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFormData(p => ({ ...p, avatar: { type: 'emoji', value: emoji } }))}
                    className={cn(
                      'h-10 w-10 p-0 text-lg',
                      formData.avatar?.value === emoji
                        ? 'bg-accent/20 ring-2 ring-accent hover:bg-accent/30'
                        : 'hover:bg-background-tertiary'
                    )}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium text-foreground">Name</label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Template name"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Description</label>
            <Input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="A helpful assistant for..."
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Model</label>
            <Select
              value={formData.model_id}
              onValueChange={(value) => {
                const model = models.find(m => m.id === value)
                setFormData(p => ({
                  ...p,
                  model_id: value,
                  model_name: model?.name || value,
                }))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">System Prompt</label>
            <Textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData(p => ({ ...p, system_prompt: e.target.value }))}
              placeholder="You are a helpful assistant..."
              rows={6}
              className="resize-none font-mono text-sm"
            />
          </div>
        </form>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
