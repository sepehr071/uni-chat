import { useState, useMemo } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import CommandPalette from './CommandPalette'
import ShortcutsModal from './ShortcutsModal'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

export default function MainLayout() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false)

  // Define keyboard shortcuts
  const shortcuts = useMemo(() => ({
    'mod+k': () => setCommandPaletteOpen(true),
    'mod+n': () => navigate('/chat'),
    'mod+,': () => navigate('/settings'),
    'escape': () => {
      if (commandPaletteOpen) setCommandPaletteOpen(false)
      else if (shortcutsModalOpen) setShortcutsModalOpen(false)
      else if (mobileSidebarOpen) setMobileSidebarOpen(false)
    },
    '?': () => {
      // Only show if no modal is open
      if (!commandPaletteOpen && !shortcutsModalOpen) {
        setShortcutsModalOpen(true)
      }
    },
  }), [navigate, commandPaletteOpen, shortcutsModalOpen, mobileSidebarOpen])

  useKeyboardShortcuts(shortcuts)

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        isMobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          onMenuClick={() => setMobileSidebarOpen(true)}
          onSearchClick={() => setCommandPaletteOpen(true)}
          sidebarOpen={sidebarOpen}
        />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Shortcuts Modal */}
      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </div>
  )
}
