import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search, BookMarked, Star, Grid3X3, List, ChevronLeft, ChevronRight, Tag, X, Loader2, FolderInput } from 'lucide-react'
import { knowledgeService } from '../../services/knowledgeService'
import { knowledgeFolderService } from '../../services/knowledgeFolderService'
import { useProject } from '../../context/ProjectContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import KnowledgeCard from '../../components/knowledge/KnowledgeCard'
import KnowledgeEditModal from '../../components/knowledge/KnowledgeEditModal'
import KnowledgeDetailModal from '../../components/knowledge/KnowledgeDetailModal'
import KnowledgeFolderSidebar from '../../components/knowledge/KnowledgeFolderSidebar'
import CreateFolderModal from '../../components/knowledge/CreateFolderModal'
import MoveToFolderModal from '../../components/knowledge/MoveToFolderModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import EmptyState from '@/components/ui/empty-state'
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
  const { t } = useTranslation('knowledge')
  const queryClient = useQueryClient()
  const { currentWorkspace } = useWorkspace()
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null
  // 'null' (literal string) is the unfiled-scope sentinel the backend expects
  // when caller wants items not pinned to any project. Omit entirely when
  // there's no workspace at all (legacy behavior).
  const projectScopeParam = currentWorkspace
    ? (projectId ?? 'null')
    : undefined

  // UI state
  const [searchInput, setSearchInput] = useState('')
  const [selectedTag, setSelectedTag] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null) // null = all, 'root' = unfiled, or folder_id
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [page, setPage] = useState(1)
  const [editItem, setEditItem] = useState(null)
  const [viewingItem, setViewingItem] = useState(null)

  // Folder modal state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState(null)

  // Move modal state
  const [moveItem, setMoveItem] = useState(null)

  // Debounced search
  const debouncedSearch = useDebounce(searchInput, 300)

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, selectedTag, favoritesOnly, selectedFolder])

  // Fetch folders (scoped to active project; 'null' sentinel = unfiled)
  const { data: foldersData, isLoading: isLoadingFolders } = useQuery({
    queryKey: ['knowledge-folders', { projectScope: projectScopeParam }],
    queryFn: () => knowledgeFolderService.list(
      projectScopeParam !== undefined ? { project_id: projectScopeParam } : {}
    )
  })

  // Fetch knowledge items
  const { data, isLoading, error } = useQuery({
    queryKey: ['knowledge', { page, search: debouncedSearch, tag: selectedTag, favoritesOnly, folder: selectedFolder, projectScope: projectScopeParam }],
    queryFn: () => knowledgeService.list({
      page,
      limit: 12,
      search: debouncedSearch || undefined,
      tag: selectedTag || undefined,
      favorite: favoritesOnly || undefined,
      folder_id: selectedFolder === null ? undefined : selectedFolder,
      ...(projectScopeParam !== undefined ? { project_id: projectScopeParam } : {})
    })
  })

  // Fetch tags
  const { data: tagsData } = useQuery({
    queryKey: ['knowledge-tags'],
    queryFn: knowledgeService.getTags,
    staleTime: 60000
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: knowledgeService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
      queryClient.invalidateQueries(['knowledge-tags'])
      queryClient.invalidateQueries(['knowledge-folders'])
      toast.success(t('toast_deleted'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('toast_delete_fail'))
    }
  })

  // Toggle favorite mutation
  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, currentValue }) => knowledgeService.toggleFavorite(id, currentValue),
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('toast_fav_fail'))
    }
  })

  // Create folder mutation — pin to active project (null when in Unfiled view)
  const createFolderMutation = useMutation({
    mutationFn: (data) => knowledgeFolderService.create({
      ...data,
      project_id: projectId,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge-folders'])
      setShowCreateFolderModal(false)
      toast.success(t('toast_folder_created'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('toast_folder_fail_create'))
    }
  })

  // Update folder mutation
  const updateFolderMutation = useMutation({
    mutationFn: ({ id, data }) => knowledgeFolderService.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge-folders'])
      setEditingFolder(null)
      setShowCreateFolderModal(false)
      toast.success(t('toast_folder_updated'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('toast_folder_fail_update'))
    }
  })

  // Delete folder mutation
  const deleteFolderMutation = useMutation({
    mutationFn: knowledgeFolderService.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge-folders'])
      queryClient.invalidateQueries(['knowledge'])
      if (selectedFolder && selectedFolder !== 'root') {
        setSelectedFolder(null)
      }
      toast.success(t('toast_folder_deleted'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('toast_folder_fail_delete'))
    }
  })

  // Move to folder mutation
  const moveMutation = useMutation({
    mutationFn: ({ itemIds, folderId }) => knowledgeService.moveToFolder(itemIds, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries(['knowledge'])
      queryClient.invalidateQueries(['knowledge-folders'])
      setMoveItem(null)
      toast.success(t('toast_moved'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('toast_move_fail'))
    }
  })

  const handleDelete = useCallback((id) => {
    deleteMutation.mutate(id)
  }, [deleteMutation])

  const handleToggleFavorite = useCallback((id, currentValue) => {
    toggleFavoriteMutation.mutate({ id, currentValue })
  }, [toggleFavoriteMutation])

  const handleEdit = useCallback((item) => {
    setEditItem(item)
  }, [])

  const handleTagClick = useCallback((tag) => {
    setSelectedTag(selectedTag === tag ? null : tag)
  }, [selectedTag])

  const handleMoveToFolder = useCallback((item) => {
    setMoveItem(item)
  }, [])

  const handleFolderSubmit = (data) => {
    if (editingFolder) {
      updateFolderMutation.mutate({ id: editingFolder._id, data })
    } else {
      createFolderMutation.mutate(data)
    }
  }

  const handleEditFolder = (folderId) => {
    const folder = folders.find(f => f._id === folderId)
    if (folder) {
      setEditingFolder(folder)
      setShowCreateFolderModal(true)
    }
  }

  const handleDeleteFolder = (folderId) => {
    deleteFolderMutation.mutate(folderId)
  }

  const handleMoveSubmit = (folderId) => {
    if (moveItem) {
      moveMutation.mutate({ itemIds: [moveItem._id], folderId })
    }
  }

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
  const folders = foldersData?.folders || []
  const unfiledCount = foldersData?.unfiled_count || 0

  const hasActiveFilters = searchInput || selectedTag || favoritesOnly

  // Get folder name for display
  const getFolderName = () => {
    if (selectedFolder === null) return null
    if (selectedFolder === 'root') return t('unfiled')
    const folder = folders.find(f => f._id === selectedFolder)
    return folder?.name
  }

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
              <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
              <p className="text-sm text-foreground-secondary">
                {currentWorkspace ? (
                  <>
                    <span>{t('subtitle.workspace', { workspace: currentWorkspace.name, project: currentProject?.name || t('unfiled') })}</span>
                  </>
                ) : (
                  t('subtitle.personal')
                )}
              </p>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('search_placeholder')}
                className="w-full ps-10 pe-4"
              />
              {searchInput && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchInput('')}
                  className="absolute end-1 top-1/2 -translate-y-1/2 h-7 w-7"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between gap-4 mt-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Favorites toggle */}
            <Button
              variant={favoritesOnly ? "default" : "secondary"}
              size="sm"
              onClick={() => setFavoritesOnly(!favoritesOnly)}
              className={cn(
                'gap-1.5',
                favoritesOnly && 'bg-yellow-500/10 border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/20 hover:text-yellow-500'
              )}
            >
              <Star className={cn('h-4 w-4', favoritesOnly && 'fill-current')} />
              {t('favorites')}
            </Button>

            {/* Current folder chip */}
            {getFolderName() && (
              <Badge variant="secondary" className="gap-1.5 ps-2 pe-1 bg-accent/10 border-accent/30 text-accent hover:bg-accent/10">
                <FolderInput className="h-3.5 w-3.5" />
                {getFolderName()}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedFolder(null)}
                  className="h-4 w-4 p-0 hover:bg-accent/20"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}

            {/* Selected tag chip */}
            {selectedTag && (
              <Badge variant="secondary" className="gap-1.5 ps-2 pe-1 bg-accent/10 border-accent/30 text-accent hover:bg-accent/10">
                <Tag className="h-3.5 w-3.5" />
                #{selectedTag}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedTag(null)}
                  className="h-4 w-4 p-0 hover:bg-accent/20"
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-foreground-tertiary hover:text-foreground-secondary"
              >
                {t('clear_all')}
              </Button>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-background-secondary rounded-lg p-1">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('grid')}
              className="h-8 w-8"
              title={t('grid_view')}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setViewMode('list')}
              className="h-8 w-8"
              title={t('list_view')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Folders sidebar (desktop only) */}
        <aside className="hidden md:flex flex-col w-56 border-e border-border">
          <KnowledgeFolderSidebar
            folders={folders}
            unfiledCount={unfiledCount}
            selectedFolder={selectedFolder}
            onSelectFolder={setSelectedFolder}
            onCreateFolder={() => {
              setEditingFolder(null)
              setShowCreateFolderModal(true)
            }}
            onEditFolder={handleEditFolder}
            onDeleteFolder={handleDeleteFolder}
            isLoading={isLoadingFolders}
          />

          {/* Tags section */}
          <div className="border-t border-border p-3">
            <h3 className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider mb-2">
              {t('tags_heading')}
            </h3>
            <div className="space-y-0.5 max-h-40 overflow-y-auto">
              {tags.map((tag) => (
                <Button
                  key={tag}
                  variant={selectedTag === tag ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  className={cn(
                    'w-full justify-start px-2 h-7 text-sm truncate',
                    selectedTag === tag && 'bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent'
                  )}
                >
                  #{tag}
                </Button>
              ))}
              {tags.length === 0 && (
                <p className="text-xs text-foreground-tertiary py-2">
                  {t('no_tags')}
                </p>
              )}
            </div>
          </div>
        </aside>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <span className="text-foreground-secondary">{t('loading')}</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-foreground-secondary mb-2">{t('error_load')}</p>
                <Button
                  variant="link"
                  onClick={() => queryClient.refetchQueries(['knowledge'])}
                  className="text-accent hover:underline"
                >
                  {t('try_again')}
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && items.length === 0 && (
            (hasActiveFilters || selectedFolder) ? (
              <EmptyState
                icon={BookMarked}
                title={t('empty_filtered')}
                description={t('empty_hint_filtered')}
                primaryCta={{
                  label: t('clear_filters'),
                  onClick: () => {
                    clearFilters()
                    setSelectedFolder(null)
                  },
                }}
              />
            ) : (
              <EmptyState
                icon={BookMarked}
                title={t('emptyState.title')}
                description={t('emptyState.description')}
              />
            )
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
                    folders={folders}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onToggleFavorite={handleToggleFavorite}
                    onTagClick={handleTagClick}
                    onMoveToFolder={handleMoveToFolder}
                    onViewDetail={setViewingItem}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-foreground-secondary px-4">
                    {t('page_of', { page, total: totalPages })}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Total count */}
              <div className="mt-4 text-sm text-foreground-tertiary text-center">
                {t('items_count_other', { count: total })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editItem && (
        <KnowledgeEditModal
          item={editItem}
          folders={folders}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* Detail modal */}
      {viewingItem && (
        <KnowledgeDetailModal
          item={viewingItem}
          folders={folders}
          onClose={() => setViewingItem(null)}
          onEdit={(item) => {
            setViewingItem(null)
            setEditItem(item)
          }}
        />
      )}

      {/* Create/Edit folder modal */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => {
          setShowCreateFolderModal(false)
          setEditingFolder(null)
        }}
        onSubmit={handleFolderSubmit}
        isLoading={createFolderMutation.isPending || updateFolderMutation.isPending}
        editFolder={editingFolder}
      />

      {/* Move to folder modal */}
      <MoveToFolderModal
        isOpen={!!moveItem}
        onClose={() => setMoveItem(null)}
        onMove={handleMoveSubmit}
        folders={folders}
        itemCount={1}
        isLoading={moveMutation.isPending}
      />
    </div>
  )
}
