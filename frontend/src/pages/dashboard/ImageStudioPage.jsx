import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [inputImages, setInputImages] = useState([])
  const [activeTab, setActiveTab] = useState('generate')
  const [generatedImage, setGeneratedImage] = useState(null)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedImages, setSelectedImages] = useState(new Set())

  // Fetch image models
  const { data: modelsData, isLoading: isLoadingModels } = useQuery({
    queryKey: ['imageModels'],
    queryFn: () => imageService.getImageModels(),
  })

  // Fetch history
  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['imageHistory'],
    queryFn: () => imageService.getHistory({ limit: 20 }),
    enabled: activeTab === 'history',
  })

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: imageService.generateImage,
    onSuccess: (data) => {
      setGeneratedImage(data.image_data)
      setInputImages([]) // Clear input images after successful generation
      queryClient.invalidateQueries(['imageHistory'])
      toast.success('Image generated!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Generation failed')
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: imageService.deleteImage,
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
      toast.success('Image deleted')
    },
  })

  // Favorite mutation
  const favoriteMutation = useMutation({
    mutationFn: imageService.toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: imageService.bulkDelete,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['imageHistory'])
      setSelectedImages(new Set())
      setIsSelectMode(false)
      toast.success(`Deleted ${data.deleted_count} images`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete images')
    },
  })

  // Toggle image selection
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

  // Select all images
  const selectAllImages = () => {
    if (historyData?.images) {
      setSelectedImages(new Set(historyData.images.map(img => img._id)))
    }
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedImages(new Set())
  }

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedImages.size === 0) return
    if (confirm(`Delete ${selectedImages.size} image${selectedImages.size > 1 ? 's' : ''}? This cannot be undone.`)) {
      bulkDeleteMutation.mutate(Array.from(selectedImages))
    }
  }

  // Exit select mode
  const exitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedImages(new Set())
  }

  const handleGenerate = () => {
    if (!prompt.trim()) {
      toast.error('Please enter a prompt')
      return
    }
    if (!selectedModel) {
      toast.error('Please select a model')
      return
    }

    // Extract base64 strings from images
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

  // Helper function to display settings with backward compatibility
  const getImageSettings = (image) => {
    const settings = image.settings || {}

    // New format
    if ('has_input_images' in settings) {
      return settings.has_input_images
        ? `Image-to-image (${settings.input_images_count} ref images)`
        : 'Text-to-image'
    }

    // Old format (backward compatibility)
    if ('aspect_ratio' in settings) {
      return `${settings.aspect_ratio} • ${settings.image_size}`
    }

    return 'Unknown'
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Image Studio</h1>
              <p className="text-sm text-foreground-secondary">Generate images with AI</p>
            </div>
          </div>
          <a
            href="/image-history"
            className="text-sm text-accent hover:underline"
          >
            View All History
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 px-6 pt-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="generate">Generate</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'generate' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Controls */}
            <div className="space-y-6">
              {/* Model Selection */}
              <div className="space-y-2">
                <Label>Model</Label>
                <Select
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                  disabled={isLoadingModels}
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

              {/* Template Selector */}
              <div>
                <Label className="mb-2">
                  Quick Start with Template
                </Label>
                <TemplateSelector
                  onSelect={(templateText) => setPrompt(templateText)}
                  disabled={generateMutation.isPending}
                />
              </div>

              {/* Prompt */}
              <div className="space-y-2">
                <Label>Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate... or use a template above"
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-foreground-tertiary">{prompt.length} characters</p>
              </div>

              {/* Negative Prompt */}
              <div className="space-y-2">
                <Label>
                  Negative Prompt (optional)
                </Label>
                <Textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="What to avoid in the image..."
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Reference Images */}
              {selectedModel && (
                <div className="space-y-2">
                  <Label>
                    Reference Images (optional)
                  </Label>
                  <p className="text-xs text-foreground-tertiary mb-2">
                    {selectedModel === 'bytedance-seed/seedream-4.5'
                      ? 'Upload up to 14 reference images for image editing'
                      : 'Upload up to 5 reference images for image editing'}
                  </p>
                  <ImageUploadPreview
                    images={inputImages}
                    maxImages={selectedModel === 'bytedance-seed/seedream-4.5' ? 14 : 5}
                    onChange={setInputImages}
                    disabled={generateMutation.isPending}
                  />
                </div>
              )}

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || !prompt.trim() || !selectedModel}
                className="w-full"
                size="lg"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate Image
                  </>
                )}
              </Button>
            </div>

            {/* Preview */}
            <div className="bg-background-tertiary rounded-xl p-4 flex items-center justify-center min-h-[400px]">
              {generatedImage ? (
                <div className="relative">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="max-w-full max-h-[500px] rounded-lg"
                  />
                  <Button
                    onClick={() => handleDownload(generatedImage)}
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                </div>
              ) : (
                <div className="text-center text-foreground-tertiary">
                  <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>Your generated image will appear here</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* History Tab */
          <div>
            {/* History Header with Select Mode Controls */}
            {historyData?.images?.length > 0 && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {isSelectMode ? (
                    <>
                      <Button
                        onClick={selectAllImages}
                        variant="secondary"
                        size="sm"
                      >
                        Select All
                      </Button>
                      <Button
                        onClick={clearSelection}
                        variant="secondary"
                        size="sm"
                        disabled={selectedImages.size === 0}
                      >
                        Clear
                      </Button>
                      <span className="text-sm text-foreground-secondary">
                        {selectedImages.size} selected
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-foreground-secondary">
                      {historyData.images.length} images
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
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1" />
                      )}
                      Delete ({selectedImages.size})
                    </Button>
                  )}
                  <Button
                    onClick={isSelectMode ? exitSelectMode : () => setIsSelectMode(true)}
                    variant={isSelectMode ? "default" : "secondary"}
                    size="sm"
                  >
                    {isSelectMode ? (
                      <>
                        <X className="h-4 w-4 mr-1" />
                        Cancel
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-4 w-4 mr-1" />
                        Select
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

                    {/* Selection checkbox */}
                    {isSelectMode && (
                      <div className="absolute top-2 left-2">
                        {selectedImages.has(image._id) ? (
                          <CheckSquare className="h-6 w-6 text-accent" />
                        ) : (
                          <Square className="h-6 w-6 text-white/70" />
                        )}
                      </div>
                    )}

                    {/* Hover overlay - only show when not in select mode */}
                    {!isSelectMode && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/70">
                          <p className="text-xs text-white truncate">{image.prompt}</p>
                          <p className="text-xs text-gray-300">{getImageSettings(image)}</p>
                        </div>
                        <div className="absolute top-2 right-2 flex gap-2">
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
                <p>No images generated yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
