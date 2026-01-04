import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search,
  MessageSquare,
  Clock,
  Archive,
  Trash2,
  MoreVertical,
  Filter,
} from 'lucide-react'
import { chatService } from '../../services/chatService'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'

export default function HistoryPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['conversations-history', showArchived, page],
    queryFn: () => chatService.getConversations({
      archived: showArchived,
      page,
      limit: 20,
    }),
  })

  const conversations = data?.conversations || []
  const total = data?.total || 0
  const hasMore = data?.has_more || false

  const filteredConversations = conversations.filter(conv =>
    conv.title?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9"
            />
          </div>
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={cn(
              'btn gap-2',
              showArchived ? 'btn-primary' : 'btn-secondary'
            )}
          >
            <Archive className="h-4 w-4" />
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </button>
        </div>

        {/* Conversations list */}
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
                ? 'Try a different search term'
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
      </div>
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
                      await chatService.archiveConversation(conversation._id)
                      onUpdate()
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
                        await chatService.deleteConversation(conversation._id)
                        onUpdate()
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
