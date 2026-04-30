import api from './api'

export const workspaceService = {
  list: () => api.get('/workspaces/list').then(r => r.data),
  get: (wid) => api.get(`/workspaces/${wid}`).then(r => r.data),
  create: (data) => api.post('/workspaces/create', data).then(r => r.data),
  update: (wid, data) => api.patch(`/workspaces/${wid}`, data).then(r => r.data),
  delete: (wid) => api.delete(`/workspaces/${wid}`).then(r => r.data),
  invite: (wid, payload) => api.post(`/workspaces/${wid}/invites`, payload).then(r => r.data),
  listInvites: (wid) => api.get(`/workspaces/${wid}/invites`).then(r => r.data),
  revokeInvite: (wid, token) => api.delete(`/workspaces/${wid}/invites/${token}`).then(r => r.data),
  acceptInvite: (token) => api.post('/workspaces/accept-invite', { token }).then(r => r.data),
  members: (wid) => api.get(`/workspaces/${wid}/members`).then(r => r.data),
  updateMember: (wid, uid, role) => api.patch(`/workspaces/${wid}/members/${uid}`, { role }).then(r => r.data),
  removeMember: (wid, uid) => api.delete(`/workspaces/${wid}/members/${uid}`).then(r => r.data),
}

export default workspaceService
