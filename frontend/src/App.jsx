import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { useWorkspace } from './context/WorkspaceContext'
import { ProjectProvider } from './context/ProjectContext'
import ErrorBoundary from './components/common/ErrorBoundary'
import { CommandPaletteProvider, useCommandPalette } from './context/CommandPaletteContext'

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
const SettingsPage = lazy(() => import('./pages/dashboard/SettingsPage'))
const ImageStudioPage = lazy(() => import('./pages/dashboard/ImageStudioPage'))
const ArenaPage = lazy(() => import('./pages/arena/ArenaPage'))
const WorkflowPage = lazy(() => import('./pages/workflow/WorkflowPage'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const UserManagement = lazy(() => import('./pages/admin/UserManagement'))
const UserHistoryPage = lazy(() => import('./pages/admin/UserHistoryPage'))
const TemplatesPage = lazy(() => import('./pages/admin/TemplatesPage'))
const AuditLogPage = lazy(() => import('./pages/admin/AuditLogPage'))
const CompaniesPage = lazy(() => import('./pages/admin/CompaniesPage'))
const CompanyDetailPage = lazy(() => import('./pages/admin/CompanyDetailPage'))
const DLPDashboardPage = lazy(() => import('./pages/admin/DLPDashboardPage'))
const PlatformLayout = lazy(() => import('./pages/platform/PlatformLayout'))
const HoldingOverviewPage = lazy(() => import('./pages/platform/HoldingOverviewPage'))
const PlatformCompaniesPage = lazy(() => import('./pages/platform/PlatformCompaniesPage'))
const PlatformCompanyDetailPage = lazy(() => import('./pages/platform/PlatformCompanyDetailPage'))
const PlatformUsersOverviewPage = lazy(() => import('./pages/platform/PlatformUsersOverviewPage'))
const FeatureFlagsPage = lazy(() => import('./pages/platform/FeatureFlagsPage'))
const PlatformAuditPage = lazy(() => import('./pages/platform/PlatformAuditPage'))
const PlatformAccountPage = lazy(() => import('./pages/platform/PlatformAccountPage'))

const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage'))
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'))
const DebatePage = lazy(() => import('./pages/debate/DebatePage'))
const ImageHistoryPage = lazy(() => import('./pages/dashboard/ImageHistoryPage'))
const LandingPage = lazy(() => import('./pages/landing/LandingPage'))
const AutomateAgentPage = lazy(() => import('./pages/automate-agent/AutomateAgentPage'))
const RoutinesPage = lazy(() => import('./pages/routines/RoutinesPage'))
const AcceptInvitePage = lazy(() => import('./pages/auth/AcceptInvitePage'))
const ProjectSettingsPage = lazy(() => import('./pages/projects/ProjectSettingsPage'))
const WorkspaceSettingsPage = lazy(() => import('./pages/workspaces/WorkspaceSettingsPage'))
const WorkspaceOverviewPage = lazy(() => import('./pages/workspaces/WorkspaceOverviewPage'))
const CreateWorkspacePage = lazy(() => import('./pages/workspaces/CreateWorkspacePage'))
const OnboardingWizard = lazy(() => import('./components/onboarding/OnboardingWizard'))

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  )
}

function ProtectedRoute({ children, adminOnly = false, platformAdminOnly = false }) {
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
  if (platformAdminOnly && user.role !== 'platform_admin') return <Navigate to="/chat" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/chat" replace />
  // Platform admins should never see the regular app shell — bounce them to their dashboard.
  if (!platformAdminOnly && user.role === 'platform_admin') return <Navigate to="/platform/holding" replace />
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
  if (user) {
    return <Navigate to={user.role === 'platform_admin' ? '/platform/holding' : '/chat'} replace />
  }
  return children
}

// Landing page redirect - shows landing for guests, redirects logged-in users to chat
function LandingRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    )
  }
  if (user) return <Navigate to={user.role === 'platform_admin' ? '/platform/holding' : '/chat'} replace />
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <LandingPage />
    </Suspense>
  )
}

const ONBOARDING_BYPASS_PATHS = new Set(['/onboarding', '/login', '/register', '/accept-invite'])

function OnboardingGate() {
  const { user } = useAuth()
  const { workspaces, currentWorkspace, loading, initialized } = useWorkspace()
  const location = useLocation()

  if (loading || !initialized) return <Outlet />

  const isManagerOrAdmin = user?.role === 'admin' || user?.role === 'manager'
  const hasTeamWorkspace =
    workspaces.some((w) => w.type === 'team') ||
    currentWorkspace?.type === 'team'
  const dismissed = user?.id
    ? localStorage.getItem(`onboarding_complete:${user.id}`) === '1'
    : false
  const bypassPath =
    ONBOARDING_BYPASS_PATHS.has(location.pathname) ||
    location.pathname.startsWith('/invite/')

  if (isManagerOrAdmin && !hasTeamWorkspace && !dismissed && !bypassPath) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}

function GlobalShortcuts() {
  const { toggle, close, isOpen } = useCommandPalette()
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'Escape' && isOpen) {
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, close, isOpen])
  return null
}

export default function App() {
  return (
    <WorkspaceProvider>
      <ProjectProvider>
        <CommandPaletteProvider>
          <GlobalShortcuts />
          <Routes>
            {/* Public Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
            </Route>

            {/* Onboarding — full-page, no MainLayout */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Suspense fallback={<LoadingSpinner />}><OnboardingWizard /></Suspense>
                </ProtectedRoute>
              }
            />

            {/* Protected Routes — with OnboardingGate */}
            <Route element={<ProtectedRoute><OnboardingGate /></ProtectedRoute>}>
              <Route element={<MainLayout />}>
                <Route path="/chat" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><ChatPage /></Suspense></ErrorBoundary>} />
                <Route path="/chat/:conversationId" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><ChatPage /></Suspense></ErrorBoundary>} />
                <Route path="/dashboard" element={<Suspense fallback={<LoadingSpinner />}><DashboardPage /></Suspense>} />
                <Route path="/chat-history" element={<Suspense fallback={<LoadingSpinner />}><HistoryPage /></Suspense>} />
                <Route path="/image-history" element={<Suspense fallback={<LoadingSpinner />}><ImageHistoryPage /></Suspense>} />
                <Route path="/history" element={<Navigate to="/chat-history" replace />} />
                <Route path="/configs" element={<Suspense fallback={<LoadingSpinner />}><ConfigsPage /></Suspense>} />
                <Route path="/settings" element={<Suspense fallback={<LoadingSpinner />}><SettingsPage /></Suspense>} />
                <Route path="/image-studio" element={<Suspense fallback={<LoadingSpinner />}><ImageStudioPage /></Suspense>} />
                <Route path="/arena" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><ArenaPage /></Suspense></ErrorBoundary>} />
                <Route path="/workflow" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><WorkflowPage /></Suspense></ErrorBoundary>} />
                <Route path="/knowledge" element={<Suspense fallback={<LoadingSpinner />}><KnowledgePage /></Suspense>} />
                <Route path="/projects" element={<Suspense fallback={<LoadingSpinner />}><ProjectsPage /></Suspense>} />
                <Route path="/workspaces/new" element={<Suspense fallback={<LoadingSpinner />}><CreateWorkspacePage /></Suspense>} />
                <Route path="/workspaces/:wid/settings" element={<Suspense fallback={<LoadingSpinner />}><WorkspaceSettingsPage /></Suspense>} />
                <Route path="/workspaces/:wid" element={<Suspense fallback={<LoadingSpinner />}><WorkspaceOverviewPage /></Suspense>} />
                <Route path="/debate" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><DebatePage /></Suspense></ErrorBoundary>} />
                <Route path="/automate-agent" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><AutomateAgentPage /></Suspense></ErrorBoundary>} />
                <Route path="/projects/:pid/settings" element={<Suspense fallback={<LoadingSpinner />}><ProjectSettingsPage /></Suspense>} />
                <Route path="/routines" element={<ErrorBoundary><Suspense fallback={<LoadingSpinner />}><RoutinesPage /></Suspense></ErrorBoundary>} />
              </Route>
            </Route>

            {/* Admin Routes */}
            <Route element={<ProtectedRoute adminOnly><MainLayout /></ProtectedRoute>}>
              <Route path="/admin" element={<Suspense fallback={<LoadingSpinner />}><AdminDashboard /></Suspense>} />
              <Route path="/admin/users" element={<Suspense fallback={<LoadingSpinner />}><UserManagement /></Suspense>} />
              <Route path="/admin/users/:userId/history" element={<Suspense fallback={<LoadingSpinner />}><UserHistoryPage /></Suspense>} />
              <Route path="/admin/templates" element={<Suspense fallback={<LoadingSpinner />}><TemplatesPage /></Suspense>} />
              <Route path="/admin/audit" element={<Suspense fallback={<LoadingSpinner />}><AuditLogPage /></Suspense>} />
              <Route path="/admin/companies" element={<Suspense fallback={<LoadingSpinner />}><CompaniesPage /></Suspense>} />
              <Route path="/admin/companies/:wid" element={<Suspense fallback={<LoadingSpinner />}><CompanyDetailPage /></Suspense>} />
              <Route path="/admin/dlp" element={<Suspense fallback={<LoadingSpinner />}><DLPDashboardPage /></Suspense>} />
            </Route>

            {/* Platform-admin Routes (two-layer holding operator) */}
            <Route element={<ProtectedRoute platformAdminOnly><Suspense fallback={<LoadingSpinner />}><PlatformLayout /></Suspense></ProtectedRoute>}>
              <Route path="/platform" element={<Navigate to="/platform/holding" replace />} />
              <Route path="/platform/holding" element={<Suspense fallback={<LoadingSpinner />}><HoldingOverviewPage /></Suspense>} />
              <Route path="/platform/companies" element={<Suspense fallback={<LoadingSpinner />}><PlatformCompaniesPage /></Suspense>} />
              <Route path="/platform/companies/:wid" element={<Suspense fallback={<LoadingSpinner />}><PlatformCompanyDetailPage /></Suspense>} />
              <Route path="/platform/users-overview" element={<Suspense fallback={<LoadingSpinner />}><PlatformUsersOverviewPage /></Suspense>} />
              <Route path="/platform/features" element={<Suspense fallback={<LoadingSpinner />}><FeatureFlagsPage /></Suspense>} />
              <Route path="/platform/audit" element={<Suspense fallback={<LoadingSpinner />}><PlatformAuditPage /></Suspense>} />
              <Route path="/platform/account" element={<Suspense fallback={<LoadingSpinner />}><PlatformAccountPage /></Suspense>} />
            </Route>

            {/* Workspace invite acceptance (auth-aware, redirects internally) */}
            <Route path="/invite/:token" element={<Suspense fallback={<LoadingSpinner />}><AcceptInvitePage /></Suspense>} />

            {/* Landing page for non-authenticated users */}
            <Route path="/" element={<LandingRedirect />} />

            {/* 404 redirect */}
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </CommandPaletteProvider>
      </ProjectProvider>
    </WorkspaceProvider>
  )
}
