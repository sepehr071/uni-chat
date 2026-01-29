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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

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
        <Button variant="secondary" onClick={() => navigate('/admin/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
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
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-accent text-white text-lg font-medium">
                  {userInfo.display_name?.[0]?.toUpperCase() || userInfo.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-foreground">{userInfo.display_name || 'No name'}</p>
                <p className="text-sm text-foreground-secondary">{userInfo.email}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm text-foreground-secondary">Total Conversations</p>
                <p className="text-xl font-bold text-foreground">{conversations.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
    <Card className="p-0 overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        {/* Conversation Header */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-3 p-4 hover:bg-background-tertiary/50 transition-colors">
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
              <div className="flex items-center gap-3 text-xs text-foreground-tertiary mt-1 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {conversation.message_count || 0}
                </Badge>
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
              <Badge variant="outline" className="ml-auto">
                {conversation.token_count.total?.toLocaleString() || 0} tokens
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>

        {/* Expanded Messages */}
        <CollapsibleContent>
          {conversation.messages && (
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
        </CollapsibleContent>
      </Collapsible>
    </Card>
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
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback className={cn(
          isUser ? 'bg-accent text-white' : isSystem ? 'bg-warning/20 text-warning' : 'bg-background-elevated text-accent'
        )}>
          {isUser ? (
            <User className="h-4 w-4" />
          ) : isSystem ? (
            <span className="text-xs font-medium">S</span>
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>
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
        <div className="flex items-center gap-2 text-xs text-foreground-tertiary mt-1 flex-wrap">
          {message.created_at && (
            <span>{format(new Date(message.created_at), 'h:mm a')}</span>
          )}
          {message.metadata?.model_id && (
            <Badge variant="outline" className="text-xs py-0">
              {message.metadata.model_id}
            </Badge>
          )}
        </div>
      </div>
    </div>
  )
}
