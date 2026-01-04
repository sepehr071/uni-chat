import { useEffect, useCallback } from 'react'

/**
 * Hook for handling keyboard shortcuts
 * @param {Object} shortcuts - Map of key combinations to callback functions
 * @param {boolean} enabled - Whether shortcuts are enabled
 */
export function useKeyboardShortcuts(shortcuts, enabled = true) {
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return

    // Don't trigger shortcuts when typing in inputs or textareas
    const target = event.target
    const isInput = target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable

    // Build the key combination string
    const parts = []
    if (event.metaKey || event.ctrlKey) parts.push('mod')
    if (event.shiftKey) parts.push('shift')
    if (event.altKey) parts.push('alt')
    parts.push(event.key.toLowerCase())
    const combo = parts.join('+')

    // Check for matching shortcut
    const callback = shortcuts[combo]
    if (callback) {
      // Allow certain shortcuts even in inputs
      const allowInInput = ['mod+k', 'escape'].includes(combo)
      if (!isInput || allowInInput) {
        event.preventDefault()
        callback(event)
      }
    }
  }, [shortcuts, enabled])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown, enabled])
}

/**
 * Shortcut definitions for display purposes
 */
export const SHORTCUTS = {
  newChat: { keys: ['Ctrl/Cmd', 'N'], description: 'New conversation' },
  search: { keys: ['Ctrl/Cmd', 'K'], description: 'Open search / command palette' },
  close: { keys: ['Esc'], description: 'Close modal or sidebar' },
  settings: { keys: ['Ctrl/Cmd', ','], description: 'Open settings' },
  help: { keys: ['?'], description: 'Show keyboard shortcuts' },
}

/**
 * Format shortcut for display based on OS
 */
export function formatShortcut(keys) {
  const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

  return keys.map(key => {
    if (key === 'Ctrl/Cmd') return isMac ? '⌘' : 'Ctrl'
    if (key === 'Shift') return isMac ? '⇧' : 'Shift'
    if (key === 'Alt') return isMac ? '⌥' : 'Alt'
    if (key === 'Esc') return 'Esc'
    return key
  }).join(' + ')
}
