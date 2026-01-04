import api from './api'

export const chatService = {
  // Conversations
  async getConversations(params = {}) {
    const response = await api.get('/conversations', { params })
    return response.data
  },

  async getConversation(conversationId) {
    const response = await api.get(`/conversations/${conversationId}`)
    return response.data
  },

  async createConversation(configId, title = 'New conversation', folderId = null) {
    const response = await api.post('/conversations', {
      config_id: configId,
      title,
      folder_id: folderId,
    })
    return response.data
  },

  async updateConversation(conversationId, data) {
    const response = await api.put(`/conversations/${conversationId}`, data)
    return response.data
  },

  async deleteConversation(conversationId) {
    const response = await api.delete(`/conversations/${conversationId}`)
    return response.data
  },

  async archiveConversation(conversationId) {
    const response = await api.post(`/conversations/${conversationId}/archive`)
    return response.data
  },

  async exportConversation(conversationId, format = 'markdown', includeMetadata = true) {
    const response = await api.get(`/conversations/${conversationId}/export`, {
      params: { format, metadata: includeMetadata },
      responseType: 'blob'
    })
    return response.data
  },

  async searchConversations(query) {
    const response = await api.get('/conversations/search', { params: { q: query } })
    return response.data
  },

  async searchMessages(query, limit = 50) {
    const response = await api.get('/conversations/search/messages', { params: { q: query, limit } })
    return response.data
  },

  // Messages (non-streaming)
  async sendMessage(conversationId, configId, message, attachments = []) {
    const response = await api.post('/chat/send', {
      conversation_id: conversationId,
      config_id: configId,
      message,
      attachments,
    })
    return response.data
  },

  async getMessages(conversationId, params = {}) {
    const response = await api.get(`/chat/${conversationId}/messages`, { params })
    return response.data
  },

  async deleteMessage(messageId) {
    const response = await api.delete(`/chat/messages/${messageId}`)
    return response.data
  },

  async regenerateMessage(messageId) {
    const response = await api.post(`/chat/regenerate/${messageId}`)
    return response.data
  },

  async editMessage(messageId, content, regenerate = true) {
    const response = await api.put(`/chat/messages/${messageId}`, { content, regenerate })
    return response.data
  },
}

export const configService = {
  async getConfigs(params = {}) {
    const response = await api.get('/configs', { params })
    return response.data
  },

  async getConfig(configId) {
    const response = await api.get(`/configs/${configId}`)
    return response.data
  },

  async createConfig(data) {
    const response = await api.post('/configs', data)
    return response.data
  },

  async updateConfig(configId, data) {
    const response = await api.put(`/configs/${configId}`, data)
    return response.data
  },

  async deleteConfig(configId) {
    const response = await api.delete(`/configs/${configId}`)
    return response.data
  },

  async publishConfig(configId) {
    const response = await api.post(`/configs/${configId}/publish`)
    return response.data
  },

  async unpublishConfig(configId) {
    const response = await api.post(`/configs/${configId}/unpublish`)
    return response.data
  },

  async duplicateConfig(configId, name = null) {
    const response = await api.post(`/configs/${configId}/duplicate`, { name })
    return response.data
  },
}

export const galleryService = {
  async browseGallery(params = {}) {
    const response = await api.get('/gallery', { params })
    return response.data
  },

  async getTemplates() {
    const response = await api.get('/gallery/templates')
    return response.data
  },

  async getPublicConfig(configId) {
    const response = await api.get(`/gallery/${configId}`)
    return response.data
  },

  async saveConfig(configId) {
    const response = await api.post(`/gallery/${configId}/save`)
    return response.data
  },

  async unsaveConfig(configId) {
    const response = await api.post(`/gallery/${configId}/unsave`)
    return response.data
  },

  async useConfig(configId) {
    const response = await api.post(`/gallery/${configId}/use`)
    return response.data
  },

  async getSavedConfigs() {
    const response = await api.get('/gallery/saved')
    return response.data
  },
}

export const folderService = {
  async getFolders() {
    const response = await api.get('/folders')
    return response.data
  },

  async getFolderTree() {
    const response = await api.get('/folders/tree')
    return response.data
  },

  async createFolder(data) {
    const response = await api.post('/folders', data)
    return response.data
  },

  async updateFolder(folderId, data) {
    const response = await api.put(`/folders/${folderId}`, data)
    return response.data
  },

  async deleteFolder(folderId) {
    const response = await api.delete(`/folders/${folderId}`)
    return response.data
  },

  async reorderFolders(orders) {
    const response = await api.put('/folders/reorder', { orders })
    return response.data
  },
}

export const modelService = {
  async getModels() {
    const response = await api.get('/models')
    return response.data
  },

  async getModel(modelId) {
    const response = await api.get(`/models/${modelId}`)
    return response.data
  },

  async getModelCategories() {
    const response = await api.get('/models/categories')
    return response.data
  },
}
