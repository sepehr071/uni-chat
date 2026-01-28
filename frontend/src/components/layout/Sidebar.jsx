import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  MessageSquare,
  History,
  Settings,
  Sliders,
  LayoutDashboard,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Users,
  FileText,
  Shield,
  X,
  LayoutGrid,
  Image,
  GitBranch,
  LogOut,
  Code2,
  BookMarked,
  Scale
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/cn'

// Navigation sections with grouped items
// Order follows UX best practices: Dashboard first, core features, creation tools, library, settings
const navSections = [
  {
    id: 'home',
    label: 'Home',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ]
  },
  {
    id: 'chat',
    label: 'Chat',
    items: [
      { to: '/chat', icon: MessageSquare, label: 'Chat' },
      { to: '/arena', icon: LayoutGrid, label: 'Arena' },
      { to: '/debate', icon: Scale, label: 'Debate' },
    ]
  },
  {
    id: 'create',
    label: 'Create',
    items: [
      { to: '/image-studio', icon: Image, label: 'Image Studio' },
      { to: '/workflow', icon: GitBranch, label: 'Workflow' },
    ]
  },
  {
    id: 'library',
    label: 'Library',
    items: [
      { to: '/configs', icon: Sliders, label: 'Assistants' },
      { to: '/gallery', icon: Sparkles, label: 'Gallery' },
      { to: '/history', icon: History, label: 'History' },
      { to: '/my-canvases', icon: Code2, label: 'My Canvases' },
      { to: '/knowledge', icon: BookMarked, label: 'Knowledge Vault' },
    ]
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { to: '/settings', icon: Settings, label: 'Settings' },
    ]
  }
]

const adminSection = {
  id: 'admin',
  label: 'Admin',
  items: [
    { to: '/admin', icon: LayoutDashboard, label: 'Admin' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/templates', icon: FileText, label: 'Templates' },
    { to: '/admin/audit', icon: Shield, label: 'Audit Log' },
  ]
}

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const sidebarRef = useRef(null)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)

  // Load expanded sections from localStorage, default all expanded
  const [expandedSections, setExpandedSections] = useState(() => {
    const saved = localStorage.getItem('sidebar-sections')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return { home: true, chat: true, create: true, library: true, settings: true, admin: true }
      }
    }
    return { home: true, chat: true, create: true, library: true, settings: true, admin: true }
  })

  // Persist expanded sections to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-sections', JSON.stringify(expandedSections))
  }, [expandedSections])

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  // Swipe to close on mobile
  const minSwipeDistance = 50

  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    if (isLeftSwipe && isMobile) {
      onClose()
    }
  }

  // Close on outside click for mobile
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isMobile && isOpen && sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMobile, isOpen, onClose])

  // Close sidebar on navigation for mobile
  const handleNavClick = () => {
    if (isMobile) {
      onClose()
    }
  }

  const handleNewChat = () => {
    navigate('/chat')
    if (isMobile) onClose()
  }

  const handleLogout = async () => {
    setShowUserMenu(false)
    await logout()
    navigate('/login')
  }

  // Render a navigation section
  const renderSection = (section, showLabel = true) => {
    const isExpanded = expandedSections[section.id]
    const showContent = isOpen || isMobile

    return (
      <div key={section.id} className="mb-1">
        {/* Section Header - clickable to toggle */}
        {showContent && showLabel && (
          <button
            onClick={() => toggleSection(section.id)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-tertiary uppercase tracking-wider hover:text-foreground-secondary transition-colors"
          >
            <span>{section.label}</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                !isExpanded && '-rotate-90'
              )}
            />
          </button>
        )}

        {/* Section Items */}
        <ul
          className={cn(
            'space-y-0.5 overflow-hidden transition-all',
            showContent && !isExpanded && 'max-h-0',
            showContent && isExpanded && 'max-h-96',
            !showContent && 'max-h-96' // Always show icons when collapsed
          )}
        >
          {section.items.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={handleNavClick}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  'min-h-[40px]',
                  isActive
                    ? 'bg-accent/10 text-accent'
                    : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                  !isOpen && !isMobile && 'justify-center'
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {showContent && <span className="text-sm">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          'flex flex-col bg-background-secondary border-r border-border transition-all duration-300 z-50',
          isMobile ? 'fixed inset-y-0 left-0 w-64' : 'relative',
          isMobile && !isOpen && '-translate-x-full',
          !isMobile && !isOpen && 'w-16',
          !isMobile && isOpen && 'w-64'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          {isOpen && (
            <h1 className="text-xl font-bold text-foreground">Uni-Chat</h1>
          )}
          {isMobile && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-background-tertiary text-foreground-secondary ml-auto"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={handleNewChat}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg',
              'bg-accent hover:bg-accent-hover text-white font-medium',
              'transition-colors active:scale-95',
              !isOpen && !isMobile && 'justify-center'
            )}
          >
            <Plus className="h-5 w-5 flex-shrink-0" />
            {(isOpen || isMobile) && <span>New Chat</span>}
          </button>
        </div>

        {/* Navigation with Sections */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {navSections.map((section) => renderSection(section))}

          {/* Admin Section */}
          {user?.role === 'admin' && renderSection(adminSection)}
        </nav>

        {/* User Info with Logout Menu */}
        {(isOpen || isMobile) && user && (
          <div className="p-3 border-t border-border relative">
            {/* User info button */}
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-background-tertiary transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium">
                {user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.profile?.display_name || user.email}
                </p>
                <p className="text-xs text-foreground-tertiary truncate">{user.email}</p>
              </div>
              <ChevronDown className={cn(
                'h-4 w-4 text-foreground-tertiary transition-transform',
                showUserMenu && 'rotate-180'
              )} />
            </button>

            {/* Dropdown menu */}
            {showUserMenu && (
              <>
                {/* Backdrop to close menu */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowUserMenu(false)}
                />
                {/* Menu */}
                <div className="absolute bottom-full left-3 right-3 mb-2 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  )
}
