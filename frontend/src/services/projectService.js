import api from './api'

export const projectService = {
  list: (workspaceId) => api.get(`/projects/list?workspace_id=${workspaceId}`).then(r => r.data),
  get: (pid) => api.get(`/projects/${pid}`).then(r => r.data),
  create: (data) => api.post('/projects/create', data).then(r => r.data),
  update: (pid, data) => api.patch(`/projects/${pid}`, data).then(r => r.data),
  delete: (pid) => api.delete(`/projects/${pid}`).then(r => r.data),
  addMember: (pid, payload) => api.post(`/projects/${pid}/members`, payload).then(r => r.data),
  updateMember: (pid, uid, role) => api.patch(`/projects/${pid}/members/${uid}`, { role }).then(r => r.data),
  removeMember: (pid, uid) => api.delete(`/projects/${pid}/members/${uid}`).then(r => r.data),
}

export default projectService
