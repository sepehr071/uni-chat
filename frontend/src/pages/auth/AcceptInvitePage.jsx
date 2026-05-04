import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import workspaceService from '../../services/workspaceService'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'

export default function AcceptInvitePage() {
  const { token } = useParams()
  const { isAuthenticated, isLoading } = useAuth()
  const { refresh, setActiveWorkspace } = useWorkspace()
  const navigate = useNavigate()
  const [status, setStatus] = useState('Joining workspace...')
  const [errored, setErrored] = useState(false)
  // null = still joining, object = success state
  const [success, setSuccess] = useState(null)

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
        const { workspace_id, role } = await workspaceService.acceptInvite(token)
        if (cancelled) return
        localStorage.removeItem('pending_invite_token')
        const list = await refresh()
        const fresh = (list || []).find(w => w._id === workspace_id)
        if (fresh) setActiveWorkspace(fresh)
        const workspaceName = fresh?.name || 'your new workspace'
        setSuccess({ workspaceName, role: role || 'member', workspace: fresh || null })
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

  if (success) {
    const { workspaceName, role, workspace } = success

    function handleNav(path) {
      if (workspace) setActiveWorkspace(workspace)
      navigate(path, { replace: true })
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground p-4">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle className="text-xl">Welcome aboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-foreground-secondary text-sm">
              You joined <strong className="text-foreground">{workspaceName}</strong> as{' '}
              <strong className="text-foreground">{role}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => handleNav('/projects')} className="w-full">
                Browse projects
              </Button>
              <Button variant="secondary" onClick={() => handleNav('/chat')} className="w-full">
                Start chatting
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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
