import { useState, useEffect, lazy, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

// Lazy-loaded so guest paths (login/register/landing) never pay for it and so
// the rail's react-markdown bundle is split out of the critical path.
const RightRail = lazy(() => import('../rail/RightRail'))

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile) {
        setSidebarOpen(false)
      }
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Edge-swipe to open is handled inside Sidebar.jsx (its onTouchStart/Move/End
  // handlers cover both open-while-edge and close-from-drawer). Mounting a
  // second document-level listener here caused duplicate firing on each swipe.

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
      />

      {/* Content column — flexes between sidebar (start) and helper rail (end) */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* Right helper rail — auth-only shell, hidden on mobile (md breakpoint) */}
      <Suspense fallback={null}>
        <RightRail />
      </Suspense>
    </div>
  )
}
