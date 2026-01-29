import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Settings2, Loader2, Download, FileText, FileJson } from 'lucide-react'
import { cn } from '../../utils/cn'
import { chatService, configService } from '../../services/chatService'
import ChatWindow from '../../components/chat/ChatWindow'
import ChatInput from '../../components/chat/ChatInput'
import ConfigSelector from '../../components/chat/ConfigSelector'
import BranchSelector from '../../components/chat/BranchSelector'
import BranchOptionsModal from '../../components/chat/BranchOptionsModal'
import CodeCanvasPanel from '../../components/chat/CodeCanvas/CodeCanvasPanel'
import { parseHtmlCode } from '../../components/chat/CodeCanvas'
import { useChatMessages, useChatStream, useChatBranches, useChatExport } from './hooks'
import { DEFAULT_MODELS, isQuickModel, getModelIdFromQuick, findDefaultModel } from '../../constants/models'

export default function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // Config state (UI-specific, stays here)
  const [selectedConfigId, setSelectedConfigId] = useState(null)
  const [showConfigSelector, setShowConfigSelector] = useState(false)

  // Code Canvas state
  const [codeCanvasOpen, setCodeCanvasOpen] = useState(false)
  const [codeCanvasCode, setCodeCanvasCode] = useState({ html: '', css: '', js: '' })

  // Handle running code in Code Canvas
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
    staleTime: 30000, // 30s - streaming updates cache directly via setQueryData
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
    handleFileUpload
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
    setShowConfigSelector
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
    handleBranchToNewConversation
  } = useChatBranches({ conversationId, queryClient, setMessages, navigate })

  const { showExportMenu, setShowExportMenu, handleExport } = useChatExport(conversationId)

  // Get selected config - handles both regular configs and quick models
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
          isQuickModel: true
        }
      }
    }
    return configs.find(c => c._id === selectedConfigId)
  }, [selectedConfigId, configs])

  // Show loading skeleton when loading conversation
  if (isLoadingConversation) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="h-9 w-32 bg-background-tertiary rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
        </div>
      </div>
    )
  }

  // No longer block on empty configs - quick models are always available

  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Chat Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          {/* Config indicator */}
          <button
            onClick={() => setShowConfigSelector(!showConfigSelector)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-tertiary hover:bg-background-elevated transition-colors"
          >
            <div
              className="h-6 w-6 rounded-lg flex items-center justify-center text-xs font-medium"
              style={{ backgroundColor: '#5c9aed20', color: '#5c9aed' }}
            >
              {selectedConfig?.avatar?.type === 'emoji'
                ? selectedConfig.avatar.value
                : selectedConfig?.name?.[0]?.toUpperCase() || 'AI'}
            </div>
            <span className="text-sm font-medium text-foreground">
              {selectedConfig?.name || 'Select AI'}
            </span>
            <Settings2 className="h-4 w-4 text-foreground-tertiary" />
          </button>

          {conversation && (
            <span
              className={cn(
                "text-sm text-foreground-secondary truncate",
                "max-w-[150px] sm:max-w-[200px] md:max-w-[300px]"
              )}
              data-testid="conversation-title"
            >
              {conversation.title}
            </span>
          )}
        </div>

        {conversation && (
          <div className="flex items-center gap-1">
            {/* Export Menu */}
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                title="Export conversation"
              >
                <Download className="h-4 w-4" />
              </button>

              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-48 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                    <button
                      onClick={() => handleExport('markdown')}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                    >
                      <FileText className="h-4 w-4" />
                      Export as Markdown
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                    >
                      <FileJson className="h-4 w-4" />
                      Export as JSON
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Config Selector Dropdown */}
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

      {/* Branch Selector - show when multiple branches exist */}
      {branches.length > 1 && (
        <div className="px-4 py-2 border-b border-border bg-background-secondary/50">
          <BranchSelector
            branches={branches}
            activeBranch={activeBranch}
            onSwitch={handleSwitchBranch}
            onDelete={handleDeleteBranch}
            onRename={handleRenameBranch}
          />
        </div>
      )}

      {/* Chat Window */}
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
      />

      {/* Chat Input */}
      <ChatInput
        onSend={handleSendMessage}
        onFileUpload={handleFileUpload}
        onStop={() => handleStopGeneration(streamingMessageId)}
        isStreaming={isStreaming}
        disabled={!selectedConfigId}
      />
      </div>

      {/* Code Canvas Side Panel */}
      <CodeCanvasPanel
        isOpen={codeCanvasOpen}
        onClose={() => setCodeCanvasOpen(false)}
        initialCode={codeCanvasCode}
      />

      {/* Branch Options Modal */}
      <BranchOptionsModal
        isOpen={!!branchModalMessageId}
        onClose={closeBranchModal}
        onBranchInPlace={handleBranchInPlace}
        onBranchToNew={handleBranchToNewConversation}
      />
    </div>
  )
}
