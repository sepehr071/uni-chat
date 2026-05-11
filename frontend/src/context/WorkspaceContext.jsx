import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import workspaceService from '../services/workspaceService'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const { user, isAuthenticated } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [switcherOpen, setSwitcherOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([])
      setCurrentWorkspace(null)
      setLoading(false)
      setInitialized(true)
      return []
    }
    setLoading(true)
    try {
      const list = await workspaceService.list()
      setWorkspaces(list)
      // pick: localStorage > user.active_workspace_id > personal > first
      const stored = localStorage.getItem('active_workspace_id')
      const activeId = stored || user?.active_workspace_id
      const storedHit = stored ? list.find(w => w._id === stored) : null
      // If stored ID points at a workspace that no longer exists (deleted,
      // wrong account inherited from prior login, backend reset), drop it so
      // we don't keep falling back forever.
      if (stored && !storedHit) {
        try { localStorage.removeItem('active_workspace_id') } catch { /* ignore */ }
      }
      const found =
        list.find(w => w._id === activeId) ||
        list.find(w => w.type === 'personal') ||
        list[0] ||
        null
      setCurrentWorkspace(found)
      return list
    } finally {
      setLoading(false)
      setInitialized(true)
    }
  }, [isAuthenticated, user?.active_workspace_id])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setActiveWorkspace = useCallback((workspace) => {
    if (!workspace) return
    setCurrentWorkspace(workspace)
    localStorage.setItem('active_workspace_id', workspace._id)
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        setActiveWorkspace,
        refresh,
        loading,
        initialized,
        switcherOpen,
        setSwitcherOpen,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
