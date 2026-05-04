import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Building2 } from 'lucide-react'
import PageHeader from '@/components/teams/PageHeader'
import Section from '@/components/teams/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { workspaceService } from '@/services/workspaceService'
import { useWorkspace } from '@/context/WorkspaceContext'

/**
 * CreateWorkspacePage — provision a new team workspace.
 * Personal workspaces are created automatically at signup, so the form only
 * supports team type. On success we set the new workspace active and route
 * to its overview.
 */
export default function CreateWorkspacePage() {
  const nav = useNavigate()
  const { refresh, setActiveWorkspace } = useWorkspace()
  const [name, setName] = useState('')
  const [type, setType] = useState('team')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) {
      setErr('Name is required')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const created = await workspaceService.create({
        name: name.trim(),
        type,
      })
      // Refresh the workspace list so context picks up the new one.
      await refresh()
      // Set it active so the rest of the app scopes correctly.
      setActiveWorkspace(created)
      toast.success(`Workspace "${created.name}" created`)
      nav(`/workspaces/${created._id}`)
    } catch (ex) {
      const msg = ex?.response?.data?.error || 'Failed to create workspace'
      setErr(msg)
      toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-0">
      <PageHeader
        crumbs={['Workspaces', 'New workspace']}
        title="Create workspace"
        subtitle="Spin up a new team workspace for shared projects, members, and billing."
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[640px] space-y-4">
          <Section
            title="Workspace details"
            hint="Members, projects, and billing live inside a workspace."
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cw-name">Name</Label>
                <Input
                  id="cw-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Inc."
                  maxLength={100}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cw-type">Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger id="cw-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">
                      <span className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Team
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11.5px] text-fg-3">
                  Personal workspaces are created automatically — you can't add
                  another one here.
                </p>
              </div>

              {err && <p className="text-sm text-err">{err}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => nav(-1)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || !name.trim()}>
                  {busy ? 'Creating...' : 'Create workspace'}
                </Button>
              </div>
            </form>
          </Section>
        </div>
      </div>
    </div>
  )
}
