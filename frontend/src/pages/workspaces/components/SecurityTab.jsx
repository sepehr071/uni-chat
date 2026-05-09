import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { ShieldCheck, Globe, Lock, Crown } from 'lucide-react'
import Section from '@/components/teams/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { workspaceService } from '@/services/workspaceService'

const PLAN_TIERS = [
  { value: 'free', labelKey: 'workspaceSettings.billing.planDialog.tierFree' },
  { value: 'team', labelKey: 'workspaceSettings.billing.planDialog.tierTeam' },
  { value: 'enterprise', labelKey: 'workspaceSettings.billing.planDialog.tierEnterprise' },
]

const PLAN_TONES = {
  free: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  team: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  enterprise: 'bg-violet/15 text-violet border-violet/30',
}

/**
 * SecurityTab — SSO + domain claim, IP allowlist, 2FA enforcement, plan tier.
 */
export default function SecurityTab({ wid, workspace, isOwner = false, onUpdated }) {
  const { t } = useTranslation('projects')
  const [ssoEnforced, setSsoEnforced] = useState(false)
  const [domain, setDomain] = useState('')
  const [ipAllowlist, setIpAllowlist] = useState('')
  const [enforce2fa, setEnforce2fa] = useState(false)
  const [planTier, setPlanTier] = useState('free')
  const [savingSso, setSavingSso] = useState(false)
  const [savingDomain, setSavingDomain] = useState(false)
  const [savingIp, setSavingIp] = useState(false)
  const [saving2fa, setSaving2fa] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  useEffect(() => {
    if (!workspace) return
    setSsoEnforced(Boolean(workspace.sso_enforced))
    setDomain(workspace.domain || '')
    setIpAllowlist(
      Array.isArray(workspace.ip_allowlist)
        ? workspace.ip_allowlist.join('\n')
        : '',
    )
    setEnforce2fa(Boolean(workspace.enforce_2fa))
    setPlanTier(workspace.plan_tier || workspace.plan || 'free')
  }, [workspace])

  async function saveWorkspaceField(patch, label) {
    try {
      const updated = await workspaceService.update(wid, patch)
      onUpdated?.(updated)
      toast.success(t('workspaceSettings.security.toastSaved', { label }))
      return updated
    } catch (err) {
      toast.error(
        err?.response?.data?.error ||
          t('workspaceSettings.security.toastSaveFailed', { label }),
      )
      throw err
    }
  }

  async function handleSsoToggle(checked) {
    if (!isOwner) return
    setSavingSso(true)
    try {
      await saveWorkspaceField(
        { sso_enforced: checked },
        t('workspaceSettings.security.labels.ssoSetting'),
      )
      setSsoEnforced(checked)
    } catch {
      // revert handled implicitly — the workspace prop will refresh
    } finally {
      setSavingSso(false)
    }
  }

  async function handleSaveDomain(e) {
    e.preventDefault()
    if (!isOwner) return
    setSavingDomain(true)
    try {
      await saveWorkspaceField(
        { domain: domain.trim() || null },
        t('workspaceSettings.security.labels.domain'),
      )
    } finally {
      setSavingDomain(false)
    }
  }

  async function handleSaveIpAllowlist() {
    if (!isOwner) return
    const lines = ipAllowlist
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
    setSavingIp(true)
    try {
      await saveWorkspaceField(
        { ip_allowlist: lines },
        t('workspaceSettings.security.labels.ipAllowlist'),
      )
    } finally {
      setSavingIp(false)
    }
  }

  async function handle2faToggle(checked) {
    if (!isOwner) return
    setSaving2fa(true)
    try {
      await saveWorkspaceField(
        { enforce_2fa: checked },
        t('workspaceSettings.security.labels.twoFactorEnforcement'),
      )
      setEnforce2fa(checked)
    } catch {
      // workspace prop will refresh on retry
    } finally {
      setSaving2fa(false)
    }
  }

  async function handlePlanChange(value) {
    if (!isOwner) return
    const previous = planTier
    setPlanTier(value)
    setSavingPlan(true)
    try {
      await saveWorkspaceField(
        { plan_tier: value },
        t('workspaceSettings.security.labels.planTier'),
      )
    } catch {
      setPlanTier(previous)
    } finally {
      setSavingPlan(false)
    }
  }

  const disabled = !isOwner

  return (
    <div style={{ maxWidth: 920 }} className="space-y-4">
      <Section
        title={t('workspaceSettings.security.ssoTitle')}
        hint={t('workspaceSettings.security.ssoHint')}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-fg-2" />
                <span className="text-[13px] font-medium text-fg-1">
                  {t('workspaceSettings.security.enforceSSO')}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] text-fg-3">
                {t('workspaceSettings.security.ssoDescription')}
              </p>
            </div>
            <Switch
              checked={ssoEnforced}
              onCheckedChange={handleSsoToggle}
              disabled={disabled || savingSso}
            />
          </div>

          <form onSubmit={handleSaveDomain} className="flex flex-col gap-2">
            <Label htmlFor="ws-domain" className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-fg-2" />
              {t('workspaceSettings.security.verifiedDomain')}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="ws-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="acme.com"
                dir="ltr"
                disabled={disabled}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                disabled={
                  disabled ||
                  savingDomain ||
                  (workspace?.domain || '') === domain.trim()
                }
              >
                {savingDomain ? t('workspaceSettings.general.saving') : t('workspaceSettings.security.save')}
              </Button>
            </div>
            <p className="text-[11px] text-fg-3">
              {t('workspaceSettings.security.domainHint')}
            </p>
          </form>
        </div>
      </Section>

      <Section
        title={t('workspaceSettings.security.ipAllowlistTitle')}
        hint={t('workspaceSettings.security.ipAllowlistHint')}
      >
        <div className="flex flex-col gap-3">
          <Textarea
            value={ipAllowlist}
            onChange={(e) => setIpAllowlist(e.target.value)}
            rows={4}
            placeholder="10.0.0.0/8&#10;192.168.1.0/24"
            disabled={disabled}
            className="font-mono text-[12px]"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={disabled || savingIp}
              onClick={handleSaveIpAllowlist}
            >
              {savingIp ? t('workspaceSettings.general.saving') : t('workspaceSettings.security.saveAllowlist')}
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title={t('workspaceSettings.security.twoFactorTitle')}
        hint={t('workspaceSettings.security.twoFactorHint')}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-fg-2" />
              <span className="text-[13px] font-medium text-fg-1">
                {t('workspaceSettings.security.require2FA')}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-fg-3">
              {t('workspaceSettings.security.twoFactorDescription')}
            </p>
          </div>
          <Switch
            checked={enforce2fa}
            onCheckedChange={handle2faToggle}
            disabled={disabled || saving2fa}
          />
        </div>
      </Section>

      <Section
        title={t('workspaceSettings.security.planTitle')}
        hint={t('workspaceSettings.security.planHint')}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-fg-2" />
              <span className="text-[13px] font-medium text-fg-1 capitalize">
                {t('workspaceSettings.security.planTier')}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                  PLAN_TONES[planTier] || PLAN_TONES.free
                }`}
              >
                {t(
                  PLAN_TIERS.find((p) => p.value === planTier)?.labelKey ||
                    'workspaceSettings.billing.planDialog.tierFree',
                )}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-fg-3">
              {t('workspaceSettings.security.planDescription')}
            </p>
          </div>
          {isOwner ? (
            <Select
              value={planTier}
              onValueChange={handlePlanChange}
              disabled={savingPlan}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_TIERS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-[11.5px] text-fg-3">{t('workspaceSettings.security.ownerOnly')}</span>
          )}
        </div>
      </Section>
    </div>
  )
}
