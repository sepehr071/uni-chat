import { useState, useCallback } from 'react'
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
  Star
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
                    "relative group bg-background-tertiary rounded-lg overflow-hidden aspect-square",
                    isSelectMode && "cursor-pointer",
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

      {/* Zoomed image modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-lg hover:bg-white/30"
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <div className="max-w-4xl max-h-full flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            <img
              src={zoomedImage.image_data}
              alt={zoomedImage.prompt}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
            <div className="text-center text-white">
              <p className="text-sm max-w-2xl">{zoomedImage.prompt}</p>
              <p className="text-xs text-gray-400 mt-2">
                {getImageSettings(zoomedImage)}
                {zoomedImage.created_at && ` • ${format(new Date(zoomedImage.created_at), 'MMM d, yyyy HH:mm')}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload(zoomedImage.image_data, zoomedImage.prompt)}
                className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-white flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={() => favoriteMutation.mutate(zoomedImage._id)}
                className="px-4 py-2 bg-white/20 rounded-lg hover:bg-white/30 text-white flex items-center gap-2"
              >
                <Heart className={cn('h-4 w-4', zoomedImage.is_favorite && 'fill-current text-red-500')} />
                {zoomedImage.is_favorite ? 'Unfavorite' : 'Favorite'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
