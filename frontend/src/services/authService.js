import api from './api'

export const authService = {
  async register(email, password, display_name) {
    const response = await api.post('/auth/register', {
      email,
      password,
      display_name,
    })
    return response.data
  },

  async login(email, password) {
    const response = await api.post('/auth/login', {
      email,
      password,
    })
    return response.data
  },

  async refresh() {
    const refreshToken = localStorage.getItem('refreshToken')
    const response = await api.post('/auth/refresh', {}, {
      headers: {
        Authorization: `Bearer ${refreshToken}`,
      },
    })
    return response.data
  },

  async logout() {
    await api.post('/auth/logout')
  },

  async getMe() {
    const response = await api.get('/auth/me')
    return response.data
  },

  async changePassword(currentPassword, newPassword) {
    const response = await api.put('/auth/password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    return response.data
  },

  // POST /api/auth/keycloak/sync — exchanges a verified KC access token for a
  // hydrated user payload (same shape as /auth/login: {access_token,
  // refresh_token, token_type, expires_in, features, user}). Backend echoes
  // the access_token; we still send the refresh_token in the body so it
  // appears in the response for symmetry with the platform_admin flow.
  async syncKeycloak(accessToken, refreshToken, idToken) {
    const response = await api.post('/auth/keycloak/sync', {
      access_token: accessToken,
      refresh_token: refreshToken,
      id_token: idToken,
    })
    return response.data
  },
}

// Named re-export so callers can `import { syncKeycloak } from '@/services/authService'`
// without destructuring at the call site.
export const syncKeycloak = (...args) => authService.syncKeycloak(...args)
