import api from './api'

export const knowledgeService = {
  /**
   * List knowledge items with pagination and filtering
   * @param {Object} params - { page, limit, tag, search, favorites_only }
   */
  list: async (params = {}) => {
    const response = await api.get('/knowledge/list', { params })
    return response.data
  },

  /**
   * Get a single knowledge item by ID
   * @param {string} id - Knowledge item ID
   */
  get: async (id) => {
    const response = await api.get(`/knowledge/${id}`)
    return response.data
  },

  /**
   * Create a new knowledge item
   * @param {Object} data - { source_type, source_id, message_id, content, title, tags }
   */
  create: async (data) => {
    const response = await api.post('/knowledge', data)
    return response.data
  },

  /**
   * Update a knowledge item
   * @param {string} id - Knowledge item ID
   * @param {Object} data - Fields to update { title, content, tags, is_favorite }
   */
  update: async (id, data) => {
    const response = await api.put(`/knowledge/${id}`, data)
    return response.data
  },

  /**
   * Delete a knowledge item
   * @param {string} id - Knowledge item ID
   */
  delete: async (id) => {
    const response = await api.delete(`/knowledge/${id}`)
    return response.data
  },

  /**
   * Search knowledge items
   * @param {string} query - Search query
   */
  search: async (query) => {
    const response = await api.get('/knowledge/search', { params: { q: query } })
    return response.data
  },

  /**
   * Get all unique tags for the user
   */
  getTags: async () => {
    const response = await api.get('/knowledge/tags')
    return response.data
  },

  /**
   * Toggle favorite status
   * @param {string} id - Knowledge item ID
   */
  toggleFavorite: async (id) => {
    const response = await api.post(`/knowledge/${id}/favorite`)
    return response.data
  }
}
