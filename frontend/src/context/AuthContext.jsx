import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { authService } from '../services/authService'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

const AUTH_ME_KEY = ['authMe']

// Strip every workspace/project scoping key from localStorage so a re-login
// (or post-logout idle) doesn't inherit a stale active workspace/project that
// no longer belongs to the new user.
function clearScopingState() {
  try {
    localStorage.removeItem('active_workspace_id')
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('active_project_id::')) {
        localStorage.removeItem(k)
      }
    })
  } catch {
    // ignore — quota/privacy errors are non-fatal
  }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken'))
  // Force-re-evaluate the `enabled` flag when login/logout flips the token.
  // useQuery doesn't observe localStorage directly.
  const [hasToken, setHasToken] = useState(() => !!localStorage.getItem('accessToken'))

  // React Query owns the user. Per-query staleTime (30s) overrides the
  // global 5min in main.jsx; refetchOnWindowFocus picks up platform-feature
  // toggles when the user returns to the tab.
  const {
    data: user,
    isLoading: isQueryLoading,
    isFetching,
  } = useQuery({
    queryKey: AUTH_ME_KEY,
    queryFn: async () => {
      try {
        return await authService.getMe()
      } catch (error) {
        // Try refresh on first 401; api.js interceptor will have already
        // attempted once, but the surfaced error may still be 401 if refresh
        // itself failed earlier. Re-attempt explicitly so first-load survives
        // a near-expired access token.
        const status = error?.response?.status
        if (status !== 401) throw error

        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) throw error
        const { access_token, refresh_token: rotatedRefreshToken } = await authService.refresh()
        localStorage.setItem('accessToken', access_token)
        if (rotatedRefreshToken) {
          localStorage.setItem('refreshToken', rotatedRefreshToken)
        }
        setAccessToken(access_token)
        return await authService.getMe()
      }
    },
    enabled: hasToken,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  // isLoading semantics expected by ProtectedRoute / PublicRoute / FeatureGate:
  //   - no token  → not loading (we're logged out, render redirect)
  //   - token + first fetch in flight → loading
  //   - token + cached data present  → not loading (background refetch is fine)
  const isLoading = hasToken && isQueryLoading

  // Handle unrecoverable auth failure: clear tokens + scoping + cache.
  // Surfaced when query throws after the inline refresh attempt also failed.
  useEffect(() => {
    if (!hasToken) return
    // useQuery exposes the latest error via getQueryState, but for our needs
    // it suffices to react when fetching stops + user is still undefined.
    if (isFetching) return
    if (user) return
    // Token exists but we couldn't resolve a user — refresh path is dead.
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('auth_kind')
    localStorage.removeItem('kc_id_token')
    clearScopingState()
    queryClient.clear()
    setAccessToken(null)
    setHasToken(false)
  }, [hasToken, isFetching, user, queryClient])

  // Listen for `auth:cleared` from api.js's 401-refresh-failure path.
  // api.js owns localStorage cleanup (tokens + scoping keys) for low coupling;
  // we own React Query cache invalidation + SPA navigation so we don't have
  // to hard-reload the page. Cache `.clear()` after explicit removal of the
  // authMe key keeps the consumer state consistent even if React Query's
  // global cache is shared across providers.
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem('auth_kind')
      localStorage.removeItem('kc_id_token')
      queryClient.removeQueries({ queryKey: AUTH_ME_KEY })
      queryClient.clear()
      setAccessToken(null)
      setHasToken(false)
      navigate('/login', { replace: true })
    }
    window.addEventListener('auth:cleared', handler)
    return () => {
      window.removeEventListener('auth:cleared', handler)
    }
  }, [queryClient, navigate])

  const login = useCallback(async (email, password) => {
    try {
      const data = await authService.login(email, password)
      localStorage.setItem('accessToken', data.access_token)
      localStorage.setItem('refreshToken', data.refresh_token)
      setAccessToken(data.access_token)
      setHasToken(true)
      // Backend returns features at the top level (`{access_token, features, user:{...}}`),
      // NOT nested under user. Merge so consumers can read `user.features.<name>`
      // without waiting for the next /auth/me round-trip.
      queryClient.setQueryData(AUTH_ME_KEY, { ...data.user, features: data.features })
      toast.success('Welcome back!')
      return data
    } catch (error) {
      const message = error.response?.data?.error || 'Login failed'
      toast.error(message)
      throw error
    }
  }, [queryClient])

  const register = useCallback(async (email, password, displayName) => {
    try {
      const data = await authService.register(email, password, displayName)
      toast.success('Account created! Please login.')
      return data
    } catch (error) {
      const message = error.response?.data?.error || 'Registration failed'
      toast.error(message)
      throw error
    }
  }, [])

  const loginKeycloak = useCallback(async () => {
    try {
      const keycloakClient = (await import('../services/keycloakClient')).default
      await keycloakClient.init()
      if (!keycloakClient.isEnabled()) {
        toast.error('SSO is not configured')
        return
      }
      // Navigates away — never resolves
      await keycloakClient.loginRedirect()
    } catch (error) {
      toast.error('Failed to start sign-in')
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    const authKind = localStorage.getItem('auth_kind')
    const idTokenHint = localStorage.getItem('kc_id_token')
    try { await authService.logout() } catch {}

    // Clear ALL auth state BEFORE any redirect so a back-button hit doesn't re-auth.
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('auth_kind')
    localStorage.removeItem('kc_id_token')
    clearScopingState()
    queryClient.clear()
    setAccessToken(null)
    setHasToken(false)

    if (authKind === 'keycloak') {
      try {
        const keycloakClient = (await import('../services/keycloakClient')).default
        await keycloakClient.init()
        // window.location assign — full navigation to KC, then KC redirects to /login
        window.location.assign(keycloakClient.logoutUrl(idTokenHint))
        return
      } catch (e) {
        console.warn('Federated logout failed, falling back to local', e)
      }
    }
    toast.success('Logged out')
  }, [queryClient])

  const updateUser = useCallback((updates) => {
    queryClient.setQueryData(AUTH_ME_KEY, (prev) =>
      prev ? { ...prev, ...updates } : prev
    )
  }, [queryClient])

  const value = {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    accessToken,
    login,
    loginKeycloak,
    register,
    logout,
    updateUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
