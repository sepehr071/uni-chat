import api from './api'

export const usageService = {
  getMyUsage: ({ from, to, group_by = 'feature' } = {}) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('group_by', group_by)
    return api.get(`/usage/me?${params}`).then(r => r.data)
  },

  getAdminUsage: ({ from, to, group_by = 'feature' } = {}) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('group_by', group_by)
    return api.get(`/admin/usage?${params}`).then(r => r.data)
  },
}
