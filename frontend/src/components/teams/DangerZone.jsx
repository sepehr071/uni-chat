import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

export default function DangerZone({
  title,
  description,
  confirmText,
  disabled,
  disabledReason,
  onConfirm,
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [loading, setLoading] = useState(false)

  const canConfirm = typed === confirmText

  async function handleConfirm() {
    if (!canConfirm) return
    setLoading(true)
    try {
      await onConfirm()
      setOpen(false)
    } finally {
      setLoading(false)
      setTyped('')
    }
  }

  function handleOpen() {
    if (disabled) return
    setTyped('')
    setOpen(true)
  }

  return (
    <div className="rounded-xl border border-red-900/50 bg-red-950/10 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-red-300">{title}</h3>
          <p className="mt-1 text-sm text-zinc-400">{description}</p>
          {disabled && disabledReason && (
            <p className="mt-2 text-xs text-zinc-500 italic">{disabledReason}</p>
          )}
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleOpen}
          disabled={disabled}
          className="flex-shrink-0"
        >
          {title}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped('') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-300">{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label className="text-sm text-zinc-300">
              Type <span className="font-mono font-semibold text-zinc-100">{confirmText}</span> to confirm:
            </Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm() }}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!canConfirm || loading}
            >
              {loading ? 'Deleting...' : 'Confirm delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
