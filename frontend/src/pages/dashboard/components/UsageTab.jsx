import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { usageService } from '../../../services/usageService'
import { Card, CardContent } from '../../../components/ui/card'
import { Separator } from '../../../components/ui/separator'
import { cn } from '../../../utils/cn'
import { CostValue } from '../../../components/ui/CostValue'
import { useWorkspace } from '../../../context/WorkspaceContext'
import { useAuth } from '../../../context/AuthContext'

function isoFromDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function formatTokens(val) {
  if (!val) return '0'
  return Number(val).toLocaleString()
}

export default function UsageTab() {
  const { t } = useTranslation('dashboard')
  const [groupBy, setGroupBy] = useState('feature')
  const { workspaces } = useWorkspace()
  const { user } = useAuth()
  const canSeeCost =
    user?.role === 'admin' || (workspaces || []).some((w) => w.role === 'owner')

  const GROUP_BY_OPTIONS = [
    { value: 'feature', label: t('usage.groupByFeature') },
    { value: 'model', label: t('usage.groupByModel') },
    { value: 'day', label: t('usage.groupByDay') },
  ]

  const filters = useMemo(() => ({
    from: isoFromDaysAgo(30),
    to: new Date().toISOString(),
    group_by: groupBy,
  }), [groupBy])

  const { data, isLoading, error } = useQuery({
    queryKey: ['usage', 'me', filters],
    queryFn: () => usageService.getMyUsage(filters),
    staleTime: 60_000,
  })

  const rows = data?.data || []
  // Preserve null/undefined so gated cost renders as '—', not '$0.00'.
  const totalCost = data?.total_cost
  const totalTokens = data?.total_tokens ?? 0

  // Sort by total_cost when present; null/undefined sort to the end.
  const top5 = [...rows]
    .sort((a, b) => {
      const av = a.total_cost == null ? -Infinity : Number(a.total_cost)
      const bv = b.total_cost == null ? -Infinity : Number(b.total_cost)
      return bv - av
    })
    .slice(0, 5)

  // Chart entries only include rows with a numeric cost — otherwise the bar
  // would be a misleading zero. If every row is gated, chartData is empty
  // and the chart block won't render meaningfully.
  const chartData = rows
    .filter(r => r.total_cost != null && !Number.isNaN(Number(r.total_cost)))
    .map(r => ({
      name: r.key?.split('/').pop() || r.key || '—',
      cost: Number(r.total_cost),
    }))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-red-500 text-sm py-4">{t('usage.failedToLoad')}</p>
    )
  }

  return (
    <div className="space-y-6">
      <div className={cn('grid gap-4', canSeeCost ? 'grid-cols-2' : 'grid-cols-1')}>
        {canSeeCost && (
          <SummaryCard
            label={t('usage.totalCost')}
            value={<CostValue usd={totalCost} />}
            highlight
          />
        )}
        <SummaryCard label={t('usage.totalTokens')} value={formatTokens(totalTokens)} />
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{t('usage.groupBy')}</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {GROUP_BY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setGroupBy(opt.value)}
              className={cn(
                'px-3 py-1.5 text-sm transition-colors',
                groupBy === opt.value
                  ? 'bg-accent text-white'
                  : 'bg-background text-foreground-secondary hover:bg-background-secondary'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg bg-background-secondary/50 p-8 text-center">
          <p className="text-foreground-secondary text-sm">{t('usage.noUsageYet')}</p>
        </div>
      ) : canSeeCost && chartData.length > 0 ? (
        <div className="rounded-lg bg-background-secondary/50 p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--foreground-tertiary))"
                fontSize={11}
                tick={{ fill: 'hsl(var(--foreground-secondary))' }}
              />
              <YAxis
                stroke="hsl(var(--foreground-tertiary))"
                fontSize={11}
                tickFormatter={v => (v == null || Number.isNaN(Number(v)) ? '—' : '$' + Number(v).toFixed(3))}
                tick={{ fill: 'hsl(var(--foreground-secondary))' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background-elevated))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
                formatter={v => [v == null || Number.isNaN(Number(v)) ? '—' : '$' + Number(v).toFixed(4), t('usage.cost')]}
              />
              <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {top5.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="font-medium text-foreground mb-3">{t('usage.topByCost')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-start py-2 px-3 text-foreground-secondary font-medium">
                      {groupBy === 'day' ? t('usage.date') : groupBy === 'model' ? t('usage.model') : t('usage.feature')}
                    </th>
                    {canSeeCost && (
                      <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('usage.cost')}</th>
                    )}
                    <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('usage.tokens')}</th>
                    <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('usage.requests')}</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-background-secondary/50 transition-colors">
                      <td className="py-2 px-3 text-foreground font-mono text-xs">{row.key || '—'}</td>
                      {canSeeCost && (
                        <td className="py-2 px-3 text-end text-foreground font-semibold">
                          <CostValue usd={row.total_cost} />
                        </td>
                      )}
                      <td className="py-2 px-3 text-end text-foreground-secondary">{formatTokens(row.total_tokens)}</td>
                      <td className="py-2 px-3 text-end text-foreground-secondary">{row.count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, highlight }) {
  return (
    <Card className={cn('transition-all hover:shadow-md', highlight && 'border-accent/30 bg-accent/5')}>
      <CardContent className="p-4">
        <p className="text-xs text-foreground-secondary font-medium">{label}</p>
        <p className={cn('text-xl font-bold mt-1', highlight ? 'text-accent' : 'text-foreground')}>{value}</p>
      </CardContent>
    </Card>
  )
}
