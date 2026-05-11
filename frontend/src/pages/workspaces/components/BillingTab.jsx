import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { fmtDate } from '@/utils/dateLocale'
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
    maximumFractionDigits: 4,
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

function fmtDateBilling(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return fmtDate(d, 'MMM d, yyyy')
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

  const { t } = useTranslation('projects')
  const seatsTotal = Number(workspace?.seats_total) || 0
  const seatsUsed = Number(workspace?.seats_used) || 0
  const budget = Number(workspace?.budget_mtd_usd) || 0
  const planTierRaw = (workspace?.plan_tier || workspace?.plan || 'free').toLowerCase()
  const planTierLabelKey = ['free', 'team', 'enterprise'].includes(planTierRaw)
    ? `workspaceSettings.billing.planDialog.tier${planTierRaw.charAt(0).toUpperCase()}${planTierRaw.slice(1)}`
    : null
  const planTier = planTierLabelKey ? t(planTierLabelKey) : (workspace?.plan_tier || workspace?.plan || '')
  const renewsAt = workspace?.renews_at

  const credits = usage?.credits || {}
  const creditRemaining = credits.remaining_usd != null ? Number(credits.remaining_usd) : Number(workspace?.credits_balance_usd ?? ledger.total_credits_usd) || 0
  const creditLifetimeTopups = credits.lifetime_topups_usd != null ? Number(credits.lifetime_topups_usd) : null
  const creditLifetimeSpend = credits.lifetime_spend_usd != null ? Number(credits.lifetime_spend_usd) : null

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
      throw new Error(t('workspaceSettings.billing.addCreditsDialog.errorAmountNonZero'))
    }
    await workspaceService.addCredits(wid, num, note, type)
    toast.success(
      type === 'refund' || num < 0
        ? t('workspaceSettings.billing.addCreditsDialog.toastRecorded', { amount: fmtUsd(num) })
        : t('workspaceSettings.billing.addCreditsDialog.toastAdded', { amount: fmtUsd(num) }),
    )
    await Promise.all([loadUsage(), loadLedger()])
  }

  if (loading) {
    return (
      <div className="px-4 py-6 text-sm text-fg-3">{t('workspaceSettings.billing.loading')}</div>
    )
  }

  return (
    <div style={{ maxWidth: 920 }} className="space-y-4">
      {/* Plan card */}
      <Section title={t('workspaceSettings.billing.planTitle')} hint={t('workspaceSettings.billing.planHint')}>
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-lg font-semibold text-fg-0 capitalize">
                {planTier}
              </span>
              <span className="inline-flex items-center rounded-full bg-violet/15 border border-violet/30 px-2 py-0.5 text-[10.5px] font-medium text-violet">
                {t('workspaceSettings.billing.planActiveBadge')}
              </span>
            </div>
            <span className="text-[12.5px] text-fg-3">
              {seatsTotal > 0
                ? t('workspaceSettings.billing.seatsLabel', { count: seatsTotal })
                : t('workspaceSettings.billing.payAsYouGo')}
              {renewsAt ? ` · ${t('workspaceSettings.billing.renewsAt', { date: fmtDateBilling(renewsAt) })}` : ''}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!isOwner}
            onClick={() => setPlanOpen(true)}
            title={!isOwner ? t('workspaceSettings.security.ownerOnly') : t('workspaceSettings.billing.planSettings')}
          >
            {t('workspaceSettings.billing.planSettings')}
          </Button>
        </div>
      </Section>

      {/* Credit balance */}
      <Section
        title={t('workspaceSettings.billing.creditTitle')}
        hint={t('workspaceSettings.billing.creditHint')}
        action={
          isOwner && (
            <Button
              size="sm"
              onClick={() => setCreditOpen(true)}
              className="h-7 gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('workspaceSettings.billing.addCredits')}
            </Button>
          )
        }
      >
        <div
          className="font-semibold text-fg-0"
          style={{ fontSize: 32, letterSpacing: '-0.02em', lineHeight: 1.1 }}
        >
          {fmtUsd(creditRemaining)}
        </div>
        {creditLifetimeSpend != null && creditLifetimeTopups != null ? (
          <div className="mt-1 text-[11px] text-fg-3">
            {t('workspaceSettings.billing.creditSpentOf', {
              spent: fmtUsd(creditLifetimeSpend),
              total: fmtUsd(creditLifetimeTopups),
            })}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-fg-3">
            {t('workspaceSettings.billing.creditRemaining')}
          </div>
        )}

        {ledger.entries && ledger.entries.length > 0 ? (
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-start text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
                  <th className="px-3 py-2">{t('workspaceSettings.billing.transactionHeaders.date')}</th>
                  <th className="px-3 py-2">{t('workspaceSettings.billing.transactionHeaders.type')}</th>
                  <th className="px-3 py-2 text-end">{t('workspaceSettings.billing.transactionHeaders.amount')}</th>
                  <th className="px-3 py-2">{t('workspaceSettings.billing.transactionHeaders.note')}</th>
                  <th className="px-3 py-2">{t('workspaceSettings.billing.transactionHeaders.addedBy')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedLedger.map((e) => {
                  const amount = Number(e.amount_usd) || 0
                  const sign = amount >= 0 ? '+' : '−'
                  const typeColors = {
                    top_up: 'bg-ok/15 border-ok/30 text-ok',
                    adjustment: 'bg-warn/15 border-warn/30 text-warn',
                    refund: 'bg-fg-3/15 border-fg-3/30 text-fg-2',
                  }
                  return (
                    <tr
                      key={e._id}
                      className="border-b border-line last:border-0"
                    >
                      <td className="px-3 py-2 text-fg-2">
                        {fmtDateBilling(e.created_at)}
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
                      <td className="px-3 py-2 text-end font-mono text-fg-1">
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
                  {t('workspaceSettings.billing.pageOf', { current: page + 1, total: totalPages })}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    {t('admin:users.previous')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  >
                    {t('admin:users.next')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-1 rounded-lg border border-dashed border-line bg-bg-2/40 px-4 py-6 text-center">
            <Receipt className="h-5 w-5 text-fg-3" />
            <p className="text-sm text-fg-2">{t('workspaceSettings.billing.ledgerEmptyTitle')}</p>
            <p className="text-[11px] text-fg-3">
              {t('workspaceSettings.billing.ledgerEmptyHint')}
            </p>
          </div>
        )}
      </Section>

      {/* 3-col stat grid */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label={t('workspaceSettings.billing.stats.seatsUsed')}
          value={`${seatsUsed} / ${seatsTotal || '∞'}`}
          hint={
            seatsTotal > 0
              ? t('workspaceSettings.billing.seatsAvailable', {
                  count: Math.max(0, seatsTotal - seatsUsed),
                })
              : t('workspaceSettings.billing.noSeatCap')
          }
          accent="#5c9aed"
        />
        <StatTile
          label={t('workspaceSettings.billing.stats.spendMtd')}
          value={fmtUsdShort(spendMtd)}
          hint={
            budget > 0
              ? t('workspaceSettings.billing.ofBudget', { amount: fmtUsdShort(budget) })
              : t('workspaceSettings.billing.noBudget')
          }
          accent="#f59e0b"
        />
        <StatTile
          label={t('workspaceSettings.billing.stats.tokensMonth')}
          value={`${fmtTokens(tokensMtd)}`}
          hint={t('workspaceSettings.billing.messagesCount', { count: totals.messages || 0 })}
          accent="#10b981"
        />
      </div>

      {/* Spend by project */}
      <Section
        title={t('workspaceSettings.billing.spendByProjectTitle')}
        hint={t('workspaceSettings.billing.spendByProjectHint')}
      >
        {topProjects.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">
            {t('workspaceSettings.billing.spendByProjectEmpty')}
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
                    {p.name ||
                      (p.project_id
                        ? t('workspaceSettings.billing.unknownProject')
                        : t('workspaceSettings.billing.unfiledProject'))}
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
                    className="font-mono text-[11px] text-fg-2 text-end"
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
      <Section
        title={t('workspaceSettings.billing.spendByUserTitle')}
        hint={t('workspaceSettings.billing.spendByUserHint')}
      >
        {byUser.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">
            {t('workspaceSettings.billing.spendByUserEmpty')}
          </p>
        ) : (
          <table className="w-full text-start text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-4">
                <th className="py-2 pe-2 w-8">{t('workspaceSettings.billing.userSpendHeaders.num')}</th>
                <th className="py-2 pe-2">{t('workspaceSettings.billing.userSpendHeaders.user')}</th>
                <th className="py-2 pe-2 text-end">{t('workspaceSettings.billing.userSpendHeaders.costMtd')}</th>
                <th className="py-2 pe-2 text-end">{t('workspaceSettings.billing.userSpendHeaders.tokens')}</th>
              </tr>
            </thead>
            <tbody>
              {byUser.map((u, i) => (
                <tr
                  key={u.user_id || i}
                  className="border-b border-line last:border-0"
                >
                  <td className="py-2 pe-2 text-fg-3 font-mono text-[11px]">
                    {i + 1}
                  </td>
                  <td className="py-2 pe-2">
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
                          {u.display_name || u.email || t('workspaceSettings.billing.unknownUser')}
                        </span>
                        {u.display_name && u.email && (
                          <span className="text-[11px] text-fg-3 truncate">
                            {u.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pe-2 text-end font-mono text-fg-1">
                    {fmtUsd(u.total_cost)}
                  </td>
                  <td className="py-2 pe-2 text-end font-mono text-fg-3">
                    {fmtTokens(u.total_tokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Spend by model */}
      <Section
        title={t('workspaceSettings.billing.spendByModelTitle')}
        hint={t('workspaceSettings.billing.spendByModelHint')}
      >
        {byModel.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">
            {t('workspaceSettings.billing.spendByModelEmpty')}
          </p>
        ) : (
          <div className="flex flex-col">
            {byModel.map((m, i) => (
              <div
                key={m.model || i}
                className="flex items-center gap-3 py-2 border-b border-line last:border-0"
              >
                <span className="grow font-mono text-[12px] text-fg-1 truncate">
                  {m.model || t('workspaceSettings.billing.unknownModel')}
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
                  className="font-mono text-[11px] text-fg-2 text-end"
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
        title={t('workspaceSettings.billing.spendLimitsTitle')}
        hint={t('workspaceSettings.billing.spendLimitsHint')}
      >
        <div className="flex flex-col gap-3">
          <LimitRow
            label={t('workspaceSettings.billing.limits.workspaceMonthly')}
            used={spendMtd}
            cap={budget > 0 ? budget : 5200}
            unit="$"
          />
          <LimitRow
            label={t('workspaceSettings.billing.limits.perUserDaily')}
            used={42}
            cap={100}
            unit="$"
          />
          <LimitRow
            label={t('workspaceSettings.billing.limits.gpt4oTokensDaily')}
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
  const { t } = useTranslation('projects')
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
          t('workspaceSettings.billing.addCreditsDialog.errorAddFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspaceSettings.billing.addCreditsDialog.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credit-amount">
              {t('workspaceSettings.billing.addCreditsDialog.amountLabel')}
            </Label>
            <Input
              id="credit-amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={t('workspaceSettings.billing.addCreditsDialog.amountPlaceholder')}
              autoFocus
              required
            />
            <p className="text-[11px] text-fg-3">
              {t('workspaceSettings.billing.addCreditsDialog.amountHint')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credit-type">
              {t('workspaceSettings.billing.addCreditsDialog.typeLabel')}
            </Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="credit-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top_up">
                  {t('workspaceSettings.billing.addCreditsDialog.typeTopUp')}
                </SelectItem>
                <SelectItem value="adjustment">
                  {t('workspaceSettings.billing.addCreditsDialog.typeAdjustment')}
                </SelectItem>
                <SelectItem value="refund">
                  {t('workspaceSettings.billing.addCreditsDialog.typeRefund')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credit-note">
              {t('workspaceSettings.billing.addCreditsDialog.noteLabel')}
            </Label>
            <Textarea
              id="credit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder={t('workspaceSettings.billing.addCreditsDialog.notePlaceholder')}
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
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={busy || !amount}>
              {busy
                ? t('workspaceSettings.general.saving')
                : t('workspaceSettings.billing.addCreditsDialog.addButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManagePlanDialog({ open, onOpenChange, workspace, wid, onSaved }) {
  const { t } = useTranslation('projects')
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
          throw new Error(t('workspaceSettings.billing.planDialog.errorSeatsNonNeg'))
        }
        payload.seats_total = n
      } else {
        payload.seats_total = null
      }
      if (budget !== '') {
        const n = Number(budget)
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(t('workspaceSettings.billing.planDialog.errorBudgetNonNeg'))
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
      toast.success(t('workspaceSettings.billing.planDialog.toastSaved'))
      onOpenChange(false)
    } catch (ex) {
      setErr(
        ex?.response?.data?.error ||
          ex?.message ||
          t('workspaceSettings.billing.planDialog.errorSaveFailed'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workspaceSettings.billing.planDialog.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-tier">{t('workspaceSettings.billing.planDialog.planLabel')}</Label>
            <Select value={planTier} onValueChange={setPlanTier}>
              <SelectTrigger id="plan-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="free">
                  {t('workspaceSettings.billing.planDialog.tierFree')}
                </SelectItem>
                <SelectItem value="team">
                  {t('workspaceSettings.billing.planDialog.tierTeam')}
                </SelectItem>
                <SelectItem value="enterprise">
                  {t('workspaceSettings.billing.planDialog.tierEnterprise')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-seats">{t('workspaceSettings.billing.planDialog.seatsLabel')}</Label>
            <Input
              id="plan-seats"
              type="number"
              min="0"
              step="1"
              value={seatsTotal}
              onChange={(e) => setSeatsTotal(e.target.value)}
              placeholder={t('workspaceSettings.billing.planDialog.seatsPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-budget">
              {t('workspaceSettings.billing.planDialog.budgetLabel')}
            </Label>
            <Input
              id="plan-budget"
              type="number"
              min="0"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={t('workspaceSettings.billing.planDialog.budgetPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plan-renews">
              {t('workspaceSettings.billing.planDialog.renewsAtLabel')}
            </Label>
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
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? t('workspaceSettings.general.saving')
                : t('workspaceSettings.billing.planDialog.saveButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
