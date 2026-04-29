import { useNavigate } from 'react-router-dom'
import { Bot, Plus, Check, ExternalLink, Zap } from 'lucide-react'
import { cn } from '../../utils/cn'
import { DEFAULT_MODELS } from '../../constants/models'
import { useModelCatalog } from '../../hooks/useModelCatalog'
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
  const navigate = useNavigate()
  const { isDeprecated } = useModelCatalog()

  const handleQuickSelect = (modelId) => onSelect(`quick:${modelId}`)

  return (
    <div
      className={cn(
        'bg-background-elevated border border-border rounded-xl shadow-dropdown animate-fade-in',
        'w-[min(22rem,calc(100vw-1rem))] max-h-[70vh] flex flex-col overflow-hidden'
      )}
      data-testid="config-selector"
    >
      <Command className="flex-1 flex flex-col overflow-hidden bg-transparent">
        <CommandInput placeholder="Search configurations..." autoFocus />
        <CommandList className="max-h-none flex-1 overflow-y-auto">
          <CommandEmpty>No configurations found.</CommandEmpty>

          {/* Quick Models */}
          <CommandGroup heading={
            <span className="flex items-center gap-1 text-foreground-tertiary">
              <Zap className="h-3 w-3" />
              <span>Quick Models</span>
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
                          title="Deprecated model"
                          aria-label="Deprecated"
                        />
                      )}
                      {isSelected && <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-foreground-tertiary truncate">
                      {model.description}
                    </p>
                  </div>
                  <span className="text-xs text-accent font-medium ml-2">Quick</span>
                </CommandItem>
              )
            })}
          </CommandGroup>

          {/* Assistants */}
          {configs.length > 0 && (
            <CommandGroup heading={
              <span className="text-foreground-tertiary">Your Assistants</span>
            }>
              {configs.map((config) => {
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
              })}
            </CommandGroup>
          )}

          {configs.length === 0 && (
            <div className="py-6 text-center">
              <Bot className="h-8 w-8 text-foreground-tertiary mx-auto mb-2" />
              <p className="text-sm text-foreground-secondary">No assistants yet</p>
              <p className="text-xs text-foreground-tertiary mt-1">Create one to get started</p>
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
          Create New
        </button>
        <button
          onClick={() => {
            onClose?.()
            navigate('/gallery')
          }}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Browse Gallery
        </button>
      </div>
    </div>
  )
}
