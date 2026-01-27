import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, Settings2, Trash2, MoreVertical, Loader2, Download, FileText, FileJson, GitBranch } from 'lucide-react'
import { chatService, configService } from '../../services/chatService'
import { streamChat, cancelChat } from '../../services/streamService'
import ChatWindow from '../../components/chat/ChatWindow'
import ChatInput from '../../components/chat/ChatInput'
import ConfigSelector from '../../components/chat/ConfigSelector'
import BranchSelector from '../../components/chat/BranchSelector'
import toast from 'react-hot-toast'

export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [showConfigSelector, setShowConfigSelector] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [branches, setBranches] = useState([])
  const [activeBranch, setActiveBranch] = useState(null)

  // Ref to store abort controller for cancellation
  const abortControllerRef = useRef(null)
  // Ref to skip query overwrite right after streaming ends
  const justFinishedStreamingRef = useRef(false)

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

  // Fetch branches when conversation is loaded
  useEffect(() => {
    const fetchBranches = async () => {
      if (!conversationId) {
        setBranches([])
        setActiveBranch(null)
        return
      }

      try {
        const data = await chatService.getBranches(conversationId)
        setBranches(data.branches || [])
        // Find and set active branch
        const active = data.branches?.find(b => b._id === data.active_branch_id)
        setActiveBranch(active || data.branches?.[0] || null)
      } catch (error) {
        console.error('Failed to fetch branches:', error)
        setBranches([])
        setActiveBranch(null)
      }
    }

    fetchBranches()
  }, [conversationId])

  // Load messages from conversation
  useEffect(() => {
    // Don't overwrite streaming messages with stale query data
    if (isStreaming) return

    // Skip overwrite right after streaming ends (query data may have empty content)
    if (justFinishedStreamingRef.current) {
      justFinishedStreamingRef.current = false
      return
    }

    if (conversationData?.messages) {
      setMessages(conversationData.messages)
    } else if (!conversationId) {
      setMessages([])
    }
  }, [conversationData, conversationId, isStreaming])

  const handleSendMessage = useCallback(async (content, attachments = []) => {
    if (!selectedConfigId) {
      toast.error('Please select an AI configuration first')
      setShowConfigSelector(true)
      return
    }

    // Optimistic update - show user message immediately
    const tempUserMessage = {
      _id: `temp-${Date.now()}`,
      role: 'user',
      content,
      attachments,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMessage])
    setIsStreaming(true)
    setStreamingContent('')

    // Create abort controller for this stream
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      await streamChat(
        {
          conversation_id: conversationId || null,
          config_id: selectedConfigId,
          message: content,
          attachments,
        },
        {
          onConversationCreated: (data) => {
            // Navigate to the new conversation
            navigate(`/chat/${data.conversation._id}`, { replace: true })
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          },
          onMessageSaved: (data) => {
            setMessages(prev => {
              // Check if message already exists by ID (deduplication)
              if (prev.some(m => m._id === data.message._id)) {
                return prev
              }

              // Replace temp message with real one, or add if not found
              const tempIndex = prev.findIndex(m =>
                m._id.toString().startsWith('temp-') && m.content === data.message.content
              )
              if (tempIndex >= 0) {
                const newMessages = [...prev]
                newMessages[tempIndex] = data.message
                return newMessages
              }
              return [...prev, data.message]
            })
          },
          onMessageStart: (data) => {
            setStreamingMessageId(data.message_id)
            setStreamingContent('')
          },
          onMessageChunk: (data) => {
            setStreamingContent(prev => prev + data.content)
          },
          onMessageComplete: (data) => {
            setMessages(prev => {
              // Check if message already exists (deduplication)
              if (prev.some(m => m._id === data.message_id)) {
                return prev
              }
              return [
                ...prev,
                {
                  _id: data.message_id,
                  role: 'assistant',
                  content: data.content,
                  metadata: data.metadata,
                  created_at: new Date().toISOString(),
                },
              ]
            })
            // Mark that we just finished streaming to skip the next query overwrite
            justFinishedStreamingRef.current = true
            setIsStreaming(false)
            setStreamingMessageId(null)
            setStreamingContent('')

            // Refresh conversations list
            queryClient.invalidateQueries({ queryKey: ['conversations'] })
          },
          onMessageError: (data) => {
            toast.error(data.error || 'Failed to generate response')
            setIsStreaming(false)
            setStreamingMessageId(null)
            setStreamingContent('')
          },
          onTitleUpdated: (data) => {
            // Update conversation title in cache
            queryClient.setQueryData(['conversations'], (old) => {
              if (!old) return old
              return {
                ...old,
                conversations: old.conversations?.map(c =>
                  c._id === data.conversation_id ? { ...c, title: data.title } : c
                ) || []
              }
            })
          },
        }
      )
    } catch (error) {
      console.error('Stream error:', error)
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')
    }
  }, [conversationId, selectedConfigId, navigate, queryClient])

  const handleStopGeneration = useCallback(async () => {
    // First try to abort the fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Also call cancel endpoint if we have a message ID
    if (streamingMessageId) {
      try {
        await cancelChat(streamingMessageId)
      } catch (error) {
        console.error('Cancel error:', error)
      }
    }

    setIsStreaming(false)
    setStreamingMessageId(null)
    setStreamingContent('')
  }, [streamingMessageId])

  const handleEditMessage = useCallback(async (messageId, newContent) => {
    if (!conversationId) return

    // Prevent editing messages with temporary IDs (not yet saved to DB)
    if (messageId.toString().startsWith('temp-')) {
      toast.error('Please wait for message to be saved')
      return
    }

    try {
      setIsStreaming(true)
      const result = await chatService.editMessage(messageId, newContent, true)

      // Update the edited message in local state
      setMessages(prev => {
        // Find the index of the edited message
        const editedIndex = prev.findIndex(m => m._id === messageId)
        if (editedIndex === -1) return prev

        // Keep messages up to and including the edited one, then add new assistant message if any
        const newMessages = prev.slice(0, editedIndex + 1).map(m =>
          m._id === messageId ? result.message : m
        )

        if (result.assistant_message) {
          newMessages.push(result.assistant_message)
        }

        return newMessages
      })

      // Refresh conversation data
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      toast.success('Message edited and regenerated')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to edit message')
    } finally {
      setIsStreaming(false)
    }
  }, [conversationId, queryClient])

  const handleRegenerateMessage = useCallback(async (messageId) => {
    if (!conversationId) return

    try {
      setIsStreaming(true)
      const result = await chatService.regenerateMessage(messageId)

      // Replace the old assistant message with the new one
      setMessages(prev => prev.map(m =>
        m._id === messageId ? result.message : m
      ))

      toast.success('Response regenerated')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to regenerate')
    } finally {
      setIsStreaming(false)
    }
  }, [conversationId])

  // Handle file upload for chat attachments (images, PDFs for vision models)
  const handleFileUpload = useCallback(async (file) => {
    // Validate file size (max 20MB for images)
    const maxSize = 20 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('File too large. Maximum size is 20MB.')
      return null
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Unsupported file type. Use images (JPEG, PNG, GIF, WebP) or PDF.')
      return null
    }

    try {
      // Convert to base64 for inline sending to OpenRouter
      const base64 = await chatService.fileToBase64(file)

      return {
        name: file.name,
        type: file.type,
        size: file.size,
        url: base64, // data:image/png;base64,... format
        mime_type: file.type
      }
    } catch (error) {
      console.error('Failed to process file:', error)
      toast.error('Failed to process file')
      return null
    }
  }, [])

  // Branch handlers
  const handleCreateBranch = useCallback(async (messageId) => {
    if (!conversationId) {
      toast.error('Please save the conversation first')
      return
    }

    // Prevent branching from temp messages
    if (messageId.toString().startsWith('temp-')) {
      toast.error('Please wait for message to be saved')
      return
    }

    try {
      const branchName = `branch-${Date.now().toString(36)}`
      const data = await chatService.createBranch(conversationId, messageId, branchName)

      // Update branches list
      setBranches(prev => [...prev, data.branch])

      // Switch to new branch
      setActiveBranch(data.branch)
      setMessages(data.messages || [])

      toast.success(`Created branch: ${data.branch.name}`)

      // Invalidate conversation query to refresh data
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create branch')
    }
  }, [conversationId, queryClient])

  const handleSwitchBranch = useCallback(async (branchId) => {
    if (!conversationId) return

    try {
      const data = await chatService.switchBranch(conversationId, branchId)

      // Update active branch
      const switched = branches.find(b => b._id === branchId)
      setActiveBranch(switched || null)

      // Update messages with branch messages
      setMessages(data.messages || [])

      toast.success(`Switched to branch: ${switched?.name || 'unknown'}`)
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to switch branch')
    }
  }, [conversationId, branches])

  const handleDeleteBranch = useCallback(async (branchId) => {
    if (!conversationId) return

    try {
      await chatService.deleteBranch(conversationId, branchId)

      // Remove from branches list
      setBranches(prev => prev.filter(b => b._id !== branchId))

      // If deleted branch was active, switch to main
      if (activeBranch?._id === branchId) {
        const mainBranch = branches.find(b => b.name === 'main')
        if (mainBranch) {
          handleSwitchBranch(mainBranch._id)
        }
      }

      toast.success('Branch deleted')
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to delete branch')
    }
  }, [conversationId, activeBranch, branches, handleSwitchBranch])

  const handleExport = useCallback(async (format) => {
    if (!conversationId) return

    try {
      const blob = await chatService.exportConversation(conversationId, format, true)

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conversation.${format === 'json' ? 'json' : 'md'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success(`Exported as ${format.toUpperCase()}`)
      setShowExportMenu(false)
    } catch (error) {
      toast.error('Failed to export conversation')
    }
  }, [conversationId])

  const selectedConfig = configs.find(c => c._id === selectedConfigId)

  // Show loading skeleton when loading conversation
  if (isLoadingConversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-32 bg-background-tertiary rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </div>
    )
  }

  // Show config selector if no configs exist
  if (configs.length === 0) {
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
          <div className="flex items-center gap-1">
            {/* Export Menu */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                title="Export conversation"
              >
                <Download className="h-4 w-4" />
              </button>

              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                    <button
                      onClick={() => handleExport('markdown')}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                    >
                      <FileText className="h-4 w-4" />
                      Export as Markdown
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                    >
                      <FileJson className="h-4 w-4" />
                      Export as JSON
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* More options menu */}
            <button className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
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

      {/* Branch Selector - show when multiple branches exist */}
      {branches.length > 1 && (
        <div className="px-4 py-2 border-b border-border bg-background-secondary/50">
          <BranchSelector
            branches={branches}
            activeBranch={activeBranch}
            onSwitch={handleSwitchBranch}
            onDelete={handleDeleteBranch}
          />
        </div>
      )}

      {/* Chat Window */}
      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        streamingContent={streamingContent}
        selectedConfig={selectedConfig}
        onEditMessage={handleEditMessage}
        onRegenerateMessage={handleRegenerateMessage}
        onCreateBranch={conversationId ? handleCreateBranch : null}
      />

      {/* Chat Input */}
      <ChatInput
        onSend={handleSendMessage}
        onFileUpload={handleFileUpload}
        onStop={handleStopGeneration}
        isStreaming={isStreaming}
        disabled={!selectedConfigId}
      />
    </div>
  )
}
