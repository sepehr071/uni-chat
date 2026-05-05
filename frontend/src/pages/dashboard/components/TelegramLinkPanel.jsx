import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, Unlink, ExternalLink } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import { telegramService } from '../../../services/telegramService'
import toast from 'react-hot-toast'

export default function TelegramLinkPanel() {
  const { t } = useTranslation('dashboard')
  const queryClient = useQueryClient()
  const [polling, setPolling] = useState(false)
  const pollTimer = useRef(null)

  const { data, isLoading } = useQuery({
    queryKey: ['telegram-status'],
    queryFn: telegramService.getStatus,
    refetchInterval: polling ? 3000 : false,
  })

  const generateMutation = useMutation({
    mutationFn: telegramService.generateToken,
    onSuccess: ({ link_url }) => {
      window.open(link_url, '_blank', 'noopener')
      setPolling(true)
      clearTimeout(pollTimer.current)
      pollTimer.current = setTimeout(() => setPolling(false), 60_000)
    },
    onError: () => toast.error(t('telegram.failedToGenerate')),
  })

  const unlinkMutation = useMutation({
    mutationFn: telegramService.unlink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] })
      toast.success(t('telegram.unlinked'))
    },
    onError: () => toast.error(t('telegram.unlinkFailed')),
  })

  useEffect(() => {
    if (data?.linked && polling) {
      setPolling(false)
      clearTimeout(pollTimer.current)
      toast.success(t('telegram.linkedAs', { username: data.telegram_username || 'telegram' }))
    }
  }, [data?.linked, polling, data?.telegram_username, t])

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">{t('telegram.title')}</h3>
        <p className="text-sm text-foreground-secondary">{t('telegram.description')}</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {data?.linked ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-foreground-secondary">{t('telegram.linkedAccount')}</p>
                <p className="font-medium text-foreground">@{data.telegram_username || t('telegram.unknownUsername').replace(/[()]/g, '')}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => unlinkMutation.mutate()}
                disabled={unlinkMutation.isPending}
              >
                {unlinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4 me-2" />}
                {t('telegram.unlink')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-foreground-secondary">{t('telegram.openTelegramDesc')}</p>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || polling}
              >
                {generateMutation.isPending || polling ? (
                  <><Loader2 className="h-4 w-4 animate-spin me-2" />{polling ? t('telegram.waitingForTelegram') : t('telegram.generating')}</>
                ) : (
                  <><Send className="h-4 w-4 me-2" />{t('telegram.linkTelegram')}</>
                )}
                {!polling && !generateMutation.isPending && <ExternalLink className="h-4 w-4 ms-2" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
