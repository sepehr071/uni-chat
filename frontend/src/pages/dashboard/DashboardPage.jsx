import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare,
  Zap,
  Bot,
  TrendingUp,
  ArrowRight,
  Clock,
  X,
} from 'lucide-react'
import { userService } from '../../services/userService'
import { chatService } from '../../services/chatService'
import { useProject } from '../../context/ProjectContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useLanguage } from '../../context/LanguageContext'
import { fmtDate } from '../../utils/dateLocale'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { Avatar, AvatarFallback } from '../../components/ui/avatar'
import WorkspaceInvitesPanel from './components/WorkspaceInvitesPanel'

export default function DashboardPage() {
  const { t } = useTranslation('dashboard')
  const { currentProject } = useProject()
  const { currentWorkspace } = useWorkspace()
  const { isRTL } = useLanguage()
  // When no project is active, fetch ALL recent conversations across the
  // user's workspaces. Previously this hardcoded "null" string which the
  // backend matched against {project_id: null}, so the recent list could
  // appear empty whenever the user had no active project.
  const projectIdParam = currentProject?._id || undefined

  const [welcomeDismissed, setWelcomeDismissed] = useState(() => {
    try { return localStorage.getItem('unichat:welcome-card-dismissed') === '1' } catch { return false }
  })
  const [visitCount] = useState(() => {
    try {
      const n = parseInt(localStorage.getItem('unichat:dashboard-visit-count') || '0', 10) + 1
      localStorage.setItem('unichat:dashboard-visit-count', String(n))
      return n
    } catch { return 999 }
  })
  const showWelcome = !welcomeDismissed && visitCount <= 3

  function handleDismissWelcome() {
    try { localStorage.setItem('unichat:welcome-card-dismissed', '1') } catch {}
    setWelcomeDismissed(true)
  }

  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: () => userService.getStats(),
  })

  const { data: conversationsData, isLoading: isLoadingConversations } = useQuery({
    queryKey: ['recent-conversations', projectIdParam || 'all'],
    queryFn: () => chatService.getConversations({
      limit: 5,
      ...(projectIdParam ? { project_id: projectIdParam } : {}),
    }),
  })

  const stats = statsData?.stats
  const recentConversations = conversationsData?.conversations || []

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        {showWelcome && (
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-semibold">{t('dashboard.welcome.title')}</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -mt-1 -me-1 text-foreground-tertiary hover:text-foreground"
                onClick={handleDismissWelcome}
                aria-label={t('dashboard.welcome.dismiss')}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground-secondary">
                {t('dashboard.welcome.body', {
                  workspace: currentWorkspace?.name || t('dashboard.welcome.title'),
                  project: currentProject?.name || 'Unfiled',
                })}
              </p>
              <Button
                variant="link"
                size="sm"
                className="mt-2 p-0 h-auto text-foreground-tertiary text-xs"
                onClick={handleDismissWelcome}
              >
                {t('dashboard.welcome.dismiss')}
              </Button>
            </CardContent>
          </Card>
        )}

        <WorkspaceInvitesPanel />

        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-foreground-secondary mt-1">{t('dashboard.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={MessageSquare}
            label={t('dashboard.stats.messagesSent')}
            value={stats?.messages_sent || 0}
            isLoading={isLoadingStats}
            index={0}
          />
          <StatCard
            icon={Zap}
            label={t('dashboard.stats.tokensUsed')}
            value={stats?.tokens_used?.toLocaleString() || 0}
            subtitle={stats?.tokens_limit === -1 ? t('dashboard.stats.unlimited') : `/ ${stats?.tokens_limit?.toLocaleString()}`}
            isLoading={isLoadingStats}
            index={1}
          />
          <StatCard
            icon={Bot}
            label={t('dashboard.stats.aiConfigs')}
            value={stats?.total_configs || 0}
            isLoading={isLoadingStats}
            index={2}
          />
          <StatCard
            icon={TrendingUp}
            label={t('dashboard.stats.conversations')}
            value={stats?.total_conversations || 0}
            isLoading={isLoadingStats}
            index={3}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <CardTitle className="text-lg">{t('dashboard.recentConversations.title')}</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/chat-history" className="gap-1">
                  {t('dashboard.recentConversations.viewAll')}
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
                  {currentProject ? (
                    <>
                      <p className="text-foreground-secondary mb-4">
                        {t('dashboard.recentConversations.noConversationsProject', { project: currentProject.name })}
                      </p>
                      <Button asChild>
                        <Link to="/chat">{t('dashboard.recentConversations.startChat')}</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-foreground-secondary mb-4">{t('dashboard.recentConversations.noConversations')}</p>
                      <Button asChild>
                        <Link to="/chat">{t('dashboard.recentConversations.startChat')}</Link>
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {recentConversations.map((conv, index) => (
                    <motion.div
                      key={conv._id}
                      initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
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
                              {conv.title || t('dashboard.recentConversations.untitled')}
                            </p>
                            <Badge variant="secondary" className="text-xs mt-1">
                              {t('dashboard.recentConversations.messages', { count: conv.message_count })}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-foreground-tertiary">
                          <Clock className="h-3.5 w-3.5" />
                          {fmtDate(new Date(conv.last_message_at || conv.created_at), 'MMM d, HH:mm')}
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <QuickAction
            to="/chat"
            icon={MessageSquare}
            title={t('dashboard.quickActions.newChat')}
            description={t('dashboard.quickActions.newChatDesc')}
            index={0}
          />
          <QuickAction
            to="/configs"
            icon={Bot}
            title={t('dashboard.quickActions.manageConfigs')}
            description={t('dashboard.quickActions.manageConfigsDesc')}
            index={1}
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
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 rtl:translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
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
