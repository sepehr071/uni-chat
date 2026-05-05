import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Plus, Check } from 'lucide-react'
import { configService } from '../../services/chatService'
import { useProject } from '../../context/ProjectContext'
import { cn } from '../../utils/cn'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function ArenaConfigSelector({ selectedConfigs, onSelect, onClose, maxConfigs = 4 }) {
  const { t } = useTranslation('arena')
  const [selected, setSelected] = useState(selectedConfigs || [])
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null

  const { data: configsData, isLoading } = useQuery({
    queryKey: ['configs', { projectId }],
    queryFn: () => configService.getConfigs(projectId ? { project_id: projectId } : undefined),
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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('selector.title')}</DialogTitle>
          <DialogDescription>
            {t('selector.description', { max: maxConfigs, count: selected.length })}
          </DialogDescription>
        </DialogHeader>

        {/* Config List */}
        <ScrollArea className="max-h-[50vh] pe-4">
          <div className="space-y-2">
            {isLoading ? (
              <p className="text-center text-foreground-secondary py-8">{t('selector.loading')}</p>
            ) : configs.length === 0 ? (
              <p className="text-center text-foreground-secondary py-8">{t('selector.no_configs')}</p>
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
                      'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-start',
                      isSelected
                        ? 'bg-accent/20 border-2 border-accent'
                        : 'bg-background-tertiary border-2 border-transparent hover:border-border',
                      isDisabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <span className="text-2xl">{config.avatar?.value || '🤖'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground truncate">{config.name}</p>
                        {isSelected && (
                          <Badge variant="accent" className="h-5 px-1.5">
                            <Check className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground-tertiary truncate">
                        {config.model_name || config.model_id}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('selector.cancel')}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selected.length < 2}
          >
            <Plus className="h-4 w-4 me-2" />
            {t('selector.start', { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
