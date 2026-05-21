import { useTranslation } from 'react-i18next'
import { Sparkles, GitBranch, Paperclip, Code2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '../../utils/cn'

/**
 * Tab bar for RightRail.
 *
 * Four tabs: Helper | Branches | Attachments | Canvas.
 *
 * `enabledTabs` — array of tab ids that should be clickable on the current
 * route. Tabs not in the list render greyed-out and disabled (so the user
 * sees them but can't click; this advertises the rail's capabilities on
 * non-chat routes without taking them anywhere broken).
 */
const TAB_DEFS = [
  { id: 'helper', icon: Sparkles, ns: 'helper', key: 'title' },
  { id: 'branches', icon: GitBranch, ns: 'chat', key: 'contextRail.branches' },
  { id: 'attachments', icon: Paperclip, ns: 'chat', key: 'contextRail.attached' },
  { id: 'canvas', icon: Code2, ns: 'chat', key: 'codeCanvas.title' },
]

export default function RailTabs({ activeTab, onTabChange, enabledTabs }) {
  const { t: tHelper } = useTranslation('helper')
  const { t: tChat } = useTranslation('chat')

  const translators = { helper: tHelper, chat: tChat }

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList
        className={cn(
          'flex w-full justify-between gap-0.5 rounded-none border-b border-line',
          'bg-background-elevated p-1 h-10',
        )}
      >
        {TAB_DEFS.map(({ id, icon: Icon, ns, key }) => {
          const enabled = enabledTabs.includes(id)
          const t = translators[ns]
          const label = t(key)
          return (
            <TabsTrigger
              key={id}
              value={id}
              disabled={!enabled}
              title={label}
              aria-label={label}
              className={cn(
                'flex-1 min-w-0 h-8 px-1 gap-1 text-xs',
                'data-[state=active]:bg-background data-[state=active]:text-foreground',
                'data-[state=active]:shadow-sm',
                !enabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              <span className="truncate hidden lg:inline">{label}</span>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
