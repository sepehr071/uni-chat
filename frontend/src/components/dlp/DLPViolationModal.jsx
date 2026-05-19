import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SeverityBadge, ActionBadge } from '@/components/dlp/badges'

function titleKey(highestAction) {
  if (highestAction === 'block') return 'violationModal.titleBlock'
  if (highestAction === 'require_confirm') return 'violationModal.titleConfirm'
  return 'violationModal.titleWarn'
}

export default function DLPViolationModal({
  isOpen,
  onClose,
  matches = [],
  highestAction = 'warn',
  onModify,
  onSendAnyway,
}) {
  const { t } = useTranslation('dlp')
  const isBlocked = highestAction === 'block'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose?.() }}>
      <DialogContent
        className="sm:max-w-lg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dlp-violation-modal-title"
        aria-describedby="dlp-violation-modal-description"
      >
        <DialogHeader>
          <DialogTitle id="dlp-violation-modal-title">{t(titleKey(highestAction))}</DialogTitle>
          <DialogDescription id="dlp-violation-modal-description">{t('violationModal.intro')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[360px] overflow-y-auto space-y-2 py-1">
          {matches.map((m, idx) => {
            const ruleName = t(`rules.${m.rule_id}.name`, { defaultValue: m.rule_name || m.rule_id })
            // For LLM smart-scan matches the model already returns a bespoke,
            // user-friendly reason in the active UI language — surface it
            // verbatim instead of the canned i18n fallback.
            const reason =
              m.source === 'llm'
                ? (m.description || t(`rules.${m.rule_id}.reason`, { defaultValue: '' }))
                : t(`rules.${m.rule_id}.reason`, { defaultValue: m.description || m.snippet || '' })
            const showSnippet = m.source !== 'llm' && m.snippet
            return (
              <div
                key={`${m.rule_id}-${idx}`}
                className="bg-background-secondary border-border rounded-lg p-3 space-y-1.5 border text-start"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={m.severity} />
                  <ActionBadge action={m.action} />
                  <span className="text-[12px] font-medium text-foreground">{ruleName}</span>
                </div>
                {reason && (
                  <p className="text-[12px] text-foreground-secondary">{reason}</p>
                )}
                {showSnippet && (
                  <code
                    dir="ltr"
                    className="font-mono text-[11px] bg-background-tertiary rounded px-1.5 py-0.5 inline-block break-all"
                  >
                    {m.snippet}
                  </code>
                )}
              </div>
            )
          })}
        </div>

        {isBlocked && (
          <p className="text-[11px] text-foreground-tertiary text-start">
            {t('violationModal.blockHint')}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onModify}>
            {t('violationModal.modify')}
          </Button>
          <Button
            variant="destructive"
            onClick={onSendAnyway}
            disabled={isBlocked}
          >
            {t('violationModal.sendAnyway')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
