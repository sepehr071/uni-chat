import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'

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
            index={0}
          />
          <StatCard
            icon={Zap}
            label="Tokens Used"
            value={stats?.tokens_used?.toLocaleString() || 0}
            subtitle={stats?.tokens_limit === -1 ? 'Unlimited' : `/ ${stats?.tokens_limit?.toLocaleString()}`}
            isLoading={isLoadingStats}
            index={1}
          />
          <StatCard
            icon={Bot}
            label="AI Configs"
            value={stats?.total_configs || 0}
            isLoading={isLoadingStats}
            index={2}
          />
          <StatCard
            icon={TrendingUp}
            label="Conversations"
            value={stats?.total_conversations || 0}
            isLoading={isLoadingStats}
            index={3}
          />
        </div>

        {/* Recent Conversations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg">Recent Conversations</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/chat-history" className="gap-1">
                  View all
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingConversations ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentConversations.length === 0 ? (
                <div className="text-center py-8">
                  <Avatar size="lg" shape="square" className="mx-auto mb-4">
                    <AvatarFallback className="bg-accent/10 text-accent">
                      <MessageSquare className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-foreground-secondary mb-4">No conversations yet</p>
                  <Button asChild>
                    <Link to="/chat">Start a Chat</Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentConversations.map((conv, index) => (
                    <motion.div
                      key={conv._id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.05 }}
                    >
                      <Link
                        to={`/chat/${conv._id}`}
                        className="flex items-center justify-between p-3 rounded-xl hover:bg-background-tertiary transition-all group border border-transparent hover:border-border"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar size="default" shape="square" className="group-hover:scale-105 transition-transform">
                            <AvatarFallback className="bg-accent/10 text-accent">
                              <MessageSquare className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate group-hover:text-accent transition-colors">
                              {conv.title || 'Untitled conversation'}
                            </p>
                            <Badge variant="secondary" className="text-xs mt-1">
                              {conv.message_count} messages
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-foreground-tertiary">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(conv.last_message_at || conv.created_at), 'MMM d, HH:mm')}
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickAction
            to="/chat"
            icon={MessageSquare}
            title="New Chat"
            description="Start a new conversation"
            index={0}
          />
          <QuickAction
            to="/configs"
            icon={Bot}
            title="Manage Configs"
            description="Create or edit AI configurations"
            index={1}
          />
          <QuickAction
            to="/gallery"
            icon={TrendingUp}
            title="Browse Gallery"
            description="Discover community configurations"
            index={2}
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, subtitle, isLoading, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3 }}
    >
      <Card className="hover:shadow-md transition-all hover:border-accent/30 group">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ) : (
            <>
              <Avatar size="default" shape="square" className="mb-3 group-hover:scale-110 transition-transform">
                <AvatarFallback className="bg-accent/10 text-accent">
                  <Icon className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-sm text-foreground-secondary">
                {label}
                {subtitle && <span className="text-foreground-tertiary"> {subtitle}</span>}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

function QuickAction({ to, icon: Icon, title, description, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + index * 0.1, duration: 0.3 }}
    >
      <Link to={to}>
        <Card className="hover:border-accent/50 hover:shadow-lg transition-all group cursor-pointer h-full">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4">
              <Avatar size="default" shape="square" className="group-hover:scale-110 transition-transform">
                <AvatarFallback className="bg-accent/10 text-accent group-hover:bg-accent/20">
                  <Icon className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors flex items-center gap-2">
                  {title}
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                </h3>
                <p className="text-sm text-foreground-secondary">{description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}
