import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'motion/react'
import {
  Send, Paperclip, X, Image, File, Loader2, Square,
  Folder, Slash, History, Plus, Cpu
} from 'lucide-react'
import * as icons from 'lucide-react'
import { cn } from '../../utils/cn'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu'
import { ModelList } from './ModelChip'
import SlashCommandMenu from './SlashCommandMenu'

export default function ChatInput({
  onSend,
  onFileUpload,
  onStop,
  disabled = false,
  placeholder,
  isStreaming = false,
  selectedConfig,
  selectedConfigId,
  configs,
  onSelectConfig,
  onOpenKnowledge,
  onOpenRecents,
  initialMessage = '',
  initialFiles = []
}) {
  const { t } = useTranslation('chat')
  const [message, setMessage] = useState(initialMessage)
  const [files, setFiles] = useState(initialFiles)
  const [uploading, setUploading] = useState(false)
  const [activeCommand, setActiveCommand] = useState(null)
  const [slashOpen, setSlashOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
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
    onSend(message.trim(), files, activeCommand)
    setMessage('')
    setFiles([])
    setActiveCommand(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
      return
    }
    // Open slash menu when typing '/' in empty textarea with no active command
    if (e.key === '/' && !message && !activeCommand) {
      e.preventDefault()
      setSlashOpen(true)
      return
    }
    // Clear active command on backspace in empty textarea
    if (e.key === 'Backspace' && !message && activeCommand) {
      e.preventDefault()
      setActiveCommand(null)
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
    const rtlChars = /[֑-߿‏‫‮יִ-﷽ﹰ-ﻼ]/
    return rtlChars.test(text) ? 'rtl' : 'ltr'
  }

  // Menu item handlers — close menu, then defer action so the dropdown unmounts
  // cleanly before any focus-stealing follow-up (file picker, modal, etc.).
  const handleAttach = () => {
    setMenuOpen(false)
    requestAnimationFrame(() => fileInputRef.current?.click())
  }
  const handleKnowledge = () => {
    setMenuOpen(false)
    if (onOpenKnowledge) requestAnimationFrame(() => onOpenKnowledge())
  }
  const handleSlash = () => {
    setMenuOpen(false)
    requestAnimationFrame(() => setSlashOpen(true))
  }
  const handleRecents = () => {
    setMenuOpen(false)
    if (onOpenRecents) requestAnimationFrame(() => onOpenRecents())
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
                    aria-label={t('input.removeFile', { name: file.name || file.filename })}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Row 2: Textarea row (with optional active-command chip) */}
        <div className="flex items-start">
          {/* Active slash-command chip */}
          <AnimatePresence>
            {activeCommand && (() => {
              const Icon = icons[activeCommand.iconName]
              return (
                <motion.div
                  key="cmd-chip"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 ms-3 mt-3 px-2 h-7 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-medium shrink-0"
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  <span>{activeCommand.label}</span>
                  <button
                    type="button"
                    onClick={() => setActiveCommand(null)}
                    aria-label={t('input.removeCommand', { name: activeCommand.label })}
                    className="ms-0.5 h-3.5 w-3.5 rounded-full flex items-center justify-center hover:bg-accent/20 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </motion.div>
              )
            })()}
          </AnimatePresence>

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeCommand ? activeCommand.placeholder : (placeholder ?? t('input.placeholder'))}
            disabled={disabled}
            rows={1}
            dir={message ? detectDir(message) : 'ltr'}
            className={cn(
              'flex-1 px-4 py-3',
              'border-none focus:outline-none resize-none',
              'bg-transparent text-foreground placeholder:text-foreground-tertiary',
              'overflow-y-auto transition-[height] duration-100',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'text-base'
            )}
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
        </div>

        {/* Row 3: Collapsed action bar — [+] menu  ·  spacer  ·  Send */}
        <div className="flex items-center gap-1 px-2 py-2 border-t border-border">
          {/* Slash menu anchor — kept inline so '/' shortcut still works */}
          <div className="relative">
            <SlashCommandMenu
              open={slashOpen}
              onOpenChange={setSlashOpen}
              onSelect={(cmd) => {
                setActiveCommand(cmd)
                setSlashOpen(false)
                textareaRef.current?.focus()
              }}
            />
          </div>

          {/* [+] DropdownMenu — Attach / Knowledge / Slash / Recents / Model */}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={t('input.moreActions')}
                    className={cn(
                      'h-8 w-8 rounded-md flex items-center justify-center',
                      'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                      'transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
                    )}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t('input.moreActions')}</TooltipContent>
            </Tooltip>

            <DropdownMenuContent side="top" align="start" sideOffset={8} className="min-w-[14rem]">
              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); handleAttach() }}
                disabled={disabled || uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                <span>{t('input.attach')}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); handleKnowledge() }}
                disabled={!onOpenKnowledge}
              >
                <Folder className="h-4 w-4" />
                <span>{t('input.knowledge')}</span>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); handleSlash() }}
              >
                <Slash className="h-4 w-4" />
                <span>{t('input.slash')}</span>
                <kbd className="ms-auto px-1 py-0.5 rounded border border-border bg-background-tertiary text-foreground-tertiary text-[10px] font-mono leading-none">/</kbd>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={(e) => { e.preventDefault(); handleRecents() }}
                disabled={!onOpenRecents}
              >
                <History className="h-4 w-4" />
                <span>{t('input.recent')}</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Cpu className="h-4 w-4" />
                  <span className="flex-1 truncate">{t('input.modelForChat')}</span>
                  <span className="ms-2 text-xs text-foreground-tertiary truncate max-w-[120px]">
                    {selectedConfig?.name || ''}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent
                    sideOffset={8}
                    className="p-0 border-0 bg-transparent shadow-none"
                  >
                    <ModelList
                      configs={configs}
                      selectedConfigId={selectedConfigId}
                      onSelectConfig={onSelectConfig}
                      onClose={() => setMenuOpen(false)}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Send / Stop button — keyboard hint lives in the Send tooltip */}
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
                      aria-label={t('input.stop')}
                      className="h-8 w-8 rounded-md flex items-center justify-center bg-error/10 text-error hover:bg-error/20 transition-colors"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('input.stop')}</TooltipContent>
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
                      aria-label={t('input.send')}
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
                  <TooltipContent>
                    <span className="flex items-center gap-1 text-xs">
                      <kbd className="px-1 py-0.5 rounded border border-border bg-background-tertiary text-[10px] font-mono leading-none">↵</kbd>
                      <span>{t('input.hintSend')}</span>
                      <span className="mx-0.5">·</span>
                      <kbd className="px-1 py-0.5 rounded border border-border bg-background-tertiary text-[10px] font-mono leading-none">⇧↵</kbd>
                      <span>{t('input.hintNewline')}</span>
                    </span>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </form>
    </div>
  )
}
