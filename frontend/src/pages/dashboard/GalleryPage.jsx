import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Bot,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
} from 'lucide-react'
import { galleryService } from '../../services/chatService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function GalleryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('uses_count')
  const [activeTab, setActiveTab] = useState('all') // 'all', 'templates', 'saved'

  // Fetch gallery configs
  const { data: galleryData, isLoading: isLoadingGallery } = useQuery({
    queryKey: ['gallery', searchQuery, sortBy],
    queryFn: () => galleryService.browseGallery({ search: searchQuery, sort: sortBy }),
    enabled: activeTab === 'all',
  })

  // Fetch templates
  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => galleryService.getTemplates(),
    enabled: activeTab === 'templates',
  })

  // Fetch saved configs
  const { data: savedData, isLoading: isLoadingSaved } = useQuery({
    queryKey: ['saved-configs'],
    queryFn: () => galleryService.getSavedConfigs(),
    enabled: activeTab === 'saved',
  })

  const isLoading = activeTab === 'all' ? isLoadingGallery : activeTab === 'templates' ? isLoadingTemplates : isLoadingSaved
  const configs = activeTab === 'all' ? galleryData?.configs || [] : activeTab === 'templates' ? templatesData?.templates || [] : savedData?.configs || []

  // Use config mutation
  const useConfigMutation = useMutation({
    mutationFn: galleryService.useConfig,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      toast.success('Configuration added to your collection')
      navigate('/chat')
    },
    onError: () => {
      toast.error('Failed to use configuration')
    },
  })

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gallery</h1>
          <p className="text-foreground-secondary mt-1">
            Discover and use community-created AI configurations
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-fit">
          <TabsList>
            <TabsTrigger value="all">Community</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search and filters */}
        {activeTab === 'all' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <Input
                type="text"
                placeholder="Search configurations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-auto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uses_count">Most Popular</SelectItem>
                <SelectItem value="saves_count">Most Saved</SelectItem>
                <SelectItem value="created_at">Newest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Configs grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : configs.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No matches found' : activeTab === 'saved' ? 'No saved configurations' : 'No configurations yet'}
            </h3>
            <p className="text-foreground-secondary">
              {searchQuery
                ? 'Try a different search term'
                : activeTab === 'saved'
                ? 'Save configurations from the gallery to see them here'
                : 'Check back later for community configurations'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {configs.map((config) => (
              <GalleryCard
                key={config._id}
                config={config}
                onUse={() => useConfigMutation.mutate(config._id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GalleryCard({ config, onUse }) {
  const queryClient = useQueryClient()
  const [isSaved, setIsSaved] = useState(false)

  const toggleSave = async () => {
    try {
      if (isSaved) {
        await galleryService.unsaveConfig(config._id)
        setIsSaved(false)
        toast.success('Removed from saved')
      } else {
        await galleryService.saveConfig(config._id)
        setIsSaved(true)
        toast.success('Saved to collection')
      }
      queryClient.invalidateQueries({ queryKey: ['saved-configs'] })
    } catch (error) {
      toast.error('Failed to update')
    }
  }

  return (
    <Card className="hover:border-border-light transition-colors">
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {config.avatar?.type === 'emoji'
              ? config.avatar.value
              : <Bot className="h-6 w-6 text-accent" />}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSave}
            className="text-foreground-tertiary hover:text-foreground"
          >
            {isSaved ? (
              <BookmarkCheck className="h-5 w-5 text-accent" />
            ) : (
              <Bookmark className="h-5 w-5" />
            )}
          </Button>
        </div>

        {/* Content */}
        <h3 className="font-semibold text-foreground mb-1">{config.name}</h3>
        <p className="text-sm text-foreground-secondary line-clamp-2 mb-3">
          {config.description || 'No description'}
        </p>

        {/* Tags */}
        {config.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {config.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-xs text-foreground-tertiary mb-4">
          <span className="flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            {config.stats?.uses_count || 0} uses
          </span>
          <span className="flex items-center gap-1">
            <Bookmark className="h-3.5 w-3.5" />
            {config.stats?.saves_count || 0} saves
          </span>
        </div>

        {/* Model & Action */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-foreground-tertiary truncate max-w-[60%]">
            {config.model_name || config.model_id}
          </span>
          <Button
            size="sm"
            onClick={onUse}
          >
            Use
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
