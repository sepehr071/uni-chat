import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Users,
  MessageSquare,
  Zap,
  TrendingUp,
  ArrowRight,
  Bot,
  Calendar,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { adminService } from '../../services/adminService'
import UsagePanel from './components/UsagePanel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899']

export default function AdminDashboard() {
  const { t } = useTranslation('admin')
  const [dateRange, setDateRange] = useState(30)

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['admin-analytics', dateRange],
    queryFn: () => adminService.getAnalytics(dateRange),
  })

  const { data: timeseriesData, isLoading: isLoadingTimeseries } = useQuery({
    queryKey: ['admin-timeseries', dateRange],
    queryFn: () => adminService.getTimeseriesAnalytics(dateRange),
  })

  const analytics = analyticsData?.analytics || {}
  const timeseries = timeseriesData?.timeseries || {}

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('dashboard.title')}</h1>
            <p className="text-foreground-secondary mt-1">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-foreground-secondary" />
            <Select value={dateRange.toString()} onValueChange={(value) => setDateRange(Number(value))}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('dashboard.last7days')}</SelectItem>
                <SelectItem value="14">{t('dashboard.last14days')}</SelectItem>
                <SelectItem value="30">{t('dashboard.last30days')}</SelectItem>
                <SelectItem value="60">{t('dashboard.last60days')}</SelectItem>
                <SelectItem value="90">{t('dashboard.last90days')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label={t('dashboard.totalUsers')} value={analytics.users?.total || 0} subtitle={t('dashboard.activeUsers', { count: analytics.users?.active || 0 })} isLoading={isLoading} />
          <StatCard icon={MessageSquare} label={t('dashboard.conversations')} value={analytics.conversations?.total || 0} subtitle={t('dashboard.conversationsRecent', { count: analytics.conversations?.recent || 0 })} isLoading={isLoading} />
          <StatCard icon={Zap} label={t('dashboard.totalTokens')} value={analytics.tokens?.total?.toLocaleString() || 0} isLoading={isLoading} />
          <StatCard icon={MessageSquare} label={t('dashboard.messages')} value={analytics.messages?.total?.toLocaleString() || 0} isLoading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MessagesChart timeseries={timeseries} isLoading={isLoadingTimeseries} />
          <ModelDistributionChart analytics={analytics} dateRange={dateRange} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickLink to="/admin/users" icon={Users} title={t('dashboard.userManagement')} description={t('dashboard.userManagementDesc')} />
          <QuickLink to="/admin/templates" icon={Bot} title={t('dashboard.templates')} description={t('dashboard.templatesDesc')} />
          <QuickLink to="/admin" icon={TrendingUp} title={t('dashboard.analytics')} description={t('dashboard.analyticsDesc')} />
        </div>

        <ModelUsageTable analytics={analytics} dateRange={dateRange} />

        <UsagePanel />
      </div>
    </div>
  )
}

function MessagesChart({ timeseries, isLoading }) {
  const { t } = useTranslation('admin')
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.messagesOverTime')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.messagesOverTime')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={256}>
          <AreaChart data={timeseries.messages || []}>
            <defs><linearGradient id="messagesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--foreground-secondary)" fontSize={12} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} />
            <YAxis stroke="var(--foreground-secondary)" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--background-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} labelStyle={{ color: 'var(--foreground)' }} />
            <Area type="monotone" dataKey="value" stroke="#6366f1" fillOpacity={1} fill="url(#messagesGradient)" name={t('dashboard.messages')} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function ModelDistributionChart({ analytics, dateRange }) {
  const { t } = useTranslation('admin')
  if (!analytics.model_usage?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.modelDistribution', { days: dateRange })}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={256}>
          <PieChart>
            <Pie data={analytics.model_usage.slice(0, 5)} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={80} labelLine={false}>
              {analytics.model_usage.slice(0, 5).map((_, i) => <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'var(--background-elevated)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--foreground)' }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function ModelUsageTable({ analytics, dateRange }) {
  const { t } = useTranslation('admin')
  if (!analytics.model_usage?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard.modelUsage', { days: dateRange })}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dashboard.modelCol')}</th>
                <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('dashboard.requestsCol')}</th>
                <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('dashboard.tokensCol')}</th>
              </tr>
            </thead>
            <tbody>
              {analytics.model_usage.map((m, i) => (
                <tr key={m._id || i} className="border-b border-border/50">
                  <td className="py-2 px-3 text-foreground">{m._id || 'Unknown'}</td>
                  <td className="py-2 px-3 text-end text-foreground-secondary">{m.count?.toLocaleString()}</td>
                  <td className="py-2 px-3 text-end text-foreground-secondary">{m.total_tokens?.toLocaleString() || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ icon: Icon, label, value, subtitle, isLoading }) {
  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-24" />
          </div>
        ) : (
          <>
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
              <Icon className="h-5 w-5 text-accent" />
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-foreground-secondary">
              {label}
              {subtitle && <span className="text-foreground-tertiary"> ({subtitle})</span>}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function QuickLink({ to, icon: Icon, title, description }) {
  return (
    <Link to={to}>
      <Card className="hover:border-accent/50 transition-colors group cursor-pointer">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
              <Icon className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">{title}</h3>
              <p className="text-sm text-foreground-secondary">{description}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-foreground-tertiary group-hover:text-accent transition-colors rtl:rotate-180" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
