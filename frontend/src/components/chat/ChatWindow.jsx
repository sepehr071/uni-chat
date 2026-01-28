import { useEffect, useRef, useState, memo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bot, User, Copy, RefreshCw, Check, Pencil, X, Send, History, FileText, ZoomIn, ChevronDown, GitBranch, Download } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import SaveToKnowledgeButton from '../knowledge/SaveToKnowledgeButton'
import { cn } from '../../utils/cn'
import { getTextDirection } from '../../utils/rtl'
import { iconButtonVariants, fastTransition, mediumTransition } from '../../utils/animations'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Button } from '../ui/button'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../ui/dialog'
import { Badge } from '../ui/badge'

export default function ChatWindow({
  messages,
  isStreaming,
  streamingContent,
  selectedConfig,
  conversationId,
  onEditMessage,
  onRegenerateMessage,
  onCreateBranch,
  onRunCode,
}) {
  const scrollRef = useRef(null)
  const [copiedId, setCopiedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)

  // Track scroll position to show/hide scroll button
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight
      setShowScrollButton(distanceFromBottom > 200)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll to bottom on new messages (only if user is near bottom)
  useEffect(() => {
    if (scrollRef.current && !showScrollButton) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent, showScrollButton])

  // Scroll to bottom handler
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }

  const handleCopy = async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(messageId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleStartEdit = (message) => {
    setEditingId(message._id)
    setEditContent(message.content)
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const handleSubmitEdit = async (messageId) => {
    if (!editContent.trim()) {
      toast.error('Message cannot be empty')
      return
    }

    // Prevent editing messages with temporary IDs (not yet saved to DB)
    if (messageId.toString().startsWith('temp-')) {
      toast.error('Please wait for message to be saved')
      return
    }

    if (onEditMessage) {
      await onEditMessage(messageId, editContent.trim())
    }
    handleCancelEdit()
  }

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center max-w-lg"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
          >
            <Avatar size="xl" shape="square" className="mx-auto mb-4">
              <AvatarFallback className="bg-accent/10 text-accent text-2xl">
                {selectedConfig?.avatar?.type === 'emoji'
                  ? selectedConfig.avatar.value
                  : <Bot className="h-8 w-8" />}
              </AvatarFallback>
            </Avatar>
          </motion.div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {selectedConfig?.name || 'Start a Conversation'}
          </h2>
          <p className="text-foreground-secondary">
            {selectedConfig?.description || 'Send a message to begin chatting with your AI assistant.'}
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      <div ref={scrollRef} className="absolute inset-0 overflow-y-auto p-4 space-y-6">
        {messages.map((message) => (
        <MessageBubble
          key={message._id}
          message={message}
          config={selectedConfig}
          conversationId={conversationId}
          copiedId={copiedId}
          onCopy={handleCopy}
          isEditing={editingId === message._id}
          editContent={editContent}
          onEditContentChange={setEditContent}
          onStartEdit={() => handleStartEdit(message)}
          onCancelEdit={handleCancelEdit}
          onSubmitEdit={() => handleSubmitEdit(message._id)}
          onRegenerate={onRegenerateMessage}
          onCreateBranch={onCreateBranch}
          onRunCode={onRunCode}
          isStreaming={false}
        />
      ))}

      {/* Streaming message */}
      {isStreaming && streamingContent && (
        <MessageBubble
          message={{
            _id: 'streaming',
            role: 'assistant',
            content: streamingContent,
          }}
          config={selectedConfig}
          isStreaming={true}
          copiedId={copiedId}
          onCopy={handleCopy}
        />
      )}

      {/* Typing indicator */}
      {isStreaming && !streamingContent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-3"
        >
          <Avatar size="sm" shape="square" className="flex-shrink-0">
            <AvatarFallback className="bg-accent/10 text-accent">
              {selectedConfig?.avatar?.type === 'emoji'
                ? <span className="text-base">{selectedConfig.avatar.value}</span>
                : <Bot className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>
          <div className="bg-background-secondary rounded-xl px-4 py-3 shadow-sm">
            <div className="flex gap-1.5">
              <motion.span
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                className="w-2 h-2 bg-accent/60 rounded-full"
              />
              <motion.span
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.15 }}
                className="w-2 h-2 bg-accent/60 rounded-full"
              />
              <motion.span
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: 0.3 }}
                className="w-2 h-2 bg-accent/60 rounded-full"
              />
            </div>
          </div>
        </motion.div>
      )}

      </div>

      {/* Scroll to bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                className="absolute bottom-4 right-4"
              >
                <Button
                  onClick={scrollToBottom}
                  size="icon"
                  className="h-11 w-11 rounded-full shadow-lg shadow-accent/30"
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>Scroll to bottom</TooltipContent>
          </Tooltip>
        )}
      </AnimatePresence>
    </div>
  )
}

const MessageBubble = memo(function MessageBubble({
  message,
  config,
  conversationId,
  isStreaming,
  copiedId,
  onCopy,
  isEditing,
  editContent,
  onEditContentChange,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onRegenerate,
  onCreateBranch,
  onRunCode,
}) {
  const isUser = message.role === 'user'
  const isCopied = copiedId === message._id
  const textareaRef = useRef(null)

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
      textareaRef.current.focus()
    }
  }, [isEditing, editContent])

  // Handle keyboard shortcuts in edit mode
  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancelEdit()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      onSubmitEdit()
    }
  }

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <Avatar size="sm" shape="square" className="flex-shrink-0">
        <AvatarFallback
          className={cn(
            isUser
              ? 'bg-accent text-white'
              : 'bg-accent/10 text-accent'
          )}
        >
          {isUser ? (
            <User className="h-4 w-4" />
          ) : config?.avatar?.type === 'emoji' ? (
            <span className="text-base">{config.avatar.value}</span>
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>

      {/* Message content */}
      <div className={cn('flex flex-col gap-1 max-w-[80%]', isUser && 'items-end')}>
        {isEditing ? (
          /* Edit Mode */
          <div className="w-full">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full bg-background-secondary border border-accent rounded-xl px-3 py-2 md:px-4 md:py-3 text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 text-base"
              placeholder="Edit your message..."
              rows={1}
              style={{ minHeight: '60px' }}
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-xs text-foreground-tertiary hidden sm:inline">
                Ctrl+Enter to save, Esc to cancel
              </span>
              <div className="flex gap-2 ml-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={onCancelEdit}
                      className="h-10 w-10"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Cancel (Esc)</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      onClick={onSubmitEdit}
                      className="h-10 w-10"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Save (Ctrl+Enter)</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        ) : (
          /* View Mode */
          <>
            {/* Attachments (images/files) */}
            {message.attachments && message.attachments.length > 0 && (
              <AttachmentPreview attachments={message.attachments} isUser={isUser} />
            )}

            {/* Group wrapper for hover actions */}
            <div className="group">
            <div
              className={cn(
                'rounded-xl px-4 py-3 relative',
                isUser
                  ? 'bg-accent text-white'
                  : 'bg-background-secondary text-foreground'
              )}
            >
              {isUser ? (
                <p
                  className="whitespace-pre-wrap"
                  dir={getTextDirection(message.content)}
                  style={getTextDirection(message.content) === 'rtl' ? { fontFamily: "'Vazirmatn', 'Inter', system-ui, sans-serif" } : {}}
                >
                  {message.content}
                </p>
              ) : (
              <div className="markdown-content">
                <MarkdownRenderer content={message.content} onRunCode={onRunCode} />
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-accent animate-pulse ml-1" />
                )}
              </div>
            )}

            {/* Edit indicator */}
            {message.is_edited && isUser && (
              <div className="absolute -top-1 -right-1">
                <div className="p-1 rounded-full bg-background-tertiary" title="Edited">
                  <History className="h-2.5 w-2.5 text-foreground-tertiary" />
                </div>
              </div>
            )}

            {/* User message actions - hover to show */}
            {!isStreaming && isUser && (
              <div className="absolute -bottom-8 right-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-background-elevated/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-border/50">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onCopy(message.content, message._id)}
                      className="h-7 w-7"
                    >
                      {isCopied ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isCopied ? 'Copied!' : 'Copy'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onStartEdit}
                      className="h-7 w-7"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit</TooltipContent>
                </Tooltip>
                {onCreateBranch && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onCreateBranch(message._id)}
                        className="h-7 w-7"
                      >
                        <GitBranch className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Create branch</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </div>

            {/* Assistant message: Metadata & Actions row */}
            {!isUser && !isStreaming && (
              <div className="flex items-center justify-between gap-4 mt-2 px-1 min-h-[28px]">
                {/* Metadata - Always visible */}
                <div className="flex items-center gap-1.5 text-xs text-foreground-tertiary">
                  {message.metadata?.model_id && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                      {message.metadata.model_id.split('/').pop()}
                    </Badge>
                  )}
                  {message.metadata?.tokens && (
                    <span className="opacity-70">{message.metadata.tokens.completion} tok</span>
                  )}
                  {message.created_at && (
                    <>
                      <span className="opacity-40">•</span>
                      <span className="opacity-70">{format(new Date(message.created_at), 'HH:mm')}</span>
                    </>
                  )}
                  {message.is_edited && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 opacity-70">
                      edited
                    </Badge>
                  )}
                </div>

                {/* Actions - Always visible on mobile, hover on desktop */}
                <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-background-elevated/80 backdrop-blur-sm rounded-lg p-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onCopy(message.content, message._id)}
                        className="h-7 w-7"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isCopied ? 'Copied!' : 'Copy'}</TooltipContent>
                  </Tooltip>
                  {conversationId && (
                    <SaveToKnowledgeButton
                      message={message}
                      conversationId={conversationId}
                      sourceType="chat"
                    />
                  )}
                  {onRegenerate && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRegenerate(message._id)}
                          className="h-7 w-7 group/regen"
                        >
                          <RefreshCw className="h-3.5 w-3.5 transition-transform group-hover/regen:rotate-180 duration-300" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Regenerate</TooltipContent>
                    </Tooltip>
                  )}
                  {onCreateBranch && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onCreateBranch(message._id)}
                          className="h-7 w-7"
                        >
                          <GitBranch className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Create branch</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparator for memoization - only re-render when necessary
  return (
    prevProps.message._id === nextProps.message._id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
    prevProps.isStreaming === nextProps.isStreaming &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.editContent === nextProps.editContent &&
    prevProps.copiedId === nextProps.copiedId &&
    prevProps.config?._id === nextProps.config?._id
  )
})

// Component to display attachments (images, PDFs, etc.)
const AttachmentPreview = memo(function AttachmentPreview({ attachments, isUser }) {
  const [zoomedImage, setZoomedImage] = useState(null)

  const isImage = (attachment) => {
    return attachment.type?.startsWith('image/') || attachment.mime_type?.startsWith('image/')
  }

  const images = attachments.filter(isImage)
  const files = attachments.filter(a => !isImage(a))

  return (
    <>
      {/* Image attachments */}
      {images.length > 0 && (
        <div className={cn(
          'flex flex-wrap gap-2 mb-2',
          isUser && 'justify-end'
        )}>
          {images.map((img, idx) => (
            <motion.div
              key={idx}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative group cursor-pointer overflow-hidden rounded-xl shadow-sm"
              onClick={() => setZoomedImage(img.url)}
            >
              <img
                src={img.url}
                alt={img.name || 'Attached image'}
                className="max-w-[200px] max-h-[200px] object-cover border border-border rounded-xl transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-end justify-center pb-3">
                <Badge variant="secondary" className="bg-white/90 text-foreground shadow-lg">
                  <ZoomIn className="h-3 w-3 mr-1" />
                  View
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* File attachments (PDFs, etc.) */}
      {files.length > 0 && (
        <div className={cn(
          'flex flex-wrap gap-2 mb-2',
          isUser && 'justify-end'
        )}>
          {files.map((file, idx) => (
            <Badge
              key={idx}
              variant="secondary"
              className="px-3 py-2 h-auto gap-2"
            >
              <FileText className="h-4 w-4" />
              <span className="truncate max-w-[150px]">
                {file.name || 'Attached file'}
              </span>
            </Badge>
          ))}
        </div>
      )}

      {/* Zoomed image modal */}
      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden"
          showClose={false}
        >
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
          <div className="relative flex items-center justify-center min-h-[50vh]">
            <img
              src={zoomedImage}
              alt="Zoomed image"
              className="max-h-[85vh] max-w-[90vw] object-contain"
            />
            {/* Action buttons */}
            <div className="absolute top-4 right-4 flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 bg-white/10 hover:bg-white/20 text-white border-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      const link = document.createElement('a')
                      link.href = zoomedImage
                      link.download = 'image.png'
                      link.click()
                    }}
                  >
                    <Download className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-10 w-10 bg-white/10 hover:bg-white/20 text-white border-0"
                    onClick={() => setZoomedImage(null)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
