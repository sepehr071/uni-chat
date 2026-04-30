import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import workspaceService from '../../services/workspaceService'

export default function AcceptInvitePage() {
  const { token } = useParams()
  const { isAuthenticated, isLoading } = useAuth()
  const { refresh, setActiveWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const [status, setStatus] = useState('Joining workspace…')
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!token) {
      setStatus('Invalid invite link')
      setErrored(true)
      return
    }
    if (!isAuthenticated) {
      localStorage.setItem('pending_invite_token', token)
      navigate('/login', { state: { from: `/invite/${token}` }, replace: true })
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const { workspace_id } = await workspaceService.acceptInvite(token)
        if (cancelled) return
        localStorage.removeItem('pending_invite_token')
        const list = await refresh()
        const fresh = (list || []).find(w => w._id === workspace_id)
        if (fresh) setActiveWorkspace(fresh)
        navigate('/chat', { replace: true })
      } catch (e) {
        if (cancelled) return
        localStorage.removeItem('pending_invite_token')
        setStatus(e.response?.data?.error || 'Invite invalid or expired')
        setErrored(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, isLoading, token, navigate, refresh, setActiveWorkspace])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-sm space-y-3 rounded-md border border-border bg-background-elevated p-6 text-center">
        <p className={errored ? 'text-error' : 'text-foreground-secondary'}>{status}</p>
        <button
          className="text-sm text-accent hover:underline"
          onClick={() => navigate('/dashboard')}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  )
}
