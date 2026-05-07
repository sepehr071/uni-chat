import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
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
import { workspaceService } from '@/services/workspaceService'
import { useWorkspace } from '@/context/WorkspaceContext'
import { cn } from '@/lib/utils'

function parseEmails(raw) {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export default function OnboardingWizard() {
  const { t } = useTranslation('companies')
  const nav = useNavigate()
  const { setActiveWorkspace, refresh } = useWorkspace()

  const [step, setStep] = useState(1)
  const [companyName, setCompanyName] = useState('')
  const [emailsRaw, setEmailsRaw] = useState('')
  const [role, setRole] = useState('editor')
  const [busy, setBusy] = useState(false)

  async function handleStep1(e) {
    e.preventDefault()
    if (!companyName.trim()) return
    setStep(2)
  }

  async function handleFinish(skip = false) {
    setBusy(true)
    try {
      const ws = await workspaceService.create({ name: companyName.trim(), type: 'team' })
      const newWorkspace = ws.workspace || ws

      await setActiveWorkspace(newWorkspace)
      await refresh()

      if (!skip) {
        const emails = parseEmails(emailsRaw)
        let sentCount = 0
        let noEmailCount = 0

        for (const email of emails) {
          try {
            const result = await workspaceService.invite(newWorkspace._id, { email, role })
            if (result?.email_sent === false) {
              noEmailCount++
            } else {
              sentCount++
            }
          } catch {
            // skip failed invites silently
          }
        }

        const total = sentCount + noEmailCount
        if (total > 0) {
          toast.success(t('onboarding.toastSuccess', { count: total }))
        }
        if (noEmailCount > 0) {
          toast(t('onboarding.toastNoEmail'), { duration: 6000 })
        }
      }

      nav('/chat', { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create company')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-0 p-4">
      <div className="w-full max-w-md rounded-xl border border-line bg-bg-1 p-8 shadow-lg">
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                s <= step ? 'bg-accent' : 'bg-bg-3',
              )}
            />
          ))}
        </div>

        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
          {t('onboarding.welcomeManager')}
        </p>

        {step === 1 && (
          <form onSubmit={handleStep1} className="space-y-5">
            <h1 className="text-xl font-semibold text-fg-0">
              {t('onboarding.step1Title')}
            </h1>

            <div className="space-y-2">
              <Label htmlFor="company-name">{t('label')}</Label>
              <Input
                id="company-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder={t('create.namePlaceholder')}
                maxLength={100}
                required
                autoFocus
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={!companyName.trim()}>
                Next
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h1 className="text-xl font-semibold text-fg-0">
              {t('onboarding.step2Title')}
            </h1>

            <div className="space-y-2">
              <Label htmlFor="invite-emails">Emails</Label>
              <Textarea
                id="invite-emails"
                value={emailsRaw}
                onChange={(e) => setEmailsRaw(e.target.value)}
                placeholder={t('onboarding.emailsPlaceholder')}
                rows={4}
                dir="ltr"
              />
              <p className="text-[11px] text-fg-3">
                Separate by comma or newline.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleFinish(true)}
                disabled={busy}
              >
                {t('onboarding.skip')}
              </Button>
              <Button
                type="button"
                onClick={() => handleFinish(false)}
                disabled={busy}
              >
                {busy ? '...' : t('onboarding.finish')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
