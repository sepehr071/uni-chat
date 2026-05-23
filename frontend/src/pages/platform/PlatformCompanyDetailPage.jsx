import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  Users,
  FolderKanban,
  DollarSign,
  Zap,
  Wallet,
  Plus,
  ShieldCheck,
  Crown,
  User as UserIcon,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { platformService } from '@/services/platformService'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmtDate } from '@/utils/dateLocale'
import PlatformAddCreditsDialog from './components/PlatformAddCreditsDialog'

function StatTile({ icon: Icon, label, value, subtitle, tone }) {
  const toneClass = tone === 'positive' ? 'text-success' : tone === 'negative' ? 'text-error' : 'text-foreground'
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 text-foreground-tertiary text-xs uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {subtitle && <div className="mt-1 text-xs text-foreground-tertiary">{subtitle}</div>}
      </CardContent>
    </Card>
  )
}

const fmtMoney = (v) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtNum = (v) => (Number(v) || 0).toLocaleString()

const ROLE_META = {
  admin:   { Icon: Crown,       labelKey: 'companyDetail.byRole.admin',   defaultLabel: 'Admins' },
  manager: { Icon: ShieldCheck, labelKey: 'companyDetail.byRole.manager', defaultLabel: 'Managers' },
  user:    { Icon: UserIcon,    labelKey: 'companyDetail.byRole.user',    defaultLabel: 'Users' },
}

export default function PlatformCompanyDetailPage() {
  const { wid } = useParams()
  const { t, i18n } = useTranslation('platform')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    platformService.getCompanyDetail(wid, days)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setErr(e?.response?.data?.error || t('companyDetail.loadError', 'Failed to load.')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [wid, days, refreshKey])

  if (loading) return <div className="p-12 flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>
  if (err) return <p className="p-6 text-error">{err}</p>

  const ws = data?.workspace || {}
  const projects = data?.projects || []
  const topUsers = data?.top_users || []
  const topModels = data?.top_models || []
  const byRole = data?.by_role || {}
  const daily = data?.daily || []
  const credits = data?.credits || {}
  const recentLedger = data?.recent_ledger || []

  const totalCost = projects.reduce((s, p) => s + (p.cost_usd || 0), 0)
  const totalCalls = projects.reduce((s, p) => s + (p.calls || 0), 0)

  const roleOrder = ['admin', 'manager', 'user']
  const remaining = Number(credits.remaining_usd || 0)
  const remainingTone = remaining < 0 ? 'negative' : remaining < 10 ? undefined : 'positive'

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <Button variant="ghost" size="sm" asChild className="-ms-2 mb-1">
              <Link to="/platform/companies"><ArrowLeft className="h-4 w-4 me-1" /> {t('companyDetail.back', 'All companies')}</Link>
            </Button>
            <h1 className="text-2xl font-bold text-foreground">{ws.name}</h1>
            <div className="text-sm text-foreground-tertiary mt-1">{ws.domain || ws.slug}</div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('range.7d', '7d')}</SelectItem>
                <SelectItem value="30">{t('range.30d', '30d')}</SelectItem>
                <SelectItem value="90">{t('range.90d', '90d')}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setAddOpen(true)} size="sm">
              <Plus className="h-4 w-4 me-1" />
              {t('companyDetail.addBtn', 'Add credits')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={Users} label={t('companyDetail.stats.members', 'Members')} value={fmtNum(data.member_count)} />
          <StatTile icon={FolderKanban} label={t('companyDetail.stats.projects', 'Teams')} value={fmtNum(data.project_count)} />
          <StatTile icon={Zap} label={t('companyDetail.stats.calls', 'Calls')} value={fmtNum(totalCalls)} subtitle={`${days}d`} />
          <StatTile icon={DollarSign} label={t('companyDetail.stats.cost', 'Cost')} value={fmtMoney(totalCost)} subtitle={`${days}d`} />
        </div>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wallet className="h-4 w-4" />
                {t('companyDetail.credits.title', 'Credits')}
              </div>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 me-1" />
                {t('companyDetail.addBtn', 'Add credits')}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md bg-background-tertiary p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-tertiary">{t('companyDetail.credits.lifetimeTopups', 'Lifetime top-ups')}</div>
                <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">{fmtMoney(credits.lifetime_topups_usd)}</div>
              </div>
              <div className="rounded-md bg-background-tertiary p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-tertiary">{t('companyDetail.credits.lifetimeSpend', 'Lifetime spend')}</div>
                <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">{fmtMoney(credits.lifetime_spend_usd)}</div>
              </div>
              <div className="rounded-md bg-background-tertiary p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-tertiary">{t('companyDetail.credits.remaining', 'Remaining')}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${remainingTone === 'negative' ? 'text-error' : remainingTone === 'positive' ? 'text-success' : 'text-foreground'}`}>{fmtMoney(credits.remaining_usd)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm font-semibold text-foreground mb-3">
              {t('companyDetail.byRole.title', 'Usage by role ({{days}}d)', { days })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {roleOrder.map((r) => {
                const meta = ROLE_META[r]
                const v = byRole[r] || { cost_usd: 0, calls: 0, tokens: 0, users: 0 }
                return (
                  <StatTile
                    key={r}
                    icon={meta.Icon}
                    label={t(meta.labelKey, meta.defaultLabel)}
                    value={fmtMoney(v.cost_usd)}
                    subtitle={`${fmtNum(v.users)} ${t('companyDetail.byRole.users', 'users')} · ${fmtNum(v.calls)} ${t('companyDetail.col.calls', 'calls')}`}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm font-semibold text-foreground mb-3">
              {t('companyDetail.dailyChart.title', 'Daily spend ({{days}}d)', { days })}
            </div>
            <div className="h-64">
              {daily.length === 0 ? (
                <div className="h-full flex items-center justify-center text-foreground-tertiary text-sm">{t('companyDetail.dailyChart.empty', 'No usage in this window.')}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pCostFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border) / 0.4)" />
                    <XAxis dataKey="date" stroke="rgb(var(--foreground-tertiary))" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                    <YAxis stroke="rgb(var(--foreground-tertiary))" fontSize={11} tickFormatter={(v) => `$${v < 1 ? v.toFixed(2) : v.toLocaleString()}`} />
                    <Tooltip
                      contentStyle={{ background: 'rgb(var(--background-secondary))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(value, name) => name === 'cost_usd' ? [fmtMoney(value), t('companyDetail.col.cost', 'Cost')] : [value, name]}
                    />
                    <Area type="monotone" dataKey="cost_usd" stroke="#6366f1" fill="url(#pCostFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">
              {t('companyDetail.projectsByUsage', 'Projects — by usage ({{days}}d)', { days })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('companyDetail.col.project', 'Team')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.calls', 'Calls')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.tokens', 'Tokens')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.cost', 'Cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 && (
                    <tr><td colSpan={4} className="text-center py-6 text-foreground-tertiary">{t('companyDetail.noProjects', 'No projects.')}</td></tr>
                  )}
                  {projects.map((p) => (
                    <tr key={p._id} className="border-t border-border hover:bg-background-tertiary/40">
                      <td className="px-4 py-2 text-foreground">{p.name}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtNum(p.calls)}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtNum(p.tokens)}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(p.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">
                {t('companyDetail.topUsers', 'Top users ({{days}}d)', { days })}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('companyDetail.col.user', 'User')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.calls', 'Calls')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.cost', 'Cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topUsers.length === 0 && (<tr><td colSpan={3} className="text-center py-6 text-foreground-tertiary">—</td></tr>)}
                  {topUsers.map((u) => (
                    <tr key={u._id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <div className="text-foreground">{u.name || u.email}</div>
                        {u.name && <div className="text-xs text-foreground-tertiary">{u.email}</div>}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtNum(u.calls)}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(u.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">
                {t('companyDetail.topModels', 'Top models ({{days}}d)', { days })}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('companyDetail.col.model', 'Model')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.calls', 'Calls')}</th>
                    <th className="px-4 py-2 text-end">{t('companyDetail.col.cost', 'Cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topModels.length === 0 && (<tr><td colSpan={3} className="text-center py-6 text-foreground-tertiary">—</td></tr>)}
                  {topModels.map((m) => (
                    <tr key={m.model} className="border-t border-border">
                      <td className="px-4 py-2 font-mono text-xs text-foreground">{m.model}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtNum(m.calls)}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(m.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground flex items-center gap-2">
              <Wallet className="h-4 w-4" /> {t('companyDetail.recentLedger.title', 'Recent ledger entries')}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-start">{t('companyDetail.recentLedger.col.date', 'Date')}</th>
                  <th className="px-4 py-2 text-start">{t('companyDetail.recentLedger.col.type', 'Type')}</th>
                  <th className="px-4 py-2 text-end">{t('companyDetail.recentLedger.col.amount', 'Amount')}</th>
                  <th className="px-4 py-2 text-start">{t('companyDetail.recentLedger.col.by', 'By')}</th>
                  <th className="px-4 py-2 text-start">{t('companyDetail.recentLedger.col.note', 'Note')}</th>
                </tr>
              </thead>
              <tbody>
                {recentLedger.length === 0 && (<tr><td colSpan={5} className="text-center py-6 text-foreground-tertiary">{t('companyDetail.recentLedger.empty', 'No entries yet.')}</td></tr>)}
                {recentLedger.map((r) => {
                  const amt = Number(r.amount_usd || 0)
                  return (
                    <tr key={r._id} className="border-t border-border">
                      <td className="px-4 py-2 text-foreground-secondary whitespace-nowrap">{r.created_at ? fmtDate(new Date(r.created_at), 'PP') : '—'}</td>
                      <td className="px-4 py-2"><span className="text-xs uppercase text-foreground-tertiary">{r.type}</span></td>
                      <td className={`px-4 py-2 text-end tabular-nums font-medium ${amt < 0 ? 'text-error' : 'text-success'}`}>{amt < 0 ? '−' : '+'}{fmtMoney(Math.abs(amt))}</td>
                      <td className="px-4 py-2 text-xs text-foreground">{r.added_by?.display_name || r.added_by?.email || '—'}</td>
                      <td className="px-4 py-2 text-foreground-tertiary truncate max-w-[280px]" title={r.note}>{r.note || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <PlatformAddCreditsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        scope="company"
        workspaceId={wid}
        workspaceName={ws.name}
        onSuccess={reload}
      />
    </div>
  )
}
