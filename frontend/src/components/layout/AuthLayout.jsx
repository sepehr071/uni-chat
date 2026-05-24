import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function AuthLayout() {
  const { t } = useTranslation('layout')

  return (
    <div className="min-h-screen bg-background flex">
      {/* Start side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-background-secondary items-center justify-center p-12">
        <div className="max-w-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Novis Ai</h1>
          </div>
          <p className="text-xl text-foreground-secondary leading-relaxed">
            {t('authLayout.tagline')}
          </p>
          <div className="space-y-4 pt-4">
            <Feature
              title={t('authLayout.customAgentsTitle')}
              description={t('authLayout.customAgentsDesc')}
            />
            <Feature
              title={t('authLayout.multipleModelsTitle')}
              description={t('authLayout.multipleModelsDesc')}
            />
          </div>
        </div>
      </div>

      {/* End side - Auth forms */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Novis Ai</h1>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function Feature({ title, description }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-1.5 bg-accent rounded-full" />
      <div>
        <h3 className="font-medium text-foreground">{title}</h3>
        <p className="text-sm text-foreground-secondary">{description}</p>
      </div>
    </div>
  )
}
