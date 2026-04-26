import { memo } from 'react'

/**
 * Thin "Now talking to {model}" divider shown when the assistant model
 * changes between two consecutive messages in the conversation.
 */
const ModelDivider = memo(function ModelDivider({ modelName }) {
  return (
    <div
      className="flex items-center gap-3 text-xs font-semibold tracking-wide text-foreground-tertiary uppercase my-1"
      aria-label={`Now talking to ${modelName}`}
    >
      <div className="flex-1 h-px bg-border" />
      <span>Now talking to {modelName}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
})

export default ModelDivider
