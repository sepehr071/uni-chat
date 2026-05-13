import { useState, useEffect, useRef } from 'react'
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  MessageSquare,
  History,
  Settings,
  Sliders,
  LayoutDashboard,
  ChevronDown,
  Plus,
  Users,
  FileText,
  Shield,
  ShieldAlert,
  X,
  LayoutGrid,
  Image,
  GitBranch,
  LogOut,
  BookMarked,
  Scale,
  Bot,
  CalendarClock,
  Folder,
  Building2,
  CreditCard,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { hasFeature } from '../../utils/featureFlags'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '../../utils/cn'
import { Button } from '../ui/button'
import { Avatar, AvatarFallback } from '../ui/avatar'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../ui/tooltip'
import { Separator } from '../ui/separator'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import ProjectSwitcher from './ProjectSwitcher'
import { canCreateCompany } from '@/utils/auth'

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const { t } = useTranslation('layout')
  const { isRTL } = useLanguage()
  const { user, logout } = useAuth()
  const { currentWorkspace } = useWorkspace()
  const { currentProject, projects, setActiveProject } = useProject()
  const navigate = useNavigate()
  const location = useLocation()

  // Navigation sections defined inside component to use t().
  // `feature` field gates the item against platform_settings.features; items
  // without it are always visible.
  const rawNavSections = [
    {
      id: 'pinned',
      label: t('sidebar.quickLinks'),
      items: [
        { to: '/chat', icon: MessageSquare, label: t('sidebar.chat') },
        { to: '/workflow', icon: GitBranch, label: t('sidebar.workflow'), feature: 'workflow' },
        { to: '/arena', icon: LayoutGrid, label: t('sidebar.arena'), feature: 'arena' },
      ]
    },
    {
      id: 'create',
      label: t('sidebar.create'),
      items: [
        { to: '/image-studio',   icon: Image,         label: t('sidebar.imageStudio'),   feature: 'image_studio' },
        { to: '/debate',         icon: Scale,         label: t('sidebar.debate'),        feature: 'debate' },
        { to: '/automate-agent', icon: Bot,           label: t('sidebar.automateAgent'), feature: 'automate_agent' },
        { to: '/routines',       icon: CalendarClock, label: t('sidebar.routines'),      feature: 'routines' },
      ]
    },
    {
      id: 'library',
      label: t('sidebar.library'),
      items: [
        { to: '/configs', icon: Sliders, label: t('sidebar.assistants') },
        { to: '/chat-history', icon: History, label: t('sidebar.chatHistory') },
        { to: '/image-history', icon: Image, label: t('sidebar.imageHistory') },
        { to: '/knowledge', icon: BookMarked, label: t('sidebar.knowledgeVault'), feature: 'knowledge' },
        { to: '/projects', icon: Folder, label: t('sidebar.projects') },
      ]
    },
  ]
  const navSections = rawNavSections
    .map((s) => ({ ...s, items: s.items.filter((i) => !i.feature || hasFeature(user, i.feature)) }))
    .filter((s) => s.items.length > 0)

  // Active-match helper — compares pathname AND ?tab= query
  const isLinkActive = (to) => {
    const [path, qs] = to.split('?')
    if (location.pathname !== path) return false
    const wantTab = qs ? new URLSearchParams(qs).get('tab') : null
    const haveTab = location.search
      ? new URLSearchParams(location.search).get('tab')
      : null
    if (wantTab) return wantTab === haveTab
    return !haveTab
  }
  const sidebarRef = useRef(null)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const [expandedSections, setExpandedSections] = useState(() => {
    const defaults = { pinned: true, create: true, library: false, dashboard: true, settings: true, admin: true, holdingAdmin: true }
    const saved = localStorage.getItem('sidebar-sections')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return { ...defaults, ...parsed }
      } catch {
        return defaults
      }
    }
    return defaults
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

  // Swipe to close — direction-aware for RTL
  const minSwipeDistance = 50
  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX)
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = isRTL
      ? touchEnd - touchStart  // RTL: swipe right to close
      : touchStart - touchEnd  // LTR: swipe left to close
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
    const active = isLinkActive(item.to)
    const content = (
      <Link
        to={item.to}
        onClick={handleNavClick}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
          'min-h-[44px] group',
          active
            ? 'bg-accent-muted text-accent font-semibold'
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

  const renderRestrictedNavItem = ({ to, icon: Icon, label, enabled, tooltip }) => {
    if (enabled) {
      return renderNavItem({ to, icon: Icon, label })
    }

    const disabledRow = (
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg min-h-[44px] group',
          'text-foreground-secondary',
          'opacity-40 cursor-not-allowed pointer-events-none',
          !showContent && 'justify-center px-2',
        )}
        aria-disabled="true"
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        {showContent && (
          <span className="text-sm font-medium">{label}</span>
        )}
      </div>
    )

    return (
      <Tooltip delayDuration={150}>
        <TooltipTrigger asChild>
          <span className="block cursor-not-allowed">{disabledRow}</span>
        </TooltipTrigger>
        <TooltipContent side={showContent ? 'top' : 'right'} className="font-medium">
          {tooltip || t('common:actions.disabled')}
        </TooltipContent>
      </Tooltip>
    )
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
          'flex flex-col bg-background-secondary border-e border-border transition-all duration-300 z-50',
          isMobile ? 'fixed inset-y-0 start-0 w-60' : 'relative',
          isMobile && !isOpen && '-translate-x-full rtl:translate-x-full',
          !isMobile && !isOpen && 'w-[68px]',
          !isMobile && isOpen && 'w-60'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
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
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('sidebar.closeMenu')}>
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
              {t('sidebar.newChat')}
            </Button>
          ) : (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button onClick={handleNewChat} size="icon" className="w-full h-11" aria-label={t('sidebar.newChat')}>
                  <Plus className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t('sidebar.newChat')}</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="px-3"><Separator /></div>

        {/* Company pill + project picker */}
        {showContent ? (
          <div className="px-2 pb-2 border-b border-border space-y-2">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-2 pb-1">
                {t('companies:label', 'Company')}
              </div>
              <WorkspaceSwitcher />
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-2 pb-1">
                {t('companies:projectLabel', 'Project')}
              </div>
              <ProjectSwitcher onClose={handleNavClick} />
            </div>
          </div>
        ) : (
          <div className="px-2 pb-2 border-b border-border flex justify-center">
            <WorkspaceSwitcher collapsed />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navSections.map(renderSection)}

          {/* Pinned projects */}
          {showContent && (() => {
            const pinnedProjects = (projects || []).filter(p => p.pinned && !p.archived)
            if (pinnedProjects.length === 0) return null
            return (
              <div className="mb-2">
                <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-3 pt-3.5 pb-1.5">
                  {t('sidebar.pinnedProjects')}
                </div>
                <ul className="space-y-1">
                  {pinnedProjects.map(p => (
                    <li key={p._id}>
                      <button
                        onClick={() => {
                          setActiveProject(p)
                          navigate('/chat')
                          if (isMobile) onClose()
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 cursor-pointer truncate transition-colors"
                      >
                        <span
                          style={{ background: p.color || '#5c9aed' }}
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                        />
                        <span className="truncate text-start">{p.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })()}

          {/* Dashboard group */}
          <div className="my-3 border-t border-border" />
          <div className="mb-2">
            {showContent && (
              <button
                onClick={() => toggleSection('dashboard')}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-tertiary uppercase tracking-wider hover:text-foreground-secondary transition-colors rounded-lg"
              >
                <span className="flex items-center gap-1.5">
                  <LayoutDashboard className="h-3 w-3 inline-block text-fg-4" />
                  {t('sidebar.dashboard')}
                </span>
                <motion.div
                  animate={{ rotate: expandedSections.dashboard ? 0 : -90 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.div>
              </button>
            )}
            <AnimatePresence initial={false}>
              {(expandedSections.dashboard || !showContent) && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1 overflow-hidden"
                >
                  <li>{renderNavItem({ to: '/dashboard', icon: LayoutDashboard, label: t('sidebar.dashboard') })}</li>
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {/* Settings group */}
          <div className="my-3 border-t border-border" />
          <div className="mb-2">
            {showContent && (
              <button
                onClick={() => toggleSection('settings')}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-tertiary uppercase tracking-wider hover:text-foreground-secondary transition-colors rounded-lg"
              >
                <span className="flex items-center gap-1.5">
                  <Settings className="h-3 w-3 inline-block text-fg-4" />
                  {t('sidebar.settings')}
                </span>
                <motion.div
                  animate={{ rotate: expandedSections.settings ? 0 : -90 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.div>
              </button>
            )}
            <AnimatePresence initial={false}>
              {(expandedSections.settings || !showContent) && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-1 overflow-hidden"
                >
                  <li>{renderNavItem({ to: '/settings', icon: Settings, label: t('sidebar.userSettings') })}</li>

                  {currentWorkspace && (() => {
                    const wsOwner = ['owner', 'admin'].includes(currentWorkspace.member_role)
                    const to = `/workspaces/${currentWorkspace._id}/settings`
                    return (
                      <li>{renderRestrictedNavItem({
                        to,
                        icon: Building2,
                        label: t('sidebar.workspaceSettings'),
                        enabled: wsOwner,
                        tooltip: t('sidebar.ownerOnly'),
                      })}</li>
                    )
                  })()}

                  {(() => {
                    const projOwner = currentProject?.member_role === 'owner'
                    const enabled = !!currentProject && projOwner
                    const to = currentProject ? `/projects/${currentProject._id}/settings` : '#'
                    return (
                      <li>{renderRestrictedNavItem({
                        to,
                        icon: Folder,
                        label: t('sidebar.projectSettings'),
                        enabled,
                        tooltip: !currentProject ? t('sidebar.noProjectSelected') : t('sidebar.ownerOnly'),
                      })}</li>
                    )
                  })()}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {/* Holding admin — super-admin only */}
          {user?.role === 'admin' && (() => {
            const holdingItems = [
              { to: '/admin/companies', icon: Building2, label: t('sidebar.companies') },
              { to: '/admin/users',     icon: Users,     label: t('sidebar.allUsers') },
              { to: '/admin',           icon: LayoutDashboard, label: t('sidebar.systemAnalytics') },
              { to: '/admin/audit',     icon: Shield,    label: t('sidebar.auditLog') },
            ]
            return (
              <>
                <div className="my-3 border-t border-border" />
                <div className="mb-2">
                  {showContent ? (
                    <button
                      onClick={() => toggleSection('holdingAdmin')}
                      className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-foreground-tertiary uppercase tracking-wider hover:text-foreground-secondary transition-colors rounded-lg"
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3 w-3 inline-block text-accent" />
                        {t('sidebar.holdingAdmin')}
                      </span>
                      <motion.div
                        animate={{ rotate: expandedSections.holdingAdmin ? 0 : -90 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </motion.div>
                    </button>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {(expandedSections.holdingAdmin || !showContent) && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-1 overflow-hidden"
                      >
                        {holdingItems.map(item => {
                          const active = isLinkActive(item.to)
                          return (
                            <li key={item.to}>
                              <Link
                                to={item.to}
                                onClick={handleNavClick}
                                className={cn(
                                  'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                                  active
                                    ? 'bg-accent-muted text-accent font-semibold'
                                    : 'text-fg-2 hover:bg-bg-2 hover:text-fg-0'
                                )}
                              >
                                <item.icon className="h-4 w-4 flex-shrink-0" />
                                {showContent && <span className="truncate">{item.label}</span>}
                              </Link>
                            </li>
                          )
                        })}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )
          })()}

          {/* Admin */}
          {showContent && currentWorkspace &&
            ['owner', 'admin'].includes(currentWorkspace.member_role) && (() => {
              const wid = currentWorkspace._id
              const role = currentWorkspace.member_role
              const adminItems = [
                { to: `/workspaces/${wid}`, icon: Building2, label: t('sidebar.workspaceOverview') },
                { to: `/workspaces/${wid}/settings?tab=members`, icon: Users, label: t('sidebar.members') },
                ...(['owner', 'admin'].includes(role)
                  ? [{ to: `/workspaces/${wid}/settings?tab=billing`, icon: CreditCard, label: t('sidebar.usageBilling') }]
                  : []),
                { to: `/workspaces/${wid}/settings?tab=audit`, icon: Shield, label: t('sidebar.auditLog') },
              ]
              return (
                <>
                  <div className="my-3 border-t border-border" />
                  <div className="mb-2">
                    <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-3 pt-3.5 pb-1.5">
                      <Shield className="h-3 w-3 inline-block me-1 text-fg-4" />
                      {t('sidebar.admin')}
                    </div>
                  <ul className="space-y-1">
                    {adminItems.map(item => {
                      const active = isLinkActive(item.to)
                      return (
                        <li key={item.to}>
                          <Link
                            to={item.to}
                            onClick={handleNavClick}
                            className={cn(
                              'flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                              active
                                ? 'bg-accent-muted text-accent font-semibold'
                                : 'text-fg-2 hover:bg-bg-2 hover:text-fg-0'
                            )}
                          >
                            <item.icon className="h-4 w-4 flex-shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                  </div>
                </>
              )
            })()}
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
                  <div className="flex-1 min-w-0 text-start">
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
                    className="absolute bottom-full start-3 end-3 mb-2 bg-background-elevated border border-border rounded-xl shadow-dropdown py-1 z-50 overflow-hidden"
                  >
                    {(user?.role === 'admin' || user?.role === 'manager') && (
                      <>
                        <Button variant="ghost" onClick={() => { setShowUserMenu(false); navigate('/admin') }} className="w-full justify-start gap-3 h-11 rounded-none">
                          <LayoutDashboard className="h-4 w-4" /> {t('sidebar.adminDashboard')}
                        </Button>
                        {user?.role === 'admin' && (
                          <Button variant="ghost" onClick={() => { setShowUserMenu(false); navigate('/admin/companies') }} className="w-full justify-start gap-3 h-11 rounded-none">
                            <Building2 className="h-4 w-4" /> {t('sidebar.companies')}
                          </Button>
                        )}
                        {user?.role === 'admin' && (
                          <Button variant="ghost" onClick={() => { setShowUserMenu(false); navigate('/admin/dlp') }} className="w-full justify-start gap-3 h-11 rounded-none">
                            <ShieldAlert className="h-4 w-4" /> {t('admin:dashboard.contentSafety', 'Content Safety')}
                          </Button>
                        )}
                        <Button variant="ghost" onClick={() => { setShowUserMenu(false); navigate('/admin/users') }} className="w-full justify-start gap-3 h-11 rounded-none">
                          <Users className="h-4 w-4" /> {t('sidebar.adminUsers')}
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowUserMenu(false); navigate('/admin/templates') }} className="w-full justify-start gap-3 h-11 rounded-none">
                          <FileText className="h-4 w-4" /> {t('sidebar.adminTemplates')}
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowUserMenu(false); navigate('/admin/audit') }} className="w-full justify-start gap-3 h-11 rounded-none">
                          <Shield className="h-4 w-4" /> {t('sidebar.adminAuditLog')}
                        </Button>
                        <Separator className="my-1" />
                      </>
                    )}
                    <Button
                      variant="ghost"
                      onClick={handleLogout}
                      className="w-full justify-start gap-3 h-11 rounded-none hover:bg-error/10 hover:text-error"
                    >
                      <LogOut className="h-4 w-4" />
                      {t('sidebar.signOut')}
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
