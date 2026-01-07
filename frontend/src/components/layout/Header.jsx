import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Menu, Bell, User, Settings, LogOut, Shield, Search, Command } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

export default function Header({ onMenuClick, onSearchClick, sidebarOpen }) {
  const { user, logout } = useAuth()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="h-14 border-b border-border bg-background-secondary flex items-center justify-between px-4">
      {/* Left side */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search button */}
        <button
          onClick={onSearchClick}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background-tertiary text-foreground-secondary hover:text-foreground border border-border hover:border-border-light transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="text-sm">Search</span>
          <div className="flex items-center gap-0.5 ml-2">
            <kbd className="px-1.5 py-0.5 text-xs bg-background border border-border rounded font-mono">
              <Command className="h-3 w-3 inline" />
            </kbd>
            <kbd className="px-1.5 py-0.5 text-xs bg-background border border-border rounded font-mono">K</kbd>
          </div>
        </button>

        {/* Mobile search button */}
        <button
          onClick={onSearchClick}
          className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground sm:hidden"
        >
          <Search className="h-5 w-5" />
        </button>

        {/* Notifications */}
        <button className="p-2 rounded-lg text-foreground-secondary hover:bg-background-tertiary hover:text-foreground relative">
          <Bell className="h-5 w-5" />
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-background-tertiary"
          >
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-medium">
              {user?.profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <span className="text-sm text-foreground hidden sm:inline max-w-[120px] truncate">
              {user?.profile?.display_name || user?.email}
            </span>
          </button>

          {/* Dropdown menu */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-background-elevated border border-border shadow-dropdown py-1 z-50 animate-fade-in">
              <div className="px-4 py-2 border-b border-border">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.profile?.display_name || 'User'}
                </p>
                <p className="text-xs text-foreground-secondary truncate">
                  {user?.email}
                </p>
                {user?.role === 'admin' && (
                  <span className="badge badge-primary mt-1">Admin</span>
                )}
              </div>

              <div className="py-1">
                <MenuLink to="/settings" icon={User} label="Profile" onClick={() => setUserMenuOpen(false)} />
                <MenuLink to="/settings" icon={Settings} label="Settings" onClick={() => setUserMenuOpen(false)} />
                {user?.role === 'admin' && (
                  <MenuLink to="/admin" icon={Shield} label="Admin Panel" onClick={() => setUserMenuOpen(false)} />
                )}
              </div>

              <div className="border-t border-border pt-1">
                <button
                  onClick={() => {
                    setUserMenuOpen(false)
                    logout()
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-error hover:bg-error/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

function MenuLink({ to, icon: Icon, label, onClick }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2 text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
