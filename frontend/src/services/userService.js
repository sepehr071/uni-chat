import api from './api'

export const userService = {
  async getProfile() {
    const response = await api.get('/users/profile')
    return response.data
  },

  async updateProfile(data) {
    const response = await api.put('/users/profile', data)
    return response.data
  },

  async getStats() {
    const response = await api.get('/users/stats')
    return response.data
  },

  async getSettings() {
    const response = await api.get('/users/settings')
    return response.data
  },

  async updateSettings(data) {
    const response = await api.put('/users/settings', data)
    return response.data
  },
}

export const uploadService = {
  async uploadFile(file) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/uploads/file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async uploadImage(file) {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/uploads/image', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async deleteUpload(uploadId) {
    const response = await api.delete(`/uploads/${uploadId}`)
    return response.data
  },

  async getMyUploads(params = {}) {
    const response = await api.get('/uploads/my', { params })
    return response.data
  },
}
