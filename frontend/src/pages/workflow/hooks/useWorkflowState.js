import { useState, useCallback, useEffect, useRef } from 'react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { workflowService } from '../../../services/workflowService';
import toast from 'react-hot-toast';

export function useWorkflowState() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [runHistory, setRunHistory] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [loadModalTab, setLoadModalTab] = useState('workflows');
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const importFileRef = useRef(null);

  // Node data update handlers
  const updateNodeData = useCallback((nodeId, updates) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...updates } };
        }
        return node;
      })
    );
  }, []);

  // Create node data with callbacks
  const createNodeData = useCallback((nodeId, type, initialData = {}) => {
    if (type === 'imageUpload') {
      return {
        label: initialData.label || 'Image Upload',
        imageUrl: initialData.imageUrl || null,
        onImageChange: (imageUrl) => updateNodeData(nodeId, { imageUrl }),
      };
    } else if (type === 'imageGen') {
      return {
        label: initialData.label || 'Image Generate',
        model: initialData.model || 'bytedance-seed/seedream-4.5',
        prompt: initialData.prompt || '',
        negativePrompt: initialData.negativePrompt || '',
        generatedImage: initialData.generatedImage || null,
        isRunning: false,
        onModelChange: (model) => updateNodeData(nodeId, { model }),
        onPromptChange: (prompt) => updateNodeData(nodeId, { prompt }),
        onNegativePromptChange: (negativePrompt) => updateNodeData(nodeId, { negativePrompt }),
      };
    } else if (type === 'textInput') {
      return {
        label: initialData.label || 'Text Input',
        text: initialData.text || '',
        placeholder: initialData.placeholder || 'Enter text...',
        onTextChange: (text) => updateNodeData(nodeId, { text }),
      };
    } else if (type === 'aiAgent') {
      return {
        label: initialData.label || 'AI Agent',
        model: initialData.model || 'openai/gpt-4o',
        systemPrompt: initialData.systemPrompt || '',
        userPromptTemplate: initialData.userPromptTemplate || '{{input}}',
        output: initialData.output || null,
        isRunning: false,
        onModelChange: (model) => updateNodeData(nodeId, { model }),
        onSystemPromptChange: (systemPrompt) => updateNodeData(nodeId, { systemPrompt }),
        onUserPromptChange: (userPromptTemplate) => updateNodeData(nodeId, { userPromptTemplate }),
      };
    }
    return initialData;
  }, [updateNodeData]);

  // Prepare nodes for saving (remove callback functions)
  const prepareNodesForSave = useCallback((nodesToSave) => {
    return nodesToSave.map((node) => ({
      ...node,
      data: {
        label: node.data.label,
        // imageUpload fields
        imageUrl: node.data.imageUrl,
        // imageGen fields
        model: node.data.model,
        prompt: node.data.prompt,
        negativePrompt: node.data.negativePrompt,
        generatedImage: node.data.generatedImage,
        // textInput fields
        text: node.data.text,
        placeholder: node.data.placeholder,
        // aiAgent fields
        systemPrompt: node.data.systemPrompt,
        userPromptTemplate: node.data.userPromptTemplate,
        output: node.data.output,
      },
    }));
  }, []);

  // Restore node callbacks after loading
  const restoreNodeCallbacks = useCallback((loadedNodes) => {
    return loadedNodes.map((node) => ({
      ...node,
      data: createNodeData(node.id, node.type, node.data),
    }));
  }, [createNodeData]);

  // Add new node
  const addNode = useCallback((type) => {
    const nodeId = `${type}-${Date.now()}`;
    const newNode = {
      id: nodeId,
      type: type,
      position: { x: Math.random() * 300 + 100, y: Math.random() * 200 + 100 },
      data: createNodeData(nodeId, type),
    };
    setNodes((nds) => [...nds, newNode]);
  }, [createNodeData]);

  // Duplicate a node
  const duplicateNode = useCallback((nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;

    const newNodeId = `${node.type}-${Date.now()}`;
    const newNode = {
      id: newNodeId,
      type: node.type,
      position: { x: node.position.x + 50, y: node.position.y + 50 },
      data: createNodeData(newNodeId, node.type, {
        ...node.data,
        generatedImage: null,
      }),
    };
    setNodes((nds) => [...nds, newNode]);
    toast.success('Node duplicated');
  }, [nodes, createNodeData]);

  // Delete a node
  const deleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    toast.success('Node deleted');
  }, []);

  // React Flow callbacks
  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    []
  );

  // Context menu
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
      nodeType: node.type,
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Load workflows list
  const loadWorkflowsList = async () => {
    try {
      const data = await workflowService.list();
      setWorkflows(data.workflows || []);
    } catch (error) {
      console.error('Error loading workflows:', error);
    }
  };

  // Load templates list
  const loadTemplatesList = async () => {
    try {
      const data = await workflowService.getTemplates();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Load run history
  const loadRunHistory = async () => {
    if (!selectedWorkflow) return;
    try {
      const data = await workflowService.getRuns(selectedWorkflow._id);
      setRunHistory(data.runs || []);
    } catch (error) {
      console.error('Error loading run history:', error);
    }
  };

  // Create new workflow
  const createNewWorkflow = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setSelectedWorkflow(null);
    setWorkflowName('Untitled Workflow');
    setWorkflowDescription('');
    toast.success('New workflow created');
  }, []);

  // Save workflow
  const saveWorkflow = useCallback(async () => {
    if (!workflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    try {
      const workflowData = {
        name: workflowName,
        description: workflowDescription,
        nodes: prepareNodesForSave(nodes),
        edges: edges,
      };

      if (selectedWorkflow) {
        workflowData.id = selectedWorkflow._id;
      }

      const result = await workflowService.save(workflowData);
      setSelectedWorkflow(result.workflow);
      toast.success(`Workflow "${workflowName}" saved`);
      loadWorkflowsList();
    } catch (error) {
      console.error('Error saving workflow:', error);
      toast.error('Failed to save workflow');
    }
  }, [workflowName, workflowDescription, nodes, edges, selectedWorkflow, prepareNodesForSave]);

  // Load workflow
  const loadWorkflow = useCallback(async (workflow) => {
    try {
      const data = await workflowService.get(workflow._id);
      const wf = data.workflow;
      setNodes(restoreNodeCallbacks(wf.nodes || []));
      setEdges(wf.edges || []);
      setSelectedWorkflow(wf);
      setWorkflowName(wf.name);
      setWorkflowDescription(wf.description || '');
      setShowLoadModal(false);
      toast.success(`Loaded "${wf.name}"`);
    } catch (error) {
      console.error('Error loading workflow:', error);
      toast.error('Failed to load workflow');
    }
  }, [restoreNodeCallbacks]);

  // Load template
  const loadTemplate = useCallback((template) => {
    try {
      setNodes(restoreNodeCallbacks(template.nodes || []));
      setEdges(template.edges || []);
      setSelectedWorkflow(null);
      setWorkflowName(`${template.name} (Copy)`);
      setWorkflowDescription(template.description || '');
      setShowLoadModal(false);
      toast.success(`Loaded template "${template.name}"`);
    } catch (error) {
      console.error('Error loading template:', error);
      toast.error('Failed to load template');
    }
  }, [restoreNodeCallbacks]);

  // Delete workflow
  const deleteWorkflow = useCallback(() => {
    if (!selectedWorkflow) {
      toast.error('No workflow selected');
      return;
    }
    setShowDeleteConfirm(true);
  }, [selectedWorkflow]);

  const handleDeleteWorkflow = useCallback(async () => {
    try {
      await workflowService.delete(selectedWorkflow._id);
      createNewWorkflow();
      loadWorkflowsList();
      toast.success('Workflow deleted');
    } catch (error) {
      console.error('Error deleting workflow:', error);
      toast.error('Failed to delete workflow');
    }
  }, [selectedWorkflow, createNewWorkflow]);

  // Duplicate workflow
  const duplicateWorkflow = useCallback(async () => {
    if (!selectedWorkflow) {
      toast.error('No workflow selected');
      return;
    }

    try {
      const result = await workflowService.duplicate(selectedWorkflow._id);
      const wf = result.workflow;
      setNodes(restoreNodeCallbacks(wf.nodes || []));
      setEdges(wf.edges || []);
      setSelectedWorkflow(wf);
      setWorkflowName(wf.name);
      setWorkflowDescription(wf.description || '');
      loadWorkflowsList();
      toast.success(`Workflow duplicated as "${wf.name}"`);
    } catch (error) {
      console.error('Error duplicating workflow:', error);
      toast.error('Failed to duplicate workflow');
    }
  }, [selectedWorkflow, restoreNodeCallbacks]);

  // Export workflow
  const exportWorkflow = useCallback(() => {
    if (nodes.length === 0) {
      toast.error('No nodes to export');
      return;
    }

    const workflowData = {
      name: workflowName,
      description: workflowDescription,
      nodes: prepareNodesForSave(nodes),
      edges: edges,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    const blob = new Blob([JSON.stringify(workflowData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflowName.replace(/[^a-z0-9]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Workflow exported');
  }, [workflowName, workflowDescription, nodes, edges, prepareNodesForSave]);

  // Import workflow
  const importWorkflow = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.name || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
          throw new Error('Invalid workflow format');
        }
        setNodes(restoreNodeCallbacks(data.nodes));
        setEdges(data.edges);
        setWorkflowName(data.name);
        setWorkflowDescription(data.description || '');
        setSelectedWorkflow(null);
        toast.success(`Imported "${data.name}"`);
      } catch (error) {
        console.error('Error importing workflow:', error);
        toast.error('Failed to import workflow: Invalid JSON format');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [restoreNodeCallbacks]);

  // Execute single node
  const executeSingleNode = useCallback(async (nodeId) => {
    if (!selectedWorkflow) {
      toast.error('Please save workflow before executing');
      return;
    }

    await saveWorkflow();

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, isRunning: true } };
        }
        return node;
      })
    );

    try {
      const result = await workflowService.executeSingleNode(selectedWorkflow._id, nodeId);
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: { ...node.data, generatedImage: result.image_data, isRunning: false },
            };
          }
          return node;
        })
      );
      toast.success('Node executed successfully');
      setTimeout(() => saveWorkflow(), 500);
    } catch (error) {
      console.error('Error executing single node:', error);
      toast.error(error.response?.data?.error || 'Failed to execute node');
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, isRunning: false } };
          }
          return node;
        })
      );
    }
  }, [selectedWorkflow, saveWorkflow]);

  // Execute workflow
  const executeWorkflow = useCallback(async () => {
    if (!selectedWorkflow) {
      toast.error('Please save workflow before executing');
      return;
    }

    await saveWorkflow();
    setIsExecuting(true);

    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === 'imageGen') {
          return { ...node, data: { ...node.data, isRunning: true } };
        }
        return node;
      })
    );

    try {
      const result = await workflowService.execute(selectedWorkflow._id);

      if (result.node_results) {
        setNodes((nds) =>
          nds.map((node) => {
            const nodeResult = result.node_results[node.id];
            if (nodeResult && nodeResult.image_data) {
              return {
                ...node,
                data: { ...node.data, generatedImage: nodeResult.image_data, isRunning: false },
              };
            }
            if (node.type === 'imageGen') {
              return { ...node, data: { ...node.data, isRunning: false } };
            }
            return node;
          })
        );
      }

      if (result.status === 'completed') {
        toast.success('Workflow completed successfully');
        setTimeout(() => saveWorkflow(), 500);
      } else if (result.status === 'failed') {
        toast.error(result.error || 'Workflow execution failed');
      }
      loadRunHistory();
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('Failed to execute workflow');
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'imageGen') {
            return { ...node, data: { ...node.data, isRunning: false } };
          }
          return node;
        })
      );
    } finally {
      setIsExecuting(false);
    }
  }, [selectedWorkflow, saveWorkflow]);

  // Handle AI-generated workflow
  const handleAIGeneratedWorkflow = useCallback((workflow) => {
    const nodesWithCallbacks = workflow.nodes.map(node => ({
      ...node,
      data: createNodeData(node.id, node.type, node.data)
    }));

    setNodes(nodesWithCallbacks);
    setEdges(workflow.edges || []);
    setWorkflowName(workflow.name || 'AI Generated Workflow');
    setWorkflowDescription(workflow.description || '');
    setSelectedWorkflow(null);
    setShowAIGenerator(false);
    toast.success('Workflow generated! Review and save when ready.');
  }, [createNodeData]);

  // Initial load
  useEffect(() => {
    loadWorkflowsList();
    loadTemplatesList();
  }, []);

  // Load run history when needed
  useEffect(() => {
    if (selectedWorkflow && showRunHistory) {
      loadRunHistory();
    }
  }, [selectedWorkflow, showRunHistory]);

  return {
    // State
    nodes,
    edges,
    selectedWorkflow,
    workflows,
    templates,
    runHistory,
    isExecuting,
    workflowName,
    workflowDescription,
    showLoadModal,
    showRunHistory,
    loadModalTab,
    showAIGenerator,
    showDeleteConfirm,
    contextMenu,
    importFileRef,

    // Setters
    setWorkflowName,
    setWorkflowDescription,
    setShowLoadModal,
    setShowRunHistory,
    setLoadModalTab,
    setShowAIGenerator,
    setShowDeleteConfirm,

    // React Flow handlers
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeContextMenu,
    closeContextMenu,

    // Node handlers
    addNode,
    duplicateNode,
    deleteNode,
    executeSingleNode,

    // Workflow handlers
    createNewWorkflow,
    saveWorkflow,
    loadWorkflow,
    loadTemplate,
    deleteWorkflow,
    handleDeleteWorkflow,
    duplicateWorkflow,
    exportWorkflow,
    importWorkflow,
    executeWorkflow,
    handleAIGeneratedWorkflow,
    loadWorkflowsList,
    loadRunHistory,
  };
}
