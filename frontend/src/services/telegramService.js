import api from './api'

export const telegramService = {
  async getStatus() {
    const res = await api.get('/users/telegram/status')
    return res.data
  },
  async generateToken() {
    const res = await api.post('/users/telegram/generate-token')
    return res.data
  },
  async unlink() {
    const res = await api.delete('/users/telegram/unlink')
    return res.data
  },
}
