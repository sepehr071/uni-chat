import { useTranslation } from 'react-i18next'
import SeriesManager from './components/SeriesManager'

export default function SeriesPage() {
  const { t } = useTranslation('meetings_series')
  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto max-w-6xl space-y-7 px-6 py-8">
        <header>
          <p className="text-xs font-semibold tracking-wide text-accent">
            {t('page.kicker')}
          </p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight text-foreground">
            {t('page.title')}
          </h1>
          <p className="mt-1.5 text-[13.5px] text-foreground-secondary">
            {t('page.subtitle')}
          </p>
        </header>
        <SeriesManager />
      </main>
    </div>
  )
}
