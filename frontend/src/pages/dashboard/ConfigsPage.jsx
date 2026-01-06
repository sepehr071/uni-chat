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
    if (confirm('Are you sure you want to delete this custom assistant?')) {
      deleteMutation.mutate(configId)
    }
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
          <button onClick={handleCreate} className="btn btn-primary">
            <Plus className="h-4 w-4" />
            Create Assistant
          </button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
          <input
            type="text"
            placeholder="Search custom assistants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9"
          />
        </div>

        {/* Configs grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-background-secondary rounded-xl animate-pulse" />
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
              <button onClick={handleCreate} className="btn btn-primary">
                <Plus className="h-4 w-4" />
                Create Assistant
              </button>
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
  const [showMenu, setShowMenu] = useState(false)
  const queryClient = useQueryClient()

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
    setShowMenu(false)
  }

  const duplicateConfig = async () => {
    try {
      await configService.duplicateConfig(config._id)
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      toast.success('Custom assistant duplicated')
    } catch (error) {
      toast.error('Failed to duplicate')
    }
    setShowMenu(false)
  }

  return (
    <div className="card hover:border-border-light transition-colors group">
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
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 rounded-lg text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-44 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                <button
                  onClick={() => {
                    onEdit()
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={duplicateConfig}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </button>
                <button
                  onClick={toggleVisibility}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                >
                  {config.visibility === 'public' ? (
                    <>
                      <Lock className="h-4 w-4" />
                      Make Private
                    </>
                  ) : (
                    <>
                      <Globe className="h-4 w-4" />
                      Make Public
                    </>
                  )}
                </button>
                <div className="border-t border-border my-1" />
                <button
                  onClick={() => {
                    onDelete()
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-error hover:bg-error/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <h3 className="font-semibold text-foreground mb-1">{config.name}</h3>
      <p className="text-sm text-foreground-secondary line-clamp-2 mb-3">
        {config.description || 'No description'}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-foreground-tertiary">
        <span className="truncate">{config.model_name || config.model_id}</span>
        <div className="flex items-center gap-1">
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
        </div>
      </div>

      {/* Stats */}
      {config.stats?.uses_count > 0 && (
        <p className="text-xs text-foreground-tertiary mt-2">
          Used {config.stats.uses_count} times
        </p>
      )}
    </div>
  )
}
