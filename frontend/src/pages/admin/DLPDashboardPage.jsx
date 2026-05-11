import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ShieldAlert,
  ShieldX,
  ShieldCheck,
  ShieldQuestion,
  Calendar,
} from 'lucide-react'
import { adminService } from '../../services/adminService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmtDate } from '@/utils/dateLocale'

const PAGE_SIZE = 50

const SEVERITY_COLORS = {
  critical: 'bg-err/15 text-err border-err/30',
  high: 'bg-warn/15 text-warn border-warn/30',
  medium: 'bg-warn/15 text-warn border-warn/30',
  low: 'bg-accent/15 text-accent border-accent/30',
}

const ACTION_COLORS = {
  block: 'bg-err/15 text-err border-err/30',
  require_confirm: 'bg-warn/15 text-warn border-warn/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
}

export default function DLPDashboardPage() {
  const { t } = useTranslation('admin')
  const [days, setDays] = useState(30)
  const [action, setAction] = useState('')
  const [severity, setSeverity] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [skip, setSkip] = useState(0)

  const summaryQuery = useQuery({
    queryKey: ['admin-dlp-summary', days],
    queryFn: () => adminService.getDlpSummary(days),
  })

  const eventsQuery = useQuery({
    queryKey: ['admin-dlp-events', days, action, severity, workspaceId, skip],
    queryFn: () =>
      adminService.listDlpEvents({
        days,
        action: action || undefined,
        severity: severity || undefined,
        workspaceId: workspaceId || undefined,
        skip,
        limit: PAGE_SIZE,
      }),
  })

  const companiesQuery = useQuery({
    queryKey: ['admin-companies-list'],
    queryFn: () => adminService.listCompanies(days),
  })

  const summary = summaryQuery.data || {}
  const events = eventsQuery.data?.rows || []
  const total = eventsQuery.data?.total || 0
  const companies = companiesQuery.data?.companies || []

  const handleFilterChange = () => setSkip(0)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('dlp.title')}</h1>
            <p className="text-foreground-secondary mt-1">{t('dlp.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-foreground-secondary" />
            <Select
              value={days.toString()}
              onValueChange={(v) => {
                setDays(Number(v))
                setSkip(0)
              }}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('dashboard.last7days')}</SelectItem>
                <SelectItem value="30">{t('dashboard.last30days')}</SelectItem>
                <SelectItem value="90">{t('dashboard.last90days')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryTile
            icon={ShieldAlert}
            label={t('dlp.statTotal')}
            value={summary.total ?? 0}
            isLoading={summaryQuery.isLoading}
            iconClass="text-foreground-secondary"
          />
          <SummaryTile
            icon={ShieldX}
            label={t('dlp.statBlocked')}
            value={summary.by_action?.block ?? 0}
            isLoading={summaryQuery.isLoading}
            iconClass="text-err"
          />
          <SummaryTile
            icon={ShieldQuestion}
            label={t('dlp.statConfirm')}
            value={summary.by_action?.require_confirm ?? 0}
            isLoading={summaryQuery.isLoading}
            iconClass="text-warn"
          />
          <SummaryTile
            icon={ShieldCheck}
            label={t('dlp.statWarn')}
            value={summary.by_action?.warn ?? 0}
            isLoading={summaryQuery.isLoading}
            iconClass="text-warn"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select
            value={action || 'all'}
            onValueChange={(v) => {
              setAction(v === 'all' ? '' : v)
              handleFilterChange()
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('dlp.filterAction')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dlp.allActions')}</SelectItem>
              <SelectItem value="block">{t('dlp.actionBlock')}</SelectItem>
              <SelectItem value="require_confirm">{t('dlp.actionConfirm')}</SelectItem>
              <SelectItem value="warn">{t('dlp.actionWarn')}</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={severity || 'all'}
            onValueChange={(v) => {
              setSeverity(v === 'all' ? '' : v)
              handleFilterChange()
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t('dlp.filterSeverity')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dlp.allSeverities')}</SelectItem>
              <SelectItem value="critical">{t('dlp.sevCritical')}</SelectItem>
              <SelectItem value="high">{t('dlp.sevHigh')}</SelectItem>
              <SelectItem value="medium">{t('dlp.sevMedium')}</SelectItem>
              <SelectItem value="low">{t('dlp.sevLow')}</SelectItem>
            </SelectContent>
          </Select>

          {companies.length > 0 && (
            <Select
              value={workspaceId || 'all'}
              onValueChange={(v) => {
                setWorkspaceId(v === 'all' ? '' : v)
                handleFilterChange()
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('dlp.filterCompany')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dlp.allCompanies')}</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Events table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('dlp.eventsTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <p className="text-foreground-secondary text-sm py-8 text-center">
                {t('dlp.empty')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colTime')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colCompany')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colUser')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colSeverity')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colAction')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colSource')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colRule')}</th>
                      <th className="text-start py-2 px-3 text-foreground-secondary font-medium">{t('dlp.colSnippet')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => {
                      const topMatch = ev.matches?.[0] || {}
                      const snippet = topMatch.snippet || ''
                      const ruleName = topMatch.rule_name || topMatch.rule_id || '—'
                      const severity = topMatch.severity || '—'
                      const createdAt = ev.created_at
                        ? fmtDate(new Date(ev.created_at), 'MMM d, HH:mm')
                        : '—'
                      return (
                        <tr key={ev._id} className="border-b border-border/50 hover:bg-background-secondary/50">
                          <td className="py-2 px-3 text-foreground-tertiary whitespace-nowrap">{createdAt}</td>
                          <td className="py-2 px-3 text-foreground truncate max-w-[120px]">
                            {ev.workspace_name || ev.workspace_id || '—'}
                          </td>
                          <td className="py-2 px-3 text-foreground truncate max-w-[140px]">
                            {ev.user_email || ev.user_id || '—'}
                          </td>
                          <td className="py-2 px-3">
                            <Badge
                              variant="outline"
                              className={SEVERITY_COLORS[severity] || ''}
                            >
                              {t(`dlp.sev${severity.charAt(0).toUpperCase() + severity.slice(1)}`, severity)}
                            </Badge>
                          </td>
                          <td className="py-2 px-3">
                            <Badge
                              variant="outline"
                              className={ACTION_COLORS[ev.highest_action] || ''}
                            >
                              {t(`dlp.action${ev.highest_action === 'require_confirm' ? 'Confirm' : ev.highest_action.charAt(0).toUpperCase() + ev.highest_action.slice(1)}`, ev.highest_action)}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-foreground-secondary">
                            {t(`dlp.source${ev.source?.charAt(0).toUpperCase() + ev.source?.slice(1)}`, ev.source || '—')}
                          </td>
                          <td className="py-2 px-3 text-foreground-secondary truncate max-w-[140px]">{ruleName}</td>
                          <td className="py-2 px-3 max-w-[200px]">
                            {snippet ? (
                              <span
                                title={snippet}
                                className="text-foreground-tertiary truncate block cursor-help font-mono text-xs"
                              >
                                {snippet.length > 40 ? snippet.slice(0, 40) + '…' : snippet}
                              </span>
                            ) : (
                              <span className="text-foreground-tertiary">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <p className="text-sm text-foreground-secondary">
                  {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} / {total}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={skip === 0}
                    onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
                  >
                    {t('users.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={skip + PAGE_SIZE >= total}
                    onClick={() => setSkip(skip + PAGE_SIZE)}
                  >
                    {t('users.next')}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function SummaryTile({ icon: Icon, label, value, isLoading, iconClass }) {
  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ) : (
          <>
            <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center mb-3">
              <Icon className={`h-5 w-5 ${iconClass}`} />
            </div>
            <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
            <p className="text-sm text-foreground-secondary">{label}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
