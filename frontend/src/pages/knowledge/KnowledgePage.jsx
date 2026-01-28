import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, BookMarked, Star, Grid3X3, List, ChevronLeft, ChevronRight, Tag, X, Loader2 } from 'lucide-react'
import { knowledgeService } from '../../services/knowledgeService'
import KnowledgeCard from '../../components/knowledge/KnowledgeCard'
import KnowledgeEditModal from '../../components/knowledge/KnowledgeEditModal'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export default function KnowledgePage() {
  const queryClient = useQueryClient()

  // UI state
  const [searchInput, setSearchInput] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [viewMode, setViewMode] = useState('grid') // 'grid' or 'list'
  const [page, setPage] = useState(1)
  const [editItem, setEditItem] = useState(null)

  // Debounced search
  const debouncedSearch = useDebounce(searchInput, 300)

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedTag, favoritesOnly])

  // Fetch knowledge items
  const { data, isLoading, error } = useQuery({
    queryKey: ['knowledge', { page, search: debouncedSearch, tag: selectedTag, favoritesOnly }],
    queryFn: () => knowledgeService.list({
      page,
      limit: 12,
      search: debouncedSearch || undefined,
      tag: selectedTag || undefined,
      favorites_only: favoritesOnly || undefined
    })
  })

  // Fetch tags
  const { data: tagsData } = useQuery({
    queryKey: ['knowledge-tags'],
    queryFn: knowledgeService.getTags,
    staleTime: 60000 // Cache for 1 minute
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: knowledgeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
      queryClient.invalidateQueries(['knowledge-tags'])
      toast.success('Knowledge item deleted')
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete')
    }
  })

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: knowledgeService.toggleFavorite,
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to update favorite')
    }
  })

  const handleDelete = useCallback((id) => {
    deleteMutation.mutate(id)
  }, [deleteMutation])

  const handleToggleFavorite = useCallback((id) => {
    toggleFavoriteMutation.mutate(id)
  }, [toggleFavoriteMutation])

  const handleEdit = useCallback((item) => {
    setEditItem(item)
  }, [])

  const handleTagClick = useCallback((tag) => {
    setSelectedTag(selectedTag === tag ? null : tag)
  }, [selectedTag])

  const clearFilters = () => {
    setSearchInput('')
    setSelectedTag(null)
    setFavoritesOnly(false)
    setPage(1)
  }

  const items = data?.items || []
  const totalPages = data?.total_pages || 1
  const total = data?.total || 0
  const tags = tagsData?.tags || []

  const hasActiveFilters = searchInput || selectedTag || favoritesOnly

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 md:p-6 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <BookMarked className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Knowledge Vault</h1>
              <p className="text-sm text-foreground-secondary">Your saved knowledge and insights</p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search knowledge..."
                className="w-full pl-10 pr-4 py-2 bg-background-secondary border border-border rounded-lg text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
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
          <div className="flex items-center gap-2 flex-wrap">
            {/* Favorites toggle */}
            <button
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors text-sm',
                favoritesOnly
                  ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
                  : 'bg-background-secondary border-border text-foreground-secondary hover:text-foreground'
              )}
            >
              <Star className={cn('h-4 w-4', favoritesOnly && 'fill-current')} />
              Favorites
            </button>

            {/* Selected tag chip */}
            {selectedTag && (
              <div className="flex items-center gap-1 px-3 py-1.5 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent">
                <Tag className="h-3.5 w-3.5" />
                #{selectedTag}
                <button
                  onClick={() => setSelectedTag(null)}
                  className="p-0.5 hover:bg-accent/20 rounded"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-foreground-tertiary hover:text-foreground-secondary"
              >
                Clear all
              </button>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-background-secondary rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'grid'
                  ? 'bg-accent text-white'
                  : 'text-foreground-secondary hover:text-foreground'
              )}
              title="Grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'p-1.5 rounded transition-colors',
                viewMode === 'list'
                  ? 'bg-accent text-white'
                  : 'text-foreground-secondary hover:text-foreground'
              )}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Tags sidebar (desktop only) */}
        <aside className="hidden md:flex flex-col w-48 border-r border-border p-4">
          <h3 className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider mb-3">
            Tags
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1">
            <button
              onClick={() => setSelectedTag(null)}
              className={cn(
                'w-full text-left px-2 py-1.5 rounded text-sm transition-colors',
                !selectedTag
                  ? 'bg-accent/10 text-accent'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
              )}
            >
              All items
            </button>
            {tags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded text-sm transition-colors truncate',
                  selectedTag === tag
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
                )}
              >
                #{tag}
              </button>
            ))}
            {tags.length === 0 && (
              <p className="text-xs text-foreground-tertiary px-2 py-4">
                No tags yet. Add tags when saving knowledge.
              </p>
            )}
          </div>
        </aside>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <span className="text-foreground-secondary">Loading knowledge...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-foreground-secondary mb-2">Failed to load knowledge items</p>
                <button
                  onClick={() => queryClient.refetchQueries(['knowledge'])}
                  className="text-accent hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 bg-background-tertiary rounded-full flex items-center justify-center mb-4">
                <BookMarked className="h-8 w-8 text-foreground-tertiary" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-2">
                {hasActiveFilters ? 'No matching items' : 'No knowledge saved yet'}
              </h3>
              <p className="text-foreground-secondary max-w-md">
                {hasActiveFilters
                  ? 'Try adjusting your filters or search query.'
                  : 'Save insights from your chats by clicking the bookmark icon on assistant messages.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-4 text-accent hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Knowledge cards */}
          {!isLoading && !error && items.length > 0 && (
            <>
              <div
                className={cn(
                  viewMode === 'grid'
                    ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                    : 'space-y-3'
                )}
              >
                {items.map((item) => (
                  <KnowledgeCard
                    key={item._id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleFavorite={handleToggleFavorite}
                    onTagClick={handleTagClick}
                  />
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

              {/* Total count */}
              <div className="mt-4 text-sm text-foreground-tertiary text-center">
                {total} item{total === 1 ? '' : 's'}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editItem && (
        <KnowledgeEditModal
          item={editItem}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  )
}
