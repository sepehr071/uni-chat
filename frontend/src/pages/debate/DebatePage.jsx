import { useState, useCallback, useRef } from 'react'
import { Scale, History, RotateCcw, Square } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { debateService } from '../../services/debateService'
import { streamDebate, cancelDebate } from '../../services/streamService'
import { DebateSetup, DebateArena, DebateHistory } from '../../components/debate'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export default function DebatePage() {
  const { t } = useTranslation('debate')
  const queryClient = useQueryClient()
  const abortControllerRef = useRef(null)

  // UI state
  const [showHistory, setShowHistory] = useState(false)
  const [mode, setMode] = useState('setup') // 'setup' | 'debate' | 'complete'
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)

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
  const [debaterConcluded, setDebaterConcluded] = useState({})
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
      toast.error(error.response?.data?.error || error.message || t('failedCreate'))
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
            if (data.concluded) {
              setDebaterConcluded(prev => ({ ...prev, [data.config_id]: true }))
            }
          },
          onDebaterConcluded: (data) => {
            setDebaterConcluded(prev => ({ ...prev, [data.config_id]: true }))
          },
          onRoundComplete: (data) => {
            console.log('Round completed:', data.round, 'concluded:', data.concluded_count, '/', data.total_debaters)
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
            toast.success(t('debateCompleted'))
          },
          onError: (data) => {
            toast.error(data.error || t('errorDuringDebate'))
            setJudgeLoading(false)
            setJudgeStreaming(false)
          },
        }
      )
    } catch (error) {
      console.error('Debate stream error:', error)
      toast.error(t('failedStream'))
    }
  }, [debaters, queryClient, t])

  const handleStart = useCallback((config) => {
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

    try {
      const data = await debateService.getSession(session._id)
      const loadedSession = data.session

      setSessionId(loadedSession._id)
      setTopic(loadedSession.topic)
      setRounds(loadedSession.settings?.rounds || loadedSession.rounds || 3)
      setDebaters(loadedSession.debaters || [])
      setJudge(loadedSession.judge || null)

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
        if (judgeVerdict) {
          setJudgeContent(judgeVerdict)
        }
        setCurrentRound(loadedSession.current_round || loadedSession.messages.length > 0 ? Math.max(...loadedSession.messages.map(m => m.round || 1)) : 0)
      }

      if (loadedSession.final_verdict) {
        setJudgeContent(loadedSession.final_verdict)
        setIsComplete(true)
        setMode('complete')
      } else if (loadedSession.status === 'in_progress') {
        setMode('debate')
        startStreaming(loadedSession._id)
      } else {
        setMode('debate')
      }
    } catch (error) {
      toast.error(t('failedLoad'))
      console.error(error)
    }
  }, [startStreaming, t])

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
              <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
              <p className="text-sm text-foreground-secondary">
                {t('subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode !== 'setup' && (
              <>
                {isAnyLoading && (
                  <Button
                    onClick={handleStop}
                    variant="secondary"
                    title={t('stopTitle')}
                  >
                    <Square className="h-4 w-4 me-2" />
                    {t('stop')}
                  </Button>
                )}
                <Button
                  onClick={handleReset}
                  variant="secondary"
                  title={t('newDebateTitle')}
                >
                  <RotateCcw className="h-4 w-4 me-2" />
                  {t('newDebate')}
                </Button>
              </>
            )}
            <Button
              onClick={() => setShowHistory(true)}
              variant="secondary"
            >
              <History className="h-4 w-4 me-2" />
              {t('history')}
            </Button>
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
            autoScrollEnabled={autoScrollEnabled}
            onToggleAutoScroll={() => setAutoScrollEnabled(prev => !prev)}
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
