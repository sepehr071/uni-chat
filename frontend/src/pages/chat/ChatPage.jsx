import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatService, configService } from '../../services/chatService'
import { routinesService } from '../../services/routinesService'
import { useProject } from '../../context/ProjectContext'
import ChatWindow from '../../components/chat/ChatWindow'
import ChatInput from '../../components/chat/ChatInput'
import ChatHeader from '../../components/chat/ChatHeader'
import BranchOptionsModal from '../../components/chat/BranchOptionsModal'
import DLPViolationModal from '../../components/dlp/DLPViolationModal'
import { parseHtmlCode } from '../../components/chat/CodeCanvas'
import { useChatMessages, useChatStream, useChatBranches, useChatExport } from './hooks'
import { DEFAULT_MODELS, isQuickModel, getModelIdFromQuick, findDefaultModel } from '../../constants/models'
import { useRightRail } from '../../hooks/useRightRail'
import { RailDataProvider } from '../../context/RailDataContext'

export default function ChatPage() {
  const { t } = useTranslation('chat')
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { currentProject } = useProject()
  const projectId = currentProject?._id || null

  // Config state
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [showConfigSelector, setShowConfigSelector] = useState(false)

  // Focus mode — persisted in localStorage
  const [isFocusMode, setIsFocusMode] = useState(() => {
    try { return localStorage.getItem('unichat:chat-focus-mode') === '1' } catch { return false }
  })
  useEffect(() => {
    try { localStorage.setItem('unichat:chat-focus-mode', isFocusMode ? '1' : '0') } catch {}
  }, [isFocusMode])

  // Code Canvas state
  const [codeCanvasOpen, setCodeCanvasOpen] = useState(false)
  const [codeCanvasCode, setCodeCanvasCode] = useState({ html: '', css: '', js: '' })

  // Right rail — auto-suppress when chat surfaces compete (focus rail).
  // Code canvas now lives INSIDE the rail (Canvas tab), so we don't suppress
  // for it any more — the rail itself is the canvas surface.
  const { setSuppressed: setRailSuppressed } = useRightRail()
  useEffect(() => {
    setRailSuppressed(isFocusMode)
    return () => setRailSuppressed(false)
  }, [isFocusMode, setRailSuppressed])

  // DLP violation modal state
  const [dlpModal, setDlpModal] = useState(null) // { matches, highestAction, text, attachments, resolve } | null
  const requestDLPDecision = useCallback(({ matches, highestAction, text = '', attachments = [] }) => {
    return new Promise((resolve) => setDlpModal({ matches, highestAction, text, attachments, resolve }))
  }, [])

  // Composer restore (force-remount via key) when user clicks Modify on the DLP modal
  const [composerRestore, setComposerRestore] = useState({ text: '', files: [], key: 0 })

  // Prefill composer from sessionStorage (set by Workflow OutputActionBar's "Open in Chat").
  // Read once per conversation switch, then clear the key so refreshes don't repopulate.
  const composerPrefill = useMemo(() => {
    if (!conversationId) return ''
    try {
      const key = `chat_prefill_${conversationId}`
      const value = sessionStorage.getItem(key) || ''
      if (value) sessionStorage.removeItem(key)
      return value
    } catch {
      return ''
    }
  }, [conversationId])

  const handleRunCode = useCallback((code, language) => {
    const parsedCode = parseHtmlCode(code, language)
    setCodeCanvasCode(parsedCode)
    setCodeCanvasOpen(true)
  }, [])

  // Fetch conversation if ID is provided
  const { data: conversationData, isLoading: isLoadingConversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatService.getConversation(conversationId),
    enabled: !!conversationId,
    staleTime: 30000,
  })

  // Fetch user's configs (scoped to active project so the picker can group them)
  const { data: configsData } = useQuery({
    queryKey: ['configs', { projectId }],
    queryFn: () => configService.getConfigs(projectId ? { project_id: projectId } : undefined),
  })

  const configs = configsData?.configs || []
  const conversation = conversationData?.conversation

  // Set initial config from conversation or first available config
  useEffect(() => {
    if (conversation?.config_id) {
      setSelectedConfigId(conversation.config_id)
    } else if (configs.length > 0 && !selectedConfigId) {
      setSelectedConfigId(configs[0]._id)
    }
  }, [conversation, configs, selectedConfigId])

  // Custom hooks
  const {
    messages,
    setMessages,
    isStreaming,
    setIsStreaming,
    streamingContent,
    setStreamingContent,
    streamingMessageId,
    setStreamingMessageId,
    justFinishedStreamingRef,
    handleEditMessage,
    handleRegenerateMessage,
    handleFileUpload,
  } = useChatMessages({ conversationId, conversationData, queryClient })

  const userTimezone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch { return 'UTC' }
  }, [])

  const handleCreateRoutineFromChat = useCallback(async (rawText) => {
    const text = (rawText || '').trim()
    if (!text) {
      toast.error(t('routineToast.scheduleHint'))
      return
    }
    if (!selectedConfigId) {
      toast.error(t('routineToast.chooseModel'))
      return
    }

    // Optional convenience: explicit "schedule: prompt" colon split. If absent,
    // the backend extractor pulls both from the full text in a single LLM call.
    const idx = text.indexOf(':')
    let scheduleHint = null
    let explicitPrompt = null
    if (idx > 0 && idx < text.length - 1) {
      scheduleHint = text.slice(0, idx).trim()
      explicitPrompt = text.slice(idx + 1).trim()
    }

    const tid = toast.loading(t('routineToast.creating'))
    try {
      const parsed = await routinesService.parseRoutine({ text, timezone: userTimezone })
      if (!parsed?.cron_expr || !parsed?.prompt) throw new Error(t('routineToast.parseFailed'))

      const promptText = explicitPrompt || parsed.prompt
      const naturalInput = scheduleHint || text
      const name = promptText.length > 60 ? promptText.slice(0, 57) + '…' : promptText

      const payload = {
        name,
        description: null,
        enabled: true,
        schedule: {
          kind: 'cron',
          cron_expr: parsed.cron_expr,
          cron_source: 'natural',
          natural_input: naturalInput,
          timezone: userTimezone,
        },
        action: {
          kind: 'chat',
          prompt: promptText,
          config_id: selectedConfigId,
        },
        outputs: {
          chat: { enabled: true, conversation_id: null },
          knowledge: { enabled: false, folder_id: null },
          telegram: { enabled: false },
        },
      }

      const result = await routinesService.createRoutine(payload)
      toast.success(t('routineToast.created'), { id: tid })
      navigate('/routines')
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('routineToast.createFailed'), { id: tid })
    }
  }, [selectedConfigId, userTimezone, navigate, t])

  const { handleSendMessage, handleStopGeneration } = useChatStream({
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
    onCanvasIntent: (parsed) => { setCodeCanvasCode(parsed); setCodeCanvasOpen(true) },
    projectId,
    onDLPViolation: requestDLPDecision,
  })

  // Refetch conversation list when the active project changes so the sidebar
  // / history view re-scopes to the new project (or "Unfiled"). Configs query
  // already keys on projectId; invalidating ensures the chat picker refreshes
  // immediately on project switch even when the cache key happens to match.
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
    queryClient.invalidateQueries({ queryKey: ['conversations-history'] })
    queryClient.invalidateQueries({ queryKey: ['recent-conversations'] })
    queryClient.invalidateQueries({ queryKey: ['folders'] })
    queryClient.invalidateQueries({ queryKey: ['configs'] })
  }, [projectId, queryClient])

  const {
    branches,
    activeBranch,
    branchModalMessageId,
    handleCreateBranch,
    handleSwitchBranch,
    handleDeleteBranch,
    handleRenameBranch,
    handleShowBranchModal,
    closeBranchModal,
    handleBranchInPlace,
    handleBranchToNewConversation,
  } = useChatBranches({ conversationId, queryClient, setMessages, navigate })

  const { handleExport } = useChatExport(conversationId)

  // Resolve selected config (handles quick models and regular configs)
  const selectedConfig = useMemo(() => {
    if (!selectedConfigId) return null
    if (isQuickModel(selectedConfigId)) {
      const modelId = getModelIdFromQuick(selectedConfigId)
      const model = findDefaultModel(modelId)
      if (model) {
        return {
          _id: selectedConfigId,
          name: model.name,
          avatar: { type: 'emoji', value: model.avatar },
          model_id: model.id,
          isQuickModel: true,
        }
      }
    }
    return configs.find((c) => c._id === selectedConfigId)
  }, [selectedConfigId, configs])

  // Loading skeleton while fetching conversation
  if (isLoadingConversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="h-9 w-32 bg-background-tertiary rounded-lg animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </div>
    )
  }

  // Data published to the right-rail panels (Branches / Attachments / Canvas).
  // The rail itself lives at MainLayout level; we just feed it through context.
  const railValue = useMemo(() => ({
    conversation,
    configs,
    selectedConfig,
    selectedConfigId,
    onSelectConfig: setSelectedConfigId,
    branches,
    activeBranch,
    onSwitchBranch: handleSwitchBranch,
    onCreateBranch: conversationId ? () => handleCreateBranch() : null,
    attachments: [],
    stats: null,
    messages,
    codeCanvasOpen,
    codeCanvasCode,
    onCloseCanvas: () => setCodeCanvasOpen(false),
  }), [
    conversation,
    configs,
    selectedConfig,
    selectedConfigId,
    branches,
    activeBranch,
    handleSwitchBranch,
    handleCreateBranch,
    conversationId,
    messages,
    codeCanvasOpen,
    codeCanvasCode,
  ])

  return (
    <RailDataProvider value={railValue}>
    <div className="flex h-full">
      {/* Main chat column */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader
          conversation={conversation}
          branches={branches}
          activeBranch={activeBranch}
          onSwitchBranch={handleSwitchBranch}
          onDeleteBranch={handleDeleteBranch}
          onRenameBranch={handleRenameBranch}
          isFocusMode={isFocusMode}
          onToggleFocus={setIsFocusMode}
          onExportMarkdown={() => handleExport('markdown')}
          onExportJson={() => handleExport('json')}
          selectedConfig={selectedConfig}
          configs={configs}
          selectedConfigId={selectedConfigId}
          onSelectConfig={setSelectedConfigId}
          onConversationMoved={() => {
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
            queryClient.invalidateQueries({ queryKey: ['conversations-history'] })
            queryClient.invalidateQueries({ queryKey: ['recent-conversations'] })
          }}
        />

        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          selectedConfig={selectedConfig}
          conversationId={conversationId}
          onEditMessage={handleEditMessage}
          onRegenerateMessage={handleRegenerateMessage}
          onCreateBranch={conversationId ? handleShowBranchModal : null}
          onRunCode={handleRunCode}
          maxColumnWidth={isFocusMode ? 680 : 720}
          onSelectStarter={(text) => handleSendMessage(text)}
        />

        <ChatInput
          key={composerRestore.key}
          onSend={(message, files, command) => {
            if (command?.intent === 'routine') {
              handleCreateRoutineFromChat(message)
              return
            }
            handleSendMessage(message, files, command)
          }}
          onFileUpload={handleFileUpload}
          onStop={() => handleStopGeneration(streamingMessageId)}
          isStreaming={isStreaming}
          disabled={!selectedConfigId}
          selectedConfig={selectedConfig}
          selectedConfigId={selectedConfigId}
          configs={configs}
          onSelectConfig={setSelectedConfigId}
          initialMessage={composerRestore.text || composerPrefill}
          initialFiles={composerRestore.files}
        />
      </div>

      {/* Branch options modal */}
      <BranchOptionsModal
        isOpen={!!branchModalMessageId}
        onClose={closeBranchModal}
        onBranchInPlace={handleBranchInPlace}
        onBranchToNew={handleBranchToNewConversation}
      />

      {/* DLP violation modal */}
      <DLPViolationModal
        isOpen={!!dlpModal}
        onClose={() => {
          if (dlpModal) {
            setComposerRestore((prev) => ({ text: dlpModal.text || '', files: dlpModal.attachments || [], key: prev.key + 1 }))
            dlpModal.resolve(false)
            setDlpModal(null)
          }
        }}
        onModify={() => {
          if (dlpModal) {
            setComposerRestore((prev) => ({ text: dlpModal.text || '', files: dlpModal.attachments || [], key: prev.key + 1 }))
            dlpModal.resolve(false)
            setDlpModal(null)
          }
        }}
        onSendAnyway={() => { dlpModal?.resolve(true); setDlpModal(null) }}
        matches={dlpModal?.matches || []}
        highestAction={dlpModal?.highestAction || 'warn'}
      />
    </div>
    </RailDataProvider>
  )
}
