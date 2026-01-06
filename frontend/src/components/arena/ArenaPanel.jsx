import { useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function ArenaPanel({ config, messages, streaming, isLoading }) {
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  const avatar = config?.avatar?.value || '🤖'
  const name = config?.name || 'AI Assistant'

  return (
    <div className="flex flex-col h-full bg-background-secondary rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-background-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-xl">{avatar}</span>
          <span className="font-medium text-foreground truncate">{name}</span>
        </div>
        <p className="text-xs text-foreground-tertiary truncate mt-1">
          {config?.model_name || config?.model_id}
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={cn(
              'max-w-[90%]',
              msg.role === 'user' ? 'ml-auto' : 'mr-auto'
            )}
          >
            <div
              className={cn(
                'rounded-lg px-4 py-2',
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-background-tertiary text-foreground'
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Streaming content */}
        {streaming && (
          <div className="mr-auto max-w-[90%]">
            <div className="rounded-lg px-4 py-2 bg-background-tertiary text-foreground">
              <p className="whitespace-pre-wrap">{streaming}</p>
              <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streaming && (
          <div className="mr-auto">
            <div className="rounded-lg px-4 py-2 bg-background-tertiary">
              <Loader2 className="h-5 w-5 animate-spin text-accent" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}
