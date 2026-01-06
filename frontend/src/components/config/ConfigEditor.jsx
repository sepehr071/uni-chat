import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Bot, Wand2, Loader2 } from 'lucide-react'
import { configService, modelService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

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
      temperature: 0.7,
      max_tokens: 2048,
      top_p: 1.0,
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
        parameters: config.parameters || {
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 1.0,
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
      toast.success(isEditing ? 'Configuration updated' : 'Configuration created')
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-2xl max-h-[90vh] overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit Configuration' : 'Create Configuration'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Avatar & Name - vertical stack */}
            <div className="space-y-4">
              {/* Avatar selector */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Avatar</label>
                <div className="grid grid-cols-5 gap-2 max-w-[240px]">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleChange('avatar', { type: 'emoji', value: emoji })}
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

              {/* Name */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="My AI Assistant"
                  className="input w-full"
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
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="A helpful assistant for..."
                className="input"
              />
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Model</label>
              <select
                value={formData.model_id}
                onChange={(e) => handleModelChange(e.target.value)}
                className="input"
                required
              >
                <option value="">Select a model...</option>
                {isLoadingModels ? (
                  <option disabled>Loading models...</option>
                ) : (
                  models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-foreground">System Prompt</label>
                <button
                  type="button"
                  onClick={handleEnhancePrompt}
                  disabled={isEnhancing || !formData.system_prompt.trim()}
                  className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isEnhancing ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Enhancing...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3 w-3" />
                      Enhance
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => handleChange('system_prompt', e.target.value)}
                placeholder="You are a helpful assistant that..."
                rows={6}
                className="input resize-none font-mono text-sm"
              />
              <p className="text-xs text-foreground-tertiary">
                This prompt will be used to define the AI's behavior and personality.
              </p>
            </div>

            {/* Parameters */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-foreground">Parameters</label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-secondary">Temperature</span>
                    <span className="text-foreground">{formData.parameters.temperature}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.parameters.temperature}
                    onChange={(e) => handleChange('parameters', {
                      ...formData.parameters,
                      temperature: parseFloat(e.target.value),
                    })}
                    className="w-full accent-accent"
                  />
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-secondary">Max Tokens</span>
                    <span className="text-foreground">{formData.parameters.max_tokens}</span>
                  </div>
                  <input
                    type="range"
                    min="256"
                    max="8192"
                    step="256"
                    value={formData.parameters.max_tokens}
                    onChange={(e) => handleChange('parameters', {
                      ...formData.parameters,
                      max_tokens: parseInt(e.target.value),
                    })}
                    className="w-full accent-accent"
                  />
                </div>

                {/* Top P */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground-secondary">Top P</span>
                    <span className="text-foreground">{formData.parameters.top_p}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.parameters.top_p}
                    onChange={(e) => handleChange('parameters', {
                      ...formData.parameters,
                      top_p: parseFloat(e.target.value),
                    })}
                    className="w-full accent-accent"
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-foreground">Tags</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="badge badge-primary flex items-center gap-1"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  placeholder="Add a tag..."
                  className="input flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="btn btn-secondary"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
            className="btn btn-primary"
          >
            {saveMutation.isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
