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
            <h1 className="text-2xl font-bold text-foreground">History</h1>
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
              <input
                type="text"
                placeholder={searchInMessages ? "Search in message content..." : "Search conversation titles..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="input pl-9"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSearchInMessages(!searchInMessages)}
                className={cn(
                  'btn gap-2 whitespace-nowrap',
                  searchInMessages ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <FileText className="h-4 w-4" />
                {searchInMessages ? 'Search Messages' : 'Search Titles'}
              </button>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={cn(
                  'btn gap-2',
                  showArchived ? 'btn-primary' : 'btn-secondary'
                )}
              >
                <Archive className="h-4 w-4" />
                {showArchived ? 'Archived' : 'Active'}
              </button>
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
                <div key={i} className="h-24 bg-background-secondary rounded-xl animate-pulse" />
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
                <div key={group.conversationId} className="card">
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
                      <button
                        onClick={() => navigate(`/chat/${group.conversationId}`)}
                        className="text-sm text-accent hover:underline"
                      >
                        View {group.messages.length - 3} more matches
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Regular Conversations List */
          <>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-20 bg-background-secondary rounded-xl animate-pulse" />
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
                  <Link to="/chat" className="btn btn-primary">
                    Start a Chat
                  </Link>
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
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="btn btn-secondary"
                >
                  Load more
                </button>
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
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div className="card hover:border-border-light transition-colors group">
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
                <span key={tag} className="badge badge-primary">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-lg text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 w-40 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                  <button
                    onClick={async () => {
                      try {
                        await chatService.archiveConversation(conversation._id)
                        onUpdate()
                        toast.success(conversation.is_archived ? 'Conversation unarchived' : 'Conversation archived')
                      } catch (error) {
                        toast.error('Failed to update conversation')
                      }
                      setShowMenu(false)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                  >
                    <Archive className="h-4 w-4" />
                    {conversation.is_archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Delete this conversation?')) {
                        try {
                          await chatService.deleteConversation(conversation._id)
                          onUpdate()
                          toast.success('Conversation deleted')
                        } catch (error) {
                          toast.error('Failed to delete conversation')
                        }
                      }
                      setShowMenu(false)
                    }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-error hover:bg-error/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
