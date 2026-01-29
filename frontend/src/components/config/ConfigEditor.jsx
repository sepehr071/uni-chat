import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Bot, Wand2, Loader2 } from 'lucide-react'
import { configService, modelService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function ConfigEditor({ config, onClose, onSave }) {
  const isEditing = !!config

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    model_id: '',
    model_name: '',
    system_prompt: '',
    avatar: { type: 'initials', value: 'AI' },
    parameters: {
      temperature: 0.5,
    },
    tags: [],
  })

  const [tagInput, setTagInput] = useState('')
  const [isEnhancing, setIsEnhancing] = useState(false)

  // Load config data if editing
  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name || '',
        description: config.description || '',
        model_id: config.model_id || '',
        model_name: config.model_name || '',
        system_prompt: config.system_prompt || '',
        avatar: config.avatar || { type: 'initials', value: 'AI' },
        parameters: {
          temperature: config.parameters?.temperature ?? 0.5,
        },
        tags: config.tags || [],
      })
    }
  }, [config])

  // Fetch available models
  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['models'],
    queryFn: () => modelService.getModels(),
  })

  const models = modelsData?.models || []

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: isEditing
      ? (data) => configService.updateConfig(config._id, data)
      : configService.createConfig,
    onSuccess: () => {
      toast.success(isEditing ? 'Custom assistant updated' : 'Custom assistant created')
      onSave()
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to save')
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error('Name is required')
      return
    }

    if (!formData.model_id) {
      toast.error('Please select a model')
      return
    }

    saveMutation.mutate(formData)
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleModelChange = (modelId) => {
    const model = models.find(m => m.id === modelId)
    setFormData(prev => ({
      ...prev,
      model_id: modelId,
      model_name: model?.name || modelId,
    }))
  }

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }))
      setTagInput('')
    }
  }

  const handleRemoveTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }))
  }

  const handleEnhancePrompt = async () => {
    if (!formData.system_prompt.trim()) {
      toast.error('Enter a prompt to enhance')
      return
    }

    setIsEnhancing(true)
    try {
      const { enhanced_prompt } = await configService.enhancePrompt(formData.system_prompt)
      handleChange('system_prompt', enhanced_prompt)
      toast.success('Prompt enhanced!')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to enhance prompt')
    } finally {
      setIsEnhancing(false)
    }
  }

  const emojiOptions = ['🤖', '🧠', '💡', '🎯', '📚', '✍️', '🎨', '🔬', '💻', '🌟']

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Custom Assistant' : 'Create Custom Assistant'}
          </DialogTitle>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Avatar & Name - vertical stack */}
            <div className="space-y-4">
              {/* Avatar selector */}
              <div className="space-y-2">
                <Label>Avatar</Label>
                <div className="grid grid-cols-5 gap-2 max-w-[240px]">
                  {emojiOptions.map((emoji) => (
                    <Button
                      key={emoji}
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => handleChange('avatar', { type: 'emoji', value: emoji })}
                      className={cn(
                        'h-10 w-10 text-lg',
                        formData.avatar?.value === emoji && 'ring-2 ring-primary'
                      )}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="My AI Assistant"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                type="text"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="A helpful assistant for..."
              />
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <Select
                value={formData.model_id}
                onValueChange={handleModelChange}
                required
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingModels ? (
                    <SelectItem value="loading" disabled>Loading models...</SelectItem>
                  ) : (
                    models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="system-prompt">System Prompt</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleEnhancePrompt}
                  disabled={isEnhancing || !formData.system_prompt.trim()}
                  className="h-auto py-1 text-xs"
                >
                  {isEnhancing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      Enhancing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3 w-3 mr-1" />
                      Enhance
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="system-prompt"
                value={formData.system_prompt}
                onChange={(e) => handleChange('system_prompt', e.target.value)}
                placeholder="You are a helpful assistant that..."
                rows={6}
                className="resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This prompt will be used to define the AI's behavior and personality.
              </p>
            </div>

            {/* Parameters */}
            <div className="space-y-4">
              <Label>Parameters</Label>

              <div className="space-y-2">
                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Temperature</span>
                    <span className="text-foreground">{formData.parameters.temperature}</span>
                  </div>
                  <Slider
                    min={0}
                    max={2}
                    step={0.1}
                    value={[formData.parameters.temperature]}
                    onValueChange={([value]) => handleChange('parameters', {
                      ...formData.parameters,
                      temperature: value,
                    })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tag-input">Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-foreground ml-1"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="tag-input"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add a tag..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddTag}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
