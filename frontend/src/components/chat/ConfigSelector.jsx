import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Bot, Plus, Check, ExternalLink, Zap, FolderOpen, Globe } from 'lucide-react'
import { cn } from '../../utils/cn'
import { DEFAULT_MODELS } from '../../constants/models'
import { useModelCatalog } from '../../hooks/useModelCatalog'
import { useProject } from '../../context/ProjectContext'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'

function ItemAvatar({ children, accent = '#5c9aed20' }) {
  return (
    <div
      className="h-8 w-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
      style={{ backgroundColor: accent }}
    >
      {children}
    </div>
  )
}

export default function ConfigSelector({ configs, selectedConfigId, onSelect, onClose }) {
  const { t } = useTranslation('chat')
  const navigate = useNavigate()
  const { isDeprecated } = useModelCatalog()
  const { currentProject } = useProject()

  const handleQuickSelect = (modelId) => onSelect(`quick:${modelId}`)

  // Group configs by visibility relative to the active project. A config is
  // "Project" if its project_id matches the active project. "Mine" = owned but
  // not pinned to this project (private/personal). "Public" = explicitly public.
  const { projectConfigs, myConfigs, publicConfigs } = useMemo(() => {
    const projectId = currentProject?._id || null
    const project = []
    const mine = []
    const pub = []
    for (const c of configs) {
      if (projectId && c.project_id === projectId) {
        project.push(c)
      } else if (c.visibility === 'public') {
        pub.push(c)
      } else {
        mine.push(c)
      }
    }
    return { projectConfigs: project, myConfigs: mine, publicConfigs: pub }
  }, [configs, currentProject?._id])

  const renderConfigItem = (config) => {
    const isSelected = selectedConfigId === config._id
    const initial = config.name?.[0]?.toUpperCase() || 'A'
    return (
      <CommandItem
        key={config._id}
        value={`assistant ${config.name} ${config.model_name || ''} ${config.model_id || ''}`}
        onSelect={() => onSelect(config._id)}
        className={cn(
          'gap-3 cursor-pointer',
          isSelected && 'bg-accent/10 text-foreground'
        )}
      >
        <ItemAvatar>
          {config.avatar?.type === 'emoji' ? config.avatar.value : initial}
        </ItemAvatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{config.name}</span>
            {isSelected && <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />}
          </div>
          <p className="text-xs text-foreground-tertiary truncate">
            {config.model_name || config.model_id}
          </p>
        </div>
      </CommandItem>
    )
  }

  return (
    <div
      className={cn(
        'bg-background-elevated border border-border rounded-xl shadow-dropdown animate-fade-in',
        'w-[min(22rem,calc(100vw-1rem))] max-h-[70vh] flex flex-col overflow-hidden'
      )}
      data-testid="config-selector"
    >
      <Command className="flex-1 flex flex-col overflow-hidden bg-transparent">
        <CommandInput placeholder={t('configSelector.searchPlaceholder')} autoFocus />
        <CommandList className="max-h-none flex-1 overflow-y-auto">
          <CommandEmpty>{t('configSelector.noConfigs')}</CommandEmpty>

          {/* Quick Models */}
          <CommandGroup heading={
            <span className="flex items-center gap-1 text-foreground-tertiary">
              <Zap className="h-3 w-3" />
              <span>{t('configSelector.quickModels')}</span>
            </span>
          }>
            {DEFAULT_MODELS.map((model) => {
              const quickId = `quick:${model.id}`
              const isSelected = selectedConfigId === quickId
              return (
                <CommandItem
                  key={model.id}
                  value={`quick ${model.name} ${model.description} ${model.id}`}
                  onSelect={() => handleQuickSelect(model.id)}
                  className={cn(
                    'gap-3 cursor-pointer',
                    isSelected && 'bg-accent/10 text-foreground'
                  )}
                >
                  <ItemAvatar>{model.avatar}</ItemAvatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{model.name}</span>
                      {isDeprecated(model.id) && (
                        <span
                          className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0"
                          title={t('configSelector.deprecated')}
                          aria-label={t('configSelector.deprecated')}
                        />
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-foreground-tertiary truncate">
                      {model.description}
                    </p>
                  </div>
                  <span className="text-xs text-accent font-medium ms-2">{t('configSelector.quickLabel')}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>

          {/* Project assistants — only when a project is active and any configs match */}
          {currentProject && projectConfigs.length > 0 && (
            <CommandGroup heading={
              <span className="flex items-center gap-1 text-foreground-tertiary">
                <FolderOpen className="h-3 w-3" />
                <span>{t('configSelector.projectGroup', { name: currentProject.name })}</span>
              </span>
            }>
              {projectConfigs.map(renderConfigItem)}
            </CommandGroup>
          )}

          {/* My assistants — owned, not pinned to active project */}
          {myConfigs.length > 0 && (
            <CommandGroup heading={
              <span className="text-foreground-tertiary">{t('configSelector.myAssistants')}</span>
            }>
              {myConfigs.map(renderConfigItem)}
            </CommandGroup>
          )}

          {/* Public assistants */}
          {publicConfigs.length > 0 && (
            <CommandGroup heading={
              <span className="flex items-center gap-1 text-foreground-tertiary">
                <Globe className="h-3 w-3" />
                <span>{t('configSelector.public')}</span>
              </span>
            }>
              {publicConfigs.map(renderConfigItem)}
            </CommandGroup>
          )}

          {configs.length === 0 && (
            <div className="py-6 text-center">
              <Bot className="h-8 w-8 text-foreground-tertiary mx-auto mb-2" />
              <p className="text-sm text-foreground-secondary">{t('configSelector.noAssistantsYet')}</p>
              <p className="text-xs text-foreground-tertiary mt-1">{t('configSelector.noAssistantsCreate')}</p>
            </div>
          )}
        </CommandList>
      </Command>

      {/* Footer actions — pinned, outside scroll area */}
      <div className="p-2 border-t border-border flex gap-2 shrink-0">
        <button
          onClick={() => {
            onClose?.()
            navigate('/configs')
          }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t('configSelector.createNew')}
        </button>
        <button
          onClick={() => {
            onClose?.()
            navigate('/gallery')
          }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          {t('configSelector.browseGallery')}
        </button>
      </div>
    </div>
  )
}
