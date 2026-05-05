import { Menu, Search, Command } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCommandPalette } from '../../context/CommandPaletteContext'
import ScopeChip from './ScopeChip'

export default function Header({ onMenuClick }) {
  const { t } = useTranslation('layout')
  const { open } = useCommandPalette()

  return (
    <header className="h-11 border-b border-border bg-background-secondary flex items-center justify-between px-4 shrink-0">
      {/* Start: hamburger (mobile only) + scope chip */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="p-1.5 -ms-1.5 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground lg:hidden"
          aria-label={t('header.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>
        <ScopeChip />
      </div>

      {/* End: search pill + mobile icon */}
      <div className="flex items-center gap-2">
        {/* Desktop/tablet search pill */}
        <button
          onClick={open}
          className="hidden sm:flex items-center gap-2 px-3 h-8 rounded-lg bg-background-tertiary border border-border text-sm text-foreground-secondary hover:text-foreground transition-colors"
          aria-label={t('header.openCommandPalette')}
        >
          <Search className="h-3.5 w-3.5" />
          <span>{t('header.searchPlaceholder')}</span>
          <span className="flex items-center gap-0.5 ms-1">
            <kbd className="px-1.5 py-0.5 text-xs bg-background border border-border rounded font-mono leading-none">
              <Command className="h-3 w-3 inline" />
            </kbd>
            <kbd className="px-1.5 py-0.5 text-xs bg-background border border-border rounded font-mono leading-none">K</kbd>
          </span>
        </button>

        {/* Mobile icon-only search button */}
        <button
          onClick={open}
          className="p-1.5 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground sm:hidden"
          aria-label={t('header.search')}
        >
          <Search className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
