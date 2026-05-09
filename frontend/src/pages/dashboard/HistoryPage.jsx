import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Search,
  MessageSquare,
  Clock,
  Archive,
  Trash2,
  MoreVertical,
  FileText,
  User,
  Bot,
} from 'lucide-react'
import { chatService } from '../../services/chatService'
import { useProject } from '../../context/ProjectContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { fmtDate } from '../../utils/dateLocale'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

export default function HistoryPage() {
  const { t } = useTranslation('dashboard')
  const navigate = useNavigate()
  const { currentProject } = useProject()
  const { currentWorkspace } = useWorkspace()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInMessages, setSearchInMessages] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState('project')

  // Only filter by project_id when scope='project' AND a project is actually
  // selected. Previously this sent the literal string "null" which the backend
  // strict-matches against {project_id: null}, hiding every chat that has a
  // real project_id. With no project active, fall through to "all" scope.
  const projectFilterParam = (scope === 'project' && currentProject?._id) || undefined

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conversations-history', showArchived, page, scope, currentProject?._id, currentWorkspace?._id],
    queryFn: () => chatService.getConversations({
      archived: showArchived,
      page,
      limit: 20,
      ...(projectFilterParam ? { project_id: projectFilterParam } : {}),
    }),
  })

  const { data: messageSearchData, isLoading: isSearchingMessages } = useQuery({
    queryKey: ['message-search', searchQuery],
    queryFn: () => chatService.searchMessages(searchQuery),
    enabled: searchInMessages && searchQuery.length >= 2,
  })

  const conversations = data?.conversations || []
  const total = data?.total || 0
  const hasMore = data?.has_more || false

  const filteredConversations = useMemo(() => {
    if (!searchQuery || searchInMessages) return conversations
    return conversations.filter(conv =>
      conv.title?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [conversations, searchQuery, searchInMessages])

  const groupedMessageResults = useMemo(() => {
    if (!messageSearchData?.results) return []

    const groups = {}
    messageSearchData.results.forEach(msg => {
      const convId = msg.conversation_id
      if (!groups[convId]) {
        groups[convId] = {
          conversationId: convId,
          conversationTitle: msg.conversation_title,
          messages: []
        }
      }
      groups[convId].messages.push(msg)
    })

    return Object.values(groups)
  }, [messageSearchData])

  const highlightMatch = (text, query) => {
    if (!query || query.length < 2) return text

    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-accent-muted text-foreground px-0.5 rounded">{part}</mark>
        : part
    )
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchInMessages && searchQuery.length < 2) {
      toast.error(t('history.minCharsToSearch'))
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('history.title')}</h1>
            <p className="text-foreground-secondary mt-1">
              {t('history.totalConversations_other', { count: total })}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <Input
                type="text"
                placeholder={searchInMessages ? t('history.searchMessagesPlaceholder') : t('history.searchTitlesPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="ps-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setSearchInMessages(!searchInMessages)}
                variant={searchInMessages ? 'default' : 'secondary'}
                className="gap-2 whitespace-nowrap"
              >
                <FileText className="h-4 w-4" />
                {searchInMessages ? t('history.searchMessages') : t('history.searchTitles')}
              </Button>
              <Button
                onClick={() => setShowArchived(!showArchived)}
                variant={showArchived ? 'default' : 'secondary'}
                className="gap-2"
              >
                <Archive className="h-4 w-4" />
                {showArchived ? t('history.archived') : t('history.active')}
              </Button>
              <Button
                onClick={() => setScope(scope === 'project' ? 'all' : 'project')}
                variant={scope === 'project' ? 'default' : 'secondary'}
                className="gap-2 whitespace-nowrap"
                title={scope === 'project' ? t('history.allScopes') : t('history.allScopes')}
              >
                {scope === 'project'
                  ? (currentProject?.name || t('history.unfiled'))
                  : t('history.allScopes')}
              </Button>
            </div>
          </div>

          {searchInMessages && searchQuery && (
            <p className="text-sm text-foreground-secondary">
              {isSearchingMessages
                ? t('history.searching')
                : t('history.foundMessages', { count: messageSearchData?.total || 0, query: searchQuery })}
            </p>
          )}
        </div>

        {searchInMessages && searchQuery.length >= 2 ? (
          isSearchingMessages ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : groupedMessageResults.length === 0 ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
              <h3 className="text-lg font-medium text-foreground mb-1">{t('history.noMessagesFound')}</h3>
              <p className="text-foreground-secondary">
                {t('history.noMessagesFoundDesc')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedMessageResults.map((group) => (
                <Card key={group.conversationId} className="p-4">
                  <div
                    className="flex items-center gap-2 pb-3 border-b border-border cursor-pointer hover:text-accent transition-colors"
                    onClick={() => navigate(`/chat/${group.conversationId}`)}
                  >
                    <MessageSquare className="h-4 w-4 text-accent" />
                    <span className="font-medium text-foreground">
                      {group.conversationTitle || t('history.untitled')}
                    </span>
                    <span className="text-sm text-foreground-tertiary">
                      {t('history.matchCount_other', { count: group.messages.length })}
                    </span>
                  </div>
                  <div className="space-y-2 pt-3">
                    {group.messages.slice(0, 3).map((msg) => (
                      <MessageSearchResult
                        key={msg._id}
                        message={msg}
                        query={searchQuery}
                        highlightMatch={highlightMatch}
                        onClick={() => navigate(`/chat/${group.conversationId}`)}
                      />
                    ))}
                    {group.messages.length > 3 && (
                      <Button
                        variant="link"
                        onClick={() => navigate(`/chat/${group.conversationId}`)}
                        className="text-sm text-accent hover:underline p-0 h-auto"
                      >
                        {t('history.viewMoreMatches', { count: group.messages.length - 3 })}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          <>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-12">
                <MessageSquare className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
                <h3 className="text-lg font-medium text-foreground mb-1">
                  {searchQuery ? t('history.noMatchesFound') : t('history.noConversationsFound')}
                </h3>
                {searchQuery ? (
                  <p className="text-foreground-secondary mb-4">
                    {t('history.tryDifferentTerm')}
                  </p>
                ) : (() => {
                  let emptyMsg
                  let extraCta = null
                  if (showArchived) {
                    emptyMsg = t('history.noArchivedConversations')
                  } else if (scope === 'project') {
                    const scopeName = currentProject?.name || t('history.unfiled')
                    emptyMsg = t('history.noConversationsInScope', { scope: scopeName })
                    extraCta = (
                      <Button variant="link" className="mt-1 h-auto p-0" onClick={() => setScope('all')}>
                        {t('history.switchToAllScopes')}
                      </Button>
                    )
                  } else {
                    emptyMsg = t('history.noConversationsYet')
                  }
                  return (
                    <>
                      <p className="text-foreground-secondary mb-4">{emptyMsg}</p>
                      {extraCta}
                      {!showArchived && scope !== 'project' && (
                        <Button asChild className="mt-4">
                          <Link to="/chat">{t('dashboard.recentConversations.startChat')}</Link>
                        </Button>
                      )}
                    </>
                  )
                })()}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conv) => (
                  <ConversationCard key={conv._id} conversation={conv} onUpdate={refetch} />
                ))}
              </div>
            )}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => setPage(p => p + 1)}
                  variant="secondary"
                >
                  {t('history.loadMore')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MessageSearchResult({ message, query, highlightMatch, onClick }) {
  const { t } = useTranslation('dashboard')

  const getSnippet = (content, query) => {
    const lowerContent = content.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const matchIndex = lowerContent.indexOf(lowerQuery)

    if (matchIndex === -1) return content.slice(0, 200)

    const start = Math.max(0, matchIndex - 50)
    const end = Math.min(content.length, matchIndex + query.length + 100)

    let snippet = content.slice(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < content.length) snippet = snippet + '...'

    return snippet
  }

  return (
    <div
      className="p-3 rounded-lg bg-background-tertiary hover:bg-background-elevated cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-1">
        {message.role === 'user' ? (
          <User className="h-3 w-3 text-foreground-tertiary" />
        ) : (
          <Bot className="h-3 w-3 text-accent" />
        )}
        <span className="text-xs text-foreground-tertiary capitalize">{message.role}</span>
        <span className="text-xs text-foreground-tertiary">•</span>
        <span className="text-xs text-foreground-tertiary">
          {fmtDate(new Date(message.created_at), 'MMM d, yyyy')}
        </span>
      </div>
      <p className="text-sm text-foreground-secondary line-clamp-2">
        {highlightMatch(getSnippet(message.content, query), query)}
      </p>
    </div>
  )
}

function ConversationCard({ conversation, onUpdate }) {
  const { t } = useTranslation('dashboard')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    try {
      await chatService.deleteConversation(conversation._id)
      onUpdate()
      toast.success(t('history.conversationDeleted'))
    } catch (error) {
      toast.error(t('history.failedToDelete'))
    }
  }

  const handleArchive = async () => {
    try {
      await chatService.archiveConversation(conversation._id)
      onUpdate()
      toast.success(conversation.is_archived ? t('history.conversationUnarchived') : t('history.conversationArchived'))
    } catch (error) {
      toast.error(t('history.failedToUpdate'))
    }
  }

  return (
    <Card className="p-4 hover:border-border-light transition-colors group">
      <div className="flex items-center justify-between">
        <Link
          to={`/chat/${conversation._id}`}
          className="flex items-center gap-3 flex-1 min-w-0"
        >
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate">
              {conversation.title || t('history.untitled')}
            </p>
            <div className="flex items-center gap-3 text-sm text-foreground-secondary">
              <span>{conversation.message_count} messages</span>
              <span className="text-foreground-tertiary">•</span>
              <span>{conversation.token_count?.total?.toLocaleString() || 0} tokens</span>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-foreground-tertiary">
            <Clock className="h-4 w-4" />
            {fmtDate(new Date(conversation.last_message_at || conversation.created_at), 'MMM d')}
          </div>

          {conversation.tags?.length > 0 && (
            <div className="hidden sm:flex gap-1">
              {conversation.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground-tertiary hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="h-4 w-4 me-2" />
                {conversation.is_archived ? t('history.unarchive') : t('history.archive')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-error focus:text-error"
              >
                <Trash2 className="h-4 w-4 me-2" />
                {t('history.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={t('history.deleteConversation.title')}
        message={t('history.deleteConversation.message')}
        confirmText={t('history.deleteConversation.confirm')}
        cancelText={t('history.deleteConversation.cancel')}
        variant="danger"
      />
    </Card>
  )
}
