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
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
          throw new Error('No refresh token')
        }

        const response = await axios.post('/api/auth/refresh', {}, {
          headers: {
            Authorization: `Bearer ${refreshToken}`,
          },
        })

        const { access_token, refresh_token: rotatedRefreshToken } = response.data
        localStorage.setItem('accessToken', access_token)
        // Backend rotates the refresh token on every /auth/refresh (P0.4).
        // Persist the new one immediately, else the next refresh will replay
        // the old (now-revoked) jti and hit 401.
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
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  }
)

export default api
