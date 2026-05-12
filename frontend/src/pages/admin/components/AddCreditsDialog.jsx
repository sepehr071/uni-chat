import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { billingService } from '@/services/billingService'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function AddCreditsDialog({ open, onOpenChange, workspaceId, workspaceName, onSuccess }) {
  const { t } = useTranslation('admin')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('top_up')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setAmount('')
    setType('top_up')
    setNote('')
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const val = Number(amount)
    if (!Number.isFinite(val) || val === 0) {
      toast.error(t('companies.addCredits.errAmount', 'Enter a non-zero amount'))
      return
    }
    setSubmitting(true)
    try {
      const res = await billingService.addCredits(workspaceId, {
        amountUsd: val,
        type,
        note: note.trim(),
      })
      toast.success(
        t('companies.addCredits.success', 'Charge added — new balance ${{balance}}', {
          balance: Number(res?.credits_balance_usd || 0).toFixed(2),
        })
      )
      reset()
      onOpenChange?.(false)
      onSuccess?.(res)
    } catch (err) {
      toast.error(
        err?.response?.data?.error ||
          t('companies.addCredits.error', 'Failed to add credits')
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange?.(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('companies.addCredits.title', 'Add credits')}</DialogTitle>
          <DialogDescription>
            {t('companies.addCredits.subtitle', 'Append a manual ledger entry to {{name}}.', { name: workspaceName || '—' })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-fg-3">
              {t('companies.addCredits.amount', 'Amount (USD)')}
            </label>
            <Input
              type="number"
              step="0.01"
              dir="ltr"
              autoFocus
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-fg-3">
              {t('companies.addCredits.amountHint', 'Positive for top-up / refund. Negative allowed only with type=adjustment.')}
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-fg-3">
              {t('companies.addCredits.type', 'Type')}
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top_up">{t('companies.addCredits.top_up', 'Top up')}</SelectItem>
                <SelectItem value="adjustment">{t('companies.addCredits.adjustment', 'Adjustment')}</SelectItem>
                <SelectItem value="refund">{t('companies.addCredits.refund', 'Refund')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-fg-3">
              {t('companies.addCredits.note', 'Note (optional)')}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('companies.addCredits.notePlaceholder', 'Invoice #1234, prepaid Q2 …')}
              rows={3}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={() => onOpenChange?.(false)}
            >
              {t('companies.addCredits.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('companies.addCredits.submit', 'Add credits')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
