import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ToggleLeft, ScrollText, Building2, UserCircle, LogOut, ShieldCheck, Menu, X, BarChart3, Users as UsersIcon } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * Platform super-admin layout — visually distinct from MainLayout so the
 * role boundary is obvious. Accent strip across the top + dedicated nav.
 */
export default function PlatformLayout() {
  const { t } = useTranslation('platform')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const navItems = [
    { to: '/platform/holding', icon: Building2, label: t('nav.holding') },
    { to: '/platform/companies', icon: BarChart3, label: t('nav.companies', 'Companies') },
    { to: '/platform/users-overview', icon: UsersIcon, label: t('nav.usersAnalytics', 'Users analytics') },
    { to: '/platform/features', icon: ToggleLeft, label: t('nav.features') },
    { to: '/platform/audit', icon: ScrollText, label: t('nav.audit') },
  ]

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Accent strip — makes the role obvious at a glance */}
      <div className="h-1 w-full bg-gradient-to-r from-accent via-accent/80 to-accent" />

      {/* Top bar */}
      <header className="flex items-center justify-between h-16 px-4 md:px-6 border-b border-border bg-background-secondary">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileNavOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <span className="text-xl font-bold bg-gradient-to-r from-accent to-accent/70 bg-clip-text text-transparent">
              Novis Ai
            </span>
          </div>
          <Badge variant="default" className="bg-accent/15 text-accent border-accent/30 hover:bg-accent/20">
            {t('header.badge')}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="hidden sm:inline text-sm text-foreground-secondary" dir="ltr">
              {user.email}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{t('header.logout')}</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            'w-60 border-e border-border bg-background-secondary flex-col',
            mobileNavOpen
              ? 'fixed inset-y-0 top-16 start-0 z-40 flex'
              : 'hidden md:flex',
          )}
        >
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                    isActive
                      ? 'bg-accent-muted text-accent'
                      : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                  )
                }
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-border">
            <NavLink
              to="/platform/account"
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[44px]',
                  isActive
                    ? 'bg-accent-muted text-accent font-medium'
                    : 'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                )
              }
            >
              <UserCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{t('nav.account')}</span>
            </NavLink>
          </div>
        </aside>

        {/* Mobile backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 top-16 bg-black/40 z-30 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
