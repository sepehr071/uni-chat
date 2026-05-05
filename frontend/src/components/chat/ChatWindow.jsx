import { useEffect, useRef, useState, memo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import {
  Bot, Copy, Check, Pencil, X, Send, History,
  FileText, ZoomIn, ChevronDown, GitBranch, Download,
} from 'lucide-react'
import MarkdownRenderer from './MarkdownRenderer'
import MessageActions from './MessageActions'
import ModelDivider from './ModelDivider'
import StreamingTurn from './StreamingTurn'
import SaveToKnowledgeButton from '../knowledge/SaveToKnowledgeButton'
import { cn } from '../../utils/cn'
import { getTextDirection } from '../../utils/rtl'
import { fastTransition } from '../../utils/animations'
import toast from 'react-hot-toast'
import { fmtDate } from '../../utils/dateLocale'
import { Button } from '../ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '../ui/dialog'
import { Badge } from '../ui/badge'
import { useAuth } from '../../context/AuthContext'

// StarterPrompts is created by W1-A — import gracefully; build succeeds once that file lands.
let StarterPrompts
try {
  // Dynamic require keeps this non-fatal when file is absent during dev.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  StarterPrompts = require('./StarterPrompts').default
} catch {
  StarterPrompts = null
}

/* ─── Blinking cursor keyframes injected once ──────────────────────── */
if (typeof document !== 'undefined') {
  const STYLE_ID = 'chat-blink-keyframes'
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `@keyframes chat-blink { 0%,100%{opacity:1} 50%{opacity:0} }`
    document.head.appendChild(style)
  }
}

/* ─── Model-name helper ─────────────────────────────────────────────── */
function extractModelName(message) {
  return (
    message?.metadata?.model_id?.split('/')?.pop() ||
    message?.config_name ||
    message?.model_name ||
    null
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   ChatWindow
   ═══════════════════════════════════════════════════════════════════════ */
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
  // New props (audit)
  maxColumnWidth = 720,
  onSelectStarter,
  onStop,
  onSaveToKnowledge,
}) {
  const { user } = useAuth()
  const scrollRef = useRef(null)
  const [copiedId, setCopiedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [showScrollButton, setShowScrollButton] = useState(false)

  /* ── Scroll tracking ── */
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200)
    }
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (scrollRef.current && !showScrollButton) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamingContent, showScrollButton])

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }

  /* ── Copy ── */
  const handleCopy = useCallback(async (content, messageId) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedId(messageId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }, [])

  /* ── Edit ── */
  const handleStartEdit = useCallback((message) => {
    setEditingId(message._id)
    setEditContent(message.content)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditContent('')
  }, [])

  const handleSubmitEdit = async (messageId) => {
    if (!editContent.trim()) { toast.error('Message cannot be empty'); return }
    if (messageId.toString().startsWith('temp-')) {
      toast.error('Please wait for message to be saved'); return
    }
    if (onEditMessage) await onEditMessage(messageId, editContent.trim())
    handleCancelEdit()
  }

  const { t } = useTranslation('chat')

  /* ── Empty state ── */
  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        {StarterPrompts ? (
          <StarterPrompts
            assistantName={selectedConfig?.name || 'AI'}
            recentConversations={[]}
            onSelectStarter={(text) => onSelectStarter?.(text)}
          />
        ) : (
          /* Fallback until W1-A's file lands */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={fastTransition}
            className="text-center max-w-lg"
          >
            <div className="w-10 h-10 rounded-full bg-accent/10 text-accent grid place-items-center mx-auto mb-4 text-xl">
              {selectedConfig?.avatar?.type === 'emoji'
                ? selectedConfig.avatar.value
                : <Bot className="h-5 w-5" />}
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {selectedConfig?.name || t('window.startConversation')}
            </h2>
            <p className="text-foreground-secondary text-sm">
              {selectedConfig?.description || t('window.startDesc')}
            </p>
          </motion.div>
        )}
      </div>
    )
  }

  /* ── Derive user display name ── */
  const userName = user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'N'
  const userDisplayName = user?.name || 'You'
  const assistantName = selectedConfig?.name || 'AI'

  return (
    <div className="flex-1 relative">
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto py-6"
        aria-live="polite"
        aria-label="Chat messages"
      >
        <div
          className="mx-auto px-4 space-y-7"
          style={{ maxWidth: maxColumnWidth }}
        >
          {messages.map((message, idx) => {
            /* Model divider: show when assistant model changes */
            const prevAssistantModel =
              idx > 0 ? extractModelName(messages[idx - 1]) : null
            const thisModel = extractModelName(message)
            const showDivider =
              message.role === 'assistant' &&
              prevAssistantModel !== null &&
              thisModel !== null &&
              prevAssistantModel !== thisModel

            return (
              <div key={message._id}>
                {showDivider && <ModelDivider modelName={thisModel} />}
                <QuietMessage
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
                  userName={userDisplayName}
                  userInitial={userName}
                  assistantName={assistantName}
                />
              </div>
            )
          })}

          {/* Streaming turn */}
          {isStreaming && (
            <StreamingTurn
              content={streamingContent}
              config={selectedConfig}
              onStop={onStop}
              onRunCode={onRunCode}
            />
          )}
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                className="absolute bottom-4 end-4"
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
            <TooltipContent>{t('window.scrollToBottom')}</TooltipContent>
          </Tooltip>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════
   QuietMessage — no bubbles, avatar + role label + prose layout
   ═══════════════════════════════════════════════════════════════════════ */
const QuietMessage = memo(function QuietMessage({
  message,
  config,
  conversationId,
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
  userName,
  userInitial,
  assistantName,
}) {
  const { t } = useTranslation('chat')
  const isUser = message.role === 'user'
  const isCopied = copiedId === message._id
  const textareaRef = useRef(null)

  /* Textarea auto-resize */
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
      textareaRef.current.focus()
    }
  }, [isEditing, editContent])

  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') onCancelEdit()
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmitEdit()
  }

  /* Avatar */
  const avatarEmoji = !isUser && config?.avatar?.type === 'emoji'
    ? config.avatar.value
    : null
  const assistantInitial = (config?.name?.[0] || 'A').toUpperCase()

  const timestamp = message.created_at
    ? fmtDate(new Date(message.created_at), 'HH:mm')
    : null

  return (
    <div className="group flex gap-3 items-start">
      {/* Avatar 24×24 */}
      {isUser ? (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-foreground text-white text-[11px] font-semibold grid place-items-center">
          {userInitial}
        </div>
      ) : (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/10 text-accent-hover grid place-items-center text-[11px] font-semibold">
          {avatarEmoji
            ? <span className="text-sm leading-none">{avatarEmoji}</span>
            : (assistantInitial || <Bot className="h-3.5 w-3.5" />)}
        </div>
      )}

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {/* Role label + timestamp */}
        <div className="text-xs font-medium text-foreground-tertiary mb-1 flex items-center gap-1">
          <span>{isUser ? userName : assistantName}</span>
          {message.is_edited && (
            <span className="opacity-60 ms-1">{t('window.edited')}</span>
          )}
          {timestamp && (
            <span className="ml-2 opacity-70">{timestamp}</span>
          )}
          {/* Token metadata for assistant */}
          {!isUser && message.metadata?.tokens && (
            <span className="ms-2 opacity-60">
              {t('window.tokens', { count: message.metadata.tokens.completion })}
            </span>
          )}
        </div>

        {/* Attachments above body */}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentPreview attachments={message.attachments} />
        )}

        {isEditing ? (
          /* ── Edit mode ── */
          <div className="w-full">
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => onEditContentChange(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="w-full bg-background-secondary border border-accent rounded-xl px-3 py-2 md:px-4 md:py-3 text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 text-base"
              placeholder={t('window.editPlaceholder')}
              rows={1}
              style={{ minHeight: '60px' }}
            />
            <div className="flex items-center justify-between mt-2 gap-2">
              <span className="text-xs text-foreground-tertiary hidden sm:inline">
                {t('window.editHint')}
              </span>
              <div className="flex gap-2 ms-auto">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="secondary" size="icon" onClick={onCancelEdit} className="h-10 w-10">
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('window.cancelEdit')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button size="icon" onClick={onSubmitEdit} className="h-10 w-10">
                      <Send className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('window.saveEdit')}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <>
            {/* Message body */}
            <div className="text-[15px] leading-[1.65] text-foreground">
              {isUser ? (
                <p
                  className="whitespace-pre-wrap"
                  dir={getTextDirection(message.content)}
                  style={
                    getTextDirection(message.content) === 'rtl'
                      ? { fontFamily: "'Vazirmatn', 'Inter', system-ui, sans-serif" }
                      : {}
                  }
                >
                  {message.content}
                </p>
              ) : (
                <div className="markdown-content">
                  <MarkdownRenderer content={message.content} onRunCode={onRunCode} />
                </div>
              )}
            </div>

            {/* Persistent action bar — always visible */}
            <MessageActions
              messageId={message._id}
              content={message.content}
              role={message.role}
              conversationId={conversationId}
              message={message}
              isCopied={isCopied}
              onCopy={onCopy}
              onEdit={onStartEdit}
              onRegenerate={onRegenerate}
              onCreateBranch={onCreateBranch}
            />
          </>
        )}
      </div>
    </div>
  )
}, (prev, next) => (
  prev.message._id === next.message._id &&
  prev.message.content === next.message.content &&
  prev.message.is_edited === next.message.is_edited &&
  prev.isEditing === next.isEditing &&
  prev.editContent === next.editContent &&
  prev.copiedId === next.copiedId &&
  prev.config?._id === next.config?._id &&
  prev.onRegenerate === next.onRegenerate &&
  prev.onCreateBranch === next.onCreateBranch
))

/* ═══════════════════════════════════════════════════════════════════════
   AttachmentPreview (unchanged behavior, re-aligned to quiet layout)
   ═══════════════════════════════════════════════════════════════════════ */
const AttachmentPreview = memo(function AttachmentPreview({ attachments }) {
  const { t } = useTranslation('chat')
  const [zoomedImage, setZoomedImage] = useState(null)

  const isImage = (a) =>
    a.type?.startsWith('image/') || a.mime_type?.startsWith('image/')

  const images = attachments.filter(isImage)
  const files = attachments.filter((a) => !isImage(a))

  return (
    <>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
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

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {files.map((file, idx) => (
            <Badge key={idx} variant="secondary" className="px-3 py-2 h-auto gap-2">
              <FileText className="h-4 w-4" />
              <span className="truncate max-w-[150px]">{file.name || 'Attached file'}</span>
            </Badge>
          ))}
        </div>
      )}

      <Dialog open={!!zoomedImage} onOpenChange={() => setZoomedImage(null)}>
        <DialogContent
          className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden"
          showClose={false}
        >
          <DialogTitle className="sr-only">{t('window.imagePreview')}</DialogTitle>
          <div className="relative flex items-center justify-center min-h-[50vh]">
            <img
              src={zoomedImage}
              alt={t('window.imagePreview')}
              className="max-h-[85vh] max-w-[90vw] object-contain"
            />
            <div className="absolute top-4 end-4 flex gap-2">
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
                <TooltipContent>{t('window.download')}</TooltipContent>
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
                <TooltipContent>{t('window.close')}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
