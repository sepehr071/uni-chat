import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useLanguage } from '@/context/LanguageContext'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/utils/cn'

/**
 * Generic collapsible nav group used by the slim Sidebar.
 *
 * Props:
 *   id            string — for keyed expand/collapse persistence
 *   label         string
 *   icon          optional lucide icon for the section header (Component)
 *   items         array of { to, icon, label }
 *   expanded      boolean — controlled by parent (localStorage-backed)
 *   onToggle      () => void
 *   showContent   boolean — true when sidebar is expanded (icons+labels)
 *   isLinkActive  (to) => boolean
 *   onNavClick    () => void (close drawer on mobile)
 */
export default function NavSection({
  id,
  label,
  icon: SectionIcon,
  items,
  expanded,
  onToggle,
  showContent,
  isLinkActive,
  onNavClick,
}) {
  const { isRTL } = useLanguage()

  if (!items || items.length === 0) return null

  return (
    <div className="mb-2" data-section-id={id}>
      {showContent && (
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-tertiary uppercase tracking-wider hover:text-foreground-secondary transition-colors rounded-lg"
        >
          <span className="flex items-center gap-1.5">
            {SectionIcon && <SectionIcon className="h-3 w-3 inline-block text-fg-4" />}
            {label}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 0 : isRTL ? 90 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </motion.div>
        </button>
      )}

      <AnimatePresence initial={false}>
        {(expanded || !showContent) && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-1 overflow-hidden"
          >
            {items.map((item) => (
              <li key={item.to}>
                <NavRow
                  item={item}
                  active={isLinkActive(item.to)}
                  showContent={showContent}
                  isRTL={isRTL}
                  onNavClick={onNavClick}
                />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function NavRow({ item, active, showContent, isRTL, onNavClick }) {
  const content = (
    <Link
      to={item.to}
      onClick={onNavClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
        'min-h-[44px] group',
        active
          ? 'bg-accent-muted text-accent font-semibold'
          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
        !showContent && 'justify-center px-2',
      )}
    >
      <item.icon
        className={cn(
          'h-5 w-5 flex-shrink-0 transition-transform duration-200',
          'group-hover:scale-110',
        )}
      />
      {showContent && (
        <motion.span
          initial={{ opacity: 0, x: isRTL ? 10 : -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-sm font-medium"
        >
          {item.label}
        </motion.span>
      )}
    </Link>
  )

  if (!showContent) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}
