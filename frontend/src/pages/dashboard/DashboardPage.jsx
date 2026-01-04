import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  MessageSquare,
  Zap,
  Bot,
  TrendingUp,
  ArrowRight,
  Clock,
} from 'lucide-react'
import { userService } from '../../services/userService'
import { chatService } from '../../services/chatService'
import { format } from 'date-fns'

export default function DashboardPage() {
  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: () => userService.getStats(),
  })

  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['recent-conversations'],
    queryFn: () => chatService.getConversations({ limit: 5 }),
  })

  const stats = statsData?.stats
  const recentConversations = conversationsData?.conversations || []

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-foreground-secondary mt-1">
            Overview of your activity and usage
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={MessageSquare}
            label="Messages Sent"
            value={stats?.messages_sent || 0}
            isLoading={isLoadingStats}
          />
          <StatCard
            icon={Zap}
            label="Tokens Used"
            value={stats?.tokens_used?.toLocaleString() || 0}
            subtitle={stats?.tokens_limit === -1 ? 'Unlimited' : `/ ${stats?.tokens_limit?.toLocaleString()}`}
            isLoading={isLoadingStats}
          />
          <StatCard
            icon={Bot}
            label="AI Configs"
            value={stats?.total_configs || 0}
            isLoading={isLoadingStats}
          />
          <StatCard
            icon={TrendingUp}
            label="Conversations"
            value={stats?.total_conversations || 0}
            isLoading={isLoadingStats}
          />
        </div>

        {/* Recent Conversations */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Recent Conversations</h2>
            <Link
              to="/history"
              className="text-sm text-accent hover:text-accent-hover flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {isLoadingConversations ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-background-tertiary rounded-lg animate-pulse" />
              ))}
            </div>
          ) : recentConversations.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="h-10 w-10 text-foreground-tertiary mx-auto mb-2" />
              <p className="text-foreground-secondary">No conversations yet</p>
              <Link to="/chat" className="btn btn-primary mt-4">
                Start a Chat
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recentConversations.map((conv) => (
                <Link
                  key={conv._id}
                  to={`/chat/${conv._id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-background-tertiary transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-5 w-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {conv.title || 'Untitled conversation'}
                      </p>
                      <p className="text-sm text-foreground-secondary">
                        {conv.message_count} messages
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-foreground-tertiary">
                    <Clock className="h-4 w-4" />
                    {format(new Date(conv.last_message_at || conv.created_at), 'MMM d, HH:mm')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickAction
            to="/chat"
            icon={MessageSquare}
            title="New Chat"
            description="Start a new conversation"
          />
          <QuickAction
            to="/configs"
            icon={Bot}
            title="Manage Configs"
            description="Create or edit AI configurations"
          />
          <QuickAction
            to="/gallery"
            icon={TrendingUp}
            title="Browse Gallery"
            description="Discover community configurations"
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, subtitle, isLoading }) {
  return (
    <div className="card">
      {isLoading ? (
        <div className="animate-pulse">
          <div className="h-10 w-10 rounded-lg bg-background-tertiary mb-3" />
          <div className="h-8 w-20 bg-background-tertiary rounded mb-1" />
          <div className="h-4 w-24 bg-background-tertiary rounded" />
        </div>
      ) : (
        <>
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
            <Icon className="h-5 w-5 text-accent" />
          </div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-foreground-secondary">
            {label}
            {subtitle && <span className="text-foreground-tertiary"> {subtitle}</span>}
          </p>
        </>
      )}
    </div>
  )
}

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="card hover:border-accent/50 transition-colors group"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
            {title}
          </h3>
          <p className="text-sm text-foreground-secondary">{description}</p>
        </div>
      </div>
    </Link>
  )
}
