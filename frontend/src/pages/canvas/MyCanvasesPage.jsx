import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink, Trash2, Eye, GitFork, Code2, Check, Globe, Lock } from 'lucide-react'
import { canvasService } from '../../services/canvasService'
import { format } from 'date-fns'
import toast from 'react-hot-toast'

/**
 * Page for managing user's shared canvases
 */
export default function MyCanvasesPage() {
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  // Fetch user's canvases
  const { data, isLoading, error } = useQuery({
    queryKey: ['my-canvases'],
    queryFn: () => canvasService.getMyCanvases()
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: canvasService.deleteCanvas,
    onSuccess: () => {
      queryClient.invalidateQueries(['my-canvases'])
      toast.success('Canvas deleted')
      setDeleteConfirm(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to delete canvas')
    }
  })

  const handleCopyLink = async (shareId) => {
    const url = `${window.location.origin}/canvas/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(shareId)
      setTimeout(() => setCopiedId(null), 2000)
      toast.success('Link copied!')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  const handleDelete = (shareId) => {
    if (deleteConfirm === shareId) {
      deleteMutation.mutate(shareId)
    } else {
      setDeleteConfirm(shareId)
      // Auto-clear confirm state after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000)
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-foreground-secondary">Loading your canvases...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground-secondary">Failed to load canvases</p>
          <button
            onClick={() => queryClient.refetchQueries(['my-canvases'])}
            className="mt-2 text-accent hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const canvases = data?.canvases || []

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">My Canvases</h1>
          <p className="text-foreground-secondary mt-1">
            Manage your shared code canvases
          </p>
        </div>

        {/* Empty state */}
        {canvases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 bg-background-tertiary rounded-full flex items-center justify-center mb-4">
              <Code2 className="h-8 w-8 text-foreground-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No canvases yet</h3>
            <p className="text-foreground-secondary max-w-md">
              Share a code canvas from the chat to see it here. You can manage, edit visibility, and share links to your canvases.
            </p>
          </div>
        ) : (
          /* Canvas grid */
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {canvases.map((canvas) => (
              <div
                key={canvas.share_id}
                className="bg-background-secondary border border-border rounded-xl overflow-hidden hover:border-border-hover transition-colors"
              >
                {/* Preview area - shows first few lines of HTML */}
                <div className="h-24 bg-background-tertiary p-3 overflow-hidden border-b border-border">
                  <pre className="text-xs text-foreground-tertiary font-mono leading-tight overflow-hidden">
                    {(canvas.html || canvas.css || canvas.js || 'Empty canvas').slice(0, 200)}
                    {(canvas.html?.length || 0) + (canvas.css?.length || 0) + (canvas.js?.length || 0) > 200 && '...'}
                  </pre>
                </div>

                {/* Content */}
                <div className="p-3">
                  {/* Title and visibility */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-medium text-foreground truncate" title={canvas.title}>
                      {canvas.title}
                    </h3>
                    <span
                      className={`flex items-center gap-1 px-1.5 py-0.5 text-xs rounded ${
                        canvas.visibility === 'public'
                          ? 'bg-success/10 text-success'
                          : 'bg-foreground-tertiary/10 text-foreground-tertiary'
                      }`}
                      title={canvas.visibility === 'public' ? 'Public' : 'Unlisted'}
                    >
                      {canvas.visibility === 'public' ? (
                        <Globe className="h-3 w-3" />
                      ) : (
                        <Lock className="h-3 w-3" />
                      )}
                    </span>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-xs text-foreground-tertiary mb-3">
                    <span className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {canvas.stats?.views || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <GitFork className="h-3 w-3" />
                      {canvas.stats?.forks || 0}
                    </span>
                    <span>
                      {format(new Date(canvas.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/canvas/${canvas.share_id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-background-tertiary hover:bg-border text-foreground rounded-lg transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </Link>
                    <button
                      onClick={() => handleCopyLink(canvas.share_id)}
                      className="p-1.5 hover:bg-background-tertiary rounded-lg text-foreground-secondary hover:text-foreground transition-colors"
                      title="Copy link"
                    >
                      {copiedId === canvas.share_id ? (
                        <Check className="h-4 w-4 text-success" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(canvas.share_id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        deleteConfirm === canvas.share_id
                          ? 'bg-error/10 text-error hover:bg-error/20'
                          : 'hover:bg-background-tertiary text-foreground-secondary hover:text-foreground'
                      }`}
                      title={deleteConfirm === canvas.share_id ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Total count */}
        {canvases.length > 0 && (
          <div className="mt-6 text-sm text-foreground-tertiary text-center">
            {canvases.length} canvas{canvases.length === 1 ? '' : 'es'}
          </div>
        )}
      </div>
    </div>
  )
}
