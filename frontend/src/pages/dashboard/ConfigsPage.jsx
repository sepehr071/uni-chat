import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Bot,
  Search,
  MoreVertical,
  Edit2,
  Copy,
  Trash2,
  Globe,
  Lock,
} from 'lucide-react'
import { configService } from '../../services/chatService'
import ConfigEditor from '../../components/config/ConfigEditor'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function ConfigsPage() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['configs'],
    queryFn: () => configService.getConfigs(),
  })

  const deleteMutation = useMutation({
    mutationFn: configService.deleteConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      toast.success('Custom assistant deleted')
    },
    onError: () => {
      toast.error('Failed to delete custom assistant')
    },
  })

  const configs = data?.configs || []
  const filteredConfigs = configs.filter(config =>
    config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    config.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleCreate = () => {
    setEditingConfig(null)
    setIsEditorOpen(true)
  }

  const handleEdit = (config) => {
    setEditingConfig(config)
    setIsEditorOpen(true)
  }

  const handleDelete = async (configId) => {
    deleteMutation.mutate(configId)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Custom Assistants</h1>
            <p className="text-foreground-secondary mt-1">
              Create and manage your custom AI assistants
            </p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            Create Assistant
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            type="text"
            placeholder="Search custom assistants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Configs grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <Skeleton className="h-12 w-12 rounded-xl" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                  <Skeleton className="h-5 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full mb-1" />
                  <Skeleton className="h-4 w-5/6 mb-3" />
                  <Skeleton className="h-4 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredConfigs.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">
              {searchQuery ? 'No matches found' : 'No custom assistants yet'}
            </h3>
            <p className="text-foreground-secondary mb-4">
              {searchQuery
                ? 'Try a different search term'
                : 'Create your first custom assistant to get started'}
            </p>
            {!searchQuery && (
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4" />
                Create Assistant
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredConfigs.map((config) => (
              <ConfigCard
                key={config._id}
                config={config}
                onEdit={() => handleEdit(config)}
                onDelete={() => handleDelete(config._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Config Editor Modal */}
      {isEditorOpen && (
        <ConfigEditor
          config={editingConfig}
          onClose={() => {
            setIsEditorOpen(false)
            setEditingConfig(null)
          }}
          onSave={() => {
            setIsEditorOpen(false)
            setEditingConfig(null)
            queryClient.invalidateQueries({ queryKey: ['configs'] })
          }}
        />
      )}
    </div>
  )
}

function ConfigCard({ config, onEdit, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const queryClient = useQueryClient()

  const handleDelete = () => {
    onDelete()
  }

  const toggleVisibility = async () => {
    try {
      if (config.visibility === 'public') {
        await configService.unpublishConfig(config._id)
        toast.success('Custom assistant is now private')
      } else {
        await configService.publishConfig(config._id)
        toast.success('Custom assistant is now public')
      }
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    } catch (error) {
      toast.error('Failed to update visibility')
    }
  }

  const duplicateConfig = async () => {
    try {
      await configService.duplicateConfig(config._id)
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      toast.success('Custom assistant duplicated')
    } catch (error) {
      toast.error('Failed to duplicate')
    }
  }

  return (
    <Card className="hover:border-border/60 transition-colors group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          {/* Avatar */}
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {config.avatar?.type === 'emoji'
              ? config.avatar.value
              : <Bot className="h-6 w-6 text-accent" />}
          </div>

          {/* Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={duplicateConfig}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleVisibility}>
                {config.visibility === 'public' ? (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Make Private
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 mr-2" />
                    Make Public
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <h3 className="font-semibold text-foreground mb-1">{config.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {config.description || 'No description'}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{config.model_name || config.model_id}</span>
          <Badge variant="secondary" className="ml-2 flex items-center gap-1 text-xs">
            {config.visibility === 'public' ? (
              <>
                <Globe className="h-3 w-3" />
                Public
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                Private
              </>
            )}
          </Badge>
        </div>

        {/* Stats */}
        {config.stats?.uses_count > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            Used {config.stats.uses_count} times
          </p>
        )}

        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Custom Assistant"
          message={`Are you sure you want to delete "${config.name}"? This action cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </CardContent>
    </Card>
  )
}
