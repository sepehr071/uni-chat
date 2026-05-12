import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { platformService } from '@/services/platformService'
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

/**
 * Charge credits as a platform admin.
 *
 * Two modes:
 *   scope='holding'  → POST /platform/holding/credits
 *   scope='company'  → POST /platform/companies/<wid>/credits  (workspaceId required)
 */
export default function PlatformAddCreditsDialog({
  open,
  onOpenChange,
  scope = 'company',
  workspaceId,
  workspaceName,
  onSuccess,
}) {
  const { t } = useTranslation('platform')
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
      toast.error(t('addCredits.errAmount', 'Enter a non-zero amount'))
      return
    }
    setSubmitting(true)
    try {
      let res
      if (scope === 'holding') {
        res = await platformService.chargeHolding({ amountUsd: val, type, note: note.trim() })
        toast.success(t('addCredits.holdingSuccess', 'Holding topped up — lifetime ${{value}}', {
          value: Number(res?.lifetime_topups_usd || 0).toFixed(2),
        }))
      } else {
        res = await platformService.chargeCompany(workspaceId, { amountUsd: val, type, note: note.trim() })
        toast.success(t('addCredits.companySuccess', 'Company charged — new balance ${{value}}', {
          value: Number(res?.credits_balance_usd || 0).toFixed(2),
        }))
      }
      reset()
      onOpenChange?.(false)
      onSuccess?.(res)
    } catch (err) {
      toast.error(err?.response?.data?.error || t('addCredits.error', 'Charge failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const subtitle = scope === 'holding'
    ? t('addCredits.holdingSubtitle', 'Append to the holding-level credit pool.')
    : t('addCredits.companySubtitle', 'Append a manual ledger entry to {{name}}.', { name: workspaceName || '—' })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) onOpenChange?.(v) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {scope === 'holding'
              ? t('addCredits.holdingTitle', 'Add holding credits')
              : t('addCredits.companyTitle', 'Add company credits')}
          </DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-foreground-tertiary">
              {t('addCredits.amount', 'Amount (USD)')}
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
            <p className="mt-1 text-[11px] text-foreground-tertiary">
              {t('addCredits.amountHint', 'Positive for top-up / refund. Negative allowed only with type=adjustment.')}
            </p>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-foreground-tertiary">
              {t('addCredits.type', 'Type')}
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top_up">{t('addCredits.top_up', 'Top up')}</SelectItem>
                <SelectItem value="adjustment">{t('addCredits.adjustment', 'Adjustment')}</SelectItem>
                <SelectItem value="refund">{t('addCredits.refund', 'Refund')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-foreground-tertiary">
              {t('addCredits.note', 'Note (optional)')}
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('addCredits.notePlaceholder', 'Invoice #1234, prepaid Q2 …')}
              rows={3}
              className="mt-1"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange?.(false)}>
              {t('addCredits.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('addCredits.submit', 'Add credits')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
