import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useWorkspace } from './WorkspaceContext'
import projectService from '../services/projectService'

const ProjectContext = createContext(null)

const UNFILED_SENTINEL = '__unfiled__'

export function ProjectProvider({ children }) {
  const { currentWorkspace } = useWorkspace()
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!currentWorkspace?._id) {
      setProjects([])
      setCurrentProject(null)
      return []
    }
    setLoading(true)
    try {
      const list = await projectService.list(currentWorkspace._id)
      setProjects(list)

      // Per-workspace active-project key.
      const key = `active_project_id::${currentWorkspace._id}`
      const stored = localStorage.getItem(key)

      // Sentinel: user explicitly chose Unfiled view.
      if (stored === UNFILED_SENTINEL) {
        setCurrentProject(null)
        return list
      }

      // Drop stored project ID if it no longer exists in this workspace —
      // prevents a deleted/foreign project from sticking around as the
      // active scope after backend resets or workspace switches.
      if (stored && !list.some(p => p._id === stored)) {
        try { localStorage.removeItem(key) } catch { /* ignore */ }
      }

      const found =
        list.find(p => p._id === stored) ||
        list.find(p => p.slug === 'personal' && !p.archived) ||
        list.find(p => !p.archived) ||
        null
      setCurrentProject(found)
      return list
    } finally {
      setLoading(false)
    }
  }, [currentWorkspace?._id])

  useEffect(() => {
    refresh()
  }, [refresh])

  // P1.21: switching workspaces should not carry over a stale Unfiled
  // sentinel from the PREVIOUS workspace. Each workspace has its own key
  // (`active_project_id::<wid>`), so the sentinel is naturally scoped, but
  // we also drop the new workspace's sentinel on switch so the user lands
  // on a real project unless they re-pick Unfiled. Without this, a user
  // who picked Unfiled in ws A and never revisits to pick a real project
  // would keep seeing the wrong scope after switching back from ws B.
  const prevWorkspaceIdRef = useRef(null)
  useEffect(() => {
    const wid = currentWorkspace?._id || null
    if (wid && prevWorkspaceIdRef.current && wid !== prevWorkspaceIdRef.current) {
      const key = `active_project_id::${wid}`
      const stored = localStorage.getItem(key)
      if (stored === UNFILED_SENTINEL) {
        try { localStorage.removeItem(key) } catch { /* ignore */ }
      }
    }
    prevWorkspaceIdRef.current = wid
  }, [currentWorkspace?._id])

  const setActiveProject = useCallback((project) => {
    setCurrentProject(project)
    if (project && currentWorkspace?._id) {
      localStorage.setItem(`active_project_id::${currentWorkspace._id}`, project._id)
    }
  }, [currentWorkspace?._id])

  // Special: setActiveProject(null) means "Unfiled" view. Persist as sentinel.
  const setUnfiledView = useCallback(() => {
    setCurrentProject(null)
    if (currentWorkspace?._id) {
      localStorage.setItem(`active_project_id::${currentWorkspace._id}`, UNFILED_SENTINEL)
    }
  }, [currentWorkspace?._id])

  return (
    <ProjectContext.Provider
      value={{ projects, currentProject, setActiveProject, setUnfiledView, refresh, loading }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
