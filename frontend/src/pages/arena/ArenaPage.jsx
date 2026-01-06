import { useState, useEffect } from 'react'
import { LayoutGrid, Plus, Send, Square, X } from 'lucide-react'
import { useSocket } from '../../context/SocketContext'
import ArenaPanel from '../../components/arena/ArenaPanel'
import ArenaConfigSelector from '../../components/arena/ArenaConfigSelector'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function ArenaPage() {
  const { socket, isConnected } = useSocket()
  const [showSelector, setShowSelector] = useState(false)
  const [configs, setConfigs] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [messages, setMessages] = useState({})
  const [streaming, setStreaming] = useState({})
  const [loading, setLoading] = useState({})
  const [input, setInput] = useState('')

  // Socket event handlers
  useEffect(() => {
    if (!socket) return

    const handleSessionCreated = (data) => {
      setSessionId(data.session._id)
    }

    const handleUserMessage = (data) => {
      // User message is shared across all panels
      configs.forEach(config => {
        setMessages(prev => ({
          ...prev,
          [config._id]: [...(prev[config._id] || []), { role: 'user', content: data.message.content }]
        }))
      })
    }

    const handleMessageStart = (data) => {
      setLoading(prev => ({ ...prev, [data.config_id]: true }))
      setStreaming(prev => ({ ...prev, [data.config_id]: '' }))
    }

    const handleMessageChunk = (data) => {
      setStreaming(prev => ({
        ...prev,
        [data.config_id]: (prev[data.config_id] || '') + data.content
      }))
    }

    const handleMessageComplete = (data) => {
      setLoading(prev => ({ ...prev, [data.config_id]: false }))
      setStreaming(prev => ({ ...prev, [data.config_id]: null }))
      setMessages(prev => ({
        ...prev,
        [data.config_id]: [...(prev[data.config_id] || []), { role: 'assistant', content: data.content }]
      }))
    }

    const handleMessageError = (data) => {
      setLoading(prev => ({ ...prev, [data.config_id]: false }))
      setStreaming(prev => ({ ...prev, [data.config_id]: null }))
      toast.error(`Error from ${data.config_id}: ${data.error}`)
    }

    socket.on('arena_session_created', handleSessionCreated)
    socket.on('arena_user_message', handleUserMessage)
    socket.on('arena_message_start', handleMessageStart)
    socket.on('arena_message_chunk', handleMessageChunk)
    socket.on('arena_message_complete', handleMessageComplete)
    socket.on('arena_message_error', handleMessageError)

    return () => {
      socket.off('arena_session_created', handleSessionCreated)
      socket.off('arena_user_message', handleUserMessage)
      socket.off('arena_message_start', handleMessageStart)
      socket.off('arena_message_chunk', handleMessageChunk)
      socket.off('arena_message_complete', handleMessageComplete)
      socket.off('arena_message_error', handleMessageError)
    }
  }, [socket, configs])

  const handleSelectConfigs = (selectedConfigs) => {
    setConfigs(selectedConfigs)
    setMessages({})
    setStreaming({})
    setLoading({})
    setSessionId(null)
  }

  const handleSendMessage = () => {
    if (!input.trim() || configs.length < 2) return
    if (!isConnected) {
      toast.error('Not connected')
      return
    }

    const configIds = configs.map(c => c._id)

    // Set loading for all configs
    const newLoading = {}
    configs.forEach(c => { newLoading[c._id] = true })
    setLoading(newLoading)

    socket.emit('arena_send_message', {
      session_id: sessionId,
      message: input,
      config_ids: configIds
    })

    setInput('')
  }

  const handleStopGeneration = () => {
    if (sessionId && socket) {
      socket.emit('arena_stop_generation', { session_id: sessionId })
    }
  }

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
      <div className="flex-shrink-0 p-6 border-b border-border">
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
          <div className="flex gap-2 mt-4 flex-wrap">
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
      <div className="flex-1 overflow-hidden p-6">
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
          <div className={cn(
            'grid gap-4 h-full',
            configs.length === 2 && 'grid-cols-2',
            configs.length === 3 && 'grid-cols-3',
            configs.length === 4 && 'grid-cols-2 grid-rows-2'
          )}>
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
                disabled={!input.trim() || !isConnected}
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
