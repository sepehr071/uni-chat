import { useTranslation } from 'react-i18next'
import { ArrowRight, Clock } from 'lucide-react'
import { cn } from '../../utils/cn'

const DEFAULT_STARTERS = [
  'Summarise this PDF and pull the 3 strongest claims',
  'Compare two products side-by-side',
  'Audit my landing page for clarity',
]

export default function StarterPrompts({
  assistantName,
  starters,
  recentConversations,
  onSelectStarter,
  onSelectRecent,
  className,
}) {
  const { t } = useTranslation('chat')
  const prompts = starters?.length ? starters : DEFAULT_STARTERS
  const hasRecents = recentConversations?.length > 0

  return (
    <div className={cn('flex flex-col items-center gap-6 w-full max-w-[560px] mx-auto px-4', className)}>
      {/* Starters */}
      <div className="w-full">
        <p className="text-xs font-semibold text-foreground-tertiary tracking-wider mb-3">
          {t('starterPrompts.starters')}{assistantName ? ` · ${assistantName}` : ''}
        </p>
        <div className="flex flex-col gap-2">
          {prompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => onSelectStarter?.(prompt)}
              className={cn(
                'flex items-center justify-between gap-3 w-full p-3 rounded-lg',
                'border border-border bg-background hover:bg-background-tertiary',
                'text-start text-sm text-foreground transition-colors group'
              )}
            >
              <span className="leading-snug">{prompt}</span>
              <ArrowRight className="h-4 w-4 text-foreground-tertiary flex-shrink-0 group-hover:text-accent transition-colors" />
            </button>
          ))}
        </div>
      </div>

      {/* Recent conversations */}
      {hasRecents && (
        <div className="w-full">
          <p className="text-xs font-semibold text-foreground-tertiary tracking-wider mb-3">
            {t('starterPrompts.recent')}
          </p>
          <div className="flex flex-col gap-1">
            {recentConversations.slice(0, 3).map((conv) => (
              <button
                key={conv.id || conv._id}
                onClick={() => onSelectRecent?.(conv.id || conv._id)}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 rounded-lg',
                  'text-start text-sm text-foreground-secondary hover:bg-background-tertiary',
                  'hover:text-foreground transition-colors'
                )}
              >
                <Clock className="h-3.5 w-3.5 text-foreground-tertiary flex-shrink-0" />
                <span className="truncate">{conv.title || t('starterPrompts.untitledConversation')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
