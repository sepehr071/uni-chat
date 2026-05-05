import { useQuery } from '@tanstack/react-query'
import { MessageSquare, BookMarked, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { telegramService } from '../../../services/telegramService'

export default function OutputSelector({ value, onChange }) {
  const { t } = useTranslation('routines')
  // value shape: { chat: { enabled }, knowledge: { enabled }, telegram: { enabled } }
  const { data: tgStatus } = useQuery({
    queryKey: ['telegram-status'],
    queryFn: telegramService.getStatus,
    staleTime: 30_000,
  })

  const tgLinked = tgStatus?.linked ?? false

  const toggle = (key) => {
    onChange({
      ...value,
      [key]: { ...value?.[key], enabled: !value?.[key]?.enabled },
    })
  }

  const outputs = [
    {
      key: 'chat',
      icon: MessageSquare,
      label: t('output.chat.label'),
      description: t('output.chat.description'),
      disabled: false,
    },
    {
      key: 'knowledge',
      icon: BookMarked,
      label: t('output.knowledge.label'),
      description: t('output.knowledge.description'),
      disabled: false,
    },
    {
      key: 'telegram',
      icon: Send,
      label: t('output.telegram.label'),
      description: tgLinked ? t('output.telegram.descriptionLinked') : t('output.telegram.descriptionUnlinked'),
      disabled: !tgLinked,
    },
  ]

  return (
    <div className="space-y-4">
      {outputs.map(({ key, icon: Icon, label, description, disabled }) => {
        const enabled = value?.[key]?.enabled ?? false
        const row = (
          <div
            key={key}
            className={`flex items-center justify-between gap-4 p-3 rounded-lg border border-border transition-colors ${
              disabled ? 'opacity-50' : 'hover:bg-background-tertiary/50'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Icon className="h-4 w-4 text-accent" />
              </div>
              <div className="min-w-0">
                <Label className="text-sm font-medium cursor-pointer">{label}</Label>
                <p className="text-xs text-foreground-tertiary mt-0.5">{description}</p>
              </div>
            </div>
            <Switch
              checked={enabled && !disabled}
              onCheckedChange={() => !disabled && toggle(key)}
              disabled={disabled}
            />
          </div>
        )

        if (disabled) {
          return (
            <Tooltip key={key} delayDuration={0}>
              <TooltipTrigger asChild>
                <div>{row}</div>
              </TooltipTrigger>
              <TooltipContent side="top">
                {t('output.telegram.tooltip')}
              </TooltipContent>
            </Tooltip>
          )
        }

        return row
      })}
    </div>
  )
}
