import { useState, useCallback, useRef } from 'react'
import { LayoutGrid, Plus, Send, Square, X } from 'lucide-react'
import { streamArena, cancelArena } from '../../services/streamService'
import ArenaPanel from '../../components/arena/ArenaPanel'
import ArenaConfigSelector from '../../components/arena/ArenaConfigSelector'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function ArenaPage() {
  const [showSelector, setShowSelector] = useState(false)
  const [configs, setConfigs] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState({})
  const [streaming, setStreaming] = useState({})
  const [loading, setLoading] = useState({})
  const [input, setInput] = useState('')

  // Ref to store abort controller for cancellation
  const abortControllerRef = useRef(null)

  const handleSelectConfigs = (selectedConfigs) => {
    setConfigs(selectedConfigs)
    setMessages({})
    setStreaming({})
    setLoading({})
    setSessionId(null)
  }

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || configs.length < 2) return

    const configIds = configs.map(c => c._id)
    const messageContent = input

    // Set loading for all configs
    const newLoading = {}
    configs.forEach(c => { newLoading[c._id] = true })
    setLoading(newLoading)

    // Clear input immediately
    setInput('')

    // Create abort controller for this stream
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      await streamArena(
        {
          session_id: sessionId,
          message: messageContent,
          config_ids: configIds
        },
        {
          onSessionCreated: (data) => {
            setSessionId(data.session._id)
          },
          onUserMessage: (data) => {
            // User message is shared across all panels
            setMessages(prev => {
              const newMessages = { ...prev }
              configIds.forEach(configId => {
                // Check for duplicates
                const existingMessages = prev[configId] || []
                const isDuplicate = existingMessages.some(
                  m => m.role === 'user' && m.content === data.message.content
                )
                if (!isDuplicate) {
                  newMessages[configId] = [...existingMessages, { role: 'user', content: data.message.content }]
                }
              })
              return newMessages
            })
          },
          onMessageStart: (data) => {
            setLoading(prev => ({ ...prev, [data.config_id]: true }))
            setStreaming(prev => ({ ...prev, [data.config_id]: '' }))
          },
          onMessageChunk: (data) => {
            setStreaming(prev => ({
              ...prev,
              [data.config_id]: (prev[data.config_id] || '') + data.content
            }))
          },
          onMessageComplete: (data) => {
            setLoading(prev => ({ ...prev, [data.config_id]: false }))
            setStreaming(prev => ({ ...prev, [data.config_id]: null }))
            setMessages(prev => ({
              ...prev,
              [data.config_id]: [...(prev[data.config_id] || []), { role: 'assistant', content: data.content }]
            }))
          },
          onMessageError: (data) => {
            setLoading(prev => ({ ...prev, [data.config_id]: false }))
            setStreaming(prev => ({ ...prev, [data.config_id]: null }))
            toast.error(`Error from ${data.config_id}: ${data.error}`)
          }
        }
      )
    } catch (error) {
      console.error('Arena stream error:', error)
      // Reset all loading states on error
      const resetLoading = {}
      configs.forEach(c => { resetLoading[c._id] = false })
      setLoading(resetLoading)
    }
  }, [input, configs, sessionId])

  const handleStopGeneration = useCallback(async () => {
    // First try to abort the fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Also call cancel endpoint if we have a session ID
    if (sessionId) {
      try {
        await cancelArena(sessionId)
      } catch (error) {
        console.error('Cancel error:', error)
      }
    }

    // Reset loading states
    const resetLoading = {}
    configs.forEach(c => { resetLoading[c._id] = false })
    setLoading(resetLoading)

    // Clear streaming content
    const resetStreaming = {}
    configs.forEach(c => { resetStreaming[c._id] = null })
    setStreaming(resetStreaming)
  }, [sessionId, configs])

  const handleRemoveConfig = (configId) => {
    if (configs.length <= 2) {
      toast.error('Minimum 2 configs required')
      return
    }
    setConfigs(configs.filter(c => c._id !== configId))
    setMessages(prev => {
      const newMessages = { ...prev }
      delete newMessages[configId]
      return newMessages
    })
  }

  const isAnyLoading = Object.values(loading).some(Boolean)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 p-4 md:p-6 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10">
              <LayoutGrid className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Arena</h1>
              <p className="text-sm text-foreground-secondary">Compare AI responses side by side</p>
            </div>
          </div>
          <button
            onClick={() => setShowSelector(true)}
            className="btn btn-primary"
          >
            <Plus className="h-4 w-4 mr-2" />
            {configs.length > 0 ? 'Change Configs' : 'Select Configs'}
          </button>
        </div>

        {/* Config chips */}
        {configs.length > 0 && (
          <div className="flex gap-2 mt-4 flex-wrap" data-testid="config-chips">
            {configs.map(config => (
              <div
                key={config._id}
                className="flex items-center gap-2 px-3 py-1.5 bg-background-tertiary rounded-full"
              >
                <span>{config.avatar?.value || '🤖'}</span>
                <span className="text-sm text-foreground">{config.name}</span>
                <button
                  onClick={() => handleRemoveConfig(config._id)}
                  className="p-0.5 hover:bg-background-elevated rounded"
                >
                  <X className="h-3 w-3 text-foreground-tertiary" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Arena Grid */}
      <div className="flex-1 overflow-hidden p-4 md:p-6">
        {configs.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <LayoutGrid className="h-16 w-16 mx-auto mb-4 text-foreground-tertiary opacity-50" />
              <h2 className="text-xl font-medium text-foreground mb-2">No configs selected</h2>
              <p className="text-foreground-secondary mb-4">Select 2-4 AI configs to start comparing</p>
              <button
                onClick={() => setShowSelector(true)}
                className="btn btn-primary"
              >
                <Plus className="h-4 w-4 mr-2" />
                Select Configs
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'grid gap-3 md:gap-4 h-full overflow-y-auto md:overflow-hidden',
              // 2 configs: stack on mobile, side-by-side on desktop
              configs.length === 2 && 'grid-cols-1 md:grid-cols-2',
              // 3 configs: stack on mobile, 2 cols tablet, 3 cols desktop
              configs.length === 3 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
              // 4 configs: stack on mobile, 2x2 grid on tablet+
              configs.length === 4 && 'grid-cols-1 sm:grid-cols-2'
            )}
            data-testid="arena-grid"
          >
            {configs.map(config => (
              <ArenaPanel
                key={config._id}
                config={config}
                messages={messages[config._id] || []}
                streaming={streaming[config._id]}
                isLoading={loading[config._id]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      {configs.length >= 2 && (
        <div className="flex-shrink-0 p-4 border-t border-border">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Send a message to all configs..."
              className="input flex-1"
              disabled={isAnyLoading}
            />
            {isAnyLoading ? (
              <button
                onClick={handleStopGeneration}
                className="btn btn-secondary"
              >
                <Square className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={handleSendMessage}
                disabled={!input.trim()}
                className="btn btn-primary"
              >
                <Send className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Config Selector Modal */}
      {showSelector && (
        <ArenaConfigSelector
          selectedConfigs={configs}
          onSelect={handleSelectConfigs}
          onClose={() => setShowSelector(false)}
          maxConfigs={4}
        />
      )}
    </div>
  )
}
