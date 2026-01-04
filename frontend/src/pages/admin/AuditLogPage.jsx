import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Shield, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import { adminService } from '../../services/adminService'
import { cn } from '../../utils/cn'

const ACTION_LABELS = {
  user_ban: { label: 'User Banned', color: 'text-red-400' },
  user_unban: { label: 'User Unbanned', color: 'text-green-400' },
  role_change: { label: 'Role Changed', color: 'text-yellow-400' },
  template_create: { label: 'Template Created', color: 'text-blue-400' },
  template_delete: { label: 'Template Deleted', color: 'text-orange-400' },
  password_change: { label: 'Password Changed', color: 'text-purple-400' },
}

export default function AuditLogPage() {
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
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Shield className="h-6 w-6" />Audit Log</h1>
            <p className="text-foreground-secondary mt-1">Track administrative actions</p>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-foreground-secondary" />
            <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0) }} className="input-field text-sm py-1.5">
              <option value="">All Actions</option>
              <option value="user_ban">User Bans</option>
              <option value="user_unban">User Unbans</option>
              <option value="role_change">Role Changes</option>
              <option value="template_create">Template Creates</option>
              <option value="template_delete">Template Deletes</option>
            </select>
          </div>
        </div>

        <div className="card">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" /></div>
          ) : logs.length === 0 ? (
            <p className="text-foreground-secondary text-center py-12">No audit logs found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-foreground-secondary font-medium">Action</th>
                    <th className="text-left py-3 px-4 text-foreground-secondary font-medium">Admin</th>
                    <th className="text-left py-3 px-4 text-foreground-secondary font-medium">Details</th>
                    <th className="text-left py-3 px-4 text-foreground-secondary font-medium">IP</th>
                    <th className="text-left py-3 px-4 text-foreground-secondary font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const actionInfo = ACTION_LABELS[log.action] || { label: log.action, color: 'text-foreground' }
                    return (
                      <tr key={log._id} className="border-b border-border/50 hover:bg-background-secondary/50">
                        <td className="py-3 px-4"><span className={cn('font-medium', actionInfo.color)}>{actionInfo.label}</span></td>
                        <td className="py-3 px-4 text-foreground-secondary">{log.admin_email || 'Unknown'}</td>
                        <td className="py-3 px-4 text-foreground-secondary text-sm">{formatDetails(log.details)}</td>
                        <td className="py-3 px-4 text-foreground-tertiary text-sm font-mono">{log.ip_address || '-'}</td>
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
              <p className="text-sm text-foreground-secondary">Page {page + 1} of {totalPages}</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-secondary p-2 disabled:opacity-50"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn btn-secondary p-2 disabled:opacity-50"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
