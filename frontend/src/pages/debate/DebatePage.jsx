import { useState, useCallback, useRef } from 'react'
import { Scale, History, RotateCcw, Square } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { debateService } from '../../services/debateService'
import { streamDebate, cancelDebate } from '../../services/streamService'
import { DebateSetup, DebateArena, DebateHistory } from '../../components/debate'
import toast from 'react-hot-toast'

export default function DebatePage() {
  const queryClient = useQueryClient()
  const abortControllerRef = useRef(null)

  // UI state
  const [showHistory, setShowHistory] = useState(false)
  const [mode, setMode] = useState('setup') // 'setup' | 'debate' | 'complete'

  // Debate configuration
  const [sessionId, setSessionId] = useState(null)
  const [topic, setTopic] = useState('')
  const [debaters, setDebaters] = useState([])
  const [judge, setJudge] = useState(null)
  const [rounds, setRounds] = useState(3)
  const [currentRound, setCurrentRound] = useState(0)

  // Streaming state
  const [debaterResponses, setDebaterResponses] = useState({})
  const [debaterStreaming, setDebaterStreaming] = useState({})
  const [debaterLoading, setDebaterLoading] = useState({})
  const [debaterConcluded, setDebaterConcluded] = useState({}) // Track who concluded
  const [isInfiniteMode, setIsInfiniteMode] = useState(false)
  const [judgeContent, setJudgeContent] = useState('')
  const [judgeStreaming, setJudgeStreaming] = useState(false)
  const [judgeLoading, setJudgeLoading] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  // Create session mutation
  const createMutation = useMutation({
    mutationFn: (data) => debateService.createSession(data),
    onSuccess: (data) => {
      setSessionId(data.session._id)
      startStreaming(data.session._id)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || error.message || 'Failed to create debate')
    },
  })

  const startStreaming = useCallback(async (sessionIdToStream) => {
    setMode('debate')

    try {
      await streamDebate(
        { session_id: sessionIdToStream },
        {
          onSessionStarted: (data) => {
            console.log('Debate started:', data)
            setIsInfiniteMode(data.is_infinite || false)
          },
          onRoundStart: (data) => {
            setCurrentRound(data.round)
            // Initialize loading state for all debaters in this round
            const loadingState = {}
            debaters.forEach(d => {
              loadingState[`${data.round - 1}_${d._id}`] = true
            })
            setDebaterLoading(prev => ({ ...prev, ...loadingState }))
          },
          onMessageStart: (data) => {
            const key = `${data.round - 1}_${data.config_id}`
            setDebaterLoading(prev => ({ ...prev, [key]: true }))
            setDebaterStreaming(prev => ({ ...prev, [key]: true }))
          },
          onMessageChunk: (data) => {
            const key = `${data.round - 1}_${data.config_id}`
            setDebaterResponses(prev => ({
              ...prev,
              [key]: (prev[key] || '') + data.content
            }))
          },
          onMessageComplete: (data) => {
            const key = `${data.round - 1}_${data.config_id}`
            setDebaterLoading(prev => ({ ...prev, [key]: false }))
            setDebaterStreaming(prev => ({ ...prev, [key]: false }))
            setDebaterResponses(prev => ({
              ...prev,
              [key]: data.content
            }))
            // Track concluded state from message
            if (data.concluded) {
              setDebaterConcluded(prev => ({ ...prev, [data.config_id]: true }))
            }
          },
          onDebaterConcluded: (data) => {
            // Explicit concluded event (redundant with above, but kept for clarity)
            setDebaterConcluded(prev => ({ ...prev, [data.config_id]: true }))
          },
          onRoundComplete: (data) => {
            console.log('Round completed:', data.round, 'concluded:', data.concluded_count, '/', data.total_debaters)
            // Reset concluded tracking for next round (unless all concluded)
            if (data.concluded_count < data.total_debaters) {
              setDebaterConcluded({})
            }
          },
          onJudgeStart: () => {
            setJudgeLoading(true)
            setJudgeStreaming(true)
          },
          onJudgeChunk: (data) => {
            setJudgeContent(prev => prev + data.content)
          },
          onJudgeComplete: (data) => {
            setJudgeLoading(false)
            setJudgeStreaming(false)
            setJudgeContent(data.verdict)
          },
          onSessionComplete: () => {
            setMode('complete')
            setIsComplete(true)
            queryClient.invalidateQueries(['debate-sessions'])
            toast.success('Debate completed!')
          },
          onError: (data) => {
            toast.error(data.error || 'An error occurred during the debate')
            setJudgeLoading(false)
            setJudgeStreaming(false)
          },
        }
      )
    } catch (error) {
      console.error('Debate stream error:', error)
      toast.error('Failed to stream debate')
    }
  }, [debaters, queryClient])

  const handleStart = useCallback((config) => {
    // Store config for use during streaming
    setTopic(config.topic)
    setRounds(config.rounds)
    setDebaters(config.debaters)
    setJudge(config.judge)
    setCurrentRound(0)
    setDebaterResponses({})
    setDebaterStreaming({})
    setDebaterLoading({})
    setDebaterConcluded({})
    setIsInfiniteMode(config.rounds === 0)
    setJudgeContent('')
    setJudgeStreaming(false)
    setJudgeLoading(false)
    setIsComplete(false)

    // Create session with API-compatible data
    createMutation.mutate({
      topic: config.topic,
      config_ids: config.config_ids,
      judge_config_id: config.judge_config_id,
      rounds: config.rounds,
    })
  }, [createMutation])

  const handleStop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (sessionId) {
      try {
        await cancelDebate(sessionId)
      } catch (error) {
        console.error('Cancel error:', error)
      }
    }

    // Reset loading states
    setDebaterLoading({})
    setDebaterStreaming({})
    setJudgeLoading(false)
    setJudgeStreaming(false)
  }, [sessionId])

  const handleReset = useCallback(() => {
    setMode('setup')
    setSessionId(null)
    setTopic('')
    setDebaters([])
    setJudge(null)
    setRounds(3)
    setCurrentRound(0)
    setDebaterResponses({})
    setDebaterStreaming({})
    setDebaterLoading({})
    setDebaterConcluded({})
    setIsInfiniteMode(false)
    setJudgeContent('')
    setJudgeStreaming(false)
    setJudgeLoading(false)
    setIsComplete(false)
  }, [])

  const handleLoadSession = useCallback(async (session) => {
    setShowHistory(false)

    // Load session data
    try {
      const data = await debateService.getSession(session._id)
      const loadedSession = data.session

      setSessionId(loadedSession._id)
      setTopic(loadedSession.topic)
      // Rounds stored in settings.rounds
      setRounds(loadedSession.settings?.rounds || loadedSession.rounds || 3)
      setDebaters(loadedSession.debaters || [])
      setJudge(loadedSession.judge || null)

      // Load existing responses if any
      if (loadedSession.messages && loadedSession.messages.length > 0) {
        const responses = {}
        let judgeVerdict = ''
        loadedSession.messages.forEach(msg => {
          if (msg.role === 'debater') {
            const key = `${msg.round - 1}_${msg.config_id}`
            responses[key] = msg.content
          } else if (msg.role === 'judge') {
            judgeVerdict = msg.content
          }
        })
        setDebaterResponses(responses)
        // Set judge content from messages if not in final_verdict
        if (judgeVerdict) {
          setJudgeContent(judgeVerdict)
        }
        setCurrentRound(loadedSession.current_round || loadedSession.messages.length > 0 ? Math.max(...loadedSession.messages.map(m => m.round || 1)) : 0)
      }

      // Load judge verdict if exists (final_verdict is the field name in backend)
      if (loadedSession.final_verdict) {
        setJudgeContent(loadedSession.final_verdict)
        setIsComplete(true)
        setMode('complete')
      } else if (loadedSession.status === 'in_progress') {
        setMode('debate')
        // Continue streaming if in progress
        startStreaming(loadedSession._id)
      } else {
        setMode('debate')
      }
    } catch (error) {
      toast.error('Failed to load debate session')
      console.error(error)
    }
  }, [startStreaming])

  const isAnyLoading = Object.values(debaterLoading).some(Boolean) || judgeLoading

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 md:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <Scale className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Debate Mode</h1>
              <p className="text-sm text-foreground-secondary">
                Watch AI models debate and reach consensus
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'setup' && (
              <>
                {isAnyLoading && (
                  <button
                    onClick={handleStop}
                    className="btn btn-secondary"
                    title="Stop debate"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="btn btn-secondary"
                  title="New debate"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  New Debate
                </button>
              </>
            )}
            <button
              onClick={() => setShowHistory(true)}
              className="btn btn-secondary"
            >
              <History className="h-4 w-4 mr-2" />
              History
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {mode === 'setup' ? (
          <div className="max-w-2xl mx-auto">
            <DebateSetup
              onStart={handleStart}
              isLoading={createMutation.isPending}
            />
          </div>
        ) : (
          <DebateArena
            topic={topic}
            debaters={debaters}
            judge={judge}
            rounds={rounds}
            currentRound={currentRound}
            debaterResponses={debaterResponses}
            debaterStreaming={debaterStreaming}
            debaterLoading={debaterLoading}
            debaterConcluded={debaterConcluded}
            isInfiniteMode={isInfiniteMode}
            judgeContent={judgeContent}
            judgeStreaming={judgeStreaming}
            judgeLoading={judgeLoading}
            isComplete={isComplete}
          />
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <DebateHistory
          onClose={() => setShowHistory(false)}
          onLoadSession={handleLoadSession}
        />
      )}
    </div>
  )
}
