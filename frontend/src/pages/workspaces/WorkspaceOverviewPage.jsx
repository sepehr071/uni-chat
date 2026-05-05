import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { fmtDate } from '@/utils/dateLocale'
import {
  Building2,
  ShieldCheck,
  Key,
  Download,
  Settings,
  Plus,
  ChevronRight,
  Users,
  MessageSquare,
  FileText,
  FolderPlus,
  UserPlus,
  Activity,
  Layers,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { workspaceService } from '@/services/workspaceService'
import PageHeader from '@/components/teams/PageHeader'
import Section from '@/components/teams/Section'
import StatTile from '@/components/teams/StatTile'
import LegendDot from '@/components/teams/LegendDot'
import Ptile from '@/components/teams/Ptile'

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------


function formatRelative(value) {
  if (!value) return '—'
  try {
    const d = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(d.getTime())) return '—'
    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function formatNumber(n) {
  const v = Number(n || 0)
  return v.toLocaleString('en-US')
}

const ACCENT = '#5c9aed'
const PROJECT_FALLBACK_COLORS = [
  '#5c9aed',
  '#a78bfa',
  '#10b981',
  '#f59e0b',
  '#f472b6',
  '#2dd4bf',
  '#ec4899',
  '#818cf8',
]
const GROUP_FALLBACK_COLORS = ['#5c9aed', '#a78bfa', '#10b981', '#f59e0b', '#f472b6']

// Map common audit-log actions to a lucide icon name.
const ACTION_ICON = {
  member_added: 'UserPlus',
  member_removed: 'UserMinus',
  invite_sent: 'Mail',
  invite_revoked: 'MailX',
  workspace_updated: 'Settings',
  workspace_created: 'Building2',
  project_created: 'FolderPlus',
  project_updated: 'Folder',
  project_deleted: 'FolderX',
  group_created: 'Layers',
  group_deleted: 'Layers',
  conversation_created: 'MessageSquare',
}

// ----------------------------------------------------------------------------
// UsageBarChart — gradient stem 30 bars (matches design parts/workspace-overview.jsx:223)
// ----------------------------------------------------------------------------

function UsageBarChart({ data }) {
  // Prefer real data when available, pad/truncate to 30 buckets.
  const series = useMemo(() => {
    const list = Array.isArray(data) ? [...data] : []
    // Each entry shape: { date, messages, cost_usd, total_tokens } (from backend aggregate_daily).
    const counts = list.map((d) => Number(d.messages || d.count || d.value || 0))
    while (counts.length < 30) counts.unshift(0)
    return counts.slice(-30)
  }, [data])

  const max = Math.max(1, ...series)

  return (
    <div className="flex h-[140px] items-end gap-1">
      {series.map((v, i) => {
        const h = (v / max) * 100
        const isLast = i === series.length - 1
        return (
          <div
            key={i}
            className="flex h-full flex-1 flex-col justify-end"
          >
            <div
              style={{
                height: `${h * 0.6}%`,
                background: isLast ? ACCENT : 'hsl(var(--bg-3))',
                borderRadius: '2px 2px 0 0',
                transition: 'background .2s',
              }}
            />
            <div
              style={{
                height: `${h * 0.4}%`,
                background: isLast ? ACCENT : 'hsl(var(--bg-4))',
                opacity: isLast ? 1 : 0.6,
                borderRadius: '0 0 2px 2px',
              }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ----------------------------------------------------------------------------
// ActivityRow
// ----------------------------------------------------------------------------

function getActivityIcon(action) {
  const name = ACTION_ICON[action] || 'Activity'
  return name
}

function describeActivity(a) {
  const action = a.action || 'event'
  const verb = action.replaceAll('_', ' ')
  const targetType = a.target_type || ''
  const targetName =
    a.details?.name ||
    a.details?.target_name ||
    a.details?.email ||
    (a.target_id ? targetType : '')
  return { verb, what: targetName || targetType || '' }
}

function ActivityRow({ entry }) {
  const iconName = getActivityIcon(entry.action)
  const { verb, what } = describeActivity(entry)
  const who =
    entry.actor_name ||
    entry.actor_email ||
    entry.admin_email ||
    entry.admin_name ||
    'System'
  const when = formatRelative(entry.created_at)

  return (
    <div className="flex items-start gap-3">
      <Ptile
        size="sm"
        color="hsl(var(--bg-3))"
        icon={iconName}
        className="!text-fg-2"
      />
      <div className="flex grow flex-col" style={{ gap: 1 }}>
        <div className="text-[12.5px] leading-snug">
          <span className="font-medium text-fg-0">{who}</span>
          <span className="text-fg-3"> {verb} </span>
          {what && <span className="text-fg-1">{what}</span>}
        </div>
        <span className="text-[11px] text-fg-3">{when}</span>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------------
// TopProjectRow
// ----------------------------------------------------------------------------

function TopProjectRow({ rank, project, maxMessages, isLast }) {
  const messages = Number(project.message_count || 0)
  const pct = maxMessages > 0 ? Math.min(100, (messages / maxMessages) * 100) : 0
  const color =
    project.color || PROJECT_FALLBACK_COLORS[(rank - 1) % PROJECT_FALLBACK_COLORS.length]
  const letter = (project.name || '?').trim().charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-2',
        !isLast && 'border-b border-line',
      )}
    >
      <span
        className="font-mono text-[11px] text-fg-4"
        style={{ width: 14 }}
      >
        #{rank}
      </span>
      <Ptile size="sm" color={color} icon={project.icon} letter={letter} />
      <span className="grow truncate text-[12.5px] text-fg-1">
        {project.name || 'Untitled'}
      </span>
      <div
        className="overflow-hidden rounded-sm bg-bg-3"
        style={{ width: 80, height: 4 }}
      >
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="font-mono text-[11px] text-fg-3"
        style={{ width: 50, textAlign: 'right' }}
      >
        {formatNumber(messages)}
      </span>
    </div>
  )
}

// ----------------------------------------------------------------------------
// GroupRow
// ----------------------------------------------------------------------------

function GroupRow({ group, index }) {
  const color = group.color || GROUP_FALLBACK_COLORS[index % GROUP_FALLBACK_COLORS.length]
  const letter = (group.name || '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border border-line bg-bg-2 p-2',
        'transition-colors hover:bg-bg-3',
      )}
    >
      <Ptile size="sm" color={color} icon={group.icon} letter={letter} />
      <span className="grow text-[12.5px] font-medium text-fg-1">
        {group.name || 'Untitled group'}
      </span>
      <span className="text-[11px] text-fg-3">
        {Number(group.member_count || 0)} members
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-fg-4" />
    </div>
  )
}

// ----------------------------------------------------------------------------
// Page
// ----------------------------------------------------------------------------

export default function WorkspaceOverviewPage() {
  const { t } = useTranslation('projects')
  const { wid } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await workspaceService.getOverview(wid)
        if (!cancelled) setData(res)
      } catch (err) {
        if (cancelled) return
        const status = err.response?.status
        if (status === 403 || status === 404) {
          toast.error('You do not have access to this workspace')
          nav('/chat', { replace: true })
          return
        }
        setError(err.response?.data?.error || 'Failed to load workspace overview')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    if (wid) load()
    return () => {
      cancelled = true
    }
  }, [wid, nav])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-0">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-0 p-6">
        <div className="text-center">
          <p className="text-sm text-err">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => nav('/chat')}
          >
            {t('workspacePage.buttons.backToChat')}
          </Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const ws = data.workspace || {}
  const billing = data.billing || {}
  const stats = data.stats || {}
  const topProjects = Array.isArray(data.top_projects) ? data.top_projects : []
  const recentActivity = Array.isArray(data.recent_activity) ? data.recent_activity : []
  const groups = Array.isArray(data.groups) ? data.groups : []
  const usage30d = Array.isArray(data.usage_30d) ? data.usage_30d : []

  const seatsUsed = Number(billing.seats_used || 0)
  const seatsTotal = Number(billing.seats_total || 0)
  const seatsAvailable = Math.max(0, seatsTotal - seatsUsed)
  const messagesMtd = Number(stats.messages_mtd || 0)
  const spendMtd = Number(billing.spend_mtd_usd || 0)
  const budgetMtd = Number(billing.budget_mtd_usd || 0)
  const spendPct = budgetMtd > 0 ? Math.round((spendMtd / budgetMtd) * 100) : 0
  const activeProjects = Number(stats.active_projects || 0)
  const planTier = (billing.plan_tier || ws.plan || 'free').toLowerCase()
  const isEnterprise = planTier === 'enterprise'
  const ssoEnforced = !!billing.sso_enforced
  const scimEnabled = !!billing.scim_enabled
  const domain = billing.domain
  const renewsAt = billing.renews_at
  const createdAt = ws.created_at

  const wsName = ws.name || 'Workspace'
  const wsLetter = wsName.trim().charAt(0).toUpperCase() || 'W'

  const maxProjectMessages = topProjects.reduce(
    (m, p) => Math.max(m, Number(p.message_count || 0)),
    0,
  )

  return (
    <div className="flex h-full flex-col bg-bg-0">
      <PageHeader
        crumbs={[wsName]}
        title={t('workspacePage.title')}
        subtitle="Health, usage, and recent activity at a glance"
        actions={
          <>
            <Button variant="secondary" size="sm" animated={false}>
              <Download className="h-3.5 w-3.5" />
              {t('workspacePage.buttons.exportReport')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              animated={false}
              onClick={() => nav(`/workspaces/${wid}/settings`)}
            >
              <Settings className="h-3.5 w-3.5" />
              {t('workspacePage.buttons.settings')}
            </Button>
            <Button
              size="sm"
              animated={false}
              onClick={() => nav(`/workspaces/${wid}/settings?tab=invites`)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('workspacePage.buttons.invite')}
            </Button>
          </>
        }
      />

      <main className="flex-1 overflow-auto bg-bg-0 p-6">
        {/* Plan banner */}
        <div
          className="mb-4 flex items-center gap-4 rounded-xl border p-4"
          style={{
            background:
              'linear-gradient(135deg, hsl(var(--accent-soft)), transparent)',
            borderColor: 'hsl(var(--accent-line))',
          }}
        >
          <Ptile
            size="lg"
            gradient
            color="#5c9aed"
            icon={Building2}
            letter={wsLetter}
          />
          <div className="flex grow flex-col gap-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-fg-0 truncate">
                {wsName}
              </span>
              {isEnterprise && (
                <span className="inline-flex items-center rounded-full border border-violet/30 bg-violet/15 px-2 py-0.5 text-[10.5px] font-medium leading-tight text-violet">
                  Enterprise
                </span>
              )}
              {ssoEnforced && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-medium leading-tight text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  SSO enforced
                </span>
              )}
              {scimEnabled && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/15 px-2 py-0.5 text-[10.5px] font-medium leading-tight text-blue-300">
                  <Key className="h-3 w-3" />
                  SCIM
                </span>
              )}
            </div>
            <span className="text-[11px] text-fg-3 truncate">
              {[
                domain,
                createdAt ? `created ${fmtDate(new Date(createdAt), 'MMM d, yyyy')}` : null,
                `${seatsUsed} ${seatsUsed === 1 ? 'member' : 'members'}`,
                `${activeProjects} active ${activeProjects === 1 ? 'project' : 'projects'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-[11px] text-fg-3">Renews</span>
            <span className="text-[12.5px] font-semibold text-fg-0">
              {renewsAt ? fmtDate(new Date(renewsAt), 'MMM d, yyyy') : '—'}
            </span>
          </div>
        </div>

        {/* Stat grid 4-up */}
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={t('workspacePage.stats.activeMembers')}
            value={
              seatsTotal > 0
                ? `${formatNumber(seatsUsed)} / ${formatNumber(seatsTotal)}`
                : formatNumber(seatsUsed)
            }
            hint={
              seatsTotal > 0
                ? `${formatNumber(seatsAvailable)} ${seatsAvailable === 1 ? 'seat' : 'seats'} available`
                : 'No seat cap'
            }
            accent="#5c9aed"
          />
          <StatTile
            label={t('workspacePage.stats.messagesMonth')}
            value={formatNumber(messagesMtd)}
            hint={messagesMtd > 0 ? 'Across all projects' : 'No messages yet'}
            accent="#10b981"
          />
          <StatTile
            label={t('workspacePage.stats.spendMtd')}
            value={`$${spendMtd.toFixed(2)}`}
            hint={
              budgetMtd > 0
                ? `$${formatNumber(budgetMtd.toFixed(2))} budget · ${spendPct}%`
                : 'No budget set'
            }
            accent="#f59e0b"
          />
          <StatTile
            label={t('workspacePage.stats.activeProjects')}
            value={formatNumber(activeProjects)}
            hint={activeProjects === 0 ? 'Create a project to get started' : 'In this workspace'}
            accent="#a78bfa"
          />
        </div>

        {/* Two-col grid: Usage chart + Recent activity */}
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <Section
            title={t('workspacePage.sections.usage')}
            hint="Daily messages across all projects, last 30 days"
            action={
              <span className="inline-flex items-center overflow-hidden rounded-md border border-line bg-bg-2 text-[11px]">
                <span className="cursor-pointer px-2 py-1 text-fg-3 hover:text-fg-1">7d</span>
                <span className="cursor-default border-s border-line bg-bg-3 px-2 py-1 font-medium text-fg-0">30d</span>
                <span className="cursor-pointer border-s border-line px-2 py-1 text-fg-3 hover:text-fg-1">90d</span>
              </span>
            }
          >
            <UsageBarChart data={usage30d} />
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <LegendDot color="#5c9aed" label="GPT-4o" value="—" />
              <LegendDot color="#10b981" label="Claude Sonnet" value="—" />
              <LegendDot color="#a78bfa" label="Gemini" value="—" />
              <LegendDot color="#f59e0b" label="Other" value="—" />
            </div>
          </Section>

          <Section title={t('workspacePage.sections.recentActivity')} hint="Audit feed">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Activity className="h-5 w-5 text-fg-4" />
                <span className="text-[12.5px] text-fg-3">
                  No recent activity yet.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {recentActivity.map((a, i) => (
                  <ActivityRow key={a._id || a.id || i} entry={a} />
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* Two-col grid: Top projects + Groups */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            title={t('workspacePage.sections.topProjects')}
            hint="By message volume"
          >
            {topProjects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <FileText className="h-5 w-5 text-fg-4" />
                <span className="text-[12.5px] text-fg-3">
                  No project activity yet this week.
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                {topProjects.map((p, i) => (
                  <TopProjectRow
                    key={p.project_id || p._id || i}
                    rank={i + 1}
                    project={p}
                    maxMessages={maxProjectMessages}
                    isLast={i === topProjects.length - 1}
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            title={t('workspacePage.sections.groups')}
            hint="Permission groups in this workspace"
            action={
              <Button
                variant="ghost"
                size="sm"
                animated={false}
                onClick={() =>
                  nav(`/workspaces/${wid}/settings?tab=groups`)
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {t('workspacePage.buttons.newGroup')}
              </Button>
            }
          >
            {groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Layers className="h-5 w-5 text-fg-4" />
                <span className="text-[12.5px] text-fg-3">
                  No groups yet. Create one to manage project access.
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {groups.map((g, i) => (
                  <GroupRow key={g._id || g.id || i} group={g} index={i} />
                ))}
              </div>
            )}
          </Section>
        </div>
      </main>
    </div>
  )
}
