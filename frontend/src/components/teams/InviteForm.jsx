import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export default function InviteForm({ onSubmit, error }) {
  const { t } = useTranslation('projects')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('editor')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await onSubmit({ email: email.trim(), role })
      setEmail('')
      setRole('editor')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor="invite-email" className="sr-only">
            Email address
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder={t('inviteForm.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">{t('inviteForm.roleViewer')}</SelectItem>
            <SelectItem value="editor">{t('inviteForm.roleEditor')}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" disabled={loading || !email.trim()}>
          {loading ? t('inviteForm.sending') : t('inviteForm.inviteButton')}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </form>
  )
}
