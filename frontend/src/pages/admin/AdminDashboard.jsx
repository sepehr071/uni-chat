import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Users,
  MessageSquare,
  Zap,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Bot,
} from 'lucide-react'
import { adminService } from '../../services/adminService'

export default function AdminDashboard() {
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => adminService.getAnalytics(30),
  })

  const analytics = analyticsData?.analytics || {}

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-foreground-secondary mt-1">
            Overview of platform usage and statistics
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Total Users"
            value={analytics.users?.total || 0}
            subtitle={`${analytics.users?.active || 0} active`}
            isLoading={isLoading}
          />
          <StatCard
            icon={MessageSquare}
            label="Conversations"
            value={analytics.conversations?.total || 0}
            subtitle={`${analytics.conversations?.recent || 0} this month`}
            isLoading={isLoading}
          />
          <StatCard
            icon={Zap}
            label="Total Tokens"
            value={analytics.tokens?.total?.toLocaleString() || 0}
            isLoading={isLoading}
          />
          <StatCard
            icon={MessageSquare}
            label="Messages"
            value={analytics.messages?.total?.toLocaleString() || 0}
            isLoading={isLoading}
          />
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <QuickLink
            to="/admin/users"
            icon={Users}
            title="User Management"
            description="View and manage users"
          />
          <QuickLink
            to="/admin/templates"
            icon={Bot}
            title="Templates"
            description="Manage AI templates"
          />
          <QuickLink
            to="/admin"
            icon={TrendingUp}
            title="Analytics"
            description="View detailed analytics"
          />
        </div>

        {/* Model Usage */}
        {analytics.model_usage?.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold text-foreground mb-4">Model Usage (Last 30 days)</h2>
            <div className="space-y-3">
              {analytics.model_usage.map((model, index) => (
                <div key={model._id || index} className="flex items-center justify-between">
                  <span className="text-foreground">{model._id || 'Unknown'}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-foreground-secondary">
                      {model.count} requests
                    </span>
                    <span className="text-foreground-secondary">
                      {model.total_tokens?.toLocaleString() || 0} tokens
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
            {subtitle && <span className="text-foreground-tertiary"> ({subtitle})</span>}
          </p>
        </>
      )}
    </div>
  )
}

function QuickLink({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="card hover:border-accent/50 transition-colors group flex items-center gap-4"
    >
      <div className="h-12 w-12 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
        <Icon className="h-6 w-6 text-accent" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium text-foreground group-hover:text-accent transition-colors">
          {title}
        </h3>
        <p className="text-sm text-foreground-secondary">{description}</p>
      </div>
      <ArrowRight className="h-5 w-5 text-foreground-tertiary group-hover:text-accent transition-colors" />
    </Link>
  )
}
