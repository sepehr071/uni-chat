import { useRef, useEffect } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { cn } from '../../utils/cn'
import { getTextDirection } from '../../utils/rtl'
import MarkdownRenderer from '../chat/MarkdownRenderer'

export default function DebaterResponse({ config, content, isStreaming, isLoading, concluded = false }) {
  const contentRef = useRef(null)

  useEffect(() => {
    if (contentRef.current && (isStreaming || content)) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [content, isStreaming])

  const avatar = config?.avatar?.value || '🤖'
  const name = config?.name || 'Debater'

  return (
    <div className="flex flex-col h-full bg-background-secondary rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-background-tertiary relative">
        <div className="flex items-center gap-2">
          <span className="text-xl">{avatar}</span>
          <span className="font-medium text-foreground truncate">{name}</span>
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-accent ml-auto" />
          )}
          {concluded && !isLoading && (
            <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/20 text-success text-xs font-medium">
              <CheckCircle className="h-3 w-3" />
              Concluded
            </div>
          )}
        </div>
        <p className="text-xs text-foreground-tertiary truncate mt-1">
          {config?.model_name || config?.model_id}
        </p>
      </div>

      {/* Content */}
      <div
        ref={contentRef}
        className="flex-1 overflow-y-auto p-4"
      >
        {content ? (
          <div
            className="prose prose-invert prose-sm max-w-none"
            dir={getTextDirection(content)}
          >
            <MarkdownRenderer content={content} />
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />
            )}
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-2" />
              <p className="text-sm text-foreground-secondary">Thinking...</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-foreground-tertiary">Waiting for turn...</p>
          </div>
        )}
      </div>
    </div>
  )
}
