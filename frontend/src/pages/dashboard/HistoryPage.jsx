import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
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
import { format } from 'date-fns'
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
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInMessages, setSearchInMessages] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)

  // Regular conversation search
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conversations-history', showArchived, page],
    queryFn: () => chatService.getConversations({
      archived: showArchived,
      page,
      limit: 20,
    }),
  })

  // Message content search
  const { data: messageSearchData, isLoading: isSearchingMessages } = useQuery({
    queryKey: ['message-search', searchQuery],
    queryFn: () => chatService.searchMessages(searchQuery),
    enabled: searchInMessages && searchQuery.length >= 2,
  })

  const conversations = data?.conversations || []
  const total = data?.total || 0
  const hasMore = data?.has_more || false

  // Filter conversations by title when not searching in messages
  const filteredConversations = useMemo(() => {
    if (!searchQuery || searchInMessages) return conversations
    return conversations.filter(conv =>
      conv.title?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [conversations, searchQuery, searchInMessages])

  // Group message search results by conversation
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

  // Highlight search query in text
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
      toast.error('Enter at least 2 characters to search')
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Chat History</h1>
            <p className="text-foreground-secondary mt-1">
              {total} conversation{total !== 1 ? 's' : ''} total
            </p>
          </div>
        </div>

        {/* Search and filters */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
              <Input
                type="text"
                placeholder={searchInMessages ? "Search in message content..." : "Search conversation titles..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setSearchInMessages(!searchInMessages)}
                variant={searchInMessages ? 'default' : 'secondary'}
                className="gap-2 whitespace-nowrap"
              >
                <FileText className="h-4 w-4" />
                {searchInMessages ? 'Search Messages' : 'Search Titles'}
              </Button>
              <Button
                onClick={() => setShowArchived(!showArchived)}
                variant={showArchived ? 'default' : 'secondary'}
                className="gap-2"
              >
                <Archive className="h-4 w-4" />
                {showArchived ? 'Archived' : 'Active'}
              </Button>
            </div>
          </div>

          {searchInMessages && searchQuery && (
            <p className="text-sm text-foreground-secondary">
              {isSearchingMessages
                ? 'Searching...'
                : `Found ${messageSearchData?.total || 0} messages matching "${searchQuery}"`}
            </p>
          )}
        </div>

        {/* Search Results - Message Search Mode */}
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
              <h3 className="text-lg font-medium text-foreground mb-1">No messages found</h3>
              <p className="text-foreground-secondary">
                Try different keywords or search in conversation titles
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
                      {group.conversationTitle || 'Untitled conversation'}
                    </span>
                    <span className="text-sm text-foreground-tertiary">
                      ({group.messages.length} match{group.messages.length !== 1 ? 'es' : ''})
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
                        View {group.messages.length - 3} more matches
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : (
          /* Regular Conversations List */
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
                  {searchQuery ? 'No matches found' : 'No conversations yet'}
                </h3>
                <p className="text-foreground-secondary mb-4">
                  {searchQuery
                    ? 'Try a different search term or search within messages'
                    : 'Start chatting to see your history here'}
                </p>
                {!searchQuery && (
                  <Button asChild>
                    <Link to="/chat">
                      Start a Chat
                    </Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredConversations.map((conv) => (
                  <ConversationCard key={conv._id} conversation={conv} onUpdate={refetch} />
                ))}
              </div>
            )}

            {/* Pagination */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  onClick={() => setPage(p => p + 1)}
                  variant="secondary"
                >
                  Load more
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
  // Truncate content around the match
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
          {format(new Date(message.created_at), 'MMM d, yyyy')}
        </span>
      </div>
      <p className="text-sm text-foreground-secondary line-clamp-2">
        {highlightMatch(getSnippet(message.content, query), query)}
      </p>
    </div>
  )
}

function ConversationCard({ conversation, onUpdate }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    try {
      await chatService.deleteConversation(conversation._id)
      onUpdate()
      toast.success('Conversation deleted')
    } catch (error) {
      toast.error('Failed to delete conversation')
    }
  }

  const handleArchive = async () => {
    try {
      await chatService.archiveConversation(conversation._id)
      onUpdate()
      toast.success(conversation.is_archived ? 'Conversation unarchived' : 'Conversation archived')
    } catch (error) {
      toast.error('Failed to update conversation')
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
              {conversation.title || 'Untitled conversation'}
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
            {format(new Date(conversation.last_message_at || conversation.created_at), 'MMM d')}
          </div>

          {/* Tags */}
          {conversation.tags?.length > 0 && (
            <div className="hidden sm:flex gap-1">
              {conversation.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="default">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Menu */}
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
                <Archive className="h-4 w-4 mr-2" />
                {conversation.is_archived ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setShowDeleteConfirm(true)}
                className="text-error focus:text-error"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </Card>
  )
}
