import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Settings2, Trash2, MoreVertical } from 'lucide-react'
import { chatService, configService } from '../../services/chatService'
import { useSocket } from '../../context/SocketContext'
import ChatWindow from '../../components/chat/ChatWindow'
import ChatInput from '../../components/chat/ChatInput'
import ConfigSelector from '../../components/chat/ConfigSelector'
import toast from 'react-hot-toast'

export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isConnected, on, off, sendMessage, stopGeneration, joinConversation, leaveConversation } = useSocket()

  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [showConfigSelector, setShowConfigSelector] = useState(false)

  // Fetch conversation if ID is provided
  const { data: conversationData, isLoading: isLoadingConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatService.getConversation(conversationId),
    enabled: !!conversationId,
  })

  // Fetch user's configs
  const { data: configsData } = useQuery({
    queryKey: ['configs'],
    queryFn: () => configService.getConfigs(),
  })

  const configs = configsData?.configs || []
  const conversation = conversationData?.conversation

  // Set initial config from conversation or first available config
  useEffect(() => {
    if (conversation?.config_id) {
      setSelectedConfigId(conversation.config_id)
    } else if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0]._id)
    }
  }, [conversation, configs, selectedConfigId])

  // Load messages from conversation
  useEffect(() => {
    if (conversationData?.messages) {
      setMessages(conversationData.messages)
    } else if (!conversationId) {
      setMessages([])
    }
  }, [conversationData, conversationId])

  // Join conversation room
  useEffect(() => {
    if (conversationId && isConnected) {
      joinConversation(conversationId)
      return () => leaveConversation(conversationId)
    }
  }, [conversationId, isConnected, joinConversation, leaveConversation])

  // Socket event handlers
  useEffect(() => {
    const handleMessageStart = (data) => {
      setStreamingMessageId(data.message_id)
      setStreamingContent('')
      setIsStreaming(true)
    }

    const handleMessageChunk = (data) => {
      setStreamingContent(prev => prev + data.content)
    }

    const handleMessageComplete = (data) => {
      setMessages(prev => [
        ...prev,
        {
          _id: data.message_id,
          role: 'assistant',
          content: data.content,
          metadata: data.metadata,
          created_at: new Date().toISOString(),
        },
      ])
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')

      // Refresh conversations list
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }

    const handleMessageError = (data) => {
      toast.error(data.error || 'Failed to generate response')
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')
    }

    const handleConversationCreated = (data) => {
      // Navigate to the new conversation
      navigate(`/chat/${data.conversation._id}`, { replace: true })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    }

    const handleMessageSaved = (data) => {
      setMessages(prev => [...prev, data.message])
    }

    const unsubscribers = [
      on('message_start', handleMessageStart),
      on('message_chunk', handleMessageChunk),
      on('message_complete', handleMessageComplete),
      on('message_error', handleMessageError),
      on('conversation_created', handleConversationCreated),
      on('message_saved', handleMessageSaved),
    ]

    return () => {
      unsubscribers.forEach(unsub => unsub())
    }
  }, [on, navigate, queryClient])

  const handleSendMessage = useCallback((content, attachments = []) => {
    if (!selectedConfigId) {
      toast.error('Please select an AI configuration first')
      setShowConfigSelector(true)
      return
    }

    if (!isConnected) {
      toast.error('Not connected to server')
      return
    }

    sendMessage({
      conversation_id: conversationId || null,
      config_id: selectedConfigId,
      message: content,
      attachments,
    })
  }, [conversationId, selectedConfigId, isConnected, sendMessage])

  const handleStopGeneration = useCallback(() => {
    if (streamingMessageId) {
      stopGeneration(streamingMessageId)
    }
  }, [streamingMessageId, stopGeneration])

  const selectedConfig = configs.find(c => c._id === selectedConfigId)

  // Show config selector if no configs exist
  if (!isLoadingConversation && configs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Bot className="h-16 w-16 text-foreground-tertiary mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">
            Create Your First AI Configuration
          </h2>
          <p className="text-foreground-secondary mb-6">
            To start chatting, you need to create an AI configuration with a custom system prompt.
          </p>
          <button
            onClick={() => navigate('/configs')}
            className="btn btn-primary"
          >
            Create Configuration
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Config indicator */}
          <button
            onClick={() => setShowConfigSelector(!showConfigSelector)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-tertiary hover:bg-background-elevated transition-colors"
          >
            <div
              className="h-6 w-6 rounded-lg flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: '#5c9aed20', color: '#5c9aed' }}
            >
              {selectedConfig?.avatar?.type === 'emoji'
                ? selectedConfig.avatar.value
                : selectedConfig?.name?.[0]?.toUpperCase() || 'AI'}
            </div>
            <span className="text-sm font-medium text-foreground">
              {selectedConfig?.name || 'Select AI'}
            </span>
            <Settings2 className="h-4 w-4 text-foreground-tertiary" />
          </button>

          {conversation && (
            <span className="text-sm text-foreground-secondary truncate max-w-[200px]">
              {conversation.title}
            </span>
          )}
        </div>

        {conversation && (
          <button className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground">
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Config Selector Dropdown */}
      {showConfigSelector && (
        <ConfigSelector
          configs={configs}
          selectedConfigId={selectedConfigId}
          onSelect={(configId) => {
            setSelectedConfigId(configId)
            setShowConfigSelector(false)
          }}
          onClose={() => setShowConfigSelector(false)}
        />
      )}

      {/* Chat Window */}
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        selectedConfig={selectedConfig}
      />

      {/* Chat Input */}
      <ChatInput
        onSend={handleSendMessage}
        onStop={handleStopGeneration}
        isStreaming={isStreaming}
        disabled={!selectedConfigId}
      />
    </div>
  )
}
