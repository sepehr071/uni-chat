import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Users, FolderKanban, MessageSquare, DollarSign, Zap, ArrowRight } from 'lucide-react'
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

function StatTile({ icon: Icon, label, value, subtitle }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-2 text-foreground-tertiary text-xs uppercase tracking-wide">
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold text-foreground tabular-nums">{value}</div>
        {subtitle && <div className="mt-1 text-xs text-foreground-tertiary">{subtitle}</div>}
      </CardContent>
    </Card>
  )
}

const fmtMoney = (v) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtNum = (v) => (Number(v) || 0).toLocaleString()

export default function PlatformCompaniesPage() {
  const { t } = useTranslation('platform')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    platformService.listCompanies(days)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setErr(e?.response?.data?.error || t('companies.loadError', 'Failed to load.')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days])

  if (loading) return <div className="p-12 flex justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>
  if (err) return <p className="p-6 text-error">{err}</p>

  const companies = data?.companies || []
  const totals = data?.totals || {}
  const usageKey = `usage_${days}d`
  const costKey = `cost_${days}d`
  const callsKey = `calls_${days}d`
  const tokensKey = `tokens_${days}d`

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {t('companies.title', 'Companies')}
            </h1>
            <p className="text-foreground-secondary mt-1">{t('companies.subtitle', 'Cross-company analytics + billing.')}</p>
          </div>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t('range.7d', '7d')}</SelectItem>
              <SelectItem value="30">{t('range.30d', '30d')}</SelectItem>
              <SelectItem value="90">{t('range.90d', '90d')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={Building2} label={t('companies.stats.companies', 'Companies')} value={fmtNum(totals.companies)} />
          <StatTile icon={Users} label={t('companies.stats.members', 'Members')} value={fmtNum(totals.members)} />
          <StatTile icon={FolderKanban} label={t('companies.stats.projects', 'Teams')} value={fmtNum(totals.projects)} />
          <StatTile icon={MessageSquare} label={t('companies.stats.conversations', 'Conversations')} value={fmtNum(totals.conversations)} />
          <StatTile icon={DollarSign} label={t('companies.stats.cost', 'Cost')} value={fmtMoney(totals[costKey])} subtitle={`${days}d`} />
          <StatTile icon={Zap} label={t('companies.stats.calls', 'Calls')} value={fmtNum(totals[callsKey])} subtitle={`${days}d`} />
          <StatTile icon={Zap} label={t('companies.stats.tokens', 'Tokens')} value={fmtNum(totals[tokensKey])} subtitle={`${days}d`} />
          <StatTile icon={DollarSign} label={t('companies.stats.balance', 'Credits balance')} value={fmtMoney(totals.credits_balance_usd)} />
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background-tertiary text-foreground-tertiary text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('companies.col.name', 'Company')}</th>
                    <th className="px-4 py-3 text-end">{t('companies.col.members', 'Members')}</th>
                    <th className="px-4 py-3 text-end">{t('companies.col.projects', 'Teams')}</th>
                    <th className="px-4 py-3 text-end">{t('companies.col.conversations', 'Chats')}</th>
                    <th className="px-4 py-3 text-end">{t('companies.col.calls', 'Calls')}</th>
                    <th className="px-4 py-3 text-end">{t('companies.col.cost', 'Cost')}</th>
                    <th className="px-4 py-3 text-end">{t('companies.col.balance', 'Balance')}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-10 text-foreground-tertiary">{t('companies.empty', 'No companies yet.')}</td></tr>
                  )}
                  {companies.map((c) => {
                    const u = c[usageKey] || {}
                    return (
                      <tr key={c._id} className="border-t border-border hover:bg-background-tertiary/40">
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{c.name}</div>
                          <div className="text-xs text-foreground-tertiary">{c.domain || c.slug}</div>
                        </td>
                        <td className="px-4 py-3 text-end tabular-nums">{fmtNum(c.member_count)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{fmtNum(c.project_count)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{fmtNum(c.conversation_count)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{fmtNum(u.calls)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{fmtMoney(u.cost_usd)}</td>
                        <td className="px-4 py-3 text-end tabular-nums">{fmtMoney(c.credits_balance_usd)}</td>
                        <td className="px-4 py-3 text-end">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/platform/companies/${c._id}`}>
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
