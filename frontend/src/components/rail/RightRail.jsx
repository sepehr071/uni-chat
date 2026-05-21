import { useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Button } from '../ui/button'
import { useLanguage } from '../../context/LanguageContext'
import { useRightRail, getEnabledTabsForRoute } from '../../hooks/useRightRail'
import { useRailData } from '../../context/RailDataContext'
import { cn } from '../../utils/cn'
import RailTabs from './RailTabs'

const HelperPanel = lazy(() => import('../helper/HelperPanel'))
const BranchesPanel = lazy(() => import('../chat/BranchesPanel'))
const AttachmentsPanel = lazy(() => import('../chat/AttachmentsPanel'))
const CodeCanvasPanel = lazy(() => import('../chat/CodeCanvasPanel'))

/**
 * RightRail — dockable right-side panel with 4 tabs:
 *   Helper | Branches | Attachments | Canvas.
 *
 * Width: 320px expanded, 56px collapsed. `hidden md:flex` — mobile gets no
 * rail (no bottom-sheet variant yet).
 *
 * State (open / activeTab / suppressed) lives in `useRightRail`. Data for
 * the chat-side panels (branches / attachments / stats / canvas code) flows
 * through `RailDataContext` which ChatPage publishes into.
 *
 * `suppressed=true` (focus mode, full-screen overlays) forces the collapsed
 * icon strip even when the user's persisted `open` is true — the
 * preference is preserved across the overlay.
 */
export default function RightRail() {
  const { t: tHelper } = useTranslation('helper')
  const { isRTL } = useLanguage()
  const location = useLocation()
  const { open, activeTab, suppressed, setOpen, setActiveTab, toggleOpen } = useRightRail()
  const railData = useRailData()

  const effectiveOpen = open && !suppressed
  const enabledTabs = useMemo(
    () => getEnabledTabsForRoute(location.pathname),
    [location.pathname],
  )

  // Smart default: when the user lands on /chat we want the rail to surface
  // the most useful tab without overriding an explicit choice. We only
  // auto-switch when the current tab is the bare default ('helper') and
  // a more relevant tab has signal — once the user clicks anything, we
  // stop second-guessing.
  const hasAutoPicked = useRef(false)
  useEffect(() => {
    if (hasAutoPicked.current) return
    if (activeTab !== 'helper') {
      hasAutoPicked.current = true
      return
    }
    if (!enabledTabs.includes('helper')) return // not on chat anyway

    if (railData.codeCanvasOpen && enabledTabs.includes('canvas')) {
      setActiveTab('canvas')
      hasAutoPicked.current = true
      return
    }
    if ((railData.branches?.length || 0) >= 2 && enabledTabs.includes('branches')) {
      setActiveTab('branches')
      hasAutoPicked.current = true
      return
    }
  }, [activeTab, enabledTabs, railData.codeCanvasOpen, railData.branches, setActiveTab])

  // When the canvas is opened, jump to the Canvas tab even if the user had
  // picked Helper / Branches earlier. (This overrides the once-only rule
  // above because explicit user action — clicking "Run" — implies intent.)
  const lastCanvasOpenRef = useRef(railData.codeCanvasOpen)
  useEffect(() => {
    if (!lastCanvasOpenRef.current && railData.codeCanvasOpen && enabledTabs.includes('canvas')) {
      setActiveTab('canvas')
      if (!open && !suppressed) setOpen(true)
    }
    lastCanvasOpenRef.current = railData.codeCanvasOpen
  }, [railData.codeCanvasOpen, enabledTabs, setActiveTab, open, suppressed, setOpen])

  // If the active tab becomes disabled (route change → e.g. away from /chat
  // while Branches was selected), fall back to Helper. Doesn't persist
  // unless the user clicks; we just render Helper for now.
  const renderedTab = enabledTabs.includes(activeTab) ? activeTab : 'helper'

  // ---------- Collapsed icon strip ----------
  if (!effectiveOpen) {
    const ExpandIcon = isRTL ? ChevronLeft : ChevronRight
    return (
      <aside
        aria-label={tHelper('title')}
        className={cn(
          'hidden md:flex',
          'h-full w-14 flex-shrink-0 flex-col items-center gap-2 py-3',
          'border-s border-line bg-background-elevated',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => !suppressed && setOpen(true)}
          aria-label={tHelper('expand')}
          title={tHelper('expand')}
          disabled={suppressed}
          className="h-10 w-10"
        >
          <ExpandIcon className="h-4 w-4" />
        </Button>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md text-foreground-muted"
          aria-hidden="true"
        >
          <Sparkles className="h-4 w-4" />
        </div>
      </aside>
    )
  }

  // ---------- Expanded rail ----------
  const CollapseIcon = isRTL ? ChevronRight : ChevronLeft

  return (
    <aside
      aria-label={tHelper('title')}
      className={cn(
        'hidden md:flex',
        'h-full w-[320px] flex-shrink-0 flex-col',
        'border-s border-line bg-background-elevated',
      )}
    >
      {/* Header: collapse button on the inline-start edge */}
      <div className="flex items-center gap-1 border-b border-line ps-2 pe-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleOpen}
          aria-label={tHelper('collapse')}
          title={tHelper('collapse')}
          className="h-8 w-8 flex-shrink-0"
          animated={false}
        >
          <CollapseIcon className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <RailTabs
            activeTab={renderedTab}
            onTabChange={(next) => setActiveTab(next)}
            enabledTabs={enabledTabs}
          />
        </div>
      </div>

      {/* Tab bodies — we use Radix Tabs.Content under a single Tabs root so
          only the active body mounts (or stays mounted but hidden). We
          mount the helper panel even when inactive so an in-flight stream
          isn't aborted just by tab-switching back later. */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Tabs value={renderedTab} className="h-full">
          <TabsContent value="helper" className="h-full mt-0">
            <Suspense fallback={null}>
              <HelperPanel active={renderedTab === 'helper'} />
            </Suspense>
          </TabsContent>
          <TabsContent value="branches" className="h-full mt-0">
            <Suspense fallback={null}>
              <BranchesPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="attachments" className="h-full mt-0">
            <Suspense fallback={null}>
              <AttachmentsPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="canvas" className="h-full mt-0">
            <Suspense fallback={null}>
              <CodeCanvasPanel />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </aside>
  )
}
