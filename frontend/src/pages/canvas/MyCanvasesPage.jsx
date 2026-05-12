import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink, Trash2, Eye, GitFork, Code2, Check, Globe, Lock, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { canvasService } from '../../services/canvasService'
import { fmtDate } from '../../utils/dateLocale'
import toast from 'react-hot-toast'

export default function MyCanvasesPage() {
  const { t } = useTranslation('canvas')
  const queryClient = useQueryClient()
  const [copiedId, setCopiedId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-canvases'],
    queryFn: () => canvasService.getMyCanvases()
  })

  const deleteMutation = useMutation({
    mutationFn: canvasService.deleteCanvas,
    onSuccess: () => {
      queryClient.invalidateQueries(['my-canvases'])
      toast.success(t('myCanvases.canvasDeleted'))
      setDeleteConfirm(null)
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('myCanvases.failedDelete'))
    }
  })

  // P2.11 — toggle a canvas between unlisted ↔ public from the dashboard.
  const visibilityMutation = useMutation({
    mutationFn: ({ shareId, visibility }) =>
      canvasService.updateCanvas(shareId, { visibility }),
    onSuccess: (_, { visibility }) => {
      queryClient.invalidateQueries(['my-canvases'])
      toast.success(
        visibility === 'public'
          ? t('myCanvases.promotedToPublic', 'Canvas is now public')
          : t('myCanvases.unlistedNow', 'Canvas set to unlisted')
      )
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || t('myCanvases.failedUpdate', 'Failed to update visibility'))
    }
  })

  const handleCopyLink = async (shareId) => {
    const url = `${window.location.origin}/canvas/${shareId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(shareId)
      setTimeout(() => setCopiedId(null), 2000)
      toast.success(t('myCanvases.linkCopied'))
    } catch {
      toast.error(t('myCanvases.failedCopy'))
    }
  }

  const handleDelete = (shareId) => {
    if (deleteConfirm === shareId) {
      deleteMutation.mutate(shareId)
    } else {
      setDeleteConfirm(shareId)
      setTimeout(() => setDeleteConfirm(null), 3000)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-foreground-secondary">{t('myCanvases.loading')}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground-secondary">{t('myCanvases.failedLoad')}</p>
          <button
            onClick={() => queryClient.refetchQueries(['my-canvases'])}
            className="mt-2 text-accent hover:underline"
          >
            {t('myCanvases.tryAgain')}
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
          <h1 className="text-2xl font-bold text-foreground">{t('myCanvases.title')}</h1>
          <p className="text-foreground-secondary mt-1">
            {t('myCanvases.subtitle')}
          </p>
        </div>

        {/* Empty state */}
        {canvases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 bg-background-tertiary rounded-full flex items-center justify-center mb-4">
              <Code2 className="h-8 w-8 text-foreground-tertiary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">{t('myCanvases.noCanvases')}</h3>
            <p className="text-foreground-secondary max-w-md">
              {t('myCanvases.noCanvasesDesc')}
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
                {/* Preview area — code stays LTR */}
                <div className="h-24 bg-background-tertiary p-3 overflow-hidden border-b border-border" dir="ltr">
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
                      title={canvas.visibility === 'public' ? t('myCanvases.public') : t('myCanvases.unlisted')}
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
                      {fmtDate(new Date(canvas.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/canvas/${canvas.share_id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm bg-background-tertiary hover:bg-border text-foreground rounded-lg transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('myCanvases.open')}
                    </Link>
                    {canvas.visibility !== 'private' && (
                      <button
                        onClick={() =>
                          visibilityMutation.mutate({
                            shareId: canvas.share_id,
                            visibility: canvas.visibility === 'public' ? 'unlisted' : 'public',
                          })
                        }
                        disabled={visibilityMutation.isPending}
                        className="p-1.5 hover:bg-background-tertiary rounded-lg text-foreground-secondary hover:text-foreground transition-colors disabled:opacity-50"
                        title={
                          canvas.visibility === 'public'
                            ? t('myCanvases.setUnlisted', 'Make unlisted')
                            : t('myCanvases.promote', 'Make public')
                        }
                      >
                        {canvas.visibility === 'public' ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Globe className="h-4 w-4" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleCopyLink(canvas.share_id)}
                      className="p-1.5 hover:bg-background-tertiary rounded-lg text-foreground-secondary hover:text-foreground transition-colors"
                      title={t('myCanvases.copyLink')}
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
                      title={deleteConfirm === canvas.share_id ? t('myCanvases.deleteConfirm') : t('myCanvases.delete')}
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
            {t('myCanvases.count', { count: canvases.length })}
          </div>
        )}
      </div>
    </div>
  )
}
