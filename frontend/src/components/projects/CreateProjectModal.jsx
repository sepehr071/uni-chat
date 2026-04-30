import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const COLORS = ['#5c9aed','#7c3aed','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16']

export default function CreateProjectModal({ open, onOpenChange, onSubmit, editProject = null }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (open) {
      setName(editProject?.name || '')
      setColor(editProject?.color || COLORS[0])
      setDescription(editProject?.description || '')
      setErr(null)
    }
  }, [open, editProject])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) { setErr('Name required'); return }
    setBusy(true); setErr(null)
    try {
      await onSubmit({ name: name.trim(), color, description: description.trim() || null })
      onOpenChange(false)
    } catch (ex) {
      setErr(ex.response?.data?.error || 'Could not save project')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editProject ? 'Edit project' : 'New project'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-name">Name</Label>
            <Input id="proj-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus required />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-md border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }} aria-label={`Color ${c}`} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">Description (optional)</Label>
            <Input id="proj-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{editProject ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
