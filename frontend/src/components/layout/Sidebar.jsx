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
  Plus,
  Users,
  FileText,
  Shield,
  X,
  LayoutGrid,
  Image
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../utils/cn'

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const sidebarRef = useRef(null)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)

  const navItems = [
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/arena', icon: LayoutGrid, label: 'Arena' },
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/history', icon: History, label: 'History' },
    { to: '/configs', icon: Sliders, label: 'Assistants' },
    { to: '/gallery', icon: Sparkles, label: 'Gallery' },
    { to: '/image-studio', icon: Image, label: 'Image Studio' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ]

  const adminItems = [
    { to: '/admin', icon: LayoutDashboard, label: 'Admin' },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/templates', icon: FileText, label: 'Templates' },
    { to: '/admin/audit', icon: Shield, label: 'Audit Log' },
  ]

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

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={handleNavClick}
                  className={({ isActive }) => cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    'min-h-[44px]', // Touch-friendly tap target
                    isActive
                      ? 'bg-accent/10 text-accent'
                      : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                    !isOpen && !isMobile && 'justify-center'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {(isOpen || isMobile) && <span>{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>

          {/* Admin Section */}
          {user?.role === 'admin' && (
            <>
              {(isOpen || isMobile) && (
                <div className="px-3 py-2 mt-4">
                  <span className="text-xs font-semibold text-foreground-tertiary uppercase tracking-wider">
                    Admin
                  </span>
                </div>
              )}
              <ul className="space-y-1 mt-1">
                {adminItems.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={handleNavClick}
                      className={({ isActive }) => cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                        'min-h-[44px]',
                        isActive
                          ? 'bg-accent/10 text-accent'
                          : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                        !isOpen && !isMobile && 'justify-center'
                      )}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {(isOpen || isMobile) && <span>{item.label}</span>}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* User Info */}
        {(isOpen || isMobile) && user && (
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium">
                {user.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.profile?.display_name || user.email}
                </p>
                <p className="text-xs text-foreground-tertiary truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
