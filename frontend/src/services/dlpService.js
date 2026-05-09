import api from './api'
import i18n from '@/i18n'

const uiLang = () => (i18n.language || 'en').slice(0, 2).toLowerCase()

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

  async scan(text, workspace_id, source = 'chat', project_id = null) {
    const r = await api.post('/dlp/scan', { text, workspace_id, source, project_id, lang: uiLang() })
    return r.data
  },

  async testClassifier(text, workspace_id) {
    const r = await api.post('/dlp/test', { text, workspace_id, lang: uiLang() })
    return r.data
  },
}

export default dlpService
