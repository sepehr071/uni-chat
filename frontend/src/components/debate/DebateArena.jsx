import { cn } from '../../utils/cn'
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
  judgeContent,
  judgeStreaming,
  judgeLoading,
  isComplete,
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Topic Banner */}
      <div className="bg-background-tertiary rounded-xl px-6 py-4 border border-border">
        <p className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider mb-1">
          Debate Topic
        </p>
        <p className="text-lg font-medium text-foreground">{topic}</p>
      </div>

      {/* Rounds */}
      {Array.from({ length: currentRound }, (_, roundIndex) => (
        <div key={roundIndex} className="space-y-4">
          {/* Round Header */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="px-4 py-1 rounded-full bg-background-tertiary text-sm font-medium text-foreground-secondary">
              Round {roundIndex + 1} of {rounds}
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

              return (
                <DebaterResponse
                  key={debater._id}
                  config={debater}
                  content={content}
                  isStreaming={isStreaming}
                  isLoading={isLoading}
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
    </div>
  )
}
