import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Plus, Folder, Archive, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import projectService from '@/services/projectService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import CreateProjectModal from '@/components/projects/CreateProjectModal'

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams()
  const { currentWorkspace } = useWorkspace()
  const { projects, refresh, setActiveProject } = useProject()
  const [open, setOpen] = useState(params.get('new') === '1')
  const [editing, setEditing] = useState(null)
  const nav = useNavigate()

  // Strip ?new=1 once consumed.
  useEffect(() => {
    if (open && params.get('new') === '1') {
      params.delete('new'); setParams(params, { replace: true })
    }
  }, [open])

  async function handleSubmit(data) {
    if (editing) {
      await projectService.update(editing._id, data)
    } else {
      await projectService.create({ ...data, workspace_id: currentWorkspace._id })
    }
    await refresh()
    setEditing(null)
  }

  async function handleArchive(p) {
    await projectService.update(p._id, { archived: !p.archived })
    await refresh()
  }

  async function handleDelete(p) {
    if (!confirm(`Delete project "${p.name}"? Folders + chats become unfiled.`)) return
    await projectService.delete(p._id)
    await refresh()
  }

  if (!currentWorkspace) {
    return <div className="p-8 text-zinc-400">No workspace selected.</div>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-sm text-zinc-400">Workspace · {currentWorkspace.name}</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" /> New project
        </Button>
      </div>

      {projects.length === 0 ? (
        <Card className="p-10 text-center text-zinc-400 space-y-2">
          <Folder className="mx-auto h-10 w-10 opacity-50" />
          <p>No projects yet.</p>
          <Button variant="link" onClick={() => setOpen(true)}>Create your first project</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <Card key={p._id} className={`p-4 space-y-3 ${p.archived ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <Folder className="h-5 w-5 mt-0.5" style={{ color: p.color || '#5c9aed' }} />
                <div className="flex-1 min-w-0">
                  <button className="block w-full text-left font-medium truncate hover:underline"
                    onClick={() => { setActiveProject(p); nav('/chat') }}>{p.name}</button>
                  {p.description && <p className="text-xs text-zinc-400 mt-0.5 truncate">{p.description}</p>}
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 mt-1">{p.member_role || 'viewer'}{p.archived ? ' · archived' : ''}</p>
                </div>
              </div>
              <div className="flex gap-1 -mb-1">
                <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setOpen(true) }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleArchive(p)}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(p)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-400" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateProjectModal open={open} onOpenChange={setOpen} onSubmit={handleSubmit} editProject={editing} />
    </div>
  )
}
