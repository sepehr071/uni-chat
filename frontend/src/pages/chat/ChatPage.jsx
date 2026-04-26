import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { chatService, configService } from '../../services/chatService'
import ChatWindow from '../../components/chat/ChatWindow'
import ChatInput from '../../components/chat/ChatInput'
import ChatHeader from '../../components/chat/ChatHeader'
import ContextRail from '../../components/chat/ContextRail'
import ConfigSelector from '../../components/chat/ConfigSelector'
import BranchOptionsModal from '../../components/chat/BranchOptionsModal'
import CodeCanvasPanel from '../../components/chat/CodeCanvas/CodeCanvasPanel'
import { parseHtmlCode } from '../../components/chat/CodeCanvas'
import { useChatMessages, useChatStream, useChatBranches, useChatExport } from './hooks'
import { DEFAULT_MODELS, isQuickModel, getModelIdFromQuick, findDefaultModel } from '../../constants/models'

export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  // Fetch user's configs
  const { data: configsData } = useQuery({
    queryKey: ['configs'],
    queryFn: () => configService.getConfigs(),
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
  })

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

  return (
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
        />

        {/* ConfigSelector dropdown — triggered from composer (W1-B) or header */}
        {showConfigSelector && (
          <ConfigSelector
            configs={configs}
            selectedConfigId={selectedConfigId}
            onSelect={(configId) => {
              setSelectedConfigId(configId)
              setShowConfigSelector(false)
            }}
            onClose={() => setShowConfigSelector(false)}
          />
        )}

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
          onSend={handleSendMessage}
          onFileUpload={handleFileUpload}
          onStop={() => handleStopGeneration(streamingMessageId)}
          isStreaming={isStreaming}
          disabled={!selectedConfigId}
          selectedConfig={selectedConfig}
          configs={configs}
          onOpenConfigSelector={() => setShowConfigSelector(true)}
        />
      </div>

      {/* Focus rail (variant B) */}
      {isFocusMode && (
        <ContextRail
          conversation={conversation}
          configs={configs}
          selectedConfig={selectedConfig}
          onSelectConfig={(configId) => setSelectedConfigId(configId)}
          branches={branches}
          activeBranch={activeBranch}
          onSwitchBranch={handleSwitchBranch}
          onCreateBranch={() => handleCreateBranch()}
          attachments={[]}
          stats={null}
          messages={messages}
          onClose={() => setIsFocusMode(false)}
        />
      )}

      {/* Code Canvas side panel */}
      <CodeCanvasPanel
        isOpen={codeCanvasOpen}
        onClose={() => setCodeCanvasOpen(false)}
        initialCode={codeCanvasCode}
      />

      {/* Branch options modal */}
      <BranchOptionsModal
        isOpen={!!branchModalMessageId}
        onClose={closeBranchModal}
        onBranchInPlace={handleBranchInPlace}
        onBranchToNew={handleBranchToNewConversation}
      />
    </div>
  )
}
