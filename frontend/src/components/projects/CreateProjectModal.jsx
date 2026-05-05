import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const COLORS = ['#5c9aed','#7c3aed','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16']

export default function CreateProjectModal({ open, onOpenChange, onSubmit, editProject = null }) {
  const { t } = useTranslation('projects')
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
    if (!name.trim()) { setErr(t('createProject.nameRequired', 'Name required')); return }
    setBusy(true); setErr(null)
    try {
      await onSubmit({ name: name.trim(), color, description: description.trim() || null })
      onOpenChange(false)
    } catch (ex) {
      setErr(ex.response?.data?.error || t('createProject.saveFailed', 'Could not save project'))
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editProject ? t('createProject.titleEdit') : t('createProject.titleNew')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proj-name">{t('createProject.nameLabel')}</Label>
            <Input id="proj-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} autoFocus required placeholder={t('createProject.namePlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label>{t('createProject.colorLabel')}</Label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-md border-2 ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ background: c }} aria-label={`Color ${c}`} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">{t('createProject.descriptionLabel')}</Label>
            <Input id="proj-desc" value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder={t('createProject.descriptionPlaceholder')} />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{t('common:actions.cancel')}</Button>
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? (editProject ? t('createProject.saving') : t('createProject.creating')) : (editProject ? t('createProject.saveButton') : t('createProject.createButton'))}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
