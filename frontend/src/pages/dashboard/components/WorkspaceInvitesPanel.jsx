import { useEffect, useState } from 'react'
import workspaceService from '../../../services/workspaceService'
import { useWorkspace } from '../../../context/WorkspaceContext'

export default function WorkspaceInvitesPanel() {
  const [token, setToken] = useState(() => localStorage.getItem('pending_invite_token'))
  const [error, setError] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const { refresh, setActiveWorkspace } = useWorkspace()

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function accept() {
      setAccepting(true)
      try {
        const { workspace_id } = await workspaceService.acceptInvite(token)
        if (cancelled) return
        localStorage.removeItem('pending_invite_token')
        const list = await refresh()
        const ws = (list || []).find(w => w._id === workspace_id)
        if (ws) setActiveWorkspace(ws)
        setToken(null)
      } catch (e) {
        if (cancelled) return
        localStorage.removeItem('pending_invite_token')
        setError(e.response?.data?.error || 'Could not accept invite')
      } finally {
        if (!cancelled) setAccepting(false)
      }
    }

    accept()
    return () => {
      cancelled = true
    }
  }, [token, refresh, setActiveWorkspace])

  if (!token && !error) return null

  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      {error ? (
        <span className="text-amber-300">Invite error: {error}</span>
      ) : (
        <span className="text-amber-200">
          {accepting ? 'Accepting workspace invite…' : 'Resuming workspace invite…'}
        </span>
      )}
    </div>
  )
}
