import { useState, useEffect, useRef, useCallback } from 'react'
import { chatService } from '../../../services/chatService'
import toast from 'react-hot-toast'

export function useChatMessages({ conversationId, conversationData, queryClient }) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingMessageId, setStreamingMessageId] = useState(null)
  const [streamingContent, setStreamingContent] = useState('')

  // Ref to skip query overwrite right after streaming ends
  const justFinishedStreamingRef = useRef(false)

  // Load messages from conversation
  useEffect(() => {
    // Don't overwrite streaming messages with stale query data
    if (isStreaming) return

    // Skip overwrite right after streaming ends (query data may be stale)
    if (justFinishedStreamingRef.current) {
      // Delay reset to survive multiple React Query updates
      setTimeout(() => {
        justFinishedStreamingRef.current = false
      }, 1000)
      return
    }

    if (conversationData?.messages) {
      setMessages(conversationData.messages)
    } else if (!conversationId) {
      setMessages([])
    }
  }, [conversationData, conversationId, isStreaming])

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

  return {
    messages,
    setMessages,
    isStreaming,
    setIsStreaming,
    streamingContent,
    setStreamingContent,
    streamingMessageId,
    setStreamingMessageId,
    justFinishedStreamingRef,
    handleEditMessage,
    handleRegenerateMessage,
    handleFileUpload
  }
}
