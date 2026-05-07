import api from './api'

export const dlpService = {
  async getPolicy(wid) {
    const r = await api.get(`/workspaces/${wid}/dlp/policy`)
    return r.data
  },

  async updatePolicy(wid, payload) {
    const r = await api.put(`/workspaces/${wid}/dlp/policy`, payload)
    return r.data
  },

  async getStats(wid, days = 30) {
    const r = await api.get(`/workspaces/${wid}/dlp/stats`, { params: { days } })
    return r.data
  },

  async listEvents(wid, params = {}) {
    const r = await api.get(`/workspaces/${wid}/dlp/events`, { params })
    return r.data
  },
}

export default dlpService
