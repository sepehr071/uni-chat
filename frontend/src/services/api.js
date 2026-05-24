import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  maxContentLength: 50 * 1024 * 1024, // 50MB
  maxBodyLength: 50 * 1024 * 1024, // 50MB
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // If 401 and not already retried, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const authKind = localStorage.getItem('auth_kind') || 'platform_admin'
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
          throw new Error('No refresh token')
        }

        let access_token
        let rotatedRefreshToken
        if (authKind === 'keycloak') {
          // Dynamic import keeps oauth4webapi out of the main bundle for
          // platform_admin users who never touch SSO.
          const { default: keycloakClient } = await import('./keycloakClient')
          const tokens = await keycloakClient.refresh(refreshToken)
          access_token = tokens.access_token
          rotatedRefreshToken = tokens.refresh_token
          if (tokens.id_token) {
            localStorage.setItem('kc_id_token', tokens.id_token)
          }
        } else {
          const response = await axios.post('/api/auth/refresh', {}, {
            headers: {
              Authorization: `Bearer ${refreshToken}`,
            },
          })
          access_token = response.data.access_token
          rotatedRefreshToken = response.data.refresh_token
        }

        localStorage.setItem('accessToken', access_token)
        // Backend rotates the refresh token on every /auth/refresh (P0.4) and
        // KC may rotate as well — persist when present, else the next refresh
        // will replay the old (now-revoked) jti and hit 401.
        if (rotatedRefreshToken) {
          localStorage.setItem('refreshToken', rotatedRefreshToken)
        }

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        // Refresh failed → effectively logged out. Clear tokens AND scoping
        // keys so the next login lands the user on a real workspace/project
        // instead of inheriting stale IDs.
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('auth_kind')
        localStorage.removeItem('kc_id_token')
        try {
          localStorage.removeItem('active_workspace_id')
          Object.keys(localStorage).forEach((k) => {
            if (k.startsWith('active_project_id::')) {
              localStorage.removeItem(k)
            }
          })
        } catch {
          // ignore
        }
        // Event-bus handoff to AuthContext: it owns queryClient + router.
        // Listener clears React Query cache and SPA-navigates to /login,
        // avoiding the full-page reload that previously masked the
        // missing cache.clear(). Guarded for non-browser/test contexts.
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new Event('auth:cleared'))
        } else {
          // Fallback for environments without dispatchEvent (e.g. SSR).
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
        }
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
