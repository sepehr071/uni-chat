import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { cn } from '../../utils/cn'

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile breakpoint
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

  // Handle swipe from left edge to open sidebar
  useEffect(() => {
    if (!isMobile) return

    let touchStartX = 0
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX
    }

    const handleTouchEnd = (e) => {
      const touchEndX = e.changedTouches[0].clientX
      const swipeDistance = touchEndX - touchStartX

      // Swipe from left edge (within 30px) to open
      if (touchStartX < 30 && swipeDistance > 50 && !sidebarOpen) {
        setSidebarOpen(true)
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

      <div className="flex-1 flex flex-col min-w-0">
        <Header onMenuClick={() => setSidebarOpen(true)} sidebarOpen={sidebarOpen} />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
