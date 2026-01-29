import { useState, useEffect } from 'react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

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
            <Input
              type="text"
              placeholder="Search users by email or name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="pl-9"
            />
          </div>
          <Button
            variant={includeBanned ? "secondary" : "default"}
            onClick={() => {
              setIncludeBanned(!includeBanned)
              setPage(1)
            }}
          >
            <Ban className="h-4 w-4 mr-2" />
            {includeBanned ? 'Hide Banned' : 'Show Banned'}
          </Button>
        </div>

        {/* Users Table */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
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
          <Card className="p-0">
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
          </Card>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-foreground-secondary">
              Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} of {total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
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
        <Badge
          variant={user.role === 'admin' ? 'default' : 'secondary'}
          className="gap-1"
        >
          {user.role === 'admin' && <Shield className="h-3 w-3" />}
          {user.role}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {isBanned ? (
          <Badge variant="destructive" className="gap-1">
            <Ban className="h-3 w-3" />
            Banned
          </Badge>
        ) : (
          <Badge variant="success" className="gap-1">
            <CheckCircle className="h-3 w-3" />
            Active
          </Badge>
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
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/admin/users/${user._id}/history`)}>
              <Eye className="h-4 w-4 mr-2" />
              View History
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSetLimits}>
              <Settings className="h-4 w-4 mr-2" />
              Set Limits
            </DropdownMenuItem>
            {user.role !== 'admin' && (
              <>
                <DropdownMenuSeparator />
                {isBanned ? (
                  <DropdownMenuItem onClick={onUnban} className="text-success">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Unban User
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={onBan} className="text-error">
                    <Ban className="h-4 w-4 mr-2" />
                    Ban User
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}

function BanModal({ user, onClose, onBan, isLoading }) {
  const [reason, setReason] = useState('')

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-foreground-secondary">
            Are you sure you want to ban <strong>{user.email}</strong>?
          </p>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Reason</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter ban reason..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onBan(reason)}
            disabled={isLoading}
          >
            {isLoading ? 'Banning...' : 'Ban User'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Usage Limits</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">Token Limit</label>
            <Input
              type="number"
              value={tokensLimit}
              onChange={(e) => setTokensLimit(e.target.value)}
              placeholder="Leave empty for unlimited"
            />
            <p className="text-xs text-foreground-tertiary">
              Current usage: {user.usage?.tokens_used?.toLocaleString() || 0} tokens
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={limitsMutation.isPending}
          >
            {limitsMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
