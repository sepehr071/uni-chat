import { memo } from 'react'
import { Square } from 'lucide-react'
import { motion } from 'motion/react'
import { Bot } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'

/**
 * Streaming assistant turn with:
 * - Left accent rule (border-l-2 border-accent)
 * - Soft accent-muted gradient background
 * - "· streaming" caption + inline Stop button
 * - Block cursor at end of streamed content
 * - 3-dot bouncer when no content yet
 */
const StreamingTurn = memo(function StreamingTurn({
  content,
  config,
  onStop,
  onRunCode,
}) {
  const avatarEmoji =
    config?.avatar?.type === 'emoji' ? config.avatar.value : null
  const avatarLetter = config?.name?.[0]?.toUpperCase() || 'A'
  const assistantName = config?.name || 'AI'

  return (
    <div className="group flex gap-3 items-start">
      {/* Avatar */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent grid place-items-center text-[11px] font-semibold">
        {avatarEmoji ? (
          <span className="text-sm leading-none">{avatarEmoji}</span>
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Role row */}
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-medium text-foreground-tertiary flex items-center gap-1.5">
            <span>{assistantName}</span>
            <span className="text-accent-hover font-medium">· streaming</span>
          </div>
          {onStop && (
            <button
              onClick={onStop}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors font-medium px-2 py-0.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20"
              aria-label="Stop generation"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          )}
        </div>

        {/* Streamed body or bouncer */}
        <div className="border-l-2 border-accent pl-3 bg-gradient-to-r from-accent-muted/40 via-transparent to-transparent rounded-r-sm py-0.5">
          {content ? (
            <div className="text-[15px] leading-[1.65] text-foreground">
              <div className="markdown-content">
                <MarkdownRenderer content={content} onRunCode={onRunCode} />
              </div>
              {/* Blinking block cursor */}
              <span
                className="inline-block w-[7px] h-[14px] bg-accent align-text-bottom ml-0.5"
                style={{ animation: 'chat-blink 1s step-end infinite' }}
                aria-hidden="true"
              />
            </div>
          ) : (
            /* 3-dot bouncer */
            <div
              className="flex gap-1.5 py-1"
              aria-live="polite"
              aria-label="AI is thinking"
            >
              {[0, 0.15, 0.3].map((delay, i) => (
                <motion.span
                  key={i}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay }}
                  className="w-2 h-2 bg-accent/60 rounded-full"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default StreamingTurn
