import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Send, Paperclip, X, Image, File, Loader2, Square } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from '../ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'

export default function ChatInput({
  onSend,
  onFileUpload,
  onStop,
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
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e) => {
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
          if (uploadedFile) setFiles(prev => [...prev, uploadedFile])
        }
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeFile = (fileToRemove) => {
    setFiles(prev => prev.filter(f => (f.name + '-' + f.size) !== (fileToRemove.name + '-' + fileToRemove.size)))
  }

  const isImage = (file) => file.type?.startsWith('image/') || file.mime_type?.startsWith('image/')
  const canSend = (message.trim() || files.length > 0) && !disabled

  return (
    <div className="border-t border-border bg-background-secondary/80 backdrop-blur-sm p-3 md:p-4">
      {/* File previews */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 mb-3"
          >
            {files.map((file) => (
              <motion.div
                key={file.name + '-' + file.size}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative group flex items-center gap-2 px-3 py-2 bg-background-tertiary rounded-lg border border-border"
              >
                {isImage(file) ? (
                  <Image className="h-4 w-4 text-accent" />
                ) : (
                  <File className="h-4 w-4 text-foreground-secondary" />
                )}
                <span className="text-sm text-foreground truncate max-w-[120px]">
                  {file.name || file.filename}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(file)}
                  className="h-6 w-6 rounded-full opacity-60 hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className="h-11 w-11 rounded-xl"
            >
              {uploading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Paperclip className="h-5 w-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Attach file</TooltipContent>
        </Tooltip>

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
              'focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent',
              'resize-none overflow-y-auto transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'text-base'
            )}
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
        </div>

        {/* Send/Stop button */}
        <AnimatePresence mode="wait">
          {isStreaming ? (
            <motion.div
              key="stop"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    onClick={onStop}
                    variant="destructive"
                    size="icon"
                    className="h-11 w-11 rounded-xl bg-error hover:bg-error/90"
                  >
                    <Square className="h-5 w-5 fill-current" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Stop generation</TooltipContent>
              </Tooltip>
            </motion.div>
          ) : (
            <motion.div
              key="send"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="submit"
                    disabled={!canSend}
                    size="icon"
                    className={cn(
                      "h-11 w-11 rounded-xl transition-all duration-200",
                      canSend && "shadow-lg shadow-accent/25"
                    )}
                  >
                    <Send className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send message</TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {/* Mobile hint */}
      <p className="text-xs text-foreground-tertiary mt-2 text-center md:hidden">
        Tap Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
