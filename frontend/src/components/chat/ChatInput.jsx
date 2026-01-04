import { useState, useRef, useEffect } from 'react'
import { Send, Paperclip, X, Image, File, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

export default function ChatInput({
  onSend,
  onFileUpload,
  disabled = false,
  placeholder = 'Type a message...',
  isStreaming = false
}) {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 200)
      textarea.style.height = newHeight + 'px'
    }
  }, [message])

  // Handle keyboard appearance on mobile
  useEffect(() => {
    const handleResize = () => {
      if (document.activeElement === textareaRef.current) {
        // Scroll into view when keyboard appears
        setTimeout(() => {
          textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
      }
    }

    window.visualViewport?.addEventListener('resize', handleResize)
    return () => window.visualViewport?.removeEventListener('resize', handleResize)
  }, [])

  const handleSubmit = (e) => {
    e?.preventDefault()
    if ((!message.trim() && files.length === 0) || disabled || isStreaming) return

    onSend(message.trim(), files)
    setMessage('')
    setFiles([])

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    // Submit on Enter (desktop) or Cmd/Ctrl+Enter (mobile-friendly)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    setUploading(true)
    try {
      for (const file of selectedFiles) {
        if (onFileUpload) {
          const uploadedFile = await onFileUpload(file)
          if (uploadedFile) {
            setFiles(prev => [...prev, uploadedFile])
          }
        }
      }
    } catch (error) {
      console.error('File upload failed:', error)
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const isImage = (file) => file.type?.startsWith('image/') || file.mime_type?.startsWith('image/')

  return (
    <div className="border-t border-border bg-background-secondary p-3 md:p-4">
      {/* File previews */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {files.map((file, index) => (
            <div
              key={index}
              className="relative group flex items-center gap-2 px-3 py-2 bg-background-tertiary rounded-lg"
            >
              {isImage(file) ? (
                <Image className="h-4 w-4 text-blue-400" />
              ) : (
                <File className="h-4 w-4 text-foreground-secondary" />
              )}
              <span className="text-sm text-foreground truncate max-w-[120px]">
                {file.name || file.filename}
              </span>
              <button
                onClick={() => removeFile(index)}
                className="p-1 rounded-full hover:bg-background text-foreground-tertiary hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        {/* File upload button */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className={cn(
            'p-3 rounded-lg transition-colors min-h-[44px] min-w-[44px]',
            'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Paperclip className="h-5 w-5" />
          )}
        </button>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              'w-full px-4 py-3 bg-background border border-border rounded-xl',
              'text-foreground placeholder-foreground-tertiary',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
              'resize-none overflow-y-auto',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'text-base' // Prevents iOS zoom on focus
            )}
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={(!message.trim() && files.length === 0) || disabled || isStreaming}
          className={cn(
            'p-3 rounded-lg transition-all min-h-[44px] min-w-[44px]',
            'bg-accent hover:bg-accent-hover text-white',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'active:scale-95'
          )}
        >
          {isStreaming ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>

      {/* Mobile hint */}
      <p className="text-xs text-foreground-tertiary mt-2 text-center md:hidden">
        Tap Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
