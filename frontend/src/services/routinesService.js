import api from './api'

export const routinesService = {
  listRoutines: async ({ projectId } = {}) => {
    const params = {}
    if (projectId === '__personal__' || projectId === null) params.project_id = '__personal__'
    else if (projectId) params.project_id = projectId
    const response = await api.get('/routines/list', { params })
    return response.data
  },

  getRoutine: async (id) => {
    const response = await api.get(`/routines/${id}`)
    return response.data
  },

  createRoutine: async (payload) => {
    const response = await api.post('/routines/create', payload)
    return response.data
  },

  updateRoutine: async (id, payload) => {
    const response = await api.put(`/routines/${id}`, payload)
    return response.data
  },

  deleteRoutine: async (id) => {
    const response = await api.delete(`/routines/${id}`)
    return response.data
  },

  toggleRoutine: async (id) => {
    const response = await api.post(`/routines/${id}/toggle`)
    return response.data
  },

  runNow: async (id) => {
    const response = await api.post(`/routines/${id}/run-now`)
    return response.data
  },

  getRuns: async (id) => {
    const response = await api.get(`/routines/${id}/runs`)
    return response.data
  },

  parseSchedule: async ({ text, timezone }) => {
    const response = await api.post('/routines/parse-schedule', { text, timezone })
    return response.data
  },

  parseRoutine: async ({ text, timezone }) => {
    const response = await api.post('/routines/parse-routine', { text, timezone })
    return response.data
  },
}
