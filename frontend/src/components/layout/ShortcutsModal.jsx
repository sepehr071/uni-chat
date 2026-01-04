import { X, Keyboard } from 'lucide-react'
import { SHORTCUTS, formatShortcut } from '../../hooks/useKeyboardShortcuts'

export default function ShortcutsModal({ isOpen, onClose }) {
  if (!isOpen) return null

  const shortcutGroups = [
    {
      title: 'Navigation',
      shortcuts: [
        { ...SHORTCUTS.newChat, id: 'newChat' },
        { ...SHORTCUTS.search, id: 'search' },
        { ...SHORTCUTS.settings, id: 'settings' },
      ]
    },
    {
      title: 'General',
      shortcuts: [
        { ...SHORTCUTS.close, id: 'close' },
        { ...SHORTCUTS.help, id: 'help' },
      ]
    },
    {
      title: 'Chat',
      shortcuts: [
        { keys: ['Enter'], description: 'Send message', id: 'send' },
        { keys: ['Shift', 'Enter'], description: 'New line', id: 'newline' },
        { keys: ['Ctrl/Cmd', 'Enter'], description: 'Save edit', id: 'saveEdit' },
      ]
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg mx-4 bg-background-elevated border border-border rounded-xl shadow-dropdown">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold text-foreground">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {shortcutGroups.map(group => (
            <div key={group.title}>
              <h3 className="text-sm font-medium text-foreground-secondary mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map(shortcut => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between py-2"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="px-2 py-1 text-xs font-mono bg-background-tertiary border border-border rounded text-foreground-secondary">
                            {formatShortcut([key])}
                          </kbd>
                          {i < shortcut.keys.length - 1 && (
                            <span className="mx-1 text-foreground-tertiary">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border text-center">
          <p className="text-xs text-foreground-tertiary">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background-tertiary border border-border rounded">?</kbd> to show this dialog
          </p>
        </div>
      </div>
    </div>
  )
}
