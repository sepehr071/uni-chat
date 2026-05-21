import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Check, Pencil, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { cn } from '../../utils/cn'
import SaveToKnowledgeButton from '../knowledge/SaveToKnowledgeButton'

const ActionBtn = ({ onClick, label, disabled, children, className }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'w-7 h-7 rounded-md grid place-items-center',
          'text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground',
          'transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
          className
        )}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
)

/**
 * Persistent 24px action bar rendered under every message turn.
 * Not hover-gated — always visible.
 */
const MessageActions = memo(function MessageActions({
  messageId,
  content,
  role,
  conversationId,
  message,
  isCopied,
  onCopy,
  onEdit,
  onRegenerate,
}) {
  const { t } = useTranslation('chat')
  const isUser = role === 'user'

  return (
    <div className="flex items-center gap-0.5 mt-1.5 h-7">
      {/* Copy — both roles */}
      <ActionBtn
        onClick={() => onCopy?.(content, messageId)}
        label={isCopied ? t('messageActions.copied') : t('messageActions.copy')}
      >
        {isCopied
          ? <Check className="h-3.5 w-3.5 text-success" />
          : <Copy className="h-3.5 w-3.5" />}
      </ActionBtn>

      {isUser ? (
        /* User actions: Edit */
        <ActionBtn onClick={onEdit} label={t('messageActions.edit')}>
          <Pencil className="h-3.5 w-3.5" />
        </ActionBtn>
      ) : (
        /* Assistant actions: Regen, Save */
        <>
          {onRegenerate && (
            <ActionBtn
              onClick={() => onRegenerate(messageId)}
              label={t('messageActions.regenerate')}
              className="group/regen"
            >
              <RefreshCw className="h-3.5 w-3.5 transition-transform group-hover/regen:rotate-180 duration-300" />
            </ActionBtn>
          )}

          {conversationId && message && (
            <SaveToKnowledgeButton
              message={message}
              conversationId={conversationId}
              sourceType="chat"
            />
          )}
        </>
      )}
    </div>
  )
})

export default MessageActions
