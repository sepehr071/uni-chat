import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899']

export default function AdminDashboard() {
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
            <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-foreground-secondary mt-1">Overview of platform usage and statistics</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-foreground-secondary" />
            <select value={dateRange} onChange={(e) => setDateRange(Number(e.target.value))} className="input text-sm py-1.5 w-auto">
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Users" value={analytics.users?.total || 0} subtitle={`${analytics.users?.active || 0} active`} isLoading={isLoading} />
          <StatCard icon={MessageSquare} label="Conversations" value={analytics.conversations?.total || 0} subtitle={`${analytics.conversations?.recent || 0} this period`} isLoading={isLoading} />
          <StatCard icon={Zap} label="Total Tokens" value={analytics.tokens?.total?.toLocaleString() || 0} isLoading={isLoading} />
          <StatCard icon={MessageSquare} label="Messages" value={analytics.messages?.total?.toLocaleString() || 0} isLoading={isLoading} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <MessagesChart timeseries={timeseries} isLoading={isLoadingTimeseries} />
          <ModelDistributionChart analytics={analytics} dateRange={dateRange} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickLink to="/admin/users" icon={Users} title="User Management" description="View and manage users" />
          <QuickLink to="/admin/templates" icon={Bot} title="Templates" description="Manage AI templates" />
          <QuickLink to="/admin" icon={TrendingUp} title="Analytics" description="View detailed analytics" />
        </div>

        <ModelUsageTable analytics={analytics} dateRange={dateRange} />
      </div>
    </div>
  )
}

function MessagesChart({ timeseries, isLoading }) {
  if (isLoading) return <div className="card"><h2 className="text-lg font-semibold text-foreground mb-4">Messages Over Time</h2><div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div></div>
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-foreground mb-4">Messages Over Time</h2>
      <ResponsiveContainer width="100%" height={256}>
        <AreaChart data={timeseries.messages || []}>
          <defs><linearGradient id="messagesGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
          <XAxis dataKey="date" stroke="rgb(var(--foreground-secondary))" fontSize={12} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })} />
          <YAxis stroke="rgb(var(--foreground-secondary))" fontSize={12} />
          <Tooltip contentStyle={{ backgroundColor: 'rgb(var(--background-elevated))', border: '1px solid rgb(var(--border))', borderRadius: '8px', color: 'rgb(var(--foreground))' }} labelStyle={{ color: 'rgb(var(--foreground))' }} />
          <Area type="monotone" dataKey="value" stroke="#6366f1" fillOpacity={1} fill="url(#messagesGradient)" name="Messages" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ModelDistributionChart({ analytics, dateRange }) {
  if (!analytics.model_usage?.length) return null
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-foreground mb-4">Model Distribution (Last {dateRange} days)</h2>
      <ResponsiveContainer width="100%" height={256}>
        <PieChart>
          <Pie data={analytics.model_usage.slice(0, 5)} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={80} labelLine={false}>
            {analytics.model_usage.slice(0, 5).map((_, i) => <Cell key={`cell-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ backgroundColor: 'rgb(var(--background-elevated))', border: '1px solid rgb(var(--border))', borderRadius: '8px', color: 'rgb(var(--foreground))' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function ModelUsageTable({ analytics, dateRange }) {
  if (!analytics.model_usage?.length) return null
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-foreground mb-4">Model Usage (Last {dateRange} days)</h2>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-border"><th className="text-left py-2 px-3 text-foreground-secondary font-medium">Model</th><th className="text-right py-2 px-3 text-foreground-secondary font-medium">Requests</th><th className="text-right py-2 px-3 text-foreground-secondary font-medium">Tokens</th></tr></thead>
          <tbody>{analytics.model_usage.map((m, i) => <tr key={m._id || i} className="border-b border-border/50"><td className="py-2 px-3 text-foreground">{m._id || 'Unknown'}</td><td className="py-2 px-3 text-right text-foreground-secondary">{m.count?.toLocaleString()}</td><td className="py-2 px-3 text-right text-foreground-secondary">{m.total_tokens?.toLocaleString() || 0}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, subtitle, isLoading }) {
  return (
    <div className="card">
      {isLoading ? (
        <div className="animate-pulse"><div className="h-10 w-10 rounded-lg bg-background-tertiary mb-3" /><div className="h-8 w-20 bg-background-tertiary rounded mb-1" /><div className="h-4 w-24 bg-background-tertiary rounded" /></div>
      ) : (
        <><div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3"><Icon className="h-5 w-5 text-accent" /></div><p className="text-2xl font-bold text-foreground">{value}</p><p className="text-sm text-foreground-secondary">{label}{subtitle && <span className="text-foreground-tertiary"> ({subtitle})</span>}</p></>
      )}
    </div>
  )
}

function QuickLink({ to, icon: Icon, title, description }) {
  return (
    <Link to={to} className="card hover:border-accent/50 transition-colors group flex items-center gap-4">
      <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors"><Icon className="h-6 w-6 text-accent" /></div>
      <div className="flex-1"><h3 className="font-medium text-foreground group-hover:text-accent transition-colors">{title}</h3><p className="text-sm text-foreground-secondary">{description}</p></div>
      <ArrowRight className="h-5 w-5 text-foreground-tertiary group-hover:text-accent transition-colors" />
    </Link>
  )
}
