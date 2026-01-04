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
}
