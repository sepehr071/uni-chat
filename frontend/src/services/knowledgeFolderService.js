import api from './api'

export const knowledgeFolderService = {
  /**
   * List all folders for the current user
   * Returns folders with item counts and unfiled count
   */
  list: async () => {
    const response = await api.get('/knowledge-folders')
    return response.data
  },

  /**
   * Get a single folder by ID
   * @param {string} id - Folder ID
   */
  get: async (id) => {
    const response = await api.get(`/knowledge-folders/${id}`)
    return response.data
  },

  /**
   * Create a new folder
   * @param {Object} data - { name, color }
   */
  create: async (data) => {
    const response = await api.post('/knowledge-folders', data)
    return response.data
  },

  /**
   * Update a folder
   * @param {string} id - Folder ID
   * @param {Object} data - { name, color }
   */
  update: async (id, data) => {
    const response = await api.put(`/knowledge-folders/${id}`, data)
    return response.data
  },

  /**
   * Delete a folder (items moved to root)
   * @param {string} id - Folder ID
   */
  delete: async (id) => {
    const response = await api.delete(`/knowledge-folders/${id}`)
    return response.data
  },

  /**
   * Reorder folders
   * @param {Array} orders - Array of { folder_id, order }
   */
  reorder: async (orders) => {
    const response = await api.put('/knowledge-folders/reorder', { orders })
    return response.data
  }
}
