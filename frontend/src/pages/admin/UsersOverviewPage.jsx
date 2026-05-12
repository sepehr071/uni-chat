import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users as UsersIcon,
  Search,
  DollarSign,
  Zap,
  ChevronLeft,
  ChevronRight,
  Crown,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react'
import { adminService } from '@/services/adminService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { fmtDate } from '@/utils/dateLocale'

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

const fmtMoney = (v) => `$${(Number(v) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
const fmtNum = (v) => (Number(v) || 0).toLocaleString()

const ROLE_BADGE = {
  admin:   { Icon: Crown,       cls: 'bg-violet/15 text-violet' },
  manager: { Icon: ShieldCheck, cls: 'bg-accent/15 text-accent' },
  user:    { Icon: UserIcon,    cls: 'bg-bg-2 text-fg-2' },
}

function RoleBadge({ role }) {
  const meta = ROLE_BADGE[role] || ROLE_BADGE.user
  const { Icon } = meta
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] uppercase tracking-wide ${meta.cls}`}>
      <Icon className="h-3 w-3" />
      {role}
    </span>
  )
}

export default function UsersOverviewPage() {
  const { t, i18n } = useTranslation('admin')
  const [days, setDays] = useState(30)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const limit = 50

  useEffect(() => {
    let alive = true
    setLoading(true)
    adminService.listUsersOverview({
      days,
      page,
      limit,
      search: search || undefined,
      role: roleFilter === 'all' ? undefined : roleFilter,
    })
      .then((res) => { if (alive) setData(res) })
      .catch((e) => { if (alive) setErr(e?.response?.data?.error || t('usersOverview.loadFailed', 'Failed to load.')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [days, page, search, roleFilter])

  const submitSearch = (e) => {
    e?.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const users = data?.users || []
  const total = data?.total || 0
  const totals = data?.totals || {}
  const pageMax = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="min-h-screen bg-bg-0">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-fg-0 flex items-center gap-2">
              <UsersIcon className="h-6 w-6" />
              {t('usersOverview.title', 'Users — analytics')}
            </h1>
            <p className="text-sm text-fg-3 mt-1">
              {t('usersOverview.subtitle', 'Cross-holding usage by user. Read-only — moderation lives in All users.')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); setPage(1) }}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t('companies.range7d')}</SelectItem>
                <SelectItem value="30">{t('companies.range30d')}</SelectItem>
                <SelectItem value="90">{t('companies.range90d')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <form onSubmit={submitSearch} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-3 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('usersOverview.searchPlaceholder', 'Search email or name…')}
                className="ps-9 w-[260px]"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              {t('usersOverview.searchBtn', 'Search')}
            </Button>
          </form>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('usersOverview.role.all', 'All roles')}</SelectItem>
              <SelectItem value="admin">{t('usersOverview.role.admin', 'Admins')}</SelectItem>
              <SelectItem value="manager">{t('usersOverview.role.manager', 'Managers')}</SelectItem>
              <SelectItem value="user">{t('usersOverview.role.user', 'Users')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile icon={UsersIcon} label={t('usersOverview.stats.users', 'Users')} value={fmtNum(totals.users)} />
          <StatTile icon={DollarSign} label={t('usersOverview.stats.cost', 'Cost')} value={fmtMoney(totals.cost_usd)} subtitle={`${days}d`} />
          <StatTile icon={Zap} label={t('usersOverview.stats.calls', 'Calls')} value={fmtNum(totals.calls)} subtitle={`${days}d`} />
          <StatTile icon={Zap} label={t('usersOverview.stats.tokens', 'Tokens')} value={fmtNum(totals.tokens)} subtitle={`${days}d`} />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border bg-bg-1 overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><LoadingSpinner /></div>
          ) : err ? (
            <div className="p-8 text-fg-2">{err}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-2 text-fg-3 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3 text-start">{t('usersOverview.col.user', 'User')}</th>
                    <th className="px-4 py-3 text-start">{t('usersOverview.col.role', 'Role')}</th>
                    <th className="px-4 py-3 text-start">{t('usersOverview.col.lastActive', 'Last active')}</th>
                    <th className="px-4 py-3 text-end">{t('usersOverview.col.workspaces', 'Companies')}</th>
                    <th className="px-4 py-3 text-end">{t('usersOverview.col.calls', 'Calls')}</th>
                    <th className="px-4 py-3 text-end">{t('usersOverview.col.tokens', 'Tokens')}</th>
                    <th className="px-4 py-3 text-end">{t('usersOverview.col.cost', 'Cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-fg-3">{t('usersOverview.empty', 'No users match.')}</td></tr>
                  )}
                  {users.map((u) => (
                    <tr key={u._id} className="border-t border-border hover:bg-bg-2/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-fg-0">{u.display_name || u.email}</div>
                        {u.display_name && <div className="text-xs text-fg-3">{u.email}</div>}
                        {u.is_banned && <div className="text-[10px] uppercase mt-0.5 text-error">{t('usersOverview.banned', 'Banned')}</div>}
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3 text-xs text-fg-2 whitespace-nowrap">
                        {u.last_active ? fmtDate(new Date(u.last_active), 'PP') : '—'}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(u.workspaces_count)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(u.calls)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtNum(u.tokens)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{fmtMoney(u.cost_usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > limit && (
          <div className="flex items-center justify-between text-sm text-fg-3">
            <span>{t('usersOverview.pageInfo', 'Page {{page}} of {{max}} — {{total}} users', { page, max: pageMax, total: fmtNum(total) })}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pageMax} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
