import api from './api';

/**
 * Workflow Service - Handles all workflow-related API calls
 */
export const workflowService = {
  /**
   * Save or create a workflow
   */
  save: async (workflow) => {
    const response = await api.post('/workflow/save', workflow);
    return response.data;
  },

  /**
   * List user's workflows
   */
  list: async () => {
    const response = await api.get('/workflow/list');
    return response.data;
  },

  /**
   * Get a specific workflow by ID
   */
  get: async (id) => {
    const response = await api.get(`/workflow/${id}`);
    return response.data;
  },

  /**
   * Delete a workflow
   */
  delete: async (id) => {
    const response = await api.delete(`/workflow/${id}`);
    return response.data;
  },

  /**
   * Get workflow templates
   */
  getTemplates: async () => {
    const response = await api.get('/workflow/templates');
    return response.data;
  },

  /**
   * Execute entire workflow
   */
  execute: async (workflowId) => {
    const response = await api.post('/workflow/execute', { workflow_id: workflowId });
    return response.data;
  },

  /**
   * Execute workflow from a specific node
   */
  executeFrom: async (workflowId, nodeId) => {
    const response = await api.post('/workflow/execute-from', {
      workflow_id: workflowId,
      node_id: nodeId
    });
    return response.data;
  },

  /**
   * Get run history for a workflow
   */
  getRuns: async (workflowId) => {
    const response = await api.get(`/workflow/runs/${workflowId}`);
    return response.data;
  }
};
