import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export const SEVERITY_TONES = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
}

export const ACTION_TONES = {
  block: 'bg-red-500/15 text-red-300 border-red-500/30',
  require_confirm: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  warn: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
}

export function SeverityBadge({ severity }) {
  const { t } = useTranslation('dlp')
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium', SEVERITY_TONES[severity] || SEVERITY_TONES.low)}>
      {t(`severity.${severity}`, { defaultValue: severity })}
    </span>
  )
}

export function ActionBadge({ action }) {
  const { t } = useTranslation('dlp')
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium', ACTION_TONES[action] || ACTION_TONES.warn)}>
      {t(`action.${action}`, { defaultValue: action })}
    </span>
  )
}
