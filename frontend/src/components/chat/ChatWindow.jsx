import { useEffect, useRef } from 'react'
import { Bot, User, Copy, RefreshCw, Check } from 'lucide-react'
import { useState } from 'react'
import MarkdownRenderer from './MarkdownRenderer'
import { cn } from '../../utils/cn'
import { format } from 'date-fns'

export default function ChatWindow({ messages, isStreaming, streamingContent, selectedConfig }) {
  const scrollRef = useRef(null)
  const [copiedId, setCopiedId] = useState(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent])

  const handleCopy = async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(messageId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {selectedConfig?.avatar?.type === 'emoji'
              ? selectedConfig.avatar.value
              : <Bot className="h-8 w-8 text-accent" />}
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {selectedConfig?.name || 'Start a Conversation'}
          </h2>
          <p className="text-foreground-secondary">
            {selectedConfig?.description || 'Send a message to begin chatting with your AI assistant.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
      {messages.map((message) => (
        <MessageBubble
          key={message._id}
          message={message}
          config={selectedConfig}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      ))}

      {/* Streaming message */}
      {isStreaming && streamingContent && (
        <MessageBubble
          message={{
            _id: 'streaming',
            role: 'assistant',
            content: streamingContent,
          }}
          config={selectedConfig}
          isStreaming={true}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      )}

      {/* Typing indicator */}
      {isStreaming && !streamingContent && (
        <div className="flex gap-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {selectedConfig?.avatar?.type === 'emoji'
              ? selectedConfig.avatar.value
              : <Bot className="h-4 w-4 text-accent" />}
          </div>
          <div className="bg-background-secondary rounded-xl px-4 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-foreground-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-foreground-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-foreground-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message, config, isStreaming, copiedId, onCopy }) {
  const isUser = message.role === 'user'
  const isCopied = copiedId === message._id

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0',
          isUser
            ? 'bg-accent text-white'
            : 'bg-background-tertiary'
        )}
        style={!isUser ? { backgroundColor: '#5c9aed20' } : {}}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : config?.avatar?.type === 'emoji' ? (
          config.avatar.value
        ) : (
          <Bot className="h-4 w-4 text-accent" />
        )}
      </div>

      {/* Message content */}
      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        <div
          className={cn(
            'rounded-xl px-4 py-3 group relative',
            isUser
              ? 'bg-accent text-white'
              : 'bg-background-secondary text-foreground'
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="markdown-content">
              <MarkdownRenderer content={message.content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />
              )}
            </div>
          )}

          {/* Actions */}
          {!isStreaming && !isUser && (
            <div className="absolute -bottom-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button
                onClick={() => onCopy(message.content, message._id)}
                className="p-1.5 rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground"
                title="Copy"
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                className="p-1.5 rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground"
                title="Regenerate"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Metadata */}
        {message.metadata && !isStreaming && (
          <div className="flex items-center gap-2 text-xs text-foreground-tertiary px-1">
            {message.metadata.model_id && (
              <span>{message.metadata.model_id.split('/').pop()}</span>
            )}
            {message.metadata.tokens && (
              <span>{message.metadata.tokens.completion} tokens</span>
            )}
            {message.created_at && (
              <span>{format(new Date(message.created_at), 'HH:mm')}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
