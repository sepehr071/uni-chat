import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Sparkles, Download, Heart, Trash2, Loader2, Image as ImageIcon, CheckSquare, Square, X } from 'lucide-react'
import { imageService } from '../../services/imageService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import ImageUploadPreview from '../../components/common/ImageUploadPreview'
import TemplateSelector from '../../components/image/TemplateSelector'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export default function ImageStudioPage() {
  const { t } = useTranslation('dashboard')
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [inputImages, setInputImages] = useState([])
  const [activeTab, setActiveTab] = useState('generate')
  const [generatedImage, setGeneratedImage] = useState(null)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedImages, setSelectedImages] = useState(new Set())

  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['imageModels'],
    queryFn: () => imageService.getImageModels(),
  })

  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['imageHistory'],
    queryFn: () => imageService.getHistory({ limit: 20 }),
    enabled: activeTab === 'history',
  })

  const generateMutation = useMutation({
    mutationFn: imageService.generateImage,
    onSuccess: (data) => {
      setGeneratedImage(data.image_data)
      setInputImages([])
      queryClient.invalidateQueries(['imageHistory'])
      toast.success(t('imageStudio.imageGenerated'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('imageStudio.generationFailed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: imageService.deleteImage,
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
      toast.success(t('imageStudio.imageDeleted'))
    },
  })

  const favoriteMutation = useMutation({
    mutationFn: imageService.toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: imageService.bulkDelete,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['imageHistory'])
      setSelectedImages(new Set())
      setIsSelectMode(false)
      toast.success(t('imageStudio.deletedCount', { count: data.deleted_count }))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('imageStudio.failedToDelete'))
    },
  })

  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(imageId)) {
        newSet.delete(imageId)
      } else {
        newSet.add(imageId)
      }
      return newSet
    })
  }

  const selectAllImages = () => {
    if (historyData?.images) {
      setSelectedImages(new Set(historyData.images.map(img => img._id)))
    }
  }

  const clearSelection = () => {
    setSelectedImages(new Set())
  }

  const handleBulkDelete = () => {
    if (selectedImages.size === 0) return
    if (confirm(t('imageStudio.deleteSelected', { count: selectedImages.size }) + '?')) {
      bulkDeleteMutation.mutate(Array.from(selectedImages))
    }
  }

  const exitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedImages(new Set())
  }

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error(t('imageStudio.enterPrompt'))
      return
    }
    if (!selectedModel) {
      toast.error(t('imageStudio.selectModelError'))
      return
    }

    const imageBase64Array = inputImages.map(img => img.base64)

    generateMutation.mutate({
      prompt,
      model: selectedModel,
      negative_prompt: negativePrompt,
      input_images: imageBase64Array.length > 0 ? imageBase64Array : undefined,
    })
  }

  const handleDownload = (imageData, filename = 'generated-image.png') => {
    const link = document.createElement('a')
    link.href = imageData
    link.download = filename
    link.click()
  }

  const models = modelsData?.models || []

  const getImageSettings = (image) => {
    const settings = image.settings || {}

    if ('has_input_images' in settings) {
      return settings.has_input_images
        ? t('imageStudio.imageToImage', { count: settings.input_images_count })
        : t('imageStudio.textToImage')
    }

    if ('aspect_ratio' in settings) {
      return `${settings.aspect_ratio} • ${settings.image_size}`
    }

    return 'Unknown'
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{t('imageStudio.title')}</h1>
              <p className="text-sm text-foreground-secondary">{t('imageStudio.subtitle')}</p>
            </div>
          </div>
          <a
            href="/image-history"
            className="text-sm text-accent hover:underline"
          >
            {t('imageStudio.viewAllHistory')}
          </a>
        </div>
      </div>

      <div className="flex-shrink-0 px-6 pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="generate">{t('imageStudio.generate')}</TabsTrigger>
            <TabsTrigger value="history">{t('imageStudio.history')}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'generate' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>{t('imageStudio.model')}</Label>
                <Select
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                  disabled={isLoadingModels}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('imageStudio.selectModel')} />
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

              <div>
                <Label className="mb-2">{t('imageStudio.quickStartTemplate')}</Label>
                <TemplateSelector
                  onSelect={(templateText) => setPrompt(templateText)}
                  disabled={generateMutation.isPending}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('imageStudio.prompt')}</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={t('imageStudio.promptPlaceholder')}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-foreground-tertiary">{t('imageStudio.promptLength', { count: prompt.length })}</p>
              </div>

              <div className="space-y-2">
                <Label>{t('imageStudio.negativePrompt')}</Label>
                <Textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder={t('imageStudio.negativePromptPlaceholder')}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {selectedModel && (() => {
                const current = models.find((m) => m.id === selectedModel)
                const maxRefs = current?.max_input_images ?? 3
                return (
                  <div className="space-y-2">
                    <Label>{t('imageStudio.referenceImages')}</Label>
                    <p className="text-xs text-foreground-tertiary mb-2">
                      {t('imageStudio.referenceImagesDesc_other', { count: maxRefs })}
                    </p>
                    <ImageUploadPreview
                      images={inputImages}
                      maxImages={maxRefs}
                      onChange={setInputImages}
                      disabled={generateMutation.isPending}
                    />
                  </div>
                )
              })()}

              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !prompt.trim() || !selectedModel}
                className="w-full"
                size="lg"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin me-2" />
                    {t('imageStudio.generating')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 me-2" />
                    {t('imageStudio.generateImage')}
                  </>
                )}
              </Button>
            </div>

            <div className="bg-background-tertiary rounded-xl p-4 flex items-center justify-center min-h-[400px]">
              {generatedImage ? (
                <div className="relative">
                  <img
                    src={generatedImage}
                    alt={t('imageStudio.imagePreviewAlt')}
                    className="max-w-full max-h-[500px] rounded-lg"
                  />
                  <Button
                    onClick={() => handleDownload(generatedImage)}
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 end-2 bg-black/50 hover:bg-black/70 text-white"
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <div className="text-center text-foreground-tertiary">
                  <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>{t('imageStudio.previewPlaceholder')}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            {historyData?.images?.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isSelectMode ? (
                    <>
                      <Button onClick={selectAllImages} variant="secondary" size="sm">
                        {t('imageStudio.selectAll')}
                      </Button>
                      <Button onClick={clearSelection} variant="secondary" size="sm" disabled={selectedImages.size === 0}>
                        {t('imageStudio.clear')}
                      </Button>
                      <span className="text-sm text-foreground-secondary">
                        {t('imageStudio.selected', { count: selectedImages.size })}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-foreground-secondary">
                      {historyData.images.length} {t('imageStudio.history')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isSelectMode && selectedImages.size > 0 && (
                    <Button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                      variant="destructive"
                      size="sm"
                    >
                      {bulkDeleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin me-1" />
                      ) : (
                        <Trash2 className="h-4 w-4 me-1" />
                      )}
                      {t('imageStudio.deleteSelected', { count: selectedImages.size })}
                    </Button>
                  )}
                  <Button
                    onClick={isSelectMode ? exitSelectMode : () => setIsSelectMode(true)}
                    variant={isSelectMode ? "default" : "secondary"}
                    size="sm"
                  >
                    {isSelectMode ? (
                      <>
                        <X className="h-4 w-4 me-1" />
                        {t('imageStudio.cancel')}
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-4 w-4 me-1" />
                        {t('imageStudio.select')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {isLoadingHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
              </div>
            ) : historyData?.images?.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {historyData.images.map((image) => (
                  <div
                    key={image._id}
                    className={cn(
                      "relative group bg-background-tertiary rounded-lg overflow-hidden",
                      isSelectMode && "cursor-pointer",
                      isSelectMode && selectedImages.has(image._id) && "ring-2 ring-accent"
                    )}
                    onClick={isSelectMode ? () => toggleImageSelection(image._id) : undefined}
                  >
                    <img
                      src={image.image_data}
                      alt={image.prompt}
                      className="w-full aspect-square object-cover"
                    />

                    {isSelectMode && (
                      <div className="absolute top-2 start-2">
                        {selectedImages.has(image._id) ? (
                          <CheckSquare className="h-6 w-6 text-accent" />
                        ) : (
                          <Square className="h-6 w-6 text-white/70" />
                        )}
                      </div>
                    )}

                    {!isSelectMode && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 start-0 end-0 p-2 bg-black/70">
                          <p className="text-xs text-white truncate">{image.prompt}</p>
                          <p className="text-xs text-gray-300">{getImageSettings(image)}</p>
                        </div>
                        <div className="absolute top-2 end-2 flex gap-2">
                          <Button
                            onClick={() => handleDownload(image.image_data)}
                            variant="ghost"
                            size="icon"
                            className="bg-white/20 hover:bg-white/30 text-white"
                          >
                            <Download className="h-5 w-5" />
                          </Button>
                          <Button
                            onClick={() => favoriteMutation.mutate(image._id)}
                            variant="ghost"
                            size="icon"
                            className="bg-white/20 hover:bg-white/30 text-white"
                          >
                            <Heart
                              className={cn(
                                'h-5 w-5',
                                image.is_favorite ? 'text-red-500 fill-current' : 'text-white'
                              )}
                            />
                          </Button>
                          <Button
                            onClick={() => deleteMutation.mutate(image._id)}
                            variant="ghost"
                            size="icon"
                            className="bg-white/20 hover:bg-white/30 text-white"
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-foreground-tertiary">
                <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>{t('imageStudio.noImagesYet')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
