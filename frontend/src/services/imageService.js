import api from './api'

export const imageService = {
  getImageModels: async () => {
    const response = await api.get('/image-gen/models')
    return response.data
  },

  generateImage: async (data) => {
    // Use longer timeout for image generation (150 seconds)
    const response = await api.post('/image-gen/generate', data, {
      timeout: 150000, // 150 seconds
    })
    return response.data
  },

  getHistory: async (params = {}) => {
    const response = await api.get('/image-gen/history', { params })
    return response.data
  },

  deleteImage: async (id) => {
    const response = await api.delete(`/image-gen/${id}`)
    return response.data
  },

  toggleFavorite: async (id) => {
    const response = await api.post(`/image-gen/${id}/favorite`)
    return response.data
  },
}
