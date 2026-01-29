import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2, Loader2, Save, X } from 'lucide-react'
import { promptTemplateService } from '../../services/promptTemplateService'
import toast from 'react-hot-toast'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CATEGORY_OPTIONS = [
  { value: 'product_photography', label: 'Product Photography' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'lifestyle', label: 'Lifestyle' },
  { value: 'hero_banner', label: 'Hero/Banner' },
  { value: 'tech_saas', label: 'Tech/SaaS' },
  { value: 'food_restaurant', label: 'Food/Restaurant' },
  { value: 'fashion_apparel', label: 'Fashion/Apparel' },
]

export default function PromptTemplatesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    template_text: '',
    description: '',
    variables: '',
  })

  // Fetch templates
  const { data: templatesData, isLoading } = useQuery({
    queryKey: ['adminPromptTemplates'],
    queryFn: () => promptTemplateService.getTemplates(),
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: promptTemplateService.createTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(['adminPromptTemplates'])
      toast.success('Template created')
      resetForm()
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to create template')
    },
  })

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => promptTemplateService.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['adminPromptTemplates'])
      toast.success('Template updated')
      resetForm()
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update template')
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: promptTemplateService.deleteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries(['adminPromptTemplates'])
      toast.success('Template deleted')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete template')
    },
  })

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      template_text: '',
      description: '',
      variables: '',
    })
    setEditingTemplate(null)
    setShowForm(false)
  }

  const handleEdit = (template) => {
    setEditingTemplate(template)
    setFormData({
      name: template.name,
      category: template.category,
      template_text: template.template_text,
      description: template.description || '',
      variables: template.variables?.join(', ') || '',
    })
    setShowForm(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()

    const templateData = {
      name: formData.name.trim(),
      category: formData.category,
      template_text: formData.template_text.trim(),
      description: formData.description.trim(),
      variables: formData.variables
        ? formData.variables.split(',').map(v => v.trim()).filter(Boolean)
        : [],
    }

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate._id, data: templateData })
    } else {
      createMutation.mutate(templateData)
    }
  }

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

  const templates = templatesData?.templates || []

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Prompt Templates</h1>
            <p className="text-sm text-foreground-secondary">
              Manage AI image generation prompt templates
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="w-5 h-5 mr-2" />
            New Template
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Form */}
        {showForm && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">
                      Template Name *
                    </Label>
                    <Input
                      id="name"
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="category">
                      Category *
                    </Label>
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                      required
                    >
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="template_text">
                    Template Text *
                  </Label>
                  <Textarea
                    id="template_text"
                    value={formData.template_text}
                    onChange={(e) => setFormData({ ...formData, template_text: e.target.value })}
                    rows={4}
                    placeholder="Use {{variable_name}} for placeholders"
                    required
                  />
                  <p className="text-xs text-foreground-tertiary mt-1">
                    Use double curly braces for variables: {`{{product}}, {{color}}`}, etc.
                  </p>
                </div>

                <div>
                  <Label htmlFor="description">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    placeholder="Brief description of this template"
                  />
                </div>

                <div>
                  <Label htmlFor="variables">
                    Variables (comma-separated)
                  </Label>
                  <Input
                    id="variables"
                    type="text"
                    value={formData.variables}
                    onChange={(e) => setFormData({ ...formData, variables: e.target.value })}
                    placeholder="product, color, style"
                  />
                  <p className="text-xs text-foreground-tertiary mt-1">
                    List variable names used in template (without curly braces)
                  </p>
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {(createMutation.isPending || updateMutation.isPending) ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        {editingTemplate ? 'Update' : 'Create'}
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Templates List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-foreground-tertiary">
            <p>No templates found. Create one to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <Card key={template._id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-foreground">{template.name}</h3>
                        <Badge variant="secondary">
                          {template.category.replace(/_/g, ' ')}
                        </Badge>
                        {template.usage_count > 0 && (
                          <span className="text-xs text-foreground-tertiary">
                            Used {template.usage_count}x
                          </span>
                        )}
                      </div>
                      {template.description && (
                        <p className="text-sm text-foreground-secondary mb-2">
                          {template.description}
                        </p>
                      )}
                      <p className="text-sm text-foreground-tertiary line-clamp-2">
                        {template.template_text}
                      </p>
                      {template.variables && template.variables.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.variables.map(v => (
                            <Badge key={v} variant="outline">
                              {v}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(template)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(template)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setPendingTemplate(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete Template"
        message={pendingTemplate ? `Are you sure you want to delete "${pendingTemplate.name}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  )
}
