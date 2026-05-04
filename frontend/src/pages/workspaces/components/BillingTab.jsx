import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import { Plus, Receipt } from 'lucide-react'
import Section from '@/components/teams/Section'
import StatTile from '@/components/teams/StatTile'
import LimitRow from '@/components/teams/LimitRow'
import Ptile from '@/components/teams/Ptile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { workspaceService } from '@/services/workspaceService'

const PAGE_SIZE = 20

const PROJECT_FALLBACK_COLOR = '#5c9aed'

function fmtUsd(n) {
  if (n == null || Number.isNaN(Number(n))) return '$0.00'
  const num = Number(n)
  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtUsdShort(n) {
  if (n == null || Number.isNaN(Number(n))) return '$0'
  const num = Number(n)
  return `$${Math.round(num).toLocaleString('en-US')}`
}

function fmtTokens(n) {
  if (n == null || Number.isNaN(Number(n))) return '0'
  const num = Number(n)
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return String(num)
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getInitials(name, email) {
  if (name) return name.slice(0, 2).toUpperCase()
  if (email) return email.slice(0, 2).toUpperCase()
  return '??'
}

export default function BillingTab({ wid, workspace, isOwner = false, onUpdated }) {
  const [usage, setUsage] = useState(null)
  const [ledger, setLedger] = useState({ entries: [], total_credits_usd: 0 })
  const [loading, setLoading] = useState(true)
  const [creditOpen, setCreditOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [page, setPage] = useState(0)

  const loadUsage = useCallback(async () => {
    try {
      const data = await workspaceService.getBillingUsage(wid)
      setUsage(data)
    } catch (err) {
      console.error('Failed to load billing usage', err)
    }
  }, [wid])

  const loadLedger = useCallback(async () => {
    try {
      const data = await workspaceService.getLedger(wid, { limit: 100 })
      setLedger(data)
    } catch {
      // Non-billing-admins can't read the ledger — quietly leave empty.
    }
  }, [wid])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([loadUsage(), loadLedger()])
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [loadUsage, loadLedger])

  // Top-5 projects by spend.
  const topProjects = useMemo(() => {
    const list = usage?.by_project || []
    const sliced = list.slice(0, 5)
    const max = Math.max(1, ...sliced.map((r) => Number(r.total_cost) || 0))
    return sliced.map((r) => ({
      ...r,
      _pct: max > 0 ? ((Number(r.total_cost) || 0) / max) * 100 : 0,
    }))
  }, [usage])

  const byUser = useMemo(() => {
    const list = usage?.by_user || []
    return list.slice(0, 10)
  }, [usage])

  const byModel = useMemo(() => {
    const list = usage?.by_model || []
    const sliced = list.slice(0, 8)
    const max = Math.max(1, ...sliced.map((r) => Number(r.total_cost) || 0))
    return sliced.map((r) => ({
      ...r,
      _pct: max > 0 ? ((Number(r.total_cost) || 0) / max) * 100 : 0,
    }))
  }, [usage])

  const totals = usage?.totals || {}
  const spendMtd = Number(totals.cost_usd) || 0
  const tokensMtd = Number(totals.total_tokens) || 0

  const seatsTotal = Number(workspace?.seats_total) || 0
  const seatsUsed = Number(workspace?.seats_used) || 0
  const budget = Number(workspace?.budget_mtd_usd) || 0
  const planTier = workspace?.plan_tier || workspace?.plan || 'Free'
  const renewsAt = workspace?.renews_at

  const creditBalance = Number(workspace?.credits_balance_usd ?? ledger.total_credits_usd) || 0

  const pagedLedger = useMemo(() => {
    const all = ledger.entries || []
    const start = page * PAGE_SIZE
    return all.slice(start, start + PAGE_SIZE)
  }, [ledger, page])
  const totalPages = Math.max(
    1,
    Math.ceil((ledger.entries?.length || 0) / PAGE_SIZE),
  )

  async function handleAddCredits({ amount, type, note }) {
    const num = Number(amount)
    if (!Number.isFinite(num) || num === 0) {
      throw new Error('Amount must be a non-zero number')
    }
    await workspaceService.addCredits(wid, num, note, type)
    toast.success(
      type === 'refund' || num < 0
        ? `Recorded ${fmtUsd(num)}`
        : `Added ${fmtUsd(num)} in credits`,
    )
    await Promise.all([loadUsage(), loadLedger()])
  }

  if (loading) {
    return (
      <div className="px-4 py-6 text-sm text-fg-3">Loading billing...</div>
    )
  }

  return (
    <div style={{ maxWidth: 920 }} className="space-y-4">
      {/* Plan card */}
      <Section title="Plan" hint="Current plan and renewal">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-fg-0 capitalize">
                {planTier}
              </span>
              <span className="inline-flex items-center rounded-full bg-violet/15 border border-violet/30 px-2 py-0.5 text-[10.5px] font-medium text-violet">
                Active
              </span>
            </div>
            <span className="text-[12.5px] text-fg-3">
              {seatsTotal > 0 ? `${seatsTotal} seats` : 'Pay as you go'}
              {renewsAt ? ` · renews ${fmtDate(renewsAt)}` : ''}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isOwner}
            onClick={() => setPlanOpen(true)}
            title={!isOwner ? 'Owner only' : 'Manage plan'}
          >
            Manage plan
          </Button>
        </div>
      </Section>

      {/* Credit balance */}
      <Section
        title="Credit balance"
        hint="Manual top-ups by an owner. Spend draws from this balance."
        action={
          isOwner && (
            <Button
              size="sm"
              onClick={() => setCreditOpen(true)}
              className="h-7 gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add credits
            </Button>
          )
        }
      >
        <div
          className="font-semibold text-fg-0"
          style={{ fontSize: 32, letterSpacing: '-0.02em', lineHeight: 1.1 }}
        >
          {fmtUsd(creditBalance)}
        </div>
        <div className="mt-1 text-[11px] text-fg-3">
          Lifetime added: {fmtUsd(ledger.total_credits_usd)}
        </div>

        {ledger.entries && ledger.entries.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Note</th>
                  <th className="px-3 py-2">Added by</th>
                </tr>
              </thead>
              <tbody>
                {pagedLedger.map((e) => {
                  const amount = Number(e.amount_usd) || 0
                  const sign = amount >= 0 ? '+' : '−'
                  const typeColors = {
                    top_up: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
                    adjustment: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
                    refund: 'bg-zinc-500/15 border-zinc-500/30 text-fg-2',
                  }
                  return (
                    <tr
                      key={e._id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-3 py-2 text-fg-2">
                        {fmtDate(e.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] capitalize ${
                            typeColors[e.type] || typeColors.adjustment
                          }`}
                        >
                          {e.type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg-1">
                        {sign}
                        {fmtUsd(Math.abs(amount)).replace('-', '')}
                      </td>
                      <td className="px-3 py-2 text-fg-3 truncate max-w-[220px]">
                        {e.note || '—'}
                      </td>
                      <td className="px-3 py-2 text-fg-3">
                        {e.added_by_user?.display_name ||
                          e.added_by_user?.email ||
                          '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-fg-3">
                <span>
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-1 rounded-lg border border-dashed border-line bg-bg-2/40 px-4 py-6 text-center">
            <Receipt className="h-5 w-5 text-fg-3" />
            <p className="text-sm text-fg-2">No ledger entries yet.</p>
            <p className="text-[11px] text-fg-3">
              Owner top-ups will appear here.
            </p>
          </div>
        )}
      </Section>

      {/* 3-col stat grid */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Seats used"
          value={`${seatsUsed} / ${seatsTotal || '∞'}`}
          hint={
            seatsTotal > 0
              ? `${Math.max(0, seatsTotal - seatsUsed)} available`
              : 'No seat cap'
          }
          accent="#5c9aed"
        />
        <StatTile
          label="Spend MTD"
          value={fmtUsdShort(spendMtd)}
          hint={budget > 0 ? `of ${fmtUsdShort(budget)} budget` : 'No budget set'}
          accent="#f59e0b"
        />
        <StatTile
          label="Tokens this month"
          value={`${fmtTokens(tokensMtd)}`}
          hint={`${(totals.messages || 0).toLocaleString()} messages`}
          accent="#10b981"
        />
      </div>

      {/* Spend by project */}
      <Section
        title="Model spend by project"
        hint="Top consumers, this billing cycle"
      >
        {topProjects.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">
            No project usage in the current window.
          </p>
        ) : (
          <div className="flex flex-col">
            {topProjects.map((p, i) => {
              const color = p.color || PROJECT_FALLBACK_COLOR
              return (
                <div
                  key={p.project_id || i}
                  className="flex items-center gap-3 py-2 border-b border-line last:border-0"
                >
                  <Ptile
                    color={color}
                    letter={(p.name?.[0] || '?').toUpperCase()}
                    size="sm"
                    gradient
                  />
                  <span className="grow text-[12.5px] text-fg-1 truncate">
                    {p.name || (p.project_id ? 'Unknown project' : 'Unfiled')}
                  </span>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-bg-3"
                    style={{ width: 200 }}
                  >
                    <div
                      className="h-full"
                      style={{ width: `${p._pct}%`, background: color }}
                    />
                  </div>
                  <span
                    className="font-mono text-[11px] text-fg-2 text-right"
                    style={{ width: 70 }}
                  >
                    {fmtUsdShort(p.total_cost)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Spend by user */}
      <Section title="Spend by user" hint="Top spenders this billing cycle">
        {byUser.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">No user spend yet.</p>
        ) : (
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">User</th>
                <th className="py-2 pr-2 text-right">Cost MTD</th>
                <th className="py-2 pr-2 text-right">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {byUser.map((u, i) => (
                <tr
                  key={u.user_id || i}
                  className="border-b border-line last:border-0"
                >
                  <td className="py-2 pr-2 text-fg-3 font-mono text-[11px]">
                    {i + 1}
                  </td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar size="sm">
                        {u.avatar_url && (
                          <AvatarImage src={u.avatar_url} alt={u.display_name || u.email} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {getInitials(u.display_name, u.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-fg-1 truncate">
                          {u.display_name || u.email || 'Unknown'}
                        </span>
                        {u.display_name && u.email && (
                          <span className="text-[11px] text-fg-3 truncate">
                            {u.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-fg-1">
                    {fmtUsd(u.total_cost)}
                  </td>
                  <td className="py-2 pr-2 text-right font-mono text-fg-3">
                    {fmtTokens(u.total_tokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Spend by model */}
      <Section title="Spend by model" hint="Cost breakdown across providers">
        {byModel.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">No model usage yet.</p>
        ) : (
          <div className="flex flex-col">
            {byModel.map((m, i) => (
              <div
                key={m.model || i}
                className="flex items-center gap-3 py-2 border-b border-line last:border-0"
              >
                <span className="grow font-mono text-[12px] text-fg-1 truncate">
                  {m.model || 'unknown'}
                </span>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-bg-3"
                  style={{ width: 200 }}
                >
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${m._pct}%` }}
                  />
                </div>
                <span
                  className="font-mono text-[11px] text-fg-2 text-right"
                  style={{ width: 70 }}
                >
                  {fmtUsdShort(m.total_cost)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Spend limits */}
      <Section
        title="Spend limits"
        hint="Hard caps per scope. Workspace owners get notified at 80%."
      >
        <div className="flex flex-col gap-3">
          <LimitRow
            label="Workspace monthly"
            used={spendMtd}
            cap={budget > 0 ? budget : 5200}
            unit="$"
          />
          <LimitRow
            label="Per-user daily"
            used={42}
            cap={100}
            unit="$"
          />
          <LimitRow
            label="GPT-4o tokens / day"
            used={2.4}
            cap={5}
            unit="M"
          />
        </div>
      </Section>

      <AddCreditsDialog
        open={creditOpen}
        onOpenChange={setCreditOpen}
        onSubmit={handleAddCredits}
      />

      <ManagePlanDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        workspace={workspace}
        wid={wid}
        onSaved={(updated) => {
          onUpdated?.(updated)
        }}
      />
    </div>
  )
}

function AddCreditsDialog({ open, onOpenChange, onSubmit }) {
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('top_up')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (open) {
      setAmount('')
      setType('top_up')
      setNote('')
      setErr(null)
    }
  }, [open])

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await onSubmit({ amount, type, note })
      onOpenChange(false)
    } catch (ex) {
      setErr(
        ex?.response?.data?.error ||
          ex?.message ||
          'Failed to add credits',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add credits</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credit-amount">Amount (USD)</Label>
            <Input
              id="credit-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              autoFocus
              required
            />
            <p className="text-[11px] text-fg-3">
              Use a negative number for adjustments / refunds.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credit-type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="credit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top_up">Top up</SelectItem>
                <SelectItem value="adjustment">Adjustment</SelectItem>
                <SelectItem value="refund">Refund</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credit-note">Note</Label>
            <Textarea
              id="credit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Annual prepayment, customer refund, etc."
            />
          </div>

          {err && <p className="text-sm text-err">{err}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !amount}>
              {busy ? 'Saving...' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManagePlanDialog({ open, onOpenChange, workspace, wid, onSaved }) {
  const [planTier, setPlanTier] = useState('free')
  const [seatsTotal, setSeatsTotal] = useState('')
  const [budget, setBudget] = useState('')
  const [renewsAt, setRenewsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (!open || !workspace) return
    setPlanTier(workspace.plan_tier || workspace.plan || 'free')
    setSeatsTotal(
      workspace.seats_total != null ? String(workspace.seats_total) : '',
    )
    setBudget(
      workspace.budget_mtd_usd != null
        ? String(workspace.budget_mtd_usd)
        : '',
    )
    if (workspace.renews_at) {
      try {
        const d = new Date(workspace.renews_at)
        if (!Number.isNaN(d.getTime())) {
          setRenewsAt(d.toISOString().slice(0, 10))
        } else {
          setRenewsAt('')
        }
      } catch {
        setRenewsAt('')
      }
    } else {
      setRenewsAt('')
    }
    setErr(null)
  }, [open, workspace])

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const payload = { plan_tier: planTier }
      if (seatsTotal !== '') {
        const n = Number(seatsTotal)
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('Seats must be a non-negative number')
        }
        payload.seats_total = n
      } else {
        payload.seats_total = null
      }
      if (budget !== '') {
        const n = Number(budget)
        if (!Number.isFinite(n) || n < 0) {
          throw new Error('Budget must be a non-negative number')
        }
        payload.budget_mtd_usd = n
      } else {
        payload.budget_mtd_usd = null
      }
      if (renewsAt) {
        try {
          const d = new Date(`${renewsAt}T00:00:00`)
          if (!Number.isNaN(d.getTime())) {
            payload.renews_at = d.toISOString()
          }
        } catch {
          // ignore — leave as not-set
        }
      } else {
        payload.renews_at = null
      }
      const updated = await workspaceService.update(wid, payload)
      onSaved?.(updated)
      toast.success('Plan settings saved')
      onOpenChange(false)
    } catch (ex) {
      setErr(
        ex?.response?.data?.error || ex?.message || 'Failed to save plan',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Plan settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-tier">Plan</Label>
            <Select value={planTier} onValueChange={setPlanTier}>
              <SelectTrigger id="plan-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="team">Team</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-seats">Seats total</Label>
            <Input
              id="plan-seats"
              type="number"
              min="0"
              step="1"
              value={seatsTotal}
              onChange={(e) => setSeatsTotal(e.target.value)}
              placeholder="Unlimited"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-budget">Monthly budget (USD)</Label>
            <Input
              id="plan-budget"
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="No budget"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-renews">Renews at</Label>
            <Input
              id="plan-renews"
              type="date"
              value={renewsAt}
              onChange={(e) => setRenewsAt(e.target.value)}
            />
          </div>

          {err && <p className="text-sm text-err">{err}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
