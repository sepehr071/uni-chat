import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Send, Paperclip, X, Image, File, Loader2, Square,
  Folder, Slash, History, ChevronDown
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'

// Internal helper: small pill button for action bar tools
function ToolPill({ icon: Icon, label, kbd, onClick, disabled: pillDisabled, title }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={pillDisabled ? undefined : onClick}
          disabled={pillDisabled}
          aria-label={label}
          className={cn(
            'flex items-center gap-1.5 px-2 h-7 rounded-md text-xs',
            'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
            'transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
          {kbd && (
            <kbd className="hidden sm:inline ml-0.5 px-1 py-0.5 rounded border border-border bg-background-tertiary text-foreground-tertiary text-[10px] font-mono leading-none">
              {kbd}
            </kbd>
          )}
        </button>
      </TooltipTrigger>
      {title && <TooltipContent>{title}</TooltipContent>}
    </Tooltip>
  )
}

// Derive avatar content + background for model chip
function ModelAvatar({ selectedConfig }) {
  if (!selectedConfig) {
    return (
      <span
        className="flex h-[18px] w-[18px] rounded-full items-center justify-center text-[10px] font-semibold bg-accent text-white shrink-0"
      >
        AI
      </span>
    )
  }
  const isEmoji = selectedConfig.avatar?.type === 'emoji'
  if (isEmoji) {
    return (
      <span
        className="flex h-[18px] w-[18px] rounded-full items-center justify-center text-[11px] shrink-0"
        style={{ backgroundColor: '#5c9aed20' }}
      >
        {selectedConfig.avatar.value}
      </span>
    )
  }
  // Letter avatar
  return (
    <span className="flex h-[18px] w-[18px] rounded-full items-center justify-center text-[10px] font-semibold bg-accent text-white shrink-0">
      {(selectedConfig.name?.[0] || 'A').toUpperCase()}
    </span>
  )
}

export default function ChatInput({
  onSend,
  onFileUpload,
  onStop,
  disabled = false,
  placeholder = 'Type a message...',
  isStreaming = false,
  selectedConfig,
  configs,
  onOpenConfigSelector,
  onOpenKnowledge,
  onOpenSlash,
  onOpenRecents
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

  // RTL detection — preserve from original
  const detectDir = (text) => {
    const rtlChars = /[֑-߿‏‫‮יִ-﷽ﹰ-ﻼ]/
    return rtlChars.test(text) ? 'rtl' : 'ltr'
  }

  return (
    <div className="px-3 md:px-4 pb-3 md:pb-4 bg-transparent">
      {/* Cockpit card */}
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-[720px] rounded-2xl border border-border bg-background shadow-sm overflow-hidden"
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Row 1: Attachment chips (only when files present) */}
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex flex-wrap gap-2 px-3 pt-3"
            >
              {files.map((file) => (
                <motion.div
                  key={file.name + '-' + file.size}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative group flex items-center gap-2 px-3 py-1.5 bg-background-tertiary rounded-lg border border-border"
                >
                  {isImage(file) ? (
                    <Image className="h-3.5 w-3.5 text-accent" />
                  ) : (
                    <File className="h-3.5 w-3.5 text-foreground-secondary" />
                  )}
                  <span className="text-xs text-foreground truncate max-w-[120px]">
                    {file.name || file.filename}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(file)}
                    className="h-4 w-4 rounded-full flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-background transition-opacity"
                    aria-label={`Remove ${file.name || file.filename}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row 2: Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          dir={message ? detectDir(message) : 'ltr'}
          className={cn(
            'w-full px-4 py-3',
            'border-none focus:outline-none resize-none',
            'bg-transparent text-foreground placeholder:text-foreground-tertiary',
            'overflow-y-auto transition-[height] duration-100',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'text-base'
          )}
          style={{ minHeight: '44px', maxHeight: '200px' }}
        />

        {/* Row 3: Action bar */}
        <div className="flex items-center gap-1 px-2 py-2 border-t border-border">

          {/* Model chip */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenConfigSelector}
                disabled={disabled}
                aria-label="Select AI model"
                className={cn(
                  'flex items-center gap-2 pl-1 pr-2 h-7 rounded-full',
                  'bg-background-tertiary text-xs font-medium',
                  'hover:bg-background-secondary transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <ModelAvatar selectedConfig={selectedConfig} />
                <span className="max-w-[100px] truncate text-foreground">
                  {selectedConfig?.name || 'Select AI'}
                </span>
                <ChevronDown className="h-3 w-3 text-foreground-tertiary shrink-0" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Change model</TooltipContent>
          </Tooltip>

          {/* Attach pill */}
          <ToolPill
            icon={uploading ? Loader2 : Paperclip}
            label="Attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            title="Attach file"
          />

          {/* Knowledge pill */}
          <ToolPill
            icon={Folder}
            label="Knowledge"
            onClick={onOpenKnowledge}
            disabled={!onOpenKnowledge}
            title={onOpenKnowledge ? 'Open knowledge vault' : 'Coming soon'}
          />

          {/* Slash pill */}
          <ToolPill
            icon={Slash}
            label="Slash"
            kbd="/"
            onClick={onOpenSlash}
            disabled={!onOpenSlash}
            title={onOpenSlash ? 'Slash commands' : 'Coming soon'}
          />

          {/* Recents pill */}
          <ToolPill
            icon={History}
            label="Recent"
            onClick={onOpenRecents}
            disabled={!onOpenRecents}
            title={onOpenRecents ? 'Recent prompts' : 'Coming soon'}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Keyboard hint — desktop only */}
          <span className="hidden sm:flex items-center gap-1 text-xs text-foreground-tertiary mr-2">
            <kbd className="px-1 py-0.5 rounded border border-border bg-background-tertiary text-[10px] font-mono leading-none">↵</kbd>
            <span>send</span>
            <span className="mx-0.5">·</span>
            <kbd className="px-1 py-0.5 rounded border border-border bg-background-tertiary text-[10px] font-mono leading-none">⇧↵</kbd>
            <span>newline</span>
          </span>

          {/* Send / Stop button */}
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
                    <button
                      type="button"
                      onClick={onStop}
                      aria-label="Stop generation"
                      className="h-8 w-8 rounded-md flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </button>
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
                    <button
                      type="submit"
                      disabled={!canSend}
                      aria-label="Send message"
                      className={cn(
                        'h-8 w-8 rounded-md flex items-center justify-center transition-all duration-200',
                        canSend
                          ? 'bg-accent text-white shadow-lg shadow-accent/25 hover:bg-accent/90'
                          : 'bg-background-tertiary text-foreground-tertiary cursor-not-allowed opacity-50'
                      )}
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Send message</TooltipContent>
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </form>
    </div>
  )
}
