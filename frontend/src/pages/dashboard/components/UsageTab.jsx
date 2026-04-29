import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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

function isoFromDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

const GROUP_BY_OPTIONS = [
  { value: 'feature', label: 'Feature' },
  { value: 'model', label: 'Model' },
  { value: 'day', label: 'Day' },
]

function formatUSD(val) {
  if (!val) return '$0.0000'
  return '$' + Number(val).toFixed(4)
}

function formatTokens(val) {
  if (!val) return '0'
  return Number(val).toLocaleString()
}

export default function UsageTab() {
  const [groupBy, setGroupBy] = useState('feature')

  const filters = {
    from: isoFromDaysAgo(30),
    to: new Date().toISOString(),
    group_by: groupBy,
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['usage', 'me', filters],
    queryFn: () => usageService.getMyUsage(filters),
    staleTime: 60_000,
  })

  const rows = data?.data || []
  const totalCost = data?.total_cost ?? 0
  const totalTokens = data?.total_tokens ?? 0

  const top5 = [...rows].sort((a, b) => b.total_cost - a.total_cost).slice(0, 5)

  const chartData = rows.map(r => ({
    name: r.key?.split('/').pop() || r.key || '—',
    cost: Number(r.total_cost) || 0,
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
      <p className="text-red-500 text-sm py-4">Failed to load usage data.</p>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <SummaryCard label="Total Cost (30 days)" value={formatUSD(totalCost)} highlight />
        <SummaryCard label="Total Tokens" value={formatTokens(totalTokens)} />
      </div>

      <Separator />

      {/* Group-by segmented control */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">Group by</span>
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

      {/* Chart */}
      {rows.length === 0 ? (
        <div className="rounded-lg bg-background-secondary/50 p-8 text-center">
          <p className="text-foreground-secondary text-sm">No usage logged yet for this period.</p>
        </div>
      ) : (
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
                formatter={v => ['$' + Number(v).toFixed(4), 'Cost']}
              />
              <Bar dataKey="cost" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top-5 table */}
      {top5.length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="font-medium text-foreground mb-3">Top by Cost</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-foreground-secondary font-medium">
                      {groupBy === 'day' ? 'Date' : groupBy === 'model' ? 'Model' : 'Feature'}
                    </th>
                    <th className="text-right py-2 px-3 text-foreground-secondary font-medium">Cost</th>
                    <th className="text-right py-2 px-3 text-foreground-secondary font-medium">Tokens</th>
                    <th className="text-right py-2 px-3 text-foreground-secondary font-medium">Requests</th>
                  </tr>
                </thead>
                <tbody>
                  {top5.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-background-secondary/50 transition-colors">
                      <td className="py-2 px-3 text-foreground font-mono text-xs">{row.key || '—'}</td>
                      <td className="py-2 px-3 text-right text-foreground font-semibold">{formatUSD(row.total_cost)}</td>
                      <td className="py-2 px-3 text-right text-foreground-secondary">{formatTokens(row.total_tokens)}</td>
                      <td className="py-2 px-3 text-right text-foreground-secondary">{row.count ?? 0}</td>
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
