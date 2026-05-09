import { useRef, useCallback } from 'react'
import { streamChat, cancelChat } from '../../../services/streamService'
import { parseHtmlCode, isRunnableCode } from '../../../components/chat/CodeCanvas'
import { dlpService } from '@/services/dlpService'
import { useWorkspace } from '@/context/WorkspaceContext'
import toast from 'react-hot-toast'
import i18n from '../../../i18n'

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
  setShowConfigSelector,
  onCanvasIntent,
  projectId = null,
  onDLPViolation = null,
}) {
  // Ref to store abort controller for cancellation
  const abortControllerRef = useRef(null)
  // Track the intent of the most recently sent message so the completion handler
  // can act on it even when the SSE event omits the echo.
  const lastSentIntentRef = useRef(null)

  const { currentWorkspace } = useWorkspace()
  const workspaceId = currentWorkspace?._id || null

  const handleSendMessage = useCallback(async (content, attachments = [], command = null) => {
    if (!selectedConfigId && !command) {
      toast.error(i18n.t('common:runtime.chat.selectConfig'))
      setShowConfigSelector(true)
      return
    }

    const resolvedConfigId = command ? command.configId : selectedConfigId
    const intent = command ? command.intent : null
    lastSentIntentRef.current = intent

    // Pre-flight DLP scan (best-effort — never blocks user on infra failure)
    let dlpConfirmed = false
    if (workspaceId && onDLPViolation) {
      try {
        const scanRes = await dlpService.scan(content, workspaceId, 'chat', projectId || null)
        const result = scanRes?.result
        if (result && result.highest_action && result.highest_action !== 'allow' && result.matches?.length) {
          const proceed = await onDLPViolation({
            matches: result.matches,
            highestAction: result.highest_action,
            text: content,
            attachments,
          })
          if (!proceed) {
            return
          }
          dlpConfirmed = true
        }
      } catch (err) {
        console.error('DLP pre-flight scan failed:', err)
      }
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

    const revertOptimistic = () => {
      setMessages(prev => prev.filter(m => m._id !== tempUserMessage._id))
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')
      lastSentIntentRef.current = null
    }

    // Create abort controller for this stream
    const controller = new AbortController()
    abortControllerRef.current = controller

    const buildPayload = (confirmed) => ({
      conversation_id: conversationId || null,
      config_id: resolvedConfigId,
      message: content,
      attachments,
      intent,
      project_id: conversationId ? undefined : projectId,
      dlp_confirmed: confirmed || undefined,
      lang: (i18n.language || 'en').slice(0, 2).toLowerCase(),
    })

    const handlers = {
      onConversationCreated: (data) => {
        navigate(`/chat/${data.conversation._id}`, { replace: true })
        queryClient.invalidateQueries({ queryKey: ['conversations'] })
      },
      onMessageSaved: (data) => {
        setMessages(prev => {
          if (prev.some(m => m._id === data.message._id)) return prev
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

        setMessages(prev => {
          if (prev.some(m => m._id === data.message_id)) return prev
          return [...prev, newMessage]
        })

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

        const isCanvas = data.intent === 'canvas' || lastSentIntentRef.current === 'canvas'
        if (isCanvas && onCanvasIntent) {
          const fenceRe = /```(\w*)\n([\s\S]*?)```/g
          let match
          let opened = false
          while ((match = fenceRe.exec(data.content)) !== null) {
            const lang = (match[1] || 'html').toLowerCase()
            const code = match[2]
            if (isRunnableCode(lang)) {
              onCanvasIntent(parseHtmlCode(code, lang))
              opened = true
              break
            }
          }
          if (!opened) {
            toast(i18n.t('common:runtime.chat.canvasNoCode'), { icon: '⚠️' })
          }
        }

        justFinishedStreamingRef.current = true
        setIsStreaming(false)
        setStreamingMessageId(null)
        setStreamingContent('')
        lastSentIntentRef.current = null

        queryClient.invalidateQueries({ queryKey: ['conversations'] })
      },
      onMessageError: async (data) => {
        // Defensive fallback for backend DLP rejection (pre-flight skipped/failed)
        if ((data.code === 'dlp_blocked' || data.code === 'dlp_confirm_required') && Array.isArray(data.matches) && onDLPViolation) {
          revertOptimistic()
          const proceed = await onDLPViolation({
            matches: data.matches,
            highestAction: data.highest_action || (data.code === 'dlp_blocked' ? 'block' : 'require_confirm'),
            text: content,
            attachments,
          })
          if (proceed && data.code === 'dlp_confirm_required') {
            // Resubmit with dlp_confirmed
            setMessages(prev => [...prev, tempUserMessage])
            setIsStreaming(true)
            setStreamingContent('')
            try {
              await streamChat(buildPayload(true), handlers)
            } catch (e) {
              revertOptimistic()
            }
          }
          return
        }
        toast.error(data.error || i18n.t('common:runtime.chat.streamFailed'))
        setIsStreaming(false)
        setStreamingMessageId(null)
        setStreamingContent('')
        lastSentIntentRef.current = null
      },
      onTitleUpdated: (data) => {
        queryClient.setQueryData(['conversations'], (old) => {
          if (!old) return old
          return {
            ...old,
            conversations: old.conversations?.map(c =>
              c._id === data.conversation_id ? { ...c, title: data.title } : c
            ) || []
          }
        })
        queryClient.setQueryData(['conversation', data.conversation_id], (old) => {
          if (!old) return old
          return {
            ...old,
            conversation: { ...old.conversation, title: data.title }
          }
        })
      },
    }

    try {
      await streamChat(buildPayload(dlpConfirmed), handlers)
    } catch (error) {
      setIsStreaming(false)
      setStreamingMessageId(null)
      setStreamingContent('')
      lastSentIntentRef.current = null
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
    setShowConfigSelector,
    onCanvasIntent,
    projectId,
    workspaceId,
    onDLPViolation,
  ])

  const handleStopGeneration = useCallback(async (messageId) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

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
