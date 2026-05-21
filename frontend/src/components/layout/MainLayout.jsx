import { useState, useEffect, lazy, Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { cn } from '../../utils/cn'

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

  // Handle swipe from edge to open sidebar — direction-aware for RTL
  useEffect(() => {
    if (!isMobile) return

    let touchStartX = 0
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX
    }

    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX
      const swipeDistance = touchEndX - touchStartX
      const dir = document.documentElement.dir

      if (dir === 'rtl') {
        // RTL: swipe from right edge inward (negative distance) to open
        const fromRightEdge = window.innerWidth - touchStartX < 30
        if (fromRightEdge && swipeDistance < -50 && !sidebarOpen) {
          setSidebarOpen(true)
        }
      } else {
        // LTR: swipe from left edge outward (positive distance) to open
        if (touchStartX < 30 && swipeDistance > 50 && !sidebarOpen) {
          setSidebarOpen(true)
        }
      }
    }

    document.addEventListener('touchstart', handleTouchStart)
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isMobile, sidebarOpen])

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
