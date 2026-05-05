import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Shield, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminService } from '../../services/adminService'
import { cn } from '../../utils/cn'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

export default function AuditLogPage() {
  const { t } = useTranslation('admin')
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState('')
  const limit = 20

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, filter],
    queryFn: () => adminService.getAuditLogs(page * limit, limit, filter || undefined),
  })

  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.ceil(total / limit)

  const ACTION_COLORS = {
    user_ban: 'text-red-400',
    user_unban: 'text-green-400',
    role_change: 'text-yellow-400',
    template_create: 'text-blue-400',
    template_delete: 'text-orange-400',
    password_change: 'text-purple-400',
  }

  const formatDetails = (details) => {
    if (!details) return '-'
    const str = JSON.stringify(details)
    return str.length > 50 ? str.substring(0, 50) + '...' : str
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6" />
              {t('auditLog.title')}
            </h1>
            <p className="text-foreground-secondary mt-1">{t('auditLog.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-foreground-secondary" />
            <Select value={filter} onValueChange={(value) => { setFilter(value); setPage(0) }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t('auditLog.allActions')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('auditLog.allActions')}</SelectItem>
                <SelectItem value="user_ban">{t('auditLog.userBans')}</SelectItem>
                <SelectItem value="user_unban">{t('auditLog.userUnbans')}</SelectItem>
                <SelectItem value="role_change">{t('auditLog.roleChanges')}</SelectItem>
                <SelectItem value="template_create">{t('auditLog.templateCreates')}</SelectItem>
                <SelectItem value="template_delete">{t('auditLog.templateDeletes')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : logs.length === 0 ? (
              <p className="text-foreground-secondary text-center py-12">{t('auditLog.noLogs')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-start py-3 px-4 text-foreground-secondary font-medium">{t('auditLog.colAction')}</th>
                      <th className="text-start py-3 px-4 text-foreground-secondary font-medium">{t('auditLog.colAdmin')}</th>
                      <th className="text-start py-3 px-4 text-foreground-secondary font-medium">{t('auditLog.colDetails')}</th>
                      <th className="text-start py-3 px-4 text-foreground-secondary font-medium">{t('auditLog.colIP')}</th>
                      <th className="text-start py-3 px-4 text-foreground-secondary font-medium">{t('auditLog.colTime')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => {
                      const color = ACTION_COLORS[log.action] || 'text-foreground'
                      const label = t(`auditLog.actions.${log.action}`, { defaultValue: log.action })
                      return (
                        <tr key={log._id} className="border-b border-border/50 hover:bg-background-secondary/50">
                          <td className="py-3 px-4"><span className={cn('font-medium', color)}>{label}</span></td>
                          <td className="py-3 px-4 text-foreground-secondary">{log.admin_email || 'Unknown'}</td>
                          <td className="py-3 px-4 text-foreground-secondary text-sm">{formatDetails(log.details)}</td>
                          <td className="py-3 px-4 text-foreground-tertiary text-sm font-mono" dir="ltr">{log.ip_address || '-'}</td>
                          <td className="py-3 px-4 text-foreground-tertiary text-sm">{new Date(log.created_at).toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-foreground-secondary">
                  {t('auditLog.page', { current: page + 1, total: totalPages })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4 rtl:rotate-180" />
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
