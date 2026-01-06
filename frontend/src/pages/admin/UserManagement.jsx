import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Search,
  Users,
  Shield,
  Ban,
  CheckCircle,
  MoreVertical,
  Eye,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { adminService } from '../../services/adminService'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function UserManagement() {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [includeBanned, setIncludeBanned] = useState(true)
  const [selectedUser, setSelectedUser] = useState(null)
  const [showBanModal, setShowBanModal] = useState(false)
  const [showLimitsModal, setShowLimitsModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, includeBanned, searchQuery],
    queryFn: () => adminService.getUsers({
      page,
      limit: 20,
      include_banned: includeBanned,
      search: searchQuery,
    }),
  })

  const users = data?.users || []
  const total = data?.total || 0
  const hasMore = data?.has_more || false

  const banMutation = useMutation({
    mutationFn: ({ userId, reason }) => adminService.banUser(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User banned')
      setShowBanModal(false)
      setSelectedUser(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to ban user')
    },
  })

  const unbanMutation = useMutation({
    mutationFn: adminService.unbanUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('User unbanned')
    },
    onError: () => {
      toast.error('Failed to unban user')
    },
  })

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-foreground-secondary mt-1">
            {total} user{total !== 1 ? 's' : ''} total
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-tertiary" />
            <input
              type="text"
              placeholder="Search users by email or name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="input pl-9"
            />
          </div>
          <button
            onClick={() => {
              setIncludeBanned(!includeBanned)
              setPage(1)
            }}
            className={cn(
              'btn gap-2',
              includeBanned ? 'btn-secondary' : 'btn-primary'
            )}
          >
            <Ban className="h-4 w-4" />
            {includeBanned ? 'Hide Banned' : 'Show Banned'}
          </button>
        </div>

        {/* Users Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-background-secondary rounded-xl animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-foreground-tertiary mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">No users found</h3>
            <p className="text-foreground-secondary">
              {searchQuery ? 'Try a different search term' : 'No users registered yet'}
            </p>
          </div>
        ) : (
          <div className="card p-0">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-background-tertiary">
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-secondary">User</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-secondary">Role</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-secondary">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-secondary">Usage</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-foreground-secondary">Joined</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-foreground-secondary">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <UserRow
                    key={user._id}
                    user={user}
                    onBan={() => {
                      setSelectedUser(user)
                      setShowBanModal(true)
                    }}
                    onUnban={() => unbanMutation.mutate(user._id)}
                    onSetLimits={() => {
                      setSelectedUser(user)
                      setShowLimitsModal(true)
                    }}
                  />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground-secondary">
              Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} of {total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                className="btn btn-secondary"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
                className="btn btn-secondary"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ban Modal */}
      {showBanModal && selectedUser && (
        <BanModal
          user={selectedUser}
          onClose={() => {
            setShowBanModal(false)
            setSelectedUser(null)
          }}
          onBan={(reason) => banMutation.mutate({ userId: selectedUser._id, reason })}
          isLoading={banMutation.isPending}
        />
      )}

      {/* Limits Modal */}
      {showLimitsModal && selectedUser && (
        <LimitsModal
          user={selectedUser}
          onClose={() => {
            setShowLimitsModal(false)
            setSelectedUser(null)
          }}
        />
      )}
    </div>
  )
}

function UserRow({ user, onBan, onUnban, onSetLimits }) {
  const navigate = useNavigate()
  const [showMenu, setShowMenu] = useState(false)
  const isBanned = user.status?.is_banned

  return (
    <tr className="border-b border-border hover:bg-background-tertiary/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-medium">
            {user.profile?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-foreground">{user.profile?.display_name || 'No name'}</p>
            <p className="text-sm text-foreground-secondary">{user.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn(
          'badge',
          user.role === 'admin' ? 'badge-primary' : 'bg-background-tertiary text-foreground-secondary'
        )}>
          {user.role === 'admin' && <Shield className="h-3 w-3 mr-1" />}
          {user.role}
        </span>
      </td>
      <td className="px-4 py-3">
        {isBanned ? (
          <span className="badge badge-error">
            <Ban className="h-3 w-3 mr-1" />
            Banned
          </span>
        ) : (
          <span className="badge badge-success">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="text-sm">
          <p className="text-foreground">{user.usage?.messages_sent || 0} messages</p>
          <p className="text-foreground-secondary">
            {user.usage?.tokens_used?.toLocaleString() || 0} tokens
          </p>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-foreground-secondary">
        {format(new Date(user.created_at), 'MMM d, yyyy')}
      </td>
      <td className="px-4 py-3 text-right relative">
        <div className="relative inline-block">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-lg text-foreground-tertiary hover:bg-background-tertiary hover:text-foreground"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {showMenu && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setShowMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 w-44 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-[110] animate-fade-in">
                <button
                  onClick={() => {
                    navigate(`/admin/users/${user._id}/history`)
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                >
                  <Eye className="h-4 w-4" />
                  View History
                </button>
                <button
                  onClick={() => {
                    onSetLimits()
                    setShowMenu(false)
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                >
                  <Settings className="h-4 w-4" />
                  Set Limits
                </button>
                {user.role !== 'admin' && (
                  <>
                    <div className="border-t border-border my-1" />
                    {isBanned ? (
                      <button
                        onClick={() => {
                          onUnban()
                          setShowMenu(false)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-success hover:bg-success/10"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Unban User
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onBan()
                          setShowMenu(false)
                        }}
                        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-error hover:bg-error/10"
                      >
                        <Ban className="h-4 w-4" />
                        Ban User
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function BanModal({ user, onClose, onBan, isLoading }) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-md p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-foreground mb-2">Ban User</h3>
        <p className="text-foreground-secondary mb-4">
          Are you sure you want to ban <strong>{user.email}</strong>?
        </p>

        <div className="space-y-2 mb-6">
          <label className="block text-sm font-medium text-foreground">Reason</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter ban reason..."
            className="input resize-none"
            rows={3}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onBan(reason)}
            disabled={isLoading}
            className="btn btn-danger"
          >
            {isLoading ? 'Banning...' : 'Ban User'}
          </button>
        </div>
      </div>
    </div>
  )
}

function LimitsModal({ user, onClose }) {
  const queryClient = useQueryClient()
  const [tokensLimit, setTokensLimit] = useState(
    user.usage?.tokens_limit === -1 ? '' : user.usage?.tokens_limit || ''
  )

  const limitsMutation = useMutation({
    mutationFn: (limit) => adminService.setUserLimits(user._id, limit),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      toast.success('Limits updated')
      onClose()
    },
    onError: () => {
      toast.error('Failed to update limits')
    },
  })

  const handleSave = () => {
    const limit = tokensLimit === '' ? -1 : parseInt(tokensLimit)
    limitsMutation.mutate(limit)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-md p-6 animate-slide-up">
        <h3 className="text-lg font-semibold text-foreground mb-4">Set Usage Limits</h3>

        <div className="space-y-2 mb-6">
          <label className="block text-sm font-medium text-foreground">Token Limit</label>
          <input
            type="number"
            value={tokensLimit}
            onChange={(e) => setTokensLimit(e.target.value)}
            placeholder="Leave empty for unlimited"
            className="input"
          />
          <p className="text-xs text-foreground-tertiary">
            Current usage: {user.usage?.tokens_used?.toLocaleString() || 0} tokens
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={limitsMutation.isPending}
            className="btn btn-primary"
          >
            {limitsMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
