import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import {
  ChevronDown,
  LayoutDashboard,
  Building2,
  ShieldAlert,
  Users,
  FileText,
  Shield,
  Settings,
  LogOut,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/utils/cn'

/**
 * Bottom block of the slim Sidebar — avatar + dropdown.
 *
 * On `>= md` this is the SINGLE source of admin entry points (Holding admin /
 * Companies / DLP / etc.) for `user.role === 'admin'`. The standalone
 * `holdingAdmin` nav section now only renders on `< md` mobile drawers
 * (kept inside Sidebar.jsx).
 */
export default function UserMenu({ showContent }) {
  const { t } = useTranslation('layout')
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const isAdmin = user.role === 'admin'
  const isManager = user.role === 'manager'

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login')
  }
  const go = (path) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <div className="p-3 border-t border-border relative">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'w-full flex items-center gap-3 p-2 rounded-xl transition-colors',
          'hover:bg-background-tertiary',
          open && 'bg-background-tertiary',
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
            <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4 text-foreground-tertiary" />
            </motion.div>
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full start-3 end-3 mb-2 bg-background-elevated border border-border rounded-xl shadow-dropdown py-1 z-50 overflow-hidden"
            >
              <Button
                variant="ghost"
                onClick={() => go('/settings')}
                className="w-full justify-start gap-3 h-11 rounded-none"
              >
                <Settings className="h-4 w-4" />
                {t('sidebar.userSettings')}
              </Button>

              {(isAdmin || isManager) && (
                <>
                  <Separator className="my-1" />
                  <Button
                    variant="ghost"
                    onClick={() => go('/admin')}
                    className="w-full justify-start gap-3 h-11 rounded-none"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    {t('sidebar.adminDashboard')}
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => go('/admin/companies')}
                        className="w-full justify-start gap-3 h-11 rounded-none"
                      >
                        <Building2 className="h-4 w-4" />
                        {t('sidebar.companies')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => go('/admin/users')}
                        className="w-full justify-start gap-3 h-11 rounded-none"
                      >
                        <Users className="h-4 w-4" />
                        {t('sidebar.allUsers')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => go('/admin')}
                        className="w-full justify-start gap-3 h-11 rounded-none"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        {t('sidebar.systemAnalytics')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => go('/admin/dlp')}
                        className="w-full justify-start gap-3 h-11 rounded-none"
                      >
                        <ShieldAlert className="h-4 w-4" />
                        {t('userMenu.contentSafety')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => go('/admin/audit')}
                        className="w-full justify-start gap-3 h-11 rounded-none"
                      >
                        <Shield className="h-4 w-4" />
                        {t('sidebar.adminAuditLog')}
                      </Button>
                    </>
                  )}
                  {!isAdmin && (
                    <Button
                      variant="ghost"
                      onClick={() => go('/admin/users')}
                      className="w-full justify-start gap-3 h-11 rounded-none"
                    >
                      <Users className="h-4 w-4" />
                      {t('sidebar.adminUsers')}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => go('/admin/templates')}
                    className="w-full justify-start gap-3 h-11 rounded-none"
                  >
                    <FileText className="h-4 w-4" />
                    {t('sidebar.adminTemplates')}
                  </Button>
                </>
              )}

              <Separator className="my-1" />
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
  )
}
