import { useRef, useEffect } from 'react'
import { ArrowDownToLine, ArrowDown } from 'lucide-react'
import { cn } from '../../utils/cn'
import { getTextDirection, containsRTL } from '../../utils/rtl'
import DebaterResponse from './DebaterResponse'
import JudgeVerdict from './JudgeVerdict'

export default function DebateArena({
  topic,
  debaters,
  judge,
  rounds,
  currentRound,
  debaterResponses,
  debaterStreaming,
  debaterLoading,
  debaterConcluded = {},
  isInfiniteMode = false,
  judgeContent,
  judgeStreaming,
  judgeLoading,
  isComplete,
  autoScrollEnabled = true,
  onToggleAutoScroll,
}) {
  const bottomRef = useRef(null)

  // Check if any debater is currently streaming
  const isAnyDebaterStreaming = Object.values(debaterStreaming).some(Boolean)
  const isAnyDebaterLoading = Object.values(debaterLoading).some(Boolean)
  const isActivelyStreaming = isAnyDebaterStreaming || isAnyDebaterLoading || judgeStreaming || judgeLoading

  // Auto-scroll only while actively streaming content
  useEffect(() => {
    if (autoScrollEnabled && bottomRef.current && isActivelyStreaming) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [currentRound, autoScrollEnabled, isActivelyStreaming, judgeContent])

  return (
    <div className="flex flex-col gap-6">
      {/* Topic Banner */}
      <div className="bg-background-tertiary rounded-xl px-6 py-4 border border-border">
        <p className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider mb-1">
          Debate Topic
        </p>
        <p
          className={`text-lg font-medium text-foreground ${containsRTL(topic) ? 'font-persian' : ''}`}
          dir={getTextDirection(topic)}
        >
          {topic}
        </p>
      </div>

      {/* Rounds */}
      {Array.from({ length: currentRound }, (_, roundIndex) => (
        <div key={roundIndex} className="space-y-4">
          {/* Round Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="px-4 py-1 rounded-full bg-background-tertiary text-sm font-medium text-foreground-secondary">
              Round {roundIndex + 1}{isInfiniteMode ? ' (Infinite)' : ` of ${rounds}`}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Debater Responses Grid */}
          <div
            className={cn(
              'grid gap-4',
              debaters.length === 2 && 'grid-cols-1 md:grid-cols-2',
              debaters.length === 3 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
              debaters.length === 4 && 'grid-cols-1 sm:grid-cols-2',
              debaters.length === 5 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
            )}
            style={{ minHeight: '300px' }}
          >
            {debaters.map((debater) => {
              const responseKey = `${roundIndex}_${debater._id}`
              const content = debaterResponses[responseKey] || ''
              const isStreaming = debaterStreaming[responseKey] || false
              const isLoading = debaterLoading[responseKey] || false
              // Show concluded badge only in current round for infinite mode
              const isConcluded = isInfiniteMode && roundIndex === currentRound - 1 && debaterConcluded[debater._id]

              return (
                <DebaterResponse
                  key={debater._id}
                  config={debater}
                  content={content}
                  isStreaming={isStreaming}
                  isLoading={isLoading}
                  concluded={isConcluded}
                />
              )
            })}
          </div>
        </div>
      ))}

      {/* Judge Verdict Section */}
      <JudgeVerdict
        config={judge}
        content={judgeContent}
        isStreaming={judgeStreaming}
        isLoading={judgeLoading}
        isComplete={isComplete}
      />

      {/* Scroll anchor */}
      <div ref={bottomRef} />

      {/* Auto-scroll toggle button */}
      {onToggleAutoScroll && (
        <button
          onClick={onToggleAutoScroll}
          className={cn(
            'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all',
            autoScrollEnabled
              ? 'bg-accent hover:bg-accent/80 text-white'
              : 'bg-background-secondary hover:bg-background-tertiary text-foreground-secondary border border-border'
          )}
          title={autoScrollEnabled ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
        >
          {autoScrollEnabled ? (
            <ArrowDownToLine className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">
            Auto-scroll {autoScrollEnabled ? 'ON' : 'OFF'}
          </span>
        </button>
      )}
    </div>
  )
}
