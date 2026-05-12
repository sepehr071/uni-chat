import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText, Filter, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { platformService } from '@/services/platformService'

const PAGE_SIZE = 50

function formatWhen(iso) {
  if (!iso) return '-'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function shortJson(obj) {
  if (obj == null) return ''
  try {
    const s = JSON.stringify(obj)
    return s.length > 80 ? s.slice(0, 80) + '…' : s
  } catch {
    return String(obj)
  }
}

export default function PlatformAuditPage() {
  const { t } = useTranslation('platform')
  const [days, setDays] = useState('30')
  const [actionFilter, setActionFilter] = useState('')
  const [events, setEvents] = useState([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)

  // Reset pagination when filters change
  useEffect(() => {
    setSkip(0)
  }, [days, actionFilter])

  // Initial / filter-driven fetch
  useEffect(() => {
    let alive = true
    setLoading(true)
    platformService
      .listAudit({
        days: days ? Number(days) : undefined,
        action: actionFilter || undefined,
        skip: 0,
        limit: PAGE_SIZE,
      })
      .then((data) => {
        if (!alive) return
        setEvents(data?.events || [])
        setTotal(data?.total || 0)
        setError(null)
      })
      .catch((err) => {
        if (!alive) return
        setError(err?.response?.data?.error || t('audit.loadError'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [days, actionFilter, t])

  const handleLoadMore = async () => {
    const nextSkip = skip + PAGE_SIZE
    setLoadingMore(true)
    try {
      const data = await platformService.listAudit({
        days: days ? Number(days) : undefined,
        action: actionFilter || undefined,
        skip: nextSkip,
        limit: PAGE_SIZE,
      })
      setEvents((prev) => [...prev, ...(data?.events || [])])
      setSkip(nextSkip)
      setTotal(data?.total || total)
    } catch (err) {
      // Non-fatal; surface inline error
      setError(err?.response?.data?.error || t('audit.loadError'))
    } finally {
      setLoadingMore(false)
    }
  }

  const canLoadMore = useMemo(() => events.length < total, [events.length, total])

  return (
    <div className="p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ScrollText className="h-6 w-6" />
              {t('audit.title')}
            </h1>
            <p className="text-foreground-secondary mt-1">{t('audit.subtitle')}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-foreground-secondary" />
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder={t('audit.filters.days')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">{t('audit.filters.days7')}</SelectItem>
                  <SelectItem value="30">{t('audit.filters.days30')}</SelectItem>
                  <SelectItem value="90">{t('audit.filters.days90')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              dir="ltr"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              placeholder={t('audit.filters.search')}
              className="w-[200px]"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-12 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : error ? (
              <p className="text-error p-6">{error}</p>
            ) : events.length === 0 ? (
              <p className="text-foreground-secondary text-center py-12">{t('audit.empty')}</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-background-secondary text-foreground-tertiary text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-start px-4 py-3 font-medium">{t('audit.columns.timestamp')}</th>
                        <th className="text-start px-4 py-3 font-medium">{t('audit.columns.action')}</th>
                        <th className="text-start px-4 py-3 font-medium">{t('audit.columns.actor')}</th>
                        <th className="text-start px-4 py-3 font-medium">{t('audit.columns.details')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((evt) => {
                        const actor = evt.platform_admin
                        const actorLabel =
                          actor?.display_name ||
                          actor?.email ||
                          evt.platform_admin_id ||
                          t('audit.unknownActor')
                        return (
                          <tr key={evt._id} className="border-t border-border hover:bg-background-secondary/50">
                            <td className="px-4 py-3 text-foreground-tertiary whitespace-nowrap" dir="ltr">
                              {formatWhen(evt.created_at)}
                            </td>
                            <td className="px-4 py-3">
                              <code className="text-xs font-mono text-accent" dir="ltr">
                                {evt.action}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-foreground-secondary truncate max-w-[200px]" dir="ltr">
                              {actorLabel}
                            </td>
                            <td className="px-4 py-3 text-foreground-tertiary text-xs font-mono break-all" dir="ltr">
                              {shortJson(evt.details)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <p className="text-xs text-foreground-tertiary">
                    {t('audit.showing', { count: events.length, total })}
                  </p>
                  {canLoadMore && (
                    <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                      {loadingMore ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        t('audit.loadMore')
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
