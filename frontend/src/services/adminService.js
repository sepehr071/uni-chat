import api from './api'

export const adminService = {
  async getUsers(params = {}) {
    const response = await api.get('/admin/users', { params })
    return response.data
  },

  async getUser(userId) {
    const response = await api.get('/admin/users/' + userId)
    return response.data
  },

  async banUser(userId, reason) {
    const response = await api.put('/admin/users/' + userId + '/ban', { reason })
    return response.data
  },

  async unbanUser(userId) {
    const response = await api.put('/admin/users/' + userId + '/unban')
    return response.data
  },

  async setUserLimits(userId, tokensLimit) {
    const response = await api.put('/admin/users/' + userId + '/limits', { tokens_limit: tokensLimit })
    return response.data
  },

  async getUserHistory(userId, includeMessages = false) {
    const response = await api.get('/admin/users/' + userId + '/history', { params: { include_messages: includeMessages } })
    return response.data
  },

  async getTemplates() {
    const response = await api.get('/admin/templates')
    return response.data
  },

  async createTemplate(data) {
    const response = await api.post('/admin/templates', data)
    return response.data
  },

  async updateTemplate(templateId, data) {
    const response = await api.put('/admin/templates/' + templateId, data)
    return response.data
  },

  async deleteTemplate(templateId) {
    const response = await api.delete('/admin/templates/' + templateId)
    return response.data
  },

  async getAnalytics(days = 30) {
    const response = await api.get('/admin/analytics', { params: { days } })
    return response.data
  },

  async getCostAnalytics(days = 30) {
    const response = await api.get('/admin/analytics/costs', { params: { days } })
    return response.data
  },

  async getTimeseriesAnalytics(days = 30, granularity = 'day') {
    const response = await api.get('/admin/analytics/timeseries', { params: { days, granularity } })
    return response.data
  },

  async getAuditLogs(skip = 0, limit = 50, action = null) {
    const params = { skip, limit }
    if (action) params.action = action
    const response = await api.get('/admin/audit-logs', { params })
    return response.data
  },

  async listCompanies(days = 30) {
    const response = await api.get('/admin/companies', { params: { days } })
    return response.data
  },

  async getCompanyDetail(wid, days = 30) {
    const response = await api.get(`/admin/companies/${wid}`, { params: { days } })
    return response.data
  },

  async listDlpEvents({ days = 30, action, severity, workspaceId, skip = 0, limit = 50 } = {}) {
    const params = { days, skip, limit }
    if (action) params.action = action
    if (severity) params.severity = severity
    if (workspaceId) params.workspace_id = workspaceId
    const response = await api.get('/admin/dlp/events', { params })
    return response.data
  },

  async getDlpSummary(days = 30) {
    const response = await api.get('/admin/dlp/stats', { params: { days } })
    return response.data
  },
}
