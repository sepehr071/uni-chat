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
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import { Separator } from '../../../components/ui/separator'
import { cn } from '../../../utils/cn'
import { CostValue } from '../../../components/ui/CostValue'

function isoFromDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const GROUP_BY_KEYS = ['feature', 'model', 'day', 'user']

function formatTokens(val) {
  if (!val) return '0'
  return Number(val).toLocaleString()
}

export default function UsagePanel() {
  const { t } = useTranslation('admin')
  const [groupBy, setGroupBy] = useState('feature')

  const filters = useMemo(() => ({
    from: isoFromDaysAgo(30),
    to: new Date().toISOString(),
    group_by: groupBy,
  }), [groupBy])

  const { data, isLoading, error } = useQuery({
    queryKey: ['usage', 'admin', filters],
    queryFn: () => usageService.getAdminUsage(filters),
    staleTime: 60_000,
  })

  const rows = data?.data || []
  const totalCost = data?.total_cost ?? 0
  const totalTokens = data?.total_tokens ?? 0

  const chartData = rows.map(r => ({
    name: r.key?.split('/').pop() || r.key || '—',
    cost: Number(r.total_cost) || 0,
  }))

  const colLabel = groupBy === 'user'
    ? t('usage.user')
    : groupBy === 'day'
    ? t('usage.colDate')
    : groupBy === 'model'
    ? t('usage.model')
    : t('usage.feature')

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('usage.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-4">
          <SummaryCard label={t('usage.totalCost')} value={<CostValue usd={totalCost} />} highlight />
          <SummaryCard label={t('usage.totalTokens')} value={formatTokens(totalTokens)} />
        </div>

        <Separator />

        {/* Group-by segmented control */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{t('usage.groupBy')}</span>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {GROUP_BY_KEYS.map(key => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors',
                  groupBy === key
                    ? 'bg-accent text-white'
                    : 'bg-background text-foreground-secondary hover:bg-background-secondary'
                )}
              >
                {t(`usage.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Loading / error / empty */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-accent" />
          </div>
        ) : error ? (
          <p className="text-red-500 text-sm py-4">{t('usage.failedLoad')}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg bg-background-secondary/50 p-8 text-center">
            <p className="text-foreground-secondary text-sm">{t('usage.noUsage')}</p>
          </div>
        ) : (
          <>
            {/* Chart */}
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
                    tickFormatter={v => '$' + v.toFixed(3)}
                    tick={{ fill: 'hsl(var(--foreground-secondary))' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background-elevated))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      color: 'hsl(var(--foreground))',
                    }}
                    formatter={v => ['$' + Number(v).toFixed(4), t('usage.colCost')]}
                  />
                  <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Breakdown table */}
            <div>
              <h3 className="font-medium text-foreground mb-3">
                {groupBy === 'user' ? t('usage.perUserBreakdown') : t('usage.allEntries')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">
                        {colLabel}
                      </th>
                      <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('usage.colCost')}</th>
                      <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('usage.colTokens')}</th>
                      <th className="text-end py-2 px-3 text-foreground-secondary font-medium">{t('usage.colRequests')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-background-secondary/50 transition-colors">
                        <td className="py-2 px-3 text-foreground font-mono text-xs">{row.key || '—'}</td>
                        <td className="py-2 px-3 text-end text-foreground font-semibold">
                          <CostValue usd={row.total_cost} />
                        </td>
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
      </CardContent>
    </Card>
  )
}

function SummaryCard({ label, value, highlight }) {
  return (
    <Card className={cn('transition-all', highlight && 'border-accent/30 bg-accent/5')}>
      <CardContent className="p-4">
        <p className="text-xs text-foreground-secondary font-medium">{label}</p>
        <p className={cn('text-xl font-bold mt-1', highlight ? 'text-accent' : 'text-foreground')}>{value}</p>
      </CardContent>
    </Card>
  )
}
