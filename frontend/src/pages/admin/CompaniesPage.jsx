import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Users, FolderKanban, MessageSquare, DollarSign, Zap, ArrowRight, ExternalLink } from 'lucide-react'
import { adminService } from '@/services/adminService'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
function LoadingSpinner() {
  return <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
}

function StatTile({ icon: Icon, label, value, subtitle }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4">
      <div className="flex items-center gap-2 text-fg-3 text-xs uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-fg-0">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-fg-3">{subtitle}</div>}
    </div>
  )
}

function fmtMoney(v) {
  return `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

function fmtNum(v) {
  return (Number(v) || 0).toLocaleString()
}

export default function CompaniesPage() {
  const { t } = useTranslation('admin')
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    adminService.listCompanies(days)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setErr(e?.response?.data?.error || t('companies.toastLoadFailed')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days])

  if (loading) return <div className="p-8"><LoadingSpinner /></div>

  if (err) {
    return <div className="p-8 text-fg-2">{err}</div>
  }

  const companies = data?.companies || []
  const totals = data?.totals || {}
  const usageKey = `usage_${days}d`
  const costKey = `cost_${days}d`
  const callsKey = `calls_${days}d`

  return (
    <div className="min-h-screen bg-bg-0">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold text-fg-0 flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {t('companies.title', 'Companies')}
            </h1>
            <p className="text-sm text-fg-3 mt-1">
              {t('companies.subtitle', 'Cross-company analytics across the holding.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-3">{t('companies.range', 'Range')}</span>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('companies.range7d')}</SelectItem>
                <SelectItem value="30">{t('companies.range30d')}</SelectItem>
                <SelectItem value="90">{t('companies.range90d')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={Building2} label={t('companies.stats.companies', 'Companies')} value={fmtNum(totals.companies)} />
          <StatTile icon={Users}     label={t('companies.stats.members', 'Members')}    value={fmtNum(totals.members)} />
          <StatTile icon={FolderKanban} label={t('companies.stats.projects', 'Projects')} value={fmtNum(totals.projects)} />
          <StatTile icon={MessageSquare} label={t('companies.stats.conversations', 'Conversations')} value={fmtNum(totals.conversations)} />
          <StatTile icon={DollarSign} label={t('companies.stats.cost', 'Cost')} value={fmtMoney(totals[costKey])} subtitle={`${days}d`} />
          <StatTile icon={Zap}        label={t('companies.stats.calls', 'Calls')} value={fmtNum(totals[callsKey])} subtitle={`${days}d`} />
          <StatTile icon={Zap}        label={t('companies.stats.tokens', 'Tokens')} value={fmtNum(totals[`tokens_${days}d`])} subtitle={`${days}d`} />
          <StatTile icon={DollarSign} label={t('companies.stats.balance', 'Credits balance')} value={fmtMoney(totals.credits_balance_usd)} />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-fg-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-start">{t('companies.col.name', 'Company')}</th>
                  <th className="px-4 py-3 text-end">{t('companies.col.members', 'Members')}</th>
                  <th className="px-4 py-3 text-end">{t('companies.col.projects', 'Projects')}</th>
                  <th className="px-4 py-3 text-end">{t('companies.col.conversations', 'Chats')}</th>
                  <th className="px-4 py-3 text-end">{t('companies.col.calls', 'Calls')}</th>
                  <th className="px-4 py-3 text-end">{t('companies.col.cost', 'Cost')}</th>
                  <th className="px-4 py-3 text-end">{t('companies.col.balance', 'Balance')}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-fg-3">{t('companies.empty', 'No companies yet.')}</td></tr>
                )}
                {companies.map((c) => {
                  const u = c[usageKey] || {}
                  return (
                    <tr key={c._id} className="border-t border-border hover:bg-bg-2/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-fg-0">{c.name}</div>
                        <div className="text-xs text-fg-3">{c.domain || c.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(c.member_count)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(c.project_count)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(c.conversation_count)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(u.calls)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtMoney(u.cost_usd)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtMoney(c.credits_balance_usd)}</td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/admin/companies/${c._id}`}>
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/workspaces/${c._id}`} title={t('companies.openCompany', 'Open company')}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
