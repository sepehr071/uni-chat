import { Loader2, Gavel, Award } from 'lucide-react'
import MarkdownRenderer from '../chat/MarkdownRenderer'
import { getTextDirection } from '../../utils/rtl'

export default function JudgeVerdict({ config, content, isStreaming, isLoading, isComplete }) {
  const avatar = config?.avatar?.value || '⚖️'
  const name = config?.name || 'Judge'

  if (!content && !isLoading && !isComplete) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-accent/10 via-background-secondary to-accent/10 rounded-xl border-2 border-accent/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-accent/20 bg-accent/5">
        <div className="p-2 rounded-lg bg-accent/20">
          <Gavel className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            Judge's Verdict
            {isComplete && <Award className="h-5 w-5 text-yellow-500" />}
          </h3>
          <div className="flex items-center gap-2 text-sm text-foreground-secondary">
            <span>{avatar}</span>
            <span>{name}</span>
            {config?.model_name && (
              <span className="text-foreground-tertiary">
                ({config.model_name})
              </span>
            )}
          </div>
        </div>
        {isLoading && (
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        )}
      </div>

      {/* Content */}
      <div className="p-6">
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
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto mb-3" />
              <p className="text-foreground-secondary">
                The judge is reviewing the debate...
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
