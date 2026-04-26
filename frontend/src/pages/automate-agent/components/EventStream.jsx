import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../../utils/cn'
import MarkdownRenderer from '@/components/chat/MarkdownRenderer'

const ROLE_STYLES = {
  assistant: 'bg-blue-500/15 text-blue-600 border-blue-200 dark:border-blue-800',
  tool:      'bg-purple-500/15 text-purple-600 border-purple-200 dark:border-purple-800',
  user:      'bg-green-500/15 text-green-600 border-green-200 dark:border-green-800',
  final:     'bg-emerald-500/15 text-emerald-500 border-emerald-300/40',
}

const RICH_ROLES = new Set(['assistant', 'final'])

function MessageCard({ msg }) {
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const isFinal = msg.type === 'final'
  const roleStyle = ROLE_STYLES[isFinal ? 'final' : msg.role] || ROLE_STYLES.assistant
  const renderRich = isFinal || RICH_ROLES.has(msg.role)

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'flex gap-3 items-start p-3 rounded-lg border transition-colors',
          isFinal
            ? 'border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10'
            : 'border-border bg-background-secondary hover:bg-background-tertiary'
        )}
      >
        <Badge
          variant="outline"
          className={cn('text-xs capitalize shrink-0 mt-0.5', roleStyle)}
        >
          {isFinal ? 'final' : msg.role}
        </Badge>

        <div className="flex-1 min-w-0">
          {msg.summary ? (
            renderRich ? (
              <div className="prose prose-sm prose-invert max-w-none text-foreground">
                <MarkdownRenderer content={msg.summary} />
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                {msg.summary}
              </p>
            )
          ) : (
            <p className="text-xs text-foreground-tertiary italic">
              {msg.type || 'message'}
            </p>
          )}
        </div>

        {msg.screenshot_url && (
          <button
            onClick={() => setScreenshotOpen(true)}
            className="shrink-0 rounded overflow-hidden border border-border hover:border-accent transition-colors"
            title="View screenshot"
          >
            <img
              src={msg.screenshot_url}
              alt="step screenshot"
              className="w-16 h-10 object-cover"
            />
          </button>
        )}
      </motion.div>

      <Dialog open={screenshotOpen} onOpenChange={setScreenshotOpen}>
        <DialogContent className="max-w-3xl p-2">
          <img
            src={msg.screenshot_url}
            alt="full screenshot"
            className="w-full rounded-lg"
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

const TERMINAL_STATUSES = new Set(['completed', 'error', 'stopped', 'timed_out'])

export default function EventStream({ messages, status, currentTask }) {
  const bottomRef = useRef(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Pause auto-scroll if user scrolls away from bottom; resume when sentinel re-enters viewport
  useEffect(() => {
    const sentinel = bottomRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      ([entry]) => setAutoScroll(entry.isIntersecting),
      { root: null, rootMargin: '0px 0px -40px 0px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [messages, currentTask, autoScroll])

  if (messages.length === 0) {
    if (status === 'idle' || TERMINAL_STATUSES.has(status)) return null
    return (
      <p className="p-4 text-sm text-foreground-tertiary">Waiting for first event…</p>
    )
  }

  const lastSummary = messages[messages.length - 1]?.summary
  const showFinal = currentTask?.output && lastSummary !== currentTask.output

  return (
    <div className="flex flex-col gap-2 relative">
      <p className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider mb-1">
        Event Stream · {messages.length} message{messages.length !== 1 ? 's' : ''}
      </p>

      <AnimatePresence initial={false}>
        {messages.map((msg, i) => (
          <MessageCard key={msg.cursor_id ?? i} msg={msg} />
        ))}

        {showFinal && (
          <MessageCard
            key="synthetic-final"
            msg={{ role: 'assistant', summary: currentTask.output, type: 'final' }}
          />
        )}
      </AnimatePresence>

      <div ref={bottomRef} />

      {!autoScroll && (
        <button
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          className="sticky bottom-3 self-center flex items-center gap-1 px-3 py-1.5 rounded-full bg-background-secondary border border-border shadow text-xs text-foreground-secondary hover:bg-background-tertiary transition-colors"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  )
}
