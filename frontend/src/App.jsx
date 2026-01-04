import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Layouts
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'

// Auth Pages (not lazy - critical path)
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Lazy loaded pages for performance
const ChatPage = lazy(() => import('./pages/chat/ChatPage'))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'))
const HistoryPage = lazy(() => import('./pages/dashboard/HistoryPage'))
const ConfigsPage = lazy(() => import('./pages/dashboard/ConfigsPage'))
const GalleryPage = lazy(() => import('./pages/dashboard/GalleryPage'))
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const UserManagement = lazy(() => import('./pages/admin/UserManagement'))
const TemplatesPage = lazy(() => import('./pages/admin/TemplatesPage'))
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'))

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-foreground-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/chat" replace />
  return children
}

function PublicRoute({ children }) {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }
  if (user) return <Navigate to="/chat" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      </Route>

      {/* Protected Routes */}
      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route path="/chat" element={<Suspense fallback={<LoadingSpinner />}><ChatPage /></Suspense>} />
        <Route path="/chat/:conversationId" element={<Suspense fallback={<LoadingSpinner />}><ChatPage /></Suspense>} />
        <Route path="/dashboard" element={<Suspense fallback={<LoadingSpinner />}><DashboardPage /></Suspense>} />
        <Route path="/history" element={<Suspense fallback={<LoadingSpinner />}><HistoryPage /></Suspense>} />
        <Route path="/configs" element={<Suspense fallback={<LoadingSpinner />}><ConfigsPage /></Suspense>} />
        <Route path="/gallery" element={<Suspense fallback={<LoadingSpinner />}><GalleryPage /></Suspense>} />
        <Route path="/settings" element={<Suspense fallback={<LoadingSpinner />}><SettingsPage /></Suspense>} />
      </Route>

      {/* Admin Routes */}
      <Route element={<ProtectedRoute adminOnly><MainLayout /></ProtectedRoute>}>
        <Route path="/admin" element={<Suspense fallback={<LoadingSpinner />}><AdminDashboard /></Suspense>} />
        <Route path="/admin/users" element={<Suspense fallback={<LoadingSpinner />}><UserManagement /></Suspense>} />
        <Route path="/admin/templates" element={<Suspense fallback={<LoadingSpinner />}><TemplatesPage /></Suspense>} />
        <Route path="/admin/audit" element={<Suspense fallback={<LoadingSpinner />}><AuditLogPage /></Suspense>} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}
