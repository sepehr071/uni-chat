import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Building2,
  FolderKanban,
  Users,
  MessageSquare,
  DollarSign,
  Loader2,
  UserCircle,
  Wallet,
  Plus,
  Crown,
  ShieldCheck,
  User as UserIcon,
  Zap,
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
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CostValue } from '@/components/ui/CostValue'
import { platformService } from '@/services/platformService'
import PlatformAddCreditsDialog from './components/PlatformAddCreditsDialog'

const fmtMoney = (v) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtNum = (v) => (Number(v) || 0).toLocaleString()

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

const ROLE_META = {
  admin:   { Icon: Crown,       labelKey: 'holding.byRole.admin',   defaultLabel: 'Admins' },
  manager: { Icon: ShieldCheck, labelKey: 'holding.byRole.manager', defaultLabel: 'Managers' },
  user:    { Icon: UserIcon,    labelKey: 'holding.byRole.user',    defaultLabel: 'Users' },
}

export default function HoldingOverviewPage() {
  const { t } = useTranslation('platform')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const reload = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    platformService.getHoldingOverview(days)
      .then((res) => { if (alive) { setData(res); setError(null) } })
      .catch((err) => { if (alive) setError(err?.response?.data?.error || t('holding.loadError')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, refreshKey, t])

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
  if (error) return <p className="text-error p-6">{error}</p>

  const ceo = data?.ceo || null
  const totals = data?.totals || {}
  const daily = data?.daily || []
  const topCompanies = data?.top_companies || []
  const topModels = data?.top_models || []
  const byRole = data?.by_role || {}
  const credits = data?.holding_credits || {}
  const remaining = Number(credits.remaining_usd || 0)
  const remainingTone = remaining < 0 ? 'negative' : remaining < 100 ? undefined : 'positive'
  const roleOrder = ['admin', 'manager', 'user']

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {t('holding.title')}
            </h1>
            <p className="text-foreground-secondary mt-1">{t('holding.subtitle')}</p>
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
              {t('holding.chargeBtn', 'Charge holding')}
            </Button>
          </div>
        </div>

        {/* Counts + window totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={Building2} label={t('holding.tiles.companies')} value={fmtNum(data?.workspaces_count)} />
          <StatTile icon={FolderKanban} label={t('holding.tiles.projects')} value={fmtNum(data?.projects_count)} />
          <StatTile icon={Users} label={t('holding.tiles.users')} value={fmtNum(data?.users_count)} />
          <StatTile icon={MessageSquare} label={t('holding.tiles.conversations')} value={fmtNum(data?.conversations_count)} />
          <StatTile icon={DollarSign} label={t('holding.tiles.cost')} value={<CostValue usd={totals.cost_usd} />} subtitle={`${days}d`} />
          <StatTile icon={Zap} label={t('holding.tiles.calls', 'Calls')} value={fmtNum(totals.calls)} subtitle={`${days}d`} />
          <StatTile icon={Zap} label={t('holding.tiles.tokens', 'Tokens')} value={fmtNum(totals.tokens)} subtitle={`${days}d`} />
        </div>

        {/* Holding credits card */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Wallet className="h-4 w-4" />
                {t('holding.credits.title', 'Holding credits')}
              </div>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 me-1" />
                {t('holding.chargeBtn', 'Charge holding')}
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-md bg-background-tertiary p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-tertiary">{t('holding.credits.lifetimeTopups', 'Lifetime top-ups')}</div>
                <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">{fmtMoney(credits.lifetime_topups_usd)}</div>
              </div>
              <div className="rounded-md bg-background-tertiary p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-tertiary">{t('holding.credits.lifetimeSpend', 'Lifetime spend')}</div>
                <div className="mt-1 text-xl font-semibold text-foreground tabular-nums">{fmtMoney(credits.lifetime_spend_usd)}</div>
              </div>
              <div className="rounded-md bg-background-tertiary p-3">
                <div className="text-xs uppercase tracking-wide text-foreground-tertiary">{t('holding.credits.remaining', 'Remaining')}</div>
                <div className={`mt-1 text-xl font-semibold tabular-nums ${remainingTone === 'negative' ? 'text-error' : remainingTone === 'positive' ? 'text-success' : 'text-foreground'}`}>{fmtMoney(credits.remaining_usd)}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* By role */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm font-semibold text-foreground mb-3">
              {t('holding.byRole.title', 'Usage by role ({{days}}d)', { days })}
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
                    subtitle={`${fmtNum(v.users)} ${t('holding.byRole.users', 'users')} · ${fmtNum(v.calls)} ${t('holding.col.calls', 'calls')}`}
                  />
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Daily chart */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-sm font-semibold text-foreground mb-3">
              {t('holding.dailyChart.title', 'Holding spend ({{days}}d)', { days })}
            </div>
            <div className="h-64">
              {daily.length === 0 ? (
                <div className="h-full flex items-center justify-center text-foreground-tertiary text-sm">{t('holding.dailyChart.empty', 'No usage in this window.')}</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hCostFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border) / 0.4)" />
                    <XAxis dataKey="date" stroke="rgb(var(--foreground-tertiary))" fontSize={11} tickFormatter={(d) => d.slice(5)} />
                    <YAxis stroke="rgb(var(--foreground-tertiary))" fontSize={11} tickFormatter={(v) => `$${v < 1 ? v.toFixed(2) : v.toLocaleString()}`} />
                    <Tooltip
                      contentStyle={{ background: 'rgb(var(--background-secondary))', border: '1px solid rgb(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(value, name) => name === 'cost_usd' ? [fmtMoney(value), t('holding.col.cost', 'Cost')] : [value, name]}
                    />
                    <Area type="monotone" dataKey="cost_usd" stroke="#6366f1" fill="url(#hCostFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top companies + Top models */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">
                {t('holding.topCompanies', 'Top companies ({{days}}d)', { days })}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('holding.col.company', 'Company')}</th>
                    <th className="px-4 py-2 text-end">{t('holding.col.calls', 'Calls')}</th>
                    <th className="px-4 py-2 text-end">{t('holding.col.cost', 'Cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topCompanies.length === 0 && (<tr><td colSpan={3} className="text-center py-6 text-foreground-tertiary">—</td></tr>)}
                  {topCompanies.map((c) => (
                    <tr key={c._id} className="border-t border-border">
                      <td className="px-4 py-2">
                        <Link to={`/platform/companies/${c._id}`} className="text-foreground hover:underline">{c.name}</Link>
                        {c.domain && <div className="text-xs text-foreground-tertiary">{c.domain}</div>}
                      </td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtNum(c.calls)}</td>
                      <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(c.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold text-foreground">
                {t('holding.topModels', 'Top models ({{days}}d)', { days })}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-start">{t('holding.col.model', 'Model')}</th>
                    <th className="px-4 py-2 text-end">{t('holding.col.calls', 'Calls')}</th>
                    <th className="px-4 py-2 text-end">{t('holding.col.cost', 'Cost')}</th>
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

        {/* CEO card */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-accent/15 text-accent flex items-center justify-center flex-shrink-0">
                <UserCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-foreground">{t('holding.ceo.title')}</h2>
                <p className="text-xs text-foreground-tertiary mt-0.5">{t('holding.ceo.subtitle')}</p>
                {ceo ? (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4 text-sm">
                    <div className="space-y-0.5">
                      <dt className="text-xs text-foreground-tertiary uppercase tracking-wide">{t('holding.ceo.email')}</dt>
                      <dd className="text-foreground" dir="ltr">{ceo.email || '-'}</dd>
                    </div>
                    <div className="space-y-0.5">
                      <dt className="text-xs text-foreground-tertiary uppercase tracking-wide">{t('holding.ceo.displayName')}</dt>
                      <dd className="text-foreground">{ceo.display_name || ceo.profile?.display_name || '-'}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-foreground-secondary">{t('holding.ceo.noCEO')}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <PlatformAddCreditsDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        scope="holding"
        onSuccess={reload}
      />
    </div>
  )
}
