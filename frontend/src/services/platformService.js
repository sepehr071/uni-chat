import api from './api'

/**
 * Platform super-admin API client.
 *
 * All endpoints require a JWT minted from `/api/auth/login` whose claims
 * include `is_platform_admin=true`. The backend enforces this via
 * `@platform_admin_required` on every route.
 */
export const platformService = {
  async getFeatures() {
    const response = await api.get('/platform/features')
    return response.data
  },

  async setFeature(feature, enabled) {
    const response = await api.put('/platform/features', { feature, enabled })
    return response.data
  },

  async bulkSetFeatures(features) {
    const response = await api.put('/platform/features', { features })
    return response.data
  },

  async listAudit({ days, action, skip = 0, limit = 50 } = {}) {
    const params = { skip, limit }
    if (days != null) params.days = days
    if (action) params.action = action
    const response = await api.get('/platform/audit', { params })
    return response.data
  },

  async getHoldingOverview(days = 30) {
    const response = await api.get('/platform/holding/overview', { params: { days } })
    return response.data
  },

  async listCompanies(days = 30) {
    const response = await api.get('/platform/companies', { params: { days } })
    return response.data
  },

  async getCompanyDetail(wid, days = 30) {
    const response = await api.get(`/platform/companies/${wid}`, { params: { days } })
    return response.data
  },

  async listUsersOverview({ days = 30, page = 1, limit = 50, search, role } = {}) {
    const params = { days, page, limit }
    if (search) params.search = search
    if (role) params.role = role
    const response = await api.get('/platform/users-overview', { params })
    return response.data
  },

  async chargeCompany(wid, { amountUsd, type = 'top_up', note = '' } = {}) {
    const response = await api.post(`/platform/companies/${wid}/credits`, {
      amount_usd: amountUsd, type, note,
    })
    return response.data
  },

  async chargeHolding({ amountUsd, type = 'top_up', note = '' } = {}) {
    const response = await api.post('/platform/holding/credits', {
      amount_usd: amountUsd, type, note,
    })
    return response.data
  },

  async getHoldingLedger({ skip = 0, limit = 50 } = {}) {
    const response = await api.get('/platform/holding/ledger', { params: { skip, limit } })
    return response.data
  },

  async getMe() {
    const response = await api.get('/platform/me')
    return response.data
  },
}

export default platformService
