import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, AlertTriangle } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
import ConfigSelector from './ConfigSelector'
import { useModelCatalog } from '../../hooks/useModelCatalog'

function ModelAvatar({ selectedConfig, size = 18 }) {
  if (!selectedConfig) {
    return (
      <span
        className="flex rounded-full items-center justify-center text-[10px] font-semibold bg-accent text-white shrink-0"
        style={{ height: size, width: size }}
      >
        AI
      </span>
    )
  }
  const isEmoji = selectedConfig.avatar?.type === 'emoji'
  if (isEmoji) {
    return (
      <span
        className="flex rounded-full items-center justify-center text-[11px] shrink-0"
        style={{ height: size, width: size, backgroundColor: '#5c9aed20' }}
      >
        {selectedConfig.avatar.value}
      </span>
    )
  }
  return (
    <span
      className="flex rounded-full items-center justify-center text-[10px] font-semibold bg-accent text-white shrink-0"
      style={{ height: size, width: size }}
    >
      {(selectedConfig.name?.[0] || 'A').toUpperCase()}
    </span>
  )
}

/**
 * Self-contained model picker chip + Popover. Each instance manages its own
 * open state so multiple chips on a page don't conflict.
 *
 * Props:
 *   selectedConfig    {object} resolved config for display
 *   configs           {array}  full assistant list
 *   selectedConfigId  {string}
 *   onSelectConfig    {fn(configId)} called when an item is picked
 *   side              {'top'|'bottom'} default 'bottom'
 *   align             {'start'|'center'|'end'} default 'start'
 *   compact           {boolean} smaller chip, no chevron — for composer
 *   disabled          {boolean}
 *   tooltipText       {string} default 'Change model'
 */
export default function ModelChip({
  selectedConfig,
  configs,
  selectedConfigId,
  onSelectConfig,
  side = 'bottom',
  align = 'start',
  compact = false,
  disabled = false,
  tooltipText,
}) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const { getById } = useModelCatalog()

  // Resolve the underlying OpenRouter model ID for deprecation lookup
  const underlyingModelId = selectedConfigId?.startsWith('quick:')
    ? selectedConfigId.slice('quick:'.length)
    : selectedConfig?.model_id || null
  const catalogEntry = underlyingModelId ? getById(underlyingModelId) : null
  const isDeprecated = Boolean(catalogEntry?.expiration_date)

  const handleSelect = (configId) => {
    onSelectConfig?.(configId)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('modelChip.selectModel')}
              className={cn(
                'flex items-center gap-2 rounded-full bg-background-tertiary text-xs font-medium',
                'hover:bg-background-secondary transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                compact ? 'pl-1 pr-2 h-6' : 'pl-1 pr-2 h-7'
              )}
            >
              <ModelAvatar selectedConfig={selectedConfig} size={compact ? 16 : 18} />
              <span className={cn('max-w-[120px] truncate text-foreground', compact && 'max-w-[100px]')}>
                {selectedConfig?.name || t('modelChip.selectAi')}
              </span>
              {isDeprecated && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" aria-label={t('configSelector.deprecated')} />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t('configSelector.deprecatedExpires', { date: new Date(catalogEntry.expiration_date).toLocaleDateString() })}
                  </TooltipContent>
                </Tooltip>
              )}
              {!compact && <ChevronDown className="h-3 w-3 text-foreground-tertiary shrink-0" />}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{tooltipText ?? t('modelChip.changeModel')}</TooltipContent>
      </Tooltip>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className="p-0 w-auto border-0 bg-transparent shadow-none"
      >
        <ConfigSelector
          configs={configs}
          selectedConfigId={selectedConfigId}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
