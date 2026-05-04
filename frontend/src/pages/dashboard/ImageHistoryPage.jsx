import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Image as ImageIcon,
  Search,
  Download,
  Heart,
  Trash2,
  Loader2,
  CheckSquare,
  Square,
  X,
  ChevronLeft,
  ChevronRight,
  Star,
  Copy,
  Check,
} from 'lucide-react'
import { imageService } from '../../services/imageService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

export default function ImageHistoryPage() {
  const queryClient = useQueryClient()

  // State
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedImages, setSelectedImages] = useState(new Set())
  const [zoomedImage, setZoomedImage] = useState(null)

  const limit = 24

  // Fetch history
  const { data, isLoading, error } = useQuery({
    queryKey: ['imageHistory', { page, limit, favoritesOnly }],
    queryFn: () => imageService.getHistory({
      page,
      limit,
      favorites_only: favoritesOnly || undefined
    })
  })

  // Mutations
  const favoriteMutation = useMutation({
    mutationFn: imageService.toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
    }
  })

  const deleteMutation = useMutation({
    mutationFn: imageService.deleteImage,
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
      toast.success('Image deleted')
    },
    onError: () => {
      toast.error('Failed to delete image')
    }
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedImages)
      await Promise.all(ids.map(id => imageService.deleteImage(id)))
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['imageHistory'])
      setSelectedImages(new Set())
      setIsSelectMode(false)
      toast.success('Images deleted')
    },
    onError: () => {
      toast.error('Failed to delete some images')
    }
  })

  // Handlers
  const handleDownload = (imageData, prompt) => {
    const link = document.createElement('a')
    link.href = imageData
    link.download = `generated-${prompt?.slice(0, 30) || 'image'}.png`
    link.click()
  }

  const toggleImageSelection = (id) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const selectAllImages = () => {
    if (data?.images) {
      setSelectedImages(new Set(data.images.map(img => img._id)))
    }
  }

  const clearSelection = () => {
    setSelectedImages(new Set())
  }

  const exitSelectMode = () => {
    setIsSelectMode(false)
    setSelectedImages(new Set())
  }

  const handleBulkDelete = () => {
    if (selectedImages.size === 0) return
    if (window.confirm(`Delete ${selectedImages.size} images?`)) {
      bulkDeleteMutation.mutate()
    }
  }

  const getImageSettings = useCallback((image) => {
    const settings = []
    if (image.model_id) settings.push(image.model_id.split('/').pop())
    if (image.aspect_ratio) settings.push(image.aspect_ratio)
    return settings.join(' • ')
  }, [])

  // Filter images by search query (client-side for now)
  const filteredImages = data?.images?.filter(img =>
    !searchQuery || img.prompt?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  const totalImages = data?.total || 0
  const totalPages = Math.ceil(totalImages / limit)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 md:p-6 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <ImageIcon className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Image History</h1>
              <p className="text-sm text-foreground-secondary">Your generated images</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by prompt..."
                className="w-full pl-10 pr-4 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-background-tertiary rounded"
                >
                  <X className="h-4 w-4 text-foreground-tertiary" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2">
            {/* Favorites toggle */}
            <button
              onClick={() => {
                setFavoritesOnly(!favoritesOnly)
                setPage(1)
              }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm',
                favoritesOnly
                  ? 'bg-red-500/10 border-red-500/30 text-red-500'
                  : 'bg-background-secondary border-border text-foreground-secondary hover:text-foreground'
              )}
            >
              <Heart className={cn('h-4 w-4', favoritesOnly && 'fill-current')} />
              Favorites
            </button>

            {/* Total count */}
            <span className="text-sm text-foreground-tertiary">
              {totalImages} images
            </span>
          </div>

          {/* Select mode controls */}
          <div className="flex items-center gap-2">
            {isSelectMode && (
              <>
                <button
                  onClick={selectAllImages}
                  className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-sm rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground"
                  disabled={selectedImages.size === 0}
                >
                  Clear
                </button>
                {selectedImages.size > 0 && (
                  <>
                    <span className="text-sm text-foreground-secondary">
                      {selectedImages.size} selected
                    </span>
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 flex items-center gap-1"
                    >
                      {bulkDeleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
            <button
              onClick={isSelectMode ? exitSelectMode : () => setIsSelectMode(true)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg flex items-center gap-1',
                isSelectMode
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground-secondary hover:text-foreground'
              )}
            >
              {isSelectMode ? (
                <>
                  <X className="h-4 w-4" />
                  Cancel
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Select
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <span className="text-foreground-secondary">Loading images...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <p className="text-foreground-secondary mb-2">Failed to load images</p>
              <button
                onClick={() => queryClient.refetchQueries(['imageHistory'])}
                className="text-accent hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && filteredImages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 bg-background-tertiary rounded-full flex items-center justify-center mb-4">
              <ImageIcon className="h-8 w-8 text-foreground-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {searchQuery ? 'No matching images' : favoritesOnly ? 'No favorite images' : 'No images generated yet'}
            </h3>
            <p className="text-foreground-secondary max-w-md">
              {searchQuery
                ? 'Try a different search query.'
                : favoritesOnly
                  ? 'Mark images as favorites to see them here.'
                  : 'Generate images in the Image Studio to see them here.'}
            </p>
          </div>
        )}

        {/* Image grid */}
        {!isLoading && !error && filteredImages.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredImages.map((image) => (
                <div
                  key={image._id}
                  className={cn(
                    "relative group bg-background-tertiary rounded-lg overflow-hidden aspect-square cursor-pointer",
                    isSelectMode && selectedImages.has(image._id) && "ring-2 ring-accent"
                  )}
                  onClick={isSelectMode ? () => toggleImageSelection(image._id) : () => setZoomedImage(image)}
                >
                  <img
                    src={image.image_data}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
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

                  {/* Hover overlay */}
                  {!isSelectMode && (
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/70">
                        <p className="text-xs text-white truncate">{image.prompt}</p>
                        <p className="text-xs text-gray-300">{getImageSettings(image)}</p>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(image.image_data, image.prompt)
                          }}
                          className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30"
                          title="Download"
                        >
                          <Download className="h-4 w-4 text-white" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            favoriteMutation.mutate(image._id)
                          }}
                          className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30"
                          title={image.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Heart
                            className={cn(
                              'h-4 w-4',
                              image.is_favorite ? 'text-red-500 fill-current' : 'text-white'
                            )}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm('Delete this image?')) {
                              deleteMutation.mutate(image._id)
                            }
                          }}
                          className="p-1.5 bg-white/20 rounded-lg hover:bg-white/30"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-white" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Favorite indicator */}
                  {image.is_favorite && !isSelectMode && (
                    <div className="absolute top-2 left-2 p-1 bg-black/40 rounded">
                      <Heart className="h-3 w-3 text-red-500 fill-current" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg bg-background-secondary border border-border text-foreground-secondary hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm text-foreground-secondary px-4">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg bg-background-secondary border border-border text-foreground-secondary hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Zoomed image modal with full detail panel */}
      {zoomedImage && (
        <ImageDetailModal
          image={zoomedImage}
          onClose={() => setZoomedImage(null)}
          onDownload={() => handleDownload(zoomedImage.image_data, zoomedImage.prompt)}
          onToggleFavorite={() => favoriteMutation.mutate(zoomedImage._id)}
          onDelete={() => {
            if (window.confirm('Delete this image?')) {
              deleteMutation.mutate(zoomedImage._id)
              setZoomedImage(null)
            }
          }}
        />
      )}
    </div>
  )
}

function CopyButton({ value, label = 'Copy' }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(String(value))
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="inline-flex items-center gap-1 text-[11px] text-foreground-tertiary hover:text-foreground transition-colors"
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Copied' : label}
    </button>
  )
}

function DetailRow({ label, children, copyValue, mono = false }) {
  if (children == null || children === '' || (Array.isArray(children) && children.length === 0)) return null
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-foreground-tertiary">{label}</span>
        {copyValue && <CopyButton value={copyValue} />}
      </div>
      <div className={cn('text-sm text-foreground break-words', mono && 'font-mono text-xs')}>
        {children}
      </div>
    </div>
  )
}

function ImageDetailModal({ image, onClose, onDownload, onToggleFavorite, onDelete }) {
  // Esc-to-close
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const settings = image.settings || {}
  const metadata = image.metadata || {}
  const inputImagesCount = settings.input_images_count
  const aspectRatio = image.aspect_ratio || metadata.aspect_ratio || settings.aspect_ratio
  const seed = metadata.seed ?? settings.seed
  const generationTime = metadata.generation_time_ms
    ? `${(metadata.generation_time_ms / 1000).toFixed(2)}s`
    : metadata.generation_time
      ? `${metadata.generation_time}s`
      : null
  const fromWorkflow = metadata.workflow_execution === true
  const generationId = metadata.generation_id

  // Other metadata keys we haven't hand-rendered already
  const knownMetaKeys = new Set([
    'aspect_ratio', 'seed', 'generation_time', 'generation_time_ms',
    'workflow_execution', 'generation_id',
  ])
  const extraMetadata = Object.entries(metadata).filter(([k, v]) => {
    if (knownMetaKeys.has(k)) return false
    if (v == null || v === '' || (typeof v === 'object' && Object.keys(v).length === 0)) return false
    return true
  })

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/20 rounded-lg hover:bg-white/30 z-10"
        title="Close (Esc)"
      >
        <X className="h-6 w-6 text-white" />
      </button>

      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col md:flex-row overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image pane (full size, contained) */}
        <div className="flex-1 min-w-0 bg-black/80 flex items-center justify-center p-4">
          <img
            src={image.image_data}
            alt={image.prompt}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>

        {/* Detail pane */}
        <div className="md:w-96 md:border-l border-border bg-background-secondary flex flex-col shrink-0 max-h-[40vh] md:max-h-none md:h-full">
          {/* Header */}
          <div className="px-5 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2 mb-1">
              <ImageIcon className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold text-foreground">Image details</h2>
            </div>
            {image.created_at && (
              <p className="text-[11px] text-foreground-tertiary">
                {format(new Date(image.created_at), 'PPpp')}
              </p>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <DetailRow label="Prompt" copyValue={image.prompt}>
              <p className="whitespace-pre-wrap leading-relaxed">{image.prompt || '—'}</p>
            </DetailRow>

            {image.negative_prompt && (
              <DetailRow label="Negative prompt" copyValue={image.negative_prompt}>
                <p className="whitespace-pre-wrap leading-relaxed text-foreground-secondary">
                  {image.negative_prompt}
                </p>
              </DetailRow>
            )}

            <DetailRow label="Model" copyValue={image.model_id} mono>
              {image.model_id}
            </DetailRow>

            {aspectRatio && (
              <DetailRow label="Aspect ratio">{aspectRatio}</DetailRow>
            )}

            {(inputImagesCount != null && inputImagesCount > 0) && (
              <DetailRow label="Reference images">
                {inputImagesCount}
              </DetailRow>
            )}

            {seed != null && seed !== '' && (
              <DetailRow label="Seed" copyValue={seed} mono>{seed}</DetailRow>
            )}

            {generationTime && (
              <DetailRow label="Generation time">{generationTime}</DetailRow>
            )}

            {fromWorkflow && (
              <DetailRow label="Source">Workflow run</DetailRow>
            )}

            {generationId && (
              <DetailRow label="Generation ID" copyValue={generationId} mono>
                {generationId}
              </DetailRow>
            )}

            {extraMetadata.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-foreground-tertiary">
                  Other metadata
                </div>
                <dl className="space-y-1">
                  {extraMetadata.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-3 text-xs">
                      <dt className="text-foreground-tertiary font-mono shrink-0">{k}</dt>
                      <dd className="text-foreground text-right break-all">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {/* Action bar */}
          <div className="px-5 py-4 border-t border-border flex flex-wrap gap-2 shrink-0">
            <button
              onClick={onDownload}
              className="flex-1 min-w-[120px] px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 text-sm flex items-center justify-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={onToggleFavorite}
              className="flex-1 min-w-[100px] px-3 py-2 bg-background-tertiary text-foreground rounded-lg hover:bg-background-tertiary/80 text-sm flex items-center justify-center gap-1.5"
            >
              <Heart
                className={cn('h-4 w-4', image.is_favorite && 'fill-current text-red-500')}
              />
              {image.is_favorite ? 'Unfavorite' : 'Favorite'}
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 text-sm flex items-center justify-center gap-1.5"
              title="Delete image"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
