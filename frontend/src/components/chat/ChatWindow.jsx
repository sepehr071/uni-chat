import { useEffect, useRef, useState, memo } from 'react'
import { Bot, User, Copy, RefreshCw, Check, Pencil, X, Send, History, FileText, ZoomIn, ChevronDown, GitBranch } from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import SaveToKnowledgeButton from '../knowledge/SaveToKnowledgeButton'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

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
        <div className="text-center max-w-lg">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {selectedConfig?.avatar?.type === 'emoji'
              ? selectedConfig.avatar.value
              : <Bot className="h-8 w-8 text-accent" />}
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {selectedConfig?.name || 'Start a Conversation'}
          </h2>
          <p className="text-foreground-secondary">
            {selectedConfig?.description || 'Send a message to begin chatting with your AI assistant.'}
          </p>
        </div>
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
        <div className="flex gap-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ backgroundColor: '#5c9aed20' }}
          >
            {selectedConfig?.avatar?.type === 'emoji'
              ? selectedConfig.avatar.value
              : <Bot className="h-4 w-4 text-accent" />}
          </div>
          <div className="bg-background-secondary rounded-xl px-4 py-3">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-foreground-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-foreground-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-foreground-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 p-3 rounded-full bg-accent hover:bg-accent-hover text-white shadow-lg transition-all"
          title="Scroll to bottom"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}
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
      <div
        className={cn(
          'h-8 w-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0',
          isUser
            ? 'bg-accent text-white'
            : 'bg-background-tertiary'
        )}
        style={!isUser ? { backgroundColor: '#5c9aed20' } : {}}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : config?.avatar?.type === 'emoji' ? (
          config.avatar.value
        ) : (
          <Bot className="h-4 w-4 text-accent" />
        )}
      </div>

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
                <button
                  onClick={onCancelEdit}
                  className="p-2 rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground min-w-[44px] min-h-[44px]"
                  title="Cancel editing"
                >
                  <X className="h-4 w-4" />
                </button>
                <button
                  onClick={onSubmitEdit}
                  className="p-2 rounded-lg bg-accent text-white hover:bg-accent-hover min-w-[44px] min-h-[44px]"
                  title="Save changes"
                >
                  <Send className="h-4 w-4" />
                </button>
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
                <p className="whitespace-pre-wrap">{message.content}</p>
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
              <div className="absolute -bottom-7 right-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                <button
                  onClick={() => onCopy(message.content, message._id)}
                  className="p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors"
                  title="Copy"
                >
                  {isCopied ? (
                    <Check className="h-3.5 w-3.5 text-success" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <button
                  onClick={onStartEdit}
                  className="p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {onCreateBranch && (
                  <button
                    onClick={() => onCreateBranch(message._id)}
                    className="p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors"
                    title="Create branch"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

            {/* Assistant message: Metadata & Actions row */}
            {!isUser && !isStreaming && (
              <div className="flex items-center justify-between gap-4 mt-1.5 px-1 min-h-[24px]">
                {/* Metadata - Always visible */}
                <div className="flex items-center gap-1.5 text-xs text-foreground-tertiary">
                  {message.metadata?.model_id && (
                    <span className="font-medium">{message.metadata.model_id.split('/').pop()}</span>
                  )}
                  {message.metadata?.model_id && message.metadata?.tokens && (
                    <span className="opacity-50">•</span>
                  )}
                  {message.metadata?.tokens && (
                    <span>{message.metadata.tokens.completion} tok</span>
                  )}
                  {message.created_at && (
                    <>
                      <span className="opacity-50">•</span>
                      <span>{format(new Date(message.created_at), 'HH:mm')}</span>
                    </>
                  )}
                  {message.is_edited && (
                    <span className="italic opacity-75 ml-1">(edited)</span>
                  )}
                </div>

                {/* Actions - Always visible on mobile, hover on desktop */}
                <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onCopy(message.content, message._id)}
                    className="p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors"
                    title="Copy"
                  >
                    {isCopied ? (
                      <Check className="h-3.5 w-3.5 text-success" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {conversationId && (
                    <SaveToKnowledgeButton
                      message={message}
                      conversationId={conversationId}
                      sourceType="chat"
                    />
                  )}
                  {onRegenerate && (
                    <button
                      onClick={() => onRegenerate(message._id)}
                      className="p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors"
                      title="Regenerate"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onCreateBranch && (
                    <button
                      onClick={() => onCreateBranch(message._id)}
                      className="p-1.5 rounded-md text-foreground-tertiary hover:text-foreground hover:bg-background-tertiary transition-colors"
                      title="Create branch"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                    </button>
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
            <div
              key={idx}
              className="relative group cursor-pointer"
              onClick={() => setZoomedImage(img.url)}
            >
              <img
                src={img.url}
                alt={img.name || 'Attached image'}
                className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-border"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
                <ZoomIn className="h-6 w-6 text-white drop-shadow-lg" />
              </div>
            </div>
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
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-2 bg-background-tertiary rounded-lg"
            >
              <FileText className="h-4 w-4 text-foreground-secondary" />
              <span className="text-sm text-foreground truncate max-w-[150px]">
                {file.name || 'Attached file'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Zoomed image modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setZoomedImage(null)}
        >
          <img
            src={zoomedImage}
            alt="Zoomed image"
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  )
})
