import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { platformService } from '@/services/platformService'

function formatWhen(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function PlatformAccountPage() {
  const { t } = useTranslation('platform')
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    platformService
      .getMe()
      .then((data) => {
        if (!alive) return
        setMe(data)
        setError(null)
      })
      .catch((err) => {
        if (!alive) return
        setError(err?.response?.data?.error || t('account.loadError'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [t])

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return <p className="text-error p-6">{error}</p>
  }

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <UserCircle className="h-6 w-6" />
            {t('account.title')}
          </h1>
          <p className="text-foreground-secondary mt-1">{t('account.subtitle')}</p>
        </div>

        <Card>
          <CardContent className="pt-5 pb-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              <div className="space-y-1">
                <dt className="text-xs text-foreground-tertiary uppercase tracking-wide">
                  {t('account.email')}
                </dt>
                <dd className="text-foreground" dir="ltr">{me?.email || '-'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-foreground-tertiary uppercase tracking-wide">
                  {t('account.displayName')}
                </dt>
                <dd className="text-foreground">{me?.display_name || me?.profile?.display_name || '-'}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-foreground-tertiary uppercase tracking-wide">
                  {t('account.createdAt')}
                </dt>
                <dd className="text-foreground" dir="ltr">{formatWhen(me?.created_at)}</dd>
              </div>
              <div className="space-y-1">
                <dt className="text-xs text-foreground-tertiary uppercase tracking-wide">
                  {t('account.lastActive')}
                </dt>
                <dd className="text-foreground" dir="ltr">{formatWhen(me?.last_active_at)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
