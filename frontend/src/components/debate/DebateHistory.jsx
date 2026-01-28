import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Trash2, ChevronRight, Loader2, Scale } from 'lucide-react'
import { debateService } from '../../services/debateService'
import { cn } from '../../utils/cn'
import toast from 'react-hot-toast'

export default function DebateHistory({ onClose, onLoadSession }) {
  const queryClient = useQueryClient()
  const [deletingId, setDeletingId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['debate-sessions'],
    queryFn: () => debateService.listSessions(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => debateService.deleteSession(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['debate-sessions'])
      toast.success('Debate deleted')
      setDeletingId(null)
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete debate')
      setDeletingId(null)
    },
  })

  const sessions = data?.sessions || []

  const handleDelete = (e, sessionId) => {
    e.stopPropagation()
    if (deletingId) return
    setDeletingId(sessionId)
    deleteMutation.mutate(sessionId)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-background-secondary border border-border rounded-xl shadow-elevated w-full max-w-lg max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Scale className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Debate History</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sessions List */}
        <div className="overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Scale className="h-12 w-12 mx-auto mb-3 text-foreground-tertiary opacity-50" />
              <p className="text-foreground-secondary">No debates yet</p>
              <p className="text-sm text-foreground-tertiary mt-1">
                Start a new debate to see it here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((session) => (
                <button
                  key={session._id}
                  onClick={() => onLoadSession(session)}
                  className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-background-tertiary transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {session.topic}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-foreground-tertiary">
                        {session.debater_count || session.debaters?.length || 0} debaters
                      </span>
                      <span className="text-foreground-tertiary">·</span>
                      <span className="text-xs text-foreground-tertiary">
                        {session.rounds || 3} rounds
                      </span>
                      <span className="text-foreground-tertiary">·</span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        session.status === 'completed'
                          ? 'bg-success/20 text-success'
                          : session.status === 'in_progress'
                            ? 'bg-warning/20 text-warning'
                            : 'bg-background-tertiary text-foreground-tertiary'
                      )}>
                        {session.status || 'pending'}
                      </span>
                    </div>
                    <p className="text-xs text-foreground-tertiary mt-1">
                      {formatDate(session.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, session._id)}
                    disabled={deletingId === session._id}
                    className="p-2 rounded-lg text-foreground-tertiary hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    {deletingId === session._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                  <ChevronRight className="h-4 w-4 text-foreground-tertiary" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
