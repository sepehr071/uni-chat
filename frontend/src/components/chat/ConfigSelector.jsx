import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Bot, Plus, Check, ExternalLink, Zap } from 'lucide-react'
import { cn } from '../../utils/cn'
import { DEFAULT_MODELS } from '../../constants/models'

export default function ConfigSelector({ configs, selectedConfigId, onSelect, onClose }) {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredConfigs = configs.filter(config =>
    config.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    config.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleQuickModelSelect = (model) => {
    onSelect(`quick:${model.id}`)
  }

  const isQuickModelSelected = selectedConfigId?.startsWith('quick:')

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Dropdown */}
      <div
        className={cn(
          "absolute top-14 z-50 bg-background-elevated border border-border rounded-xl shadow-dropdown animate-fade-in",
          "left-2 right-2 w-auto sm:left-4 sm:right-auto sm:w-80"
        )}
        data-testid="config-selector"
      >
        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
            <input
              type="text"
              placeholder="Search configurations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background-tertiary rounded-lg text-sm text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-1 focus:ring-accent"
              autoFocus
            />
          </div>
        </div>

        {/* Quick Models */}
        {!searchQuery && (
          <div className="p-2 border-b border-border">
            <p className="text-xs font-medium text-foreground-tertiary px-2 py-1 flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Quick Models
            </p>
            <div className="space-y-1">
              {DEFAULT_MODELS.map(model => {
                const quickId = `quick:${model.id}`
                const isSelected = selectedConfigId === quickId
                return (
                  <button
                    key={model.id}
                    onClick={() => handleQuickModelSelect(model)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                      isSelected
                        ? 'bg-accent/10 text-foreground'
                        : 'hover:bg-background-tertiary text-foreground-secondary hover:text-foreground'
                    )}
                  >
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                      style={{ backgroundColor: '#5c9aed20' }}
                    >
                      {model.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{model.name}</span>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-foreground-tertiary truncate">
                        {model.description}
                      </p>
                    </div>
                    <span className="text-xs text-accent font-medium">Quick</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Config list */}
        <div className="max-h-64 overflow-y-auto p-2">
          {!searchQuery && (
            <p className="text-xs font-medium text-foreground-tertiary px-2 py-1">
              Your Assistants
            </p>
          )}
          {filteredConfigs.length === 0 ? (
            <div className="py-8 text-center">
              <Bot className="h-8 w-8 text-foreground-tertiary mx-auto mb-2" />
              <p className="text-sm text-foreground-secondary">No configurations found</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConfigs.map((config) => (
                <button
                  key={config._id}
                  onClick={() => onSelect(config._id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                    selectedConfigId === config._id
                      ? 'bg-accent/10 text-foreground'
                      : 'hover:bg-background-tertiary text-foreground-secondary hover:text-foreground'
                  )}
                >
                  {/* Avatar */}
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                    style={{ backgroundColor: '#5c9aed20' }}
                  >
                    {config.avatar?.type === 'emoji'
                      ? config.avatar.value
                      : config.name?.[0]?.toUpperCase() || 'AI'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{config.name}</span>
                      {selectedConfigId === config._id && (
                        <Check className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-foreground-tertiary truncate">
                      {config.model_name || config.model_id}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-2 border-t border-border flex gap-2">
          <button
            onClick={() => {
              onClose()
              navigate('/configs')
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create New
          </button>
          <button
            onClick={() => {
              onClose()
              navigate('/gallery')
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Browse Gallery
          </button>
        </div>
      </div>
    </>
  )
}
