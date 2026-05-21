import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AudioWaveform } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card'
import { Button } from '../../components/ui/button'

/**
 * Assistants hub — landing page listing available assistants as cards.
 *
 * For now exposes one assistant (Meeting Assistant) and a placeholder line
 * for upcoming ones. Each card links to the underlying feature route
 * (`/meetings` for the Meeting Assistant).
 */
export default function AssistantsHubPage() {
  const { t } = useTranslation('assistants')

  const assistants = [
    {
      id: 'meetings',
      icon: AudioWaveform,
      title: t('meetingAssistant.title'),
      description: t('meetingAssistant.description'),
      to: '/meetings',
      cta: t('meetingAssistant.cta'),
    },
  ]

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            {t('pageTitle')}
          </h1>
          <p className="mt-2 text-sm text-foreground-secondary">
            {t('pageHint')}
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assistants.map((a) => {
            const Icon = a.icon
            return (
              <Card key={a.id} variant="default" className="flex flex-col">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent mb-2">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <CardTitle>{a.title}</CardTitle>
                  <CardDescription>{a.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <Button asChild className="w-full">
                    <Link to={a.to}>{a.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <p className="mt-6 text-center text-xs text-foreground-tertiary">
          {t('moreSoon')}
        </p>
      </div>
    </div>
  )
}
