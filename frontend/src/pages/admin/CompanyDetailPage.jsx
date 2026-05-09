import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Users, FolderKanban, DollarSign, Zap, ExternalLink } from 'lucide-react'
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

function StatTile({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-border bg-bg-1 p-4">
      <div className="flex items-center gap-2 text-fg-3 text-xs uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-fg-0">{value}</div>
    </div>
  )
}

const fmtMoney = (v) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtNum = (v) => (Number(v) || 0).toLocaleString()

export default function CompanyDetailPage() {
  const { wid } = useParams()
  const { t } = useTranslation(['admin', 'projects'])
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    adminService.getCompanyDetail(wid, days)
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setErr(e?.response?.data?.error || t('companies.toastLoadFailed')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [wid, days])

  if (loading) return <div className="p-8"><LoadingSpinner /></div>
  if (err) return <div className="p-8 text-fg-2">{err}</div>

  const ws = data?.workspace || {}
  const projects = data?.projects || []
  const topUsers = data?.top_users || []
  const topModels = data?.top_models || []

  const totalCost = projects.reduce((s, p) => s + (p.cost_usd || 0), 0)
  const totalCalls = projects.reduce((s, p) => s + (p.calls || 0), 0)
  const totalTokens = projects.reduce((s, p) => s + (p.tokens || 0), 0)

  return (
    <div className="min-h-screen bg-bg-0">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <Button variant="ghost" size="sm" asChild className="-ms-2 mb-1">
              <Link to="/admin/companies"><ArrowLeft className="h-4 w-4 me-1" /> {t('companies.back', 'All companies')}</Link>
            </Button>
            <h1 className="text-2xl font-bold text-fg-0">{ws.name}</h1>
            <div className="text-sm text-fg-3 mt-1">{ws.domain || ws.slug}</div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('companies.range7d')}</SelectItem>
                <SelectItem value="30">{t('companies.range30d')}</SelectItem>
                <SelectItem value="90">{t('companies.range90d')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/workspaces/${wid}`}><ExternalLink className="h-4 w-4 me-1" /> {t('companies.openCompany', 'Open company')}</Link>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={Users} label={t('companies.stats.members', 'Members')} value={fmtNum(data.member_count)} />
          <StatTile icon={FolderKanban} label={t('companies.stats.projects', 'Projects')} value={fmtNum(data.project_count)} />
          <StatTile icon={Zap} label={t('companies.stats.calls', 'Calls')} value={fmtNum(totalCalls)} />
          <StatTile icon={DollarSign} label={t('companies.stats.cost', 'Cost')} value={fmtMoney(totalCost)} />
        </div>

        {/* Projects */}
        <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
          <div className="px-4 py-3 border-b border-border text-sm font-semibold text-fg-0">
            {t('companies.projectsByUsage', 'Projects — by usage ({{days}}d)', { days })}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-fg-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-start">{t('companies.col.project', 'Project')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.calls', 'Calls')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.tokens', 'Tokens')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.cost', 'Cost')}</th>
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-6 text-fg-3">{t('companies.noProjects', 'No projects.')}</td></tr>
                )}
                {projects.map((p) => (
                  <tr key={p._id} className="border-t border-border hover:bg-bg-2/40">
                    <td className="px-4 py-2">
                      <span className="text-fg-0">{p.name}</span>
                      {p.archived && <span className="ms-2 text-[10px] uppercase text-fg-4">{t('projects:status.archived')}</span>}
                      {p.pinned && <span className="ms-2 text-[10px] uppercase text-amber-500">{t('companies.pinned')}</span>}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtNum(p.calls)}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtNum(p.tokens)}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(p.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top users */}
          <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold text-fg-0">
              {t('companies.topUsers', 'Top users — by cost ({{days}}d)', { days })}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-fg-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-start">{t('companies.col.user', 'User')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.calls', 'Calls')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.cost', 'Cost')}</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-6 text-fg-3">—</td></tr>
                )}
                {topUsers.map((u) => (
                  <tr key={u._id} className="border-t border-border">
                    <td className="px-4 py-2">
                      <div className="text-fg-0">{u.name || u.email}</div>
                      {u.name && <div className="text-xs text-fg-3">{u.email}</div>}
                    </td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtNum(u.calls)}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(u.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top models */}
          <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-semibold text-fg-0">
              {t('companies.topModels', 'Top models — by cost ({{days}}d)', { days })}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-fg-3 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-start">{t('companies.col.model', 'Model')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.calls', 'Calls')}</th>
                  <th className="px-4 py-2 text-end">{t('companies.col.cost', 'Cost')}</th>
                </tr>
              </thead>
              <tbody>
                {topModels.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-6 text-fg-3">—</td></tr>
                )}
                {topModels.map((m) => (
                  <tr key={m.model} className="border-t border-border">
                    <td className="px-4 py-2 font-mono text-xs text-fg-0">{m.model}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtNum(m.calls)}</td>
                    <td className="px-4 py-2 text-end tabular-nums">{fmtMoney(m.cost_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
