import { useRef, useCallback } from 'react'
import { streamChat, cancelChat } from '../../../services/streamService'
import toast from 'react-hot-toast'

export function useChatStream({
  conversationId,
  selectedConfigId,
  navigate,
  queryClient,
  setMessages,
  setStreamingContent,
  setStreamingMessageId,
  setIsStreaming,
  justFinishedStreamingRef,
  setShowConfigSelector
}) {
  // Ref to store abort controller for cancellation
  const abortControllerRef = useRef(null)

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
            // Update local state
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

            // Update React Query cache directly to prevent race conditions
            const convId = conversationId || data.conversation_id
            if (convId) {
              queryClient.setQueryData(['conversation', convId], (old) => {
                if (!old) return old
                const exists = old.messages?.some(m => m._id === data.message._id)
                if (exists) return old
                return {
                  ...old,
                  messages: [...(old.messages || []), data.message]
                }
              })
            }
          },
          onMessageStart: (data) => {
            setStreamingMessageId(data.message_id)
            setStreamingContent('')
          },
          onMessageChunk: (data) => {
            setStreamingContent(prev => prev + data.content)
          },
          onMessageComplete: (data) => {
            const newMessage = {
              _id: data.message_id,
              role: 'assistant',
              content: data.content,
              metadata: data.metadata,
              created_at: new Date().toISOString(),
            }

            // Update local state
            setMessages(prev => {
              // Check if message already exists (deduplication)
              if (prev.some(m => m._id === data.message_id)) {
                return prev
              }
              return [...prev, newMessage]
            })

            // Update React Query cache directly to prevent race conditions
            const convId = conversationId || data.conversation_id
            if (convId) {
              queryClient.setQueryData(['conversation', convId], (old) => {
                if (!old) return old
                const exists = old.messages?.some(m => m._id === data.message_id)
                if (exists) return old
                return {
                  ...old,
                  messages: [...(old.messages || []), newMessage]
                }
              })
            }

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
            // Update conversation title in sidebar list cache
            queryClient.setQueryData(['conversations'], (old) => {
              if (!old) return old
              return {
                ...old,
                conversations: old.conversations?.map(c =>
                  c._id === data.conversation_id ? { ...c, title: data.title } : c
                ) || []
              }
            })
            // Also update the individual conversation cache (for header display)
            queryClient.setQueryData(['conversation', data.conversation_id], (old) => {
              if (!old) return old
              return {
                ...old,
                conversation: { ...old.conversation, title: data.title }
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
  }, [
    conversationId,
    selectedConfigId,
    navigate,
    queryClient,
    setMessages,
    setStreamingContent,
    setStreamingMessageId,
    setIsStreaming,
    justFinishedStreamingRef,
    setShowConfigSelector
  ])

  const handleStopGeneration = useCallback(async (messageId) => {
    // First try to abort the fetch request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    // Also call cancel endpoint if we have a message ID
    if (messageId) {
      try {
        await cancelChat(messageId)
      } catch (error) {
        console.error('Cancel error:', error)
      }
    }

    setIsStreaming(false)
    setStreamingMessageId(null)
    setStreamingContent('')
  }, [setIsStreaming, setStreamingMessageId, setStreamingContent])

  return { handleSendMessage, handleStopGeneration }
}
