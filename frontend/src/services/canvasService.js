import api from './api'

export const canvasService = {
  /**
   * Share a canvas publicly
   * @param {Object} data - { title, html, css, js, visibility }
   */
  shareCanvas: async (data) => {
    const response = await api.post('/canvas/share', data)
    return response.data
  },

  /**
   * Get user's shared canvases
   * @param {number} page - Page number (default 1)
   * @param {number} limit - Items per page (default 50)
   */
  getMyCanvases: async (page = 1, limit = 50) => {
    const response = await api.get('/canvas/my-canvases', { params: { page, limit } })
    return response.data
  },

  /**
   * Get a public canvas by share ID (no auth required)
   * @param {string} shareId - The share ID
   */
  getPublicCanvas: async (shareId) => {
    const response = await api.get(`/canvas/public/${shareId}`)
    return response.data
  },

  /**
   * Update a shared canvas
   * @param {string} shareId - The share ID
   * @param {Object} data - Fields to update { title, visibility, html, css, js }
   */
  updateCanvas: async (shareId, data) => {
    const response = await api.patch(`/canvas/${shareId}`, data)
    return response.data
  },

  /**
   * Delete a shared canvas
   * @param {string} shareId - The share ID
   */
  deleteCanvas: async (shareId) => {
    const response = await api.delete(`/canvas/${shareId}`)
    return response.data
  },

  /**
   * Fork a shared canvas to user's collection
   * @param {string} shareId - The share ID
   */
  forkCanvas: async (shareId) => {
    const response = await api.post(`/canvas/public/${shareId}/fork`)
    return response.data
  }
}
