import { useState, useRef, useEffect } from 'react'
import { Send, Square, Paperclip, X, Image, FileText } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { uploadService } from '../../services/userService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function ChatInput({ onSend, onStop, isStreaming, disabled }) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState([])
  const [isUploading, setIsUploading] = useState(false)
  const textareaRef = useRef(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
    }
  }, [message])

  const handleSubmit = (e) => {
    e?.preventDefault()

    if (isStreaming || disabled || (!message.trim() && attachments.length === 0)) {
      return
    }

    onSend(message.trim(), attachments.map(a => ({
      file_id: a.id,
      type: a.type,
      url: a.url,
    })))

    setMessage('')
    setAttachments([])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleFileUpload = async (files) => {
    setIsUploading(true)

    for (const file of files) {
      try {
        const isImage = file.type.startsWith('image/')
        const { upload } = isImage
          ? await uploadService.uploadImage(file)
          : await uploadService.uploadFile(file)

        setAttachments(prev => [
          ...prev,
          {
            id: upload.id,
            type: upload.type,
            name: upload.original_name,
            url: upload.url,
            thumbnail_url: upload.thumbnail_url,
          },
        ])
      } catch (error) {
        toast.error(`Failed to upload ${file.name}`)
      }
    }

    setIsUploading(false)
  }

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleFileUpload,
    noClick: true,
    noKeyboard: true,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'text/markdown': ['.md'],
    },
    maxSize: 16 * 1024 * 1024, // 16MB
  })

  return (
    <div className="border-t border-border bg-background-secondary p-4">
      {/* Drag overlay */}
      <div
        {...getRootProps()}
        className={cn(
          'relative transition-colors',
          isDragActive && 'ring-2 ring-accent ring-inset rounded-xl'
        )}
      >
        <input {...getInputProps()} />

        {isDragActive && (
          <div className="absolute inset-0 bg-accent/10 rounded-xl flex items-center justify-center z-10">
            <p className="text-accent font-medium">Drop files here</p>
          </div>
        )}

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((attachment, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-background-tertiary rounded-lg px-3 py-2 text-sm"
              >
                {attachment.type === 'image' ? (
                  <Image className="h-4 w-4 text-accent" />
                ) : (
                  <FileText className="h-4 w-4 text-accent" />
                )}
                <span className="truncate max-w-[150px] text-foreground-secondary">
                  {attachment.name}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="p-0.5 rounded hover:bg-background-elevated"
                >
                  <X className="h-3 w-3 text-foreground-tertiary" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-3">
          {/* Attach button */}
          <label className="p-2.5 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground cursor-pointer">
            <Paperclip className="h-5 w-5" />
            <input
              type="file"
              className="hidden"
              multiple
              accept="image/*,.pdf,.txt,.md"
              onChange={(e) => handleFileUpload(Array.from(e.target.files))}
              disabled={isUploading || disabled}
            />
          </label>

          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? 'Select an AI configuration to start' : 'Type a message...'}
              disabled={disabled || isStreaming}
              rows={1}
              className="w-full resize-none bg-background-tertiary rounded-xl px-4 py-3 pr-12 text-foreground placeholder:text-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-accent transition-colors disabled:opacity-50"
              style={{ maxHeight: '200px' }}
            />

            {/* Send/Stop button */}
            <div className="absolute right-2 bottom-2">
              {isStreaming ? (
                <button
                  onClick={onStop}
                  className="p-2 rounded-lg bg-error/10 text-error hover:bg-error/20 transition-colors"
                  title="Stop generating"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={disabled || (!message.trim() && attachments.length === 0)}
                  className="p-2 rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:hover:bg-accent"
                  title="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Helper text */}
        <p className="text-xs text-foreground-tertiary mt-2 text-center">
          Press Enter to send, Shift + Enter for new line
        </p>
      </div>
    </div>
  )
}
