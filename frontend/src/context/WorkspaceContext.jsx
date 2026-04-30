import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import workspaceService from '../services/workspaceService'

const WorkspaceContext = createContext(null)

export function WorkspaceProvider({ children }) {
  const { user, isAuthenticated } = useAuth()
  const [workspaces, setWorkspaces] = useState([])
  const [currentWorkspace, setCurrentWorkspace] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setWorkspaces([])
      setCurrentWorkspace(null)
      return []
    }
    setLoading(true)
    try {
      const list = await workspaceService.list()
      setWorkspaces(list)
      // pick: localStorage > user.active_workspace_id > personal > first
      const stored = localStorage.getItem('active_workspace_id')
      const activeId = stored || user?.active_workspace_id
      const found =
        list.find(w => w._id === activeId) ||
        list.find(w => w.type === 'personal') ||
        list[0] ||
        null
      setCurrentWorkspace(found)
      return list
    } finally {
      setLoading(false)
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
      value={{ workspaces, currentWorkspace, setActiveWorkspace, refresh, loading }}
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
