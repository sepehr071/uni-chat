import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Plus, Check } from 'lucide-react'
import { configService } from '../../services/chatService'
import { cn } from '../../utils/cn'

export default function ArenaConfigSelector({ selectedConfigs, onSelect, onClose, maxConfigs = 4 }) {
  const [selected, setSelected] = useState(selectedConfigs || [])

  const { data: configsData, isLoading } = useQuery({
    queryKey: ['configs'],
    queryFn: () => configService.getConfigs(),
  })

  const configs = configsData?.configs || []

  const toggleConfig = (config) => {
    if (selected.find(c => c._id === config._id)) {
      setSelected(selected.filter(c => c._id !== config._id))
    } else if (selected.length < maxConfigs) {
      setSelected([...selected, config])
    }
  }

  const handleConfirm = () => {
    if (selected.length >= 2) {
      onSelect(selected)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Select Configs</h2>
            <p className="text-sm text-foreground-secondary">
              Choose 2-{maxConfigs} configs to compare ({selected.length} selected)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Config List */}
        <div className="overflow-y-auto max-h-[50vh] p-4 space-y-2">
          {isLoading ? (
            <p className="text-center text-foreground-secondary py-8">Loading...</p>
          ) : configs.length === 0 ? (
            <p className="text-center text-foreground-secondary py-8">No configs available</p>
          ) : (
            configs.map((config) => {
              const isSelected = selected.find(c => c._id === config._id)
              const isDisabled = !isSelected && selected.length >= maxConfigs

              return (
                <button
                  key={config._id}
                  onClick={() => !isDisabled && toggleConfig(config)}
                  disabled={isDisabled}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
                    isSelected
                      ? 'bg-accent/20 border-2 border-accent'
                      : 'bg-background-tertiary border-2 border-transparent hover:border-border',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <span className="text-2xl">{config.avatar?.value || '🤖'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{config.name}</p>
                    <p className="text-xs text-foreground-tertiary truncate">
                      {config.model_name || config.model_id}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="p-1 bg-accent rounded-full">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.length < 2}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4 mr-2" />
            Start Arena ({selected.length})
          </button>
        </div>
      </div>
    </div>
  )
}
