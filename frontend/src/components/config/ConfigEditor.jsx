import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Bot, Wand2, Loader2, FolderOpen, Lock, Globe } from 'lucide-react'
import { configService, modelService } from '../../services/chatService'
import { useProject } from '../../context/ProjectContext'
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
  const { t } = useTranslation('common')
  const isEditing = !!config
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null

  // Visibility default: existing config's visibility when editing, else
  // 'project' when a project is active, else 'private'.
  const initialVisibility = config?.visibility || (projectId ? 'project' : 'private')

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
    visibility: initialVisibility,
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
        visibility: config.visibility || (projectId ? 'project' : 'private'),
      })
    }
  }, [config, projectId])

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
      toast.success(isEditing ? t('config.toast_updated') : t('config.toast_created'))
      onSave()
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('config.toast_fail'))
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      toast.error(t('config.toast_name_required'))
      return
    }

    if (!formData.model_id) {
      toast.error(t('config.toast_model_required'))
      return
    }

    // Build payload. When visibility is 'project', include project_id so
    // the backend can derive workspace_id and pin the config to the project.
    // Don't change project pinning when editing an existing config — backend
    // rejects reassignment.
    const payload = { ...formData }
    if (!isEditing && payload.visibility === 'project' && projectId) {
      payload.project_id = projectId
    }

    saveMutation.mutate(payload)
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
      toast.error(t('config.enhance_empty'))
      return
    }

    setIsEnhancing(true)
    try {
      const { enhanced_prompt } = await configService.enhancePrompt(formData.system_prompt)
      handleChange('system_prompt', enhanced_prompt)
      toast.success(t('config.enhanced'))
    } catch (error) {
      toast.error(error.response?.data?.error || t('config.enhance_fail'))
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
            {isEditing ? t('config.edit_title') : t('config.create_title')}
          </DialogTitle>
        </DialogHeader>

        {/* Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="space-y-6">
            {/* Avatar & Name - vertical stack */}
            <div className="space-y-4">
              {/* Avatar selector */}
              <div className="space-y-2">
                <Label>{t('config.avatar_label')}</Label>
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
                <Label htmlFor="name">{t('config.name_label')}</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder={t('config.name_placeholder')}
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">{t('config.description_label')}</Label>
              <Input
                id="description"
                type="text"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder={t('config.description_placeholder')}
              />
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label>{t('config.visibility_label')}</Label>
              <div className="flex flex-wrap gap-2">
                {projectId && (
                  <button
                    type="button"
                    onClick={() => handleChange('visibility', 'project')}
                    disabled={isEditing && config?.visibility !== 'project'}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                      formData.visibility === 'project'
                        ? 'border-accent bg-accent/10 text-foreground'
                        : 'border-border bg-background-secondary text-foreground-secondary hover:border-foreground-tertiary',
                      isEditing && config?.visibility !== 'project' && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <FolderOpen className="h-4 w-4" />
                    <div className="text-start">
                      <div className="font-medium">{t('config.visibility_project')}</div>
                      <div className="text-xs text-foreground-tertiary truncate max-w-[140px]">
                        {currentProject?.name}
                      </div>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleChange('visibility', 'private')}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    formData.visibility === 'private'
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border bg-background-secondary text-foreground-secondary hover:border-foreground-tertiary'
                  )}
                >
                  <Lock className="h-4 w-4" />
                  <div className="text-start">
                    <div className="font-medium">{t('config.visibility_private')}</div>
                    <div className="text-xs text-foreground-tertiary">{t('config.visibility_private_hint')}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('visibility', 'public')}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors',
                    formData.visibility === 'public'
                      ? 'border-accent bg-accent/10 text-foreground'
                      : 'border-border bg-background-secondary text-foreground-secondary hover:border-foreground-tertiary'
                  )}
                >
                  <Globe className="h-4 w-4" />
                  <div className="text-start">
                    <div className="font-medium">{t('config.visibility_public')}</div>
                    <div className="text-xs text-foreground-tertiary">{t('config.visibility_public_hint')}</div>
                  </div>
                </button>
              </div>
              {isEditing && projectId && config?.visibility !== 'project' && (
                <p className="text-xs text-foreground-tertiary">
                  {t('config.visibility_lock_hint')}
                </p>
              )}
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label htmlFor="model">{t('config.model_label')}</Label>
              <Select
                value={formData.model_id}
                onValueChange={handleModelChange}
                required
              >
                <SelectTrigger id="model">
                  <SelectValue placeholder={t('config.model_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingModels ? (
                    <SelectItem value="loading" disabled>{t('config.loading_models')}</SelectItem>
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
                <Label htmlFor="system-prompt">{t('config.system_prompt_label')}</Label>
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
                      <Loader2 className="h-3 w-3 animate-spin me-1" />
                      {t('config.enhancing')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3 w-3 me-1" />
                      {t('config.enhance')}
                    </>
                  )}
                </Button>
              </div>
              <Textarea
                id="system-prompt"
                value={formData.system_prompt}
                onChange={(e) => handleChange('system_prompt', e.target.value)}
                placeholder={t('config.system_prompt_placeholder')}
                rows={6}
                className="resize-none font-mono text-sm"
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                {t('config.system_prompt_hint')}
              </p>
            </div>

            {/* Parameters */}
            <div className="space-y-4">
              <Label>{t('config.parameters_label')}</Label>

              <div className="space-y-2">
                {/* Temperature */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('config.temperature_label')}</span>
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
              <Label htmlFor="tag-input">{t('config.tags_label')}</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-foreground ms-1"
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
                  placeholder={t('config.tag_placeholder')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleAddTag}
                >
                  {t('config.add_tag')}
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
            {t('config.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? t('config.saving') : isEditing ? t('config.save_changes') : t('config.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
