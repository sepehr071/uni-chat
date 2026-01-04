import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'

// Layouts
import MainLayout from './components/layout/MainLayout'
import AuthLayout from './components/layout/AuthLayout'

// Auth Pages
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'

// Main Pages
import ChatPage from './pages/chat/ChatPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import HistoryPage from './pages/dashboard/HistoryPage'
import ConfigsPage from './pages/dashboard/ConfigsPage'
import GalleryPage from './pages/dashboard/GalleryPage'
import SettingsPage from './pages/dashboard/SettingsPage'

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard'
import UserManagement from './pages/admin/UserManagement'
import TemplatesPage from './pages/admin/TemplatesPage'

// Protected Route Component
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

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/chat" replace />
  }

  return children
}

// Public Route (redirect to chat if logged in)
function PublicRoute({ children }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/chat" replace />
  }

  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<AuthLayout />}>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
      </Route>

      {/* Protected Routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:conversationId" element={<ChatPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/configs" element={<ConfigsPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Admin Routes */}
      <Route
        element={
          <ProtectedRoute adminOnly>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UserManagement />} />
        <Route path="/admin/templates" element={<TemplatesPage />} />
      </Route>

      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<Navigate to="/chat" replace />} />
    </Routes>
  )
}
