import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  MessageSquare,
  Calendar,
  Clock,
  User,
  Bot,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { adminService } from '../../services/adminService'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'

export default function UserHistoryPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [expandedConversation, setExpandedConversation] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-user-history', userId],
    queryFn: () => adminService.getUserHistory(userId, true),
  })

  const conversations = data?.conversations || []
  const userInfo = data?.user || {}

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        <p className="text-error mb-4">Failed to load user history</p>
        <button onClick={() => navigate('/admin/users')} className="btn btn-secondary">
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            to="/admin/users"
            className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">User History</h1>
            <p className="text-foreground-secondary">
              {userInfo.display_name || userInfo.email || 'Unknown User'}
            </p>
          </div>
        </div>

        {/* User Info Card */}
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center text-white text-lg font-medium">
              {userInfo.display_name?.[0]?.toUpperCase() || userInfo.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-medium text-foreground">{userInfo.display_name || 'No name'}</p>
              <p className="text-sm text-foreground-secondary">{userInfo.email}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-sm text-foreground-secondary">Total Conversations</p>
              <p className="text-xl font-bold text-foreground">{conversations.length}</p>
            </div>
          </div>
        </div>

        {/* Conversations List */}
        {conversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">No conversations</h3>
            <p className="text-foreground-secondary">This user hasn't started any conversations yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation._id}
                conversation={conversation}
                isExpanded={expandedConversation === conversation._id}
                onToggle={() =>
                  setExpandedConversation(
                    expandedConversation === conversation._id ? null : conversation._id
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationItem({ conversation, isExpanded, onToggle }) {
  return (
    <div className="card p-0 overflow-hidden">
      {/* Conversation Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-background-tertiary/50 transition-colors"
      >
        <div className={cn(
          'transition-transform',
          isExpanded && 'rotate-90'
        )}>
          <ChevronRight className="h-5 w-5 text-foreground-tertiary" />
        </div>
        <MessageSquare className="h-5 w-5 text-accent" />
        <div className="flex-1 text-left">
          <p className="font-medium text-foreground">
            {conversation.title || 'Untitled Conversation'}
          </p>
          <div className="flex items-center gap-4 text-xs text-foreground-tertiary mt-1">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {conversation.message_count || 0} messages
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(conversation.created_at), 'MMM d, yyyy')}
            </span>
            {conversation.last_message_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last: {format(new Date(conversation.last_message_at), 'MMM d, h:mm a')}
              </span>
            )}
          </div>
        </div>
        {conversation.token_count && (
          <div className="text-right">
            <p className="text-sm text-foreground-secondary">
              {conversation.token_count.total?.toLocaleString() || 0} tokens
            </p>
          </div>
        )}
      </button>

      {/* Expanded Messages */}
      {isExpanded && conversation.messages && (
        <div className="border-t border-border bg-background-tertiary/30">
          <div className="max-h-96 overflow-y-auto p-4 space-y-4">
            {conversation.messages.length === 0 ? (
              <p className="text-center text-foreground-tertiary py-4">No messages in this conversation</p>
            ) : (
              conversation.messages.map((message, index) => (
                <MessageItem key={message._id || index} message={message} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MessageItem({ message }) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'

  return (
    <div className={cn(
      'flex gap-3',
      isUser && 'flex-row-reverse'
    )}>
      <div className={cn(
        'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0',
        isUser ? 'bg-accent' : isSystem ? 'bg-warning/20' : 'bg-background-elevated'
      )}>
        {isUser ? (
          <User className="h-4 w-4 text-white" />
        ) : isSystem ? (
          <span className="text-warning text-xs font-medium">S</span>
        ) : (
          <Bot className="h-4 w-4 text-accent" />
        )}
      </div>
      <div className={cn(
        'flex-1 max-w-[80%]',
        isUser && 'text-right'
      )}>
        <div className={cn(
          'inline-block p-3 rounded-lg text-sm',
          isUser
            ? 'bg-accent text-white'
            : isSystem
            ? 'bg-warning/10 text-foreground border border-warning/20'
            : 'bg-background-elevated text-foreground'
        )}>
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <p className="text-xs text-foreground-tertiary mt-1">
          {message.created_at && format(new Date(message.created_at), 'h:mm a')}
          {message.metadata?.model_id && (
            <span className="ml-2">via {message.metadata.model_id}</span>
          )}
        </p>
      </div>
    </div>
  )
}
