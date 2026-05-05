import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
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
  FolderOpen,
} from 'lucide-react'
import { configService } from '../../services/chatService'
import ConfigEditor from '../../components/config/ConfigEditor'
import { useProject } from '../../context/ProjectContext'
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
  const { t } = useTranslation('dashboard')
  const queryClient = useQueryClient()
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null

  const [searchQuery, setSearchQuery] = useState('')
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [scopeFilter, setScopeFilter] = useState(projectId ? 'project' : 'mine')

  const { data, isLoading } = useQuery({
    queryKey: ['configs', { projectId }],
    queryFn: () => configService.getConfigs(projectId ? { project_id: projectId } : undefined),
  })

  const deleteMutation = useMutation({
    mutationFn: configService.deleteConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      toast.success(t('configs.assistantDeleted'))
    },
    onError: () => {
      toast.error(t('configs.failedToDelete'))
    },
  })

  const configs = data?.configs || []

  const filteredConfigs = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return configs.filter((config) => {
      if (scopeFilter === 'project') {
        if (!projectId || config.project_id !== projectId) return false
      } else if (scopeFilter === 'mine') {
        if (projectId && config.project_id === projectId) return false
        if (config.visibility === 'public') return false
      } else if (scopeFilter === 'public') {
        if (config.visibility !== 'public') return false
      }
      if (!q) return true
      return (
        config.name.toLowerCase().includes(q) ||
        config.description?.toLowerCase().includes(q)
      )
    })
  }, [configs, scopeFilter, searchQuery, projectId])

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

  const SCOPE_CHIPS = [
    { id: 'all', label: t('configs.scopeAll') },
    { id: 'mine', label: t('configs.scopeMine') },
    { id: 'project', label: t('configs.scopeProject'), requiresProject: true },
    { id: 'public', label: t('configs.scopePublic') },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('configs.title')}</h1>
            <p className="text-foreground-secondary mt-1">{t('configs.subtitle')}</p>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4" />
            {t('configs.createAssistant')}
          </Button>
        </div>

        <div className="space-y-3">
          <div className="relative max-w-md">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
            <Input
              type="text"
              placeholder={t('configs.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="ps-9"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {SCOPE_CHIPS.map((chip) => {
              if (chip.requiresProject && !projectId) return null
              const isActive = scopeFilter === chip.id
              return (
                <Button
                  key={chip.id}
                  variant={isActive ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setScopeFilter(chip.id)}
                  className={cn('gap-1.5', isActive && 'bg-accent text-accent-foreground hover:bg-accent/90')}
                >
                  {chip.id === 'project' && <FolderOpen className="h-3.5 w-3.5" />}
                  {chip.id === 'public' && <Globe className="h-3.5 w-3.5" />}
                  {chip.id === 'mine' && <Lock className="h-3.5 w-3.5" />}
                  {chip.label}
                  {chip.id === 'project' && currentProject && (
                    <span className="opacity-70 truncate max-w-[120px]">· {currentProject.name}</span>
                  )}
                </Button>
              )
            })}
          </div>
        </div>

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
              {searchQuery ? t('configs.noMatchesFound') : t('configs.noAssistantsYet')}
            </h3>
            <p className="text-foreground-secondary mb-4">
              {searchQuery
                ? t('configs.tryDifferentTerm')
                : t('configs.createFirstAssistant')}
            </p>
            {!searchQuery && (
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4" />
                {t('configs.createAssistant')}
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
  const { t } = useTranslation('dashboard')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const queryClient = useQueryClient()

  const toggleVisibility = async () => {
    try {
      if (config.visibility === 'public') {
        await configService.unpublishConfig(config._id)
        toast.success(t('configs.nowPrivate'))
      } else {
        await configService.publishConfig(config._id)
        toast.success(t('configs.nowPublic'))
      }
      queryClient.invalidateQueries({ queryKey: ['configs'] })
    } catch (error) {
      toast.error(t('configs.failedToUpdateVisibility'))
    }
  }

  const duplicateConfig = async () => {
    try {
      await configService.duplicateConfig(config._id)
      queryClient.invalidateQueries({ queryKey: ['configs'] })
      toast.success(t('configs.duplicated'))
    } catch (error) {
      toast.error(t('configs.failedToDuplicate'))
    }
  }

  return (
    <Card className="hover:border-border/60 transition-colors group">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div
            className="h-12 w-12 rounded-xl flex items-center justify-center text-xl"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {config.avatar?.type === 'emoji'
              ? config.avatar.value
              : <Bot className="h-6 w-6 text-accent" />}
          </div>

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
                <Edit2 className="h-4 w-4 me-2" />
                {t('configs.edit')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={duplicateConfig}>
                <Copy className="h-4 w-4 me-2" />
                {t('configs.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleVisibility}>
                {config.visibility === 'public' ? (
                  <>
                    <Lock className="h-4 w-4 me-2" />
                    {t('configs.makePrivate')}
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4 me-2" />
                    {t('configs.makePublic')}
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 me-2" />
                {t('configs.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h3 className="font-semibold text-foreground mb-1">{config.name}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {config.description || t('configs.noDescription')}
        </p>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{config.model_name || config.model_id}</span>
          <Badge variant="secondary" className="ms-2 flex items-center gap-1 text-xs">
            {config.visibility === 'public' ? (
              <>
                <Globe className="h-3 w-3" />
                {t('configs.public')}
              </>
            ) : (
              <>
                <Lock className="h-3 w-3" />
                {t('configs.private')}
              </>
            )}
          </Badge>
        </div>

        {config.stats?.uses_count > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {t('configs.usedTimes', { count: config.stats.uses_count })}
          </p>
        )}

        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={onDelete}
          title={t('configs.deleteAssistant.title')}
          message={t('configs.deleteAssistant.message', { name: config.name })}
          confirmText={t('configs.deleteAssistant.confirm')}
          cancelText={t('configs.deleteAssistant.cancel')}
          variant="danger"
        />
      </CardContent>
    </Card>
  )
}
