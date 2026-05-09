import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, Plus, Trash2, ShieldAlert } from 'lucide-react'
import { fmtDate } from '@/utils/dateLocale'
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
import { dlpService } from '@/services/dlpService'
import { cn } from '@/lib/utils'
import { SeverityBadge, ActionBadge } from '@/components/dlp/badges'

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return fmtDate(d, 'MMM d, yyyy HH:mm')
}

function emptyPattern() {
  return { _clientId: Math.random().toString(36).slice(2), name: '', regex: '', severity: 'medium', action: 'warn', regexError: null }
}

export default function DLPPolicyTab({ wid, isOwner = false }) {
  const { t } = useTranslation('dlp')
  const { t: tAdmin } = useTranslation('admin')

  const [policy, setPolicy] = useState(null)
  const [ruleCatalog, setRuleCatalog] = useState([])
  const [stats, setStats] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const [enabled, setEnabled] = useState(false)
  const [sensitivity, setSensitivity] = useState('balanced')
  const [patterns, setPatterns] = useState([])
  const [llmClassifier, setLlmClassifier] = useState({
    enabled: false,
    guidance_prompt: '',
    action_thresholds: { confidential: 'warn', restricted: 'require_confirm' },
  })

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const [catalogOpen, setCatalogOpen] = useState(false)
  const [llmOpen, setLlmOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  const [testText, setTestText] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testRunning, setTestRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [policyRes, statsRes, eventsRes] = await Promise.all([
        dlpService.getPolicy(wid),
        dlpService.getStats(wid, 30),
        dlpService.listEvents(wid, { limit: 10 }),
      ])
      const p = policyRes.policy
      setPolicy(p)
      setRuleCatalog(policyRes.rule_catalog || [])
      setEnabled(p.enabled ?? false)
      setSensitivity(p.sensitivity || 'balanced')
      setPatterns(
        (p.custom_patterns || []).map((cp) => ({ ...cp, _clientId: cp.id || Math.random().toString(36).slice(2), regexError: null }))
      )
      const lc = p.llm_classifier || {}
      const at = lc.action_thresholds || {}
      setLlmClassifier({
        enabled: lc.enabled ?? false,
        guidance_prompt: lc.guidance_prompt || '',
        action_thresholds: {
          confidential: at.confidential || 'warn',
          restricted: at.restricted || 'require_confirm',
        },
      })
      setStats(statsRes)
      setEvents(eventsRes.rows || [])
    } catch (err) {
      toast.error(err.response?.data?.error || t('errors.loadFailed'))
    } finally {
      setLoading(false)
      setDirty(false)
    }
  }, [wid, t])

  useEffect(() => { load() }, [load])

  function markDirty() { setDirty(true) }

  function handleEnabledChange(val) { setEnabled(val); markDirty() }
  function handleSensitivityChange(val) { setSensitivity(val); markDirty() }

  function addPattern() {
    setPatterns((prev) => [...prev, emptyPattern()])
    markDirty()
  }

  function removePattern(clientId) {
    setPatterns((prev) => prev.filter((p) => p._clientId !== clientId))
    markDirty()
  }

  function updatePattern(clientId, field, value) {
    setPatterns((prev) =>
      prev.map((p) => {
        if (p._clientId !== clientId) return p
        const updated = { ...p, [field]: value }
        if (field === 'regex') {
          try { new RegExp(value); updated.regexError = null } catch { updated.regexError = t('errors.invalidRegex') }
        }
        return updated
      })
    )
    markDirty()
  }

  function handleLlmChange(field, value) {
    setLlmClassifier((prev) => ({ ...prev, [field]: value }))
    markDirty()
  }

  function handleLlmThresholdChange(category, value) {
    setLlmClassifier((prev) => ({
      ...prev,
      action_thresholds: { ...prev.action_thresholds, [category]: value },
    }))
    markDirty()
  }

  async function handleRunTest() {
    if (!testText.trim() || !llmClassifier.enabled) return
    setTestRunning(true)
    try {
      const res = await dlpService.testClassifier(testText, wid)
      setTestResult(res?.result || null)
    } catch (err) {
      toast.error(err.response?.data?.error || t('errors.saveFailed'))
    } finally {
      setTestRunning(false)
    }
  }

  async function handleSave() {
    const hasRegexErrors = patterns.some((p) => p.regexError)
    if (hasRegexErrors) {
      toast.error(t('errors.fixRegex'))
      return
    }
    setSaving(true)
    try {
      const cleanPatterns = patterns.map(({ _clientId, regexError, ...rest }) => rest)
      const payload = {
        enabled,
        sensitivity,
        custom_patterns: cleanPatterns,
        llm_classifier: {
          enabled: llmClassifier.enabled,
          guidance_prompt: llmClassifier.guidance_prompt || undefined,
          action_thresholds: llmClassifier.action_thresholds,
        },
      }
      await dlpService.updatePolicy(wid, payload)
      toast.success(t('saveSuccess'))
      setDirty(false)
    } catch (err) {
      toast.error(err.response?.data?.error || t('errors.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  const sensitivityDescriptions = {
    lenient: t('sensitivity.lenientDesc'),
    balanced: t('sensitivity.balancedDesc'),
    strict: t('sensitivity.strictDesc'),
  }

  const statTiles = [
    { label: t('stats.total'), value: stats?.total_events ?? '—' },
    { label: t('stats.blocked'), value: stats?.by_action?.block ?? 0 },
    { label: t('stats.confirm'), value: stats?.by_action?.require_confirm ?? 0 },
    { label: t('stats.warn'), value: stats?.by_action?.warn ?? 0 },
  ]

  return (
    <div style={{ maxWidth: 920 }} className="space-y-4">
      {/* Header with save button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-fg-2" />
          <h2 className="text-[15px] font-semibold text-fg-0">{t('title')}</h2>
        </div>
        {isOwner && (
          <Button size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? t('saving') : t('save')}
          </Button>
        )}
      </div>

      {/* Section A — Master switch + sensitivity */}
      <Section title={t('sections.policy')} hint={t('sections.policyHint')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch
              id="dlp-enabled"
              checked={enabled}
              onCheckedChange={isOwner ? handleEnabledChange : undefined}
              disabled={!isOwner}
            />
            <Label htmlFor="dlp-enabled" className="text-[13px]">
              {enabled ? t('enabledLabel') : t('disabledLabel')}
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="text-[12px] text-fg-2">{t('sensitivity.label')}</Label>
            <div className="inline-flex items-center gap-0.5 rounded-md border border-line bg-bg-2 p-0.5">
              {(['lenient', 'balanced', 'strict']).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  disabled={!isOwner}
                  onClick={() => isOwner && handleSensitivityChange(tier)}
                  className={cn(
                    'rounded px-3 py-1 text-[12px] capitalize transition-colors',
                    sensitivity === tier ? 'bg-bg-4 text-fg-0' : 'text-fg-3 hover:text-fg-1',
                    !isOwner && 'cursor-default opacity-60',
                  )}
                >
                  {t(`sensitivity.${tier}`)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-fg-3">{sensitivityDescriptions[sensitivity]}</p>
          </div>
        </div>
      </Section>

      {/* Section B — Stats */}
      <Section title={t('sections.stats')} hint={t('sections.statsHint')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statTiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border border-line bg-bg-1 px-4 py-3">
              <p className="text-[11px] text-fg-3">{tile.label}</p>
              <p className="mt-0.5 text-[20px] font-semibold text-fg-0">{tile.value}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Section C — Builtin rules (collapsed) */}
      <div className="rounded-lg border border-line bg-bg-1">
        <button
          type="button"
          onClick={() => setCatalogOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-medium text-fg-1 hover:bg-bg-2 transition-colors rounded-lg"
        >
          {catalogOpen ? <ChevronDown className="h-4 w-4 text-fg-3" /> : <ChevronRight className="h-4 w-4 text-fg-3" />}
          {t('sections.builtinRules', { count: ruleCatalog.length })}
        </button>
        {catalogOpen && (
          <div className="border-t border-line overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line bg-bg-2 text-fg-3">
                  <th className="px-4 py-2 text-start font-medium">{t('catalog.name')}</th>
                  <th className="px-4 py-2 text-start font-medium">{t('catalog.category')}</th>
                  <th className="px-4 py-2 text-start font-medium">{t('catalog.severity')}</th>
                  <th className="px-4 py-2 text-start font-medium">{t('catalog.action')}</th>
                </tr>
              </thead>
              <tbody>
                {ruleCatalog.map((rule) => (
                  <tr key={rule.id} className="border-b border-line last:border-0 hover:bg-bg-2">
                    <td className="px-4 py-2 text-fg-1 font-medium">
                      {t(`rules.${rule.id}.name`, { defaultValue: rule.name })}
                    </td>
                    <td className="px-4 py-2 text-fg-3 capitalize">
                      {t(`catalog.categories.${rule.category}`, { defaultValue: rule.category })}
                    </td>
                    <td className="px-4 py-2"><SeverityBadge severity={rule.severity} /></td>
                    <td className="px-4 py-2"><ActionBadge action={rule.default_action} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section D — Custom patterns */}
      <Section title={t('sections.customPatterns')} hint={t('sections.customPatternsHint')}>
        <div className="space-y-3">
          {patterns.length === 0 && (
            <p className="text-[12px] text-fg-3">{t('customPatterns.empty')}</p>
          )}
          {patterns.map((pat) => (
            <div key={pat._clientId} className="rounded-lg border border-line bg-bg-1 p-3 space-y-2">
              <div className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-[140px] space-y-1">
                  <Label className="text-[11px] text-fg-3">{t('customPatterns.name')}</Label>
                  <Input
                    value={pat.name}
                    onChange={(e) => updatePattern(pat._clientId, 'name', e.target.value)}
                    placeholder={t('customPatterns.namePlaceholder')}
                    disabled={!isOwner}
                    className="h-7 text-[12px]"
                  />
                </div>
                <div className="flex-[2] min-w-[200px] space-y-1">
                  <Label className="text-[11px] text-fg-3">{t('customPatterns.regex')}</Label>
                  <Input
                    value={pat.regex}
                    onChange={(e) => updatePattern(pat._clientId, 'regex', e.target.value)}
                    placeholder={t('customPatterns.regexPlaceholder')}
                    disabled={!isOwner}
                    className={cn('h-7 text-[12px] font-mono', pat.regexError && 'border-red-500')}
                    dir="ltr"
                  />
                  {pat.regexError && <p className="text-[10px] text-red-400">{pat.regexError}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-fg-3">{t('customPatterns.severity')}</Label>
                  <Select value={pat.severity} onValueChange={(v) => updatePattern(pat._clientId, 'severity', v)} disabled={!isOwner}>
                    <SelectTrigger className="h-7 w-[110px] text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['critical', 'high', 'medium', 'low'].map((s) => (
                        <SelectItem key={s} value={s}>{t(`severity.${s}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-fg-3">{t('customPatterns.action')}</Label>
                  <Select value={pat.action} onValueChange={(v) => updatePattern(pat._clientId, 'action', v)} disabled={!isOwner}>
                    <SelectTrigger className="h-7 w-[130px] text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['block', 'require_confirm', 'warn'].map((a) => (
                        <SelectItem key={a} value={a}>{t(`action.${a}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => removePattern(pat._clientId)}
                    className="mt-5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-fg-3 hover:bg-bg-3 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {isOwner && (
            <Button type="button" variant="outline" size="sm" onClick={addPattern} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t('customPatterns.add')}
            </Button>
          )}
        </div>
      </Section>

      {/* Section E — LLM classifier (collapsed) */}
      <div className="rounded-lg border border-line bg-bg-1">
        <button
          type="button"
          onClick={() => setLlmOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-4 py-3 text-[13px] font-medium text-fg-1 hover:bg-bg-2 transition-colors rounded-lg"
        >
          {llmOpen ? <ChevronDown className="h-4 w-4 text-fg-3" /> : <ChevronRight className="h-4 w-4 text-fg-3" />}
          {t('sections.llmClassifier')}
        </button>
        {llmOpen && (
          <div className="border-t border-line px-4 pb-4 pt-3 space-y-3">
            <div className="flex items-center gap-3">
              <Switch
                id="llm-enabled"
                checked={llmClassifier.enabled}
                onCheckedChange={(v) => isOwner && handleLlmChange('enabled', v)}
                disabled={!isOwner}
              />
              <Label htmlFor="llm-enabled" className="text-[13px]">{t('llm.enabledLabel')}</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-[12px] text-fg-2">{t('llm.guidancePrompt')}</Label>
              <Textarea
                value={llmClassifier.guidance_prompt}
                onChange={(e) => handleLlmChange('guidance_prompt', e.target.value)}
                placeholder={t('llm.guidancePromptPlaceholder')}
                disabled={!isOwner}
                rows={4}
                maxLength={4000}
                className="text-[12px] resize-none"
              />
              <p className="text-[11px] text-fg-3">{llmClassifier.guidance_prompt.length}/4000</p>
            </div>

            {/* Action thresholds */}
            <div className="space-y-2 pt-1">
              <Label className="text-[12px] text-fg-2">{t('llm.thresholdsLabel')}</Label>
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-[12px] text-fg-2">{t('llm.thresholdConfidential')}</Label>
                  <Select
                    value={llmClassifier.action_thresholds.confidential}
                    onValueChange={(v) => isOwner && handleLlmThresholdChange('confidential', v)}
                    disabled={!isOwner}
                  >
                    <SelectTrigger className="h-7 w-[160px] text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['warn', 'require_confirm'].map((a) => (
                        <SelectItem key={a} value={a}>{t(`action.${a}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[12px] text-fg-2">{t('llm.thresholdRestricted')}</Label>
                  <Select
                    value={llmClassifier.action_thresholds.restricted}
                    onValueChange={(v) => isOwner && handleLlmThresholdChange('restricted', v)}
                    disabled={!isOwner}
                  >
                    <SelectTrigger className="h-7 w-[160px] text-[12px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['warn', 'require_confirm', 'block'].map((a) => (
                        <SelectItem key={a} value={a}>{t(`action.${a}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Test classifier playground */}
            <div className="rounded-lg border border-line bg-bg-2">
              <button
                type="button"
                onClick={() => setTestOpen((v) => !v)}
                className="flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-fg-1 hover:bg-bg-3 transition-colors rounded-lg"
              >
                {testOpen ? <ChevronDown className="h-3.5 w-3.5 text-fg-3" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-3" />}
                {t('llm.test.title')}
              </button>
              {testOpen && (
                <div className="border-t border-line px-3 pb-3 pt-2 space-y-2">
                  <Textarea
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder={t('llm.test.placeholder')}
                    rows={3}
                    className="text-[12px] resize-none"
                  />
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleRunTest}
                      disabled={!testText.trim() || !llmClassifier.enabled || testRunning}
                    >
                      {testRunning ? t('llm.test.running') : t('llm.test.run')}
                    </Button>
                  </div>
                  {testResult && (
                    <div className="rounded-md border border-line bg-bg-1 p-2.5 space-y-2">
                      {(!testResult.matches || testResult.matches.length === 0) ? (
                        <p className="text-[12px] text-fg-3">{t('llm.test.noViolations')}</p>
                      ) : (
                        <>
                          <div className="space-y-1.5">
                            {testResult.matches.map((m, idx) => (
                              <div key={`${m.rule_id}-${idx}`} className="flex flex-wrap items-center gap-2">
                                <SeverityBadge severity={m.severity} />
                                <ActionBadge action={m.action} />
                                <span className="text-[12px] text-fg-1">
                                  {t(`rules.${m.rule_id}.name`, { defaultValue: m.rule_name || m.rule_id })}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-fg-3">
                            <span>{t('llm.test.highestAction')}:</span>
                            <ActionBadge action={testResult.highest_action} />
                          </div>
                          {testResult.matches.some((m) => m.source === 'llm') && (
                            <div className="text-[11px] text-fg-3 space-y-0.5">
                              <div className="font-medium text-fg-2">{t('llm.test.smartVerdict')}</div>
                              {testResult.matches
                                .filter((m) => m.source === 'llm')
                                .map((m, idx) => (
                                  <div key={`smart-${idx}`}>
                                    {m.category ? <span className="capitalize">{m.category}</span> : null}
                                    {m.category && m.description ? ' — ' : null}
                                    {m.description || null}
                                  </div>
                                ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Section F — Recent events */}
      <Section title={t('sections.recentEvents')} hint={t('sections.recentEventsHint')}>
        {events.length === 0 ? (
          <p className="text-[12px] text-fg-3">{t('events.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line bg-bg-2 text-fg-3">
                  <th className="px-3 py-2 text-start font-medium">{t('events.time')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('events.severity')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('events.action')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('events.source')}</th>
                  <th className="px-3 py-2 text-start font-medium">{t('events.rule')}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const topMatch = ev.matches?.[0]
                  const sourceKey = ev.source
                    ? `dlp.source${ev.source.charAt(0).toUpperCase()}${ev.source.slice(1)}`
                    : null
                  const sourceLabel = sourceKey
                    ? tAdmin(sourceKey, { defaultValue: ev.source })
                    : '—'
                  const ruleLabel = topMatch?.rule_id
                    ? t(`rules.${topMatch.rule_id}.name`, {
                        defaultValue: topMatch.rule_name || '—',
                      })
                    : (topMatch?.rule_name || '—')
                  return (
                    <tr key={ev._id} className="border-b border-line last:border-0 hover:bg-bg-2">
                      <td className="px-3 py-2 text-fg-3 whitespace-nowrap">{fmtDateTime(ev.created_at)}</td>
                      <td className="px-3 py-2"><SeverityBadge severity={topMatch?.severity || 'low'} /></td>
                      <td className="px-3 py-2"><ActionBadge action={ev.highest_action} /></td>
                      <td className="px-3 py-2 text-fg-2 capitalize">{sourceLabel}</td>
                      <td className="px-3 py-2 text-fg-2 max-w-[160px] truncate" title={ruleLabel}>
                        {ruleLabel}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-[12px] text-fg-3"
            onClick={() => toast(t('events.viewAllHint'))}
          >
            {t('events.viewAll')}
          </Button>
        </div>
      </Section>

      {/* Read-only notice for non-owners */}
      {!isOwner && (
        <p className="text-[11px] text-fg-3 ps-1">{t('readOnlyNotice')}</p>
      )}
    </div>
  )
}
