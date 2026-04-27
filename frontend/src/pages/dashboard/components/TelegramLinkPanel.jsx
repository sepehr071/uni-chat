import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Send, Loader2, Unlink, ExternalLink } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { Card, CardContent } from '../../../components/ui/card'
import { telegramService } from '../../../services/telegramService'
import toast from 'react-hot-toast'

export default function TelegramLinkPanel() {
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
    onError: () => toast.error('Failed to generate Telegram link'),
  })

  const unlinkMutation = useMutation({
    mutationFn: telegramService.unlink,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telegram-status'] })
      toast.success('Telegram unlinked')
    },
    onError: () => toast.error('Failed to unlink Telegram'),
  })

  useEffect(() => {
    if (data?.linked && polling) {
      setPolling(false)
      clearTimeout(pollTimer.current)
      toast.success(`Linked as @${data.telegram_username || 'telegram'}`)
    }
  }, [data?.linked, polling, data?.telegram_username])

  if (isLoading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground mb-1">Telegram Bot</h3>
        <p className="text-sm text-foreground-secondary">
          Chat with uni-chat from inside Telegram. Conversations sync to your account in real time.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {data?.linked ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-foreground-secondary">Linked Telegram account</p>
                <p className="font-medium text-foreground">@{data.telegram_username || '(unknown)'}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => unlinkMutation.mutate()}
                disabled={unlinkMutation.isPending}
              >
                {unlinkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4 mr-2" />}
                Unlink
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-foreground-secondary">
                Click below to open Telegram and finish linking. The link is valid for 10 minutes.
              </p>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || polling}
              >
                {generateMutation.isPending || polling ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{polling ? 'Waiting for Telegram…' : 'Generating…'}</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Link Telegram</>
                )}
                {!polling && !generateMutation.isPending && <ExternalLink className="h-4 w-4 ml-2" />}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
