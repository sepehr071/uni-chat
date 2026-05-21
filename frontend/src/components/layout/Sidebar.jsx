import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  MessageSquare, History, Settings, Sliders, LayoutDashboard,
  Users, Shield, ShieldAlert, X, LayoutGrid, Image, GitBranch,
  BookMarked, Scale, Bot, CalendarClock, AudioWaveform, Folder,
  Building2, CreditCard, LifeBuoy,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { hasFeature } from '../../utils/featureFlags'
import { useWorkspace } from '@/context/WorkspaceContext'
import { useProject } from '@/context/ProjectContext'
import { useLanguage } from '@/context/LanguageContext'
import { cn } from '../../utils/cn'
import { Button } from '../ui/button'
import WorkspaceHeader from './sidebar/WorkspaceHeader'
import NavSection from './sidebar/NavSection'
import UserMenu from './sidebar/UserMenu'

export default function Sidebar({ isOpen, onClose, isMobile }) {
  const { t } = useTranslation('layout')
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const { currentWorkspace } = useWorkspace()
  const { currentProject, projects, setActiveProject } = useProject()
  const navigate = useNavigate()
  const location = useLocation()

  // Navigation sections. `feature` gates against platform_settings.features.
  const navSections = [
    { id: 'pinned', label: t('sidebar.quickLinks'), items: [
      { to: '/chat', icon: MessageSquare, label: t('sidebar.chat') },
      { to: '/helper', icon: LifeBuoy, label: t('sidebar.supportAssistant') },
      { to: '/workflow', icon: GitBranch, label: t('sidebar.workflow'), feature: 'workflow' },
      { to: '/arena', icon: LayoutGrid, label: t('sidebar.arena'), feature: 'arena' },
    ]},
    { id: 'create', label: t('sidebar.create'), items: [
      { to: '/image-studio', icon: Image, label: t('sidebar.imageStudio'), feature: 'image_studio' },
      { to: '/debate', icon: Scale, label: t('sidebar.debate'), feature: 'debate' },
      { to: '/automate-agent', icon: Bot, label: t('sidebar.automateAgent'), feature: 'automate_agent' },
      { to: '/routines', icon: CalendarClock, label: t('sidebar.routines'), feature: 'routines' },
      { to: '/assistants', icon: AudioWaveform, label: t('sidebar.assistantsHub'), feature: 'meetings' },
    ]},
    { id: 'library', label: t('sidebar.library'), items: [
      { to: '/configs', icon: Sliders, label: t('sidebar.assistants') },
      { to: '/chat-history', icon: History, label: t('sidebar.chatHistory') },
      { to: '/image-history', icon: Image, label: t('sidebar.imageHistory') },
      { to: '/knowledge', icon: BookMarked, label: t('sidebar.knowledgeVault'), feature: 'knowledge' },
      { to: '/projects', icon: Folder, label: t('sidebar.projects') },
    ]},
  ].map((s) => ({ ...s, items: s.items.filter((i) => !i.feature || hasFeature(user, i.feature)) }))
   .filter((s) => s.items.length > 0)

  const isLinkActive = (to) => {
    const [path, qs] = to.split('?')
    if (location.pathname !== path) return false
    const wantTab = qs ? new URLSearchParams(qs).get('tab') : null
    const haveTab = location.search ? new URLSearchParams(location.search).get('tab') : null
    if (wantTab) return wantTab === haveTab
    return !haveTab
  }

  const sidebarRef = useRef(null)
  const [touchStart, setTouchStart] = useState(null)
  const [touchEnd, setTouchEnd] = useState(null)

  const [expandedSections, setExpandedSections] = useState(() => {
    const defaults = { pinned: true, create: true, library: false, dashboard: true, settings: true, admin: true, holdingAdmin: true }
    const saved = localStorage.getItem('sidebar-sections')
    if (saved) {
      try {
        return { ...defaults, ...JSON.parse(saved) }
      } catch {
        return defaults
      }
    }
    return defaults
  })
  useEffect(() => {
    localStorage.setItem('sidebar-sections', JSON.stringify(expandedSections))
  }, [expandedSections])
  const toggleSection = (id) => setExpandedSections((p) => ({ ...p, [id]: !p[id] }))

  // Swipe to close — direction-aware for RTL (Sidebar owns this; MainLayout
  // no longer registers a competing edge-swipe handler).
  const minSwipeDistance = 50
  const onTouchStart = (e) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX)
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    const distance = isRTL ? touchEnd - touchStart : touchStart - touchEnd
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

  const showContent = isOpen || isMobile
  const handleNavClick = () => isMobile && onClose()
  const handleNewChat = () => {
    navigate('/chat')
    if (isMobile) onClose()
  }

  const wsId = currentWorkspace?._id
  const isWsOwnerAdmin = currentWorkspace && ['owner', 'admin'].includes(currentWorkspace.member_role)

  const settingsItems = [
    { to: '/settings', icon: Settings, label: t('sidebar.userSettings') },
    ...(isWsOwnerAdmin
      ? [{ to: `/workspaces/${wsId}/settings`, icon: Building2, label: t('sidebar.workspaceSettings') }]
      : []),
    ...(currentProject?.member_role === 'owner'
      ? [{ to: `/projects/${currentProject._id}/settings`, icon: Folder, label: t('sidebar.projectSettings') }]
      : []),
  ]

  const wsAdminItems = isWsOwnerAdmin
    ? [
        { to: `/workspaces/${wsId}`, icon: Building2, label: t('sidebar.workspaceOverview') },
        { to: `/workspaces/${wsId}/settings?tab=members`, icon: Users, label: t('sidebar.members') },
        { to: `/workspaces/${wsId}/settings?tab=billing`, icon: CreditCard, label: t('sidebar.usageBilling') },
        { to: `/workspaces/${wsId}/settings?tab=audit`, icon: Shield, label: t('sidebar.auditLog') },
      ]
    : []

  // Holding admin only on `< md` drawer; `>= md` lives in UserMenu.
  const holdingItems = user?.role === 'admin' && isMobile
    ? [
        { to: '/admin/companies', icon: Building2, label: t('sidebar.companies') },
        { to: '/admin/users', icon: Users, label: t('sidebar.allUsers') },
        { to: '/admin', icon: LayoutDashboard, label: t('sidebar.systemAnalytics') },
        { to: '/admin/audit', icon: Shield, label: t('sidebar.auditLog') },
      ]
    : []

  const pinnedProjects = (projects || []).filter((p) => p.pinned && !p.archived)

  // Build the section render list — divider before each except the first.
  const sectionGroups = [
    ...navSections.map((s) => ({ key: s.id, divider: false, props: { id: s.id, label: s.label, items: s.items } })),
    { key: 'dashboard', divider: true, props: { id: 'dashboard', label: t('sidebar.dashboard'), icon: LayoutDashboard, items: [{ to: '/dashboard', icon: LayoutDashboard, label: t('sidebar.dashboard') }] } },
    { key: 'settings', divider: true, props: { id: 'settings', label: t('sidebar.settings'), icon: Settings, items: settingsItems } },
    ...(holdingItems.length ? [{ key: 'holdingAdmin', divider: true, props: { id: 'holdingAdmin', label: t('sidebar.holdingAdmin'), icon: ShieldAlert, items: holdingItems } }] : []),
    ...(wsAdminItems.length && showContent ? [{ key: 'admin', divider: true, props: { id: 'admin', label: t('sidebar.admin'), icon: Shield, items: wsAdminItems } }] : []),
  ]
  const navCommon = { showContent, isLinkActive, onNavClick: handleNavClick }

  return (
    <>
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
          !isMobile && isOpen && 'w-60',
        )}
      >
        <WorkspaceHeader
          showContent={showContent}
          onNewChat={handleNewChat}
          isMobile={isMobile}
        />

        {isMobile && (
          <div className="absolute top-3 end-3">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('sidebar.closeMenu')}>
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {sectionGroups.map((g, idx) => (
            <div key={g.key}>
              {g.divider && <div className="my-3 border-t border-border" />}
              <NavSection
                {...g.props}
                expanded={expandedSections[g.props.id]}
                onToggle={() => toggleSection(g.props.id)}
                {...navCommon}
              />
              {/* Pinned projects render right after the first navSections block */}
              {idx === navSections.length - 1 && showContent && pinnedProjects.length > 0 && (
                <div className="mb-2">
                  <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-fg-4 px-3 pt-3.5 pb-1.5">
                    {t('sidebar.pinnedProjects')}
                  </div>
                  <ul className="space-y-1">
                    {pinnedProjects.map((p) => (
                      <li key={p._id}>
                        <button
                          type="button"
                          onClick={() => { setActiveProject(p); navigate('/chat'); if (isMobile) onClose() }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] text-fg-2 hover:bg-bg-2 hover:text-fg-0 truncate transition-colors"
                        >
                          <span style={{ background: p.color || '#5c9aed' }} className="w-2.5 h-2.5 rounded-sm flex-shrink-0" />
                          <span className="truncate text-start">{p.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </nav>

        <UserMenu showContent={showContent} />
      </aside>
    </>
  )
}
