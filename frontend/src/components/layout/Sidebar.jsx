import { useState, useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  MessageSquare,
  History,
  Settings,
  Sliders,
  LayoutDashboard,
  Sparkles,
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
import { Button } from '../ui/button'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/tooltip'
import { Separator } from '../ui/separator'

// Navigation sections
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
      { to: '/chat-history', icon: History, label: 'Chat History' },
      { to: '/image-history', icon: Image, label: 'Image History' },
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

  useEffect(() => {
    localStorage.setItem('sidebar-sections', JSON.stringify(expandedSections))
  }, [expandedSections])

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }))
  }

  // Swipe to close
  const minSwipeDistance = 50
  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX)
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = touchStart - touchEnd
    if (distance > minSwipeDistance && isMobile) onClose()
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (isMobile && isOpen && sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMobile, isOpen, onClose])

  const handleNavClick = () => isMobile && onClose()
  const handleNewChat = () => {
    navigate('/chat')
    if (isMobile) onClose()
  }
  const handleLogout = async () => {
    setShowUserMenu(false)
    await logout()
    navigate('/login')
  }

  const showContent = isOpen || isMobile

  const renderNavItem = (item, isExpanded) => {
    const content = (
      <NavLink
        to={item.to}
        onClick={handleNavClick}
        className={({ isActive }) => cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
          'min-h-[44px] group',
          isActive
            ? 'bg-accent text-white shadow-sm'
            : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
          !showContent && 'justify-center px-2'
        )}
      >
        <item.icon className={cn(
          "h-5 w-5 flex-shrink-0 transition-transform duration-200",
          "group-hover:scale-110"
        )} />
        {showContent && (
          <motion.span
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm font-medium"
          >
            {item.label}
          </motion.span>
        )}
      </NavLink>
    )

    if (!showContent) {
      return (
        <Tooltip key={item.to} delayDuration={0}>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="font-medium">
            {item.label}
          </TooltipContent>
        </Tooltip>
      )
    }

    return <div key={item.to}>{content}</div>
  }

  const renderSection = (section) => {
    const isExpanded = expandedSections[section.id]

    return (
      <div key={section.id} className="mb-2">
        {showContent && (
          <button
            onClick={() => toggleSection(section.id)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-tertiary uppercase tracking-wider hover:text-foreground-secondary transition-colors rounded-lg"
          >
            <span>{section.label}</span>
            <motion.div
              animate={{ rotate: isExpanded ? 0 : -90 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.div>
          </button>
        )}

        <AnimatePresence initial={false}>
          {(isExpanded || !showContent) && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="space-y-1 overflow-hidden"
            >
              {section.items.map((item) => (
                <li key={item.to}>{renderNavItem(item, isExpanded)}</li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className={cn(
          'flex flex-col bg-background-secondary border-r border-border transition-all duration-300 z-50',
          isMobile ? 'fixed inset-y-0 left-0 w-72' : 'relative',
          isMobile && !isOpen && '-translate-x-full',
          !isMobile && !isOpen && 'w-[68px]',
          !isMobile && isOpen && 'w-72'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <AnimatePresence mode="wait">
            {showContent && (
              <motion.h1
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="text-xl font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent"
              >
                Uni-Chat
              </motion.h1>
            )}
          </AnimatePresence>
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          {showContent ? (
            <Button
              onClick={handleNewChat}
              className="w-full gap-2 h-11 text-base font-semibold shadow-lg shadow-accent/25"
            >
              <Plus className="h-5 w-5" />
              New Chat
            </Button>
          ) : (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button onClick={handleNewChat} size="icon" className="w-full h-11">
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">New Chat</TooltipContent>
            </Tooltip>
          )}
        </div>

        <Separator className="mx-3" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navSections.map(renderSection)}
          {user?.role === 'admin' && (
            <>
              <Separator className="my-2 mx-1" />
              {renderSection(adminSection)}
            </>
          )}
        </nav>

        {/* User Info */}
        {user && (
          <div className="p-3 border-t border-border relative">
            <motion.button
              onClick={() => setShowUserMenu(!showUserMenu)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                "w-full flex items-center gap-3 p-2 rounded-xl transition-colors",
                "hover:bg-background-tertiary",
                showUserMenu && "bg-background-tertiary"
              )}
            >
              <Avatar size="default">
                <AvatarFallback className="text-sm">
                  {user.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              {showContent && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.profile?.display_name || user.email?.split('@')[0]}
                    </p>
                    <p className="text-xs text-foreground-tertiary truncate">{user.email}</p>
                  </div>
                  <motion.div
                    animate={{ rotate: showUserMenu ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-4 w-4 text-foreground-tertiary" />
                  </motion.div>
                </>
              )}
            </motion.button>

            {/* User menu dropdown */}
            <AnimatePresence>
              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-3 right-3 mb-2 bg-background-elevated border border-border rounded-xl shadow-dropdown py-1 z-50 overflow-hidden"
                  >
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="w-full justify-start gap-3 h-11 rounded-none hover:bg-error/10 hover:text-error"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </aside>
    </>
  )
}
