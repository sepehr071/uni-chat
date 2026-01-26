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
} from 'lucide-react'
import { adminService } from '../../services/adminService'
import { modelService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import ConfirmDialog from '../../components/common/ConfirmDialog'

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
          <button
            onClick={() => {
              setEditingTemplate(null)
              setIsEditorOpen(true)
            }}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4" />
            Create Template
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
          <input
            type="text"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* Templates grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-background-secondary rounded-xl animate-pulse" />
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
              <button
                onClick={() => {
                  setEditingTemplate(null)
                  setIsEditorOpen(true)
                }}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4" />
                Create Template
              </button>
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
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setPendingTemplate(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Template"
        message={pendingTemplate ? `Are you sure you want to delete "${pendingTemplate.name}"? This action cannot be undone.` : 'Are you sure you want to delete this template?'}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  )
}

function TemplateCard({ template, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="card hover:border-border-light transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div
          className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
          style={{ backgroundColor: '#5c9aed20' }}
        >
          {template.avatar?.type === 'emoji'
            ? template.avatar.value
            : <Bot className="h-6 w-6 text-accent" />}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-36 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                <button
                  onClick={() => {
                    onEdit()
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => {
                    onDelete()
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-error hover:bg-error/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
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
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit Template' : 'Create Template'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)] p-6 space-y-6">
          {/* Avatar & Name */}
          <div className="flex gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Avatar</label>
              <div className="flex flex-wrap gap-2">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, avatar: { type: 'emoji', value: emoji } }))}
                    className={cn(
                      'h-10 w-10 rounded-lg flex items-center justify-center text-lg transition-colors',
                      formData.avatar?.value === emoji
                        ? 'bg-accent/20 ring-2 ring-accent'
                        : 'bg-background-tertiary hover:bg-background-elevated'
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium text-foreground">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="Template name"
                className="input"
                required
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
              placeholder="A helpful assistant for..."
              className="input"
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Model</label>
            <select
              value={formData.model_id}
              onChange={(e) => {
                const model = models.find(m => m.id === e.target.value)
                setFormData(p => ({
                  ...p,
                  model_id: e.target.value,
                  model_name: model?.name || e.target.value,
                }))
              }}
              className="input"
              required
            >
              <option value="">Select a model...</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">System Prompt</label>
            <textarea
              value={formData.system_prompt}
              onChange={(e) => setFormData(p => ({ ...p, system_prompt: e.target.value }))}
              placeholder="You are a helpful assistant..."
              rows={6}
              className="input resize-none font-mono text-sm"
            />
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            className="btn btn-primary"
          >
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
