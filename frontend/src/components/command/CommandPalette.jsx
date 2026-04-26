import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { useCommandPalette } from '@/context/CommandPaletteContext'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { NAV_SECTIONS, ADMIN_ITEMS } from '@/constants/navigation'

export default function CommandPalette() {
  const ctx = useCommandPalette()
  const { user } = useAuth()
  const { toggleTheme, theme } = useTheme()
  const navigate = useNavigate()

  const handleSelect = (fn) => {
    fn()
    ctx.close()
  }

  const navGroups = NAV_SECTIONS.map(section => ({
    id: `nav:${section.id}`,
    heading: section.label,
    items: section.items.map(item => ({
      id: `nav:${item.to}`,
      label: item.label,
      icon: item.icon,
      onSelect: () => navigate(item.to),
    })),
  }))

  const adminGroup = user?.role === 'admin'
    ? [{
        id: 'admin',
        heading: 'Admin',
        items: ADMIN_ITEMS.map(item => ({
          id: `admin:${item.to}`,
          label: item.label,
          icon: item.icon,
          onSelect: () => navigate(item.to),
        })),
      }]
    : []

  const preferencesGroup = {
    id: 'preferences',
    heading: 'Preferences',
    items: [
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: theme === 'dark' ? Sun : Moon,
        onSelect: toggleTheme,
      },
    ],
  }

  const dynamicGroups = Object.entries(ctx.scopes).map(([scopeId, items]) => ({
    id: `scope:${scopeId}`,
    heading: scopeId,
    items,
  }))

  const allGroups = [...dynamicGroups, ...navGroups, ...adminGroup, preferencesGroup]

  return (
    <Command.Dialog
      open={ctx.isOpen}
      onOpenChange={open => open ? ctx.open() : ctx.close()}
      label="Command palette"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        aria-hidden="true"
        onClick={ctx.close}
      />

      {/* Panel */}
      <div className="fixed top-[20vh] left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 px-4">
        <div className="bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[60vh]">
          <Command.Input
            placeholder="Type a command or search..."
            className="w-full px-4 py-3 bg-transparent text-foreground placeholder:text-foreground-secondary outline-none border-b border-border text-sm"
          />

          <Command.List className="flex-1 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-foreground-secondary">
              No results found.
            </Command.Empty>

            {allGroups.map(group => {
              const visibleItems = group.items || []
              if (visibleItems.length === 0) return null
              return (
                <Command.Group
                  key={group.id}
                  heading={group.heading}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-foreground-secondary [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {visibleItems.map(item => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.label} ${item.hint || ''} ${item.id}`}
                        onSelect={() => handleSelect(item.onSelect)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground-secondary cursor-pointer transition-colors
                          data-[selected=true]:bg-background-tertiary data-[selected=true]:text-foreground
                          hover:bg-background-tertiary hover:text-foreground"
                      >
                        {Icon && <Icon className="h-4 w-4 shrink-0 text-foreground-secondary" />}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.hint && (
                          <span className="text-xs text-foreground-secondary shrink-0">{item.hint}</span>
                        )}
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 text-xs bg-background border border-border rounded font-mono shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )
            })}
          </Command.List>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-background-secondary text-xs text-foreground-secondary">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono">↑↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background border border-border rounded font-mono">esc</kbd>
              close
            </span>
            <span className="ml-auto opacity-60">uni-chat ⌘K</span>
          </div>
        </div>
      </div>
    </Command.Dialog>
  )
}
