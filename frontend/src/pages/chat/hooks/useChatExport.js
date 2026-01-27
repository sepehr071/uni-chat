import { useState, useCallback } from 'react'
import { chatService } from '../../../services/chatService'
import toast from 'react-hot-toast'

export function useChatExport(conversationId) {
  const [showExportMenu, setShowExportMenu] = useState(false)

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

  return { showExportMenu, setShowExportMenu, handleExport }
}
