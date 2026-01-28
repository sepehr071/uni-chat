import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Eye, GitFork, ArrowLeft, Code2 } from 'lucide-react'
import { canvasService } from '../../services/canvasService'
import { useAuth } from '../../context/AuthContext'
import CodeCanvas from '../../components/chat/CodeCanvas'
import toast from 'react-hot-toast'

/**
 * Public page for viewing shared canvases
 * No authentication required for viewing
 */
export default function PublicCanvasPage() {
  const { shareId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  // Fetch canvas data
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-canvas', shareId],
    queryFn: () => canvasService.getPublicCanvas(shareId),
    retry: false
  })

  // Fork mutation
  const forkMutation = useMutation({
    mutationFn: () => canvasService.forkCanvas(shareId),
    onSuccess: (data) => {
      toast.success('Canvas forked to your collection!')
      navigate(`/canvas/${data.canvas.share_id}`)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to fork canvas')
    }
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-foreground-secondary">Loading canvas...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !data?.canvas) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <div className="inline-flex items-center justify-center h-16 w-16 bg-background-tertiary text-foreground-tertiary rounded-full mb-4">
            <Code2 className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Canvas Not Found</h1>
          <p className="text-foreground-secondary mb-6">
            This canvas may have been deleted, set to private, or the link may be incorrect.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Go Home
          </Link>
        </div>
      </div>
    )
  }

  const { canvas } = data

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-background-secondary">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-1.5 hover:bg-background-tertiary rounded-lg text-foreground-secondary hover:text-foreground transition-colors"
            title="Go home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{canvas.title}</h1>
            <div className="flex items-center gap-3 text-xs text-foreground-tertiary">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {canvas.stats?.views || 0} views
              </span>
              {canvas.stats?.forks > 0 && (
                <span className="flex items-center gap-1">
                  <GitFork className="h-3 w-3" />
                  {canvas.stats.forks} forks
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {user ? (
            <button
              onClick={() => forkMutation.mutate()}
              disabled={forkMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {forkMutation.isPending ? (
                <>
                  <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Forking...
                </>
              ) : (
                <>
                  <GitFork className="h-3.5 w-3.5" />
                  Fork
                </>
              )}
            </button>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
            >
              <GitFork className="h-3.5 w-3.5" />
              Login to Fork
            </Link>
          )}
        </div>
      </header>

      {/* Canvas Content */}
      <div className="flex-1 min-h-0">
        <CodeCanvas
          initialCode={{
            html: canvas.html || '',
            css: canvas.css || '',
            js: canvas.js || ''
          }}
        />
      </div>
    </div>
  )
}
