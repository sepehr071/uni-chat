import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Plus, ChevronDown, Inbox } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Ptile from '@/components/teams/Ptile'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import { useLanguage } from '@/context/LanguageContext'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/utils/cn'

const WS_PALETTE = ['#5c9aed', '#10b981', '#f59e0b', '#a78bfa', '#f472b6', '#2dd4bf', '#ef4444']

function firstLetter(name) {
  return (name || '?').trim().charAt(0).toUpperCase()
}

function workspaceColor(ws) {
  if (!ws?._id) return '#5c9aed'
  if (ws.type === 'personal') return '#10b981'
  let h = 0
  for (let i = 0; i < ws._id.length; i++) h = (h * 31 + ws._id.charCodeAt(i)) >>> 0
  return WS_PALETTE[h % WS_PALETTE.length]
}

/**
 * Top block of the slim Sidebar: brand row, workspace context (read-only —
 * mutation lives in the Header pill-bar), and a primary "New chat" button.
 *
 * On mobile (`< md`) we also surface a compact scope chip that opens the
 * workspace switcher, so drawer users keep that one-tap reach.
 */
export default function WorkspaceHeader({ showContent, onNewChat, isMobile }) {
  const { t } = useTranslation('layout')
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { currentWorkspace, setSwitcherOpen } = useWorkspace()
  const { currentProject } = useProject()

  const openCompanySwitcher = () => {
    if (typeof setSwitcherOpen === 'function') setSwitcherOpen(true)
  }

  return (
    <>
      {/* Brand + workspace context */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border gap-2">
        {showContent && currentWorkspace ? (
          <button
            type="button"
            onClick={openCompanySwitcher}
            className="flex items-center gap-2 min-w-0 hover:bg-bg-2 rounded-md px-1.5 py-1 -mx-1.5 transition"
            aria-label={t('header.openCompanySwitcher')}
          >
            <Ptile
              size="sm"
              gradient
              color={workspaceColor(currentWorkspace)}
              letter={firstLetter(currentWorkspace.name)}
              className="!w-6 !h-6 !text-[11px]"
            />
            <span className="text-sm font-semibold text-fg-0 truncate">
              {currentWorkspace.name}
            </span>
            <ChevronDown className="h-3 w-3 text-fg-4 flex-shrink-0" />
          </button>
        ) : (
          <AnimatePresence mode="wait">
            {showContent && (
              <motion.h1
                initial={{ opacity: 0, x: isRTL ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
                className="text-xl font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent"
              >
                Uni-Chat
              </motion.h1>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Mobile-only scope pill — Header pills exist on mobile too, but when
          the drawer is open the header is obscured, so this keeps reach. */}
      {isMobile && showContent && currentWorkspace && (
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={openCompanySwitcher}
            className={cn(
              'w-full inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md',
              'border border-line bg-bg-2 hover:bg-bg-3 transition text-sm text-fg-1',
            )}
          >
            <Ptile
              size="sm"
              gradient
              color={workspaceColor(currentWorkspace)}
              letter={firstLetter(currentWorkspace.name)}
              className="!w-5 !h-5 !text-[10px]"
            />
            <span className="font-medium truncate">{currentWorkspace.name}</span>
            <span className="text-fg-4 mx-1">›</span>
            {currentProject ? (
              <>
                <span
                  style={{ background: currentProject.color || '#5c9aed' }}
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                />
                <span className="truncate">{currentProject.name}</span>
              </>
            ) : (
              <>
                <Inbox className="h-3 w-3 text-fg-3 flex-shrink-0" />
                <span className="text-fg-3 italic">{t('scopeChip.unfiled')}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* New Chat button */}
      <div className="p-3">
        {showContent ? (
          <Button
            onClick={onNewChat}
            className="w-full gap-2 h-11 text-base font-semibold shadow-lg shadow-accent/25"
          >
            <Plus className="h-5 w-5" />
            {t('sidebar.newChat')}
          </Button>
        ) : (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                onClick={onNewChat}
                size="icon"
                className="w-full h-11"
                aria-label={t('sidebar.newChat')}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t('sidebar.newChat')}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </>
  )
}
