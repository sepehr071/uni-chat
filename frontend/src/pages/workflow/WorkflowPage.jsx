import { useState, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Save,
  FolderOpen,
  Trash2,
  Plus,
  Play,
  Upload,
  Sparkles,
  History,
  Loader2
} from 'lucide-react';
import { workflowService } from '../../services/workflowService';
import { ImageUploadNode, ImageGenNode, NodeContextMenu } from '../../components/workflow';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';

// Define node types outside component to prevent re-creation
const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
};

function WorkflowEditor() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showRunHistory, setShowRunHistory] = useState(false);
  const [runHistory, setRunHistory] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { x, y, nodeId, nodeType }

  // Node data update handlers
  const updateNodeData = useCallback((nodeId, updates) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              ...updates,
            },
          };
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
    }
    return initialData;
  }, [updateNodeData]);

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
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
      data: createNodeData(newNodeId, node.type, {
        ...node.data,
        generatedImage: null, // Don't copy generated image
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

  // Execute a single node
  const executeSingleNode = useCallback(async (nodeId) => {
    if (!selectedWorkflow) {
      toast.error('Please save workflow before executing');
      return;
    }

    // First save the workflow to ensure latest data including any generated images
    await saveWorkflow();

    // Set the specific node to running state
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: { ...node.data, isRunning: true },
          };
        }
        return node;
      })
    );

    try {
      const result = await workflowService.executeSingleNode(selectedWorkflow._id, nodeId);

      // Update the node with generated image
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                generatedImage: result.image_data,
                isRunning: false,
              },
            };
          }
          return node;
        })
      );

      toast.success('Node executed successfully');

      // Auto-save to persist the generated image
      setTimeout(() => saveWorkflow(), 500);
    } catch (error) {
      console.error('Error executing single node:', error);
      toast.error(error.response?.data?.error || 'Failed to execute node');

      // Reset running state
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: { ...node.data, isRunning: false },
            };
          }
          return node;
        })
      );
    }
  }, [selectedWorkflow]);

  // Context menu handler for nodes
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeId: node.id,
      nodeType: node.type,
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
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

  // Load workflows list
  const loadWorkflowsList = async () => {
    try {
      const data = await workflowService.list();
      setWorkflows(data.workflows || []);
    } catch (error) {
      console.error('Error loading workflows:', error);
    }
  };

  // Create new workflow
  const createNewWorkflow = () => {
    setNodes([]);
    setEdges([]);
    setSelectedWorkflow(null);
    setWorkflowName('Untitled Workflow');
    setWorkflowDescription('');
    toast.success('New workflow created');
  };

  // Prepare nodes for saving (remove callback functions)
  const prepareNodesForSave = useCallback((nodesToSave) => {
    return nodesToSave.map((node) => ({
      ...node,
      data: {
        label: node.data.label,
        imageUrl: node.data.imageUrl,
        model: node.data.model,
        prompt: node.data.prompt,
        negativePrompt: node.data.negativePrompt,
        generatedImage: node.data.generatedImage,
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

  // Save workflow
  const saveWorkflow = async () => {
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
  };

  // Load workflow
  const loadWorkflow = async (workflow) => {
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
  };

  // Delete workflow
  const deleteWorkflow = async () => {
    if (!selectedWorkflow) {
      toast.error('No workflow selected');
      return;
    }

    if (!confirm(`Delete "${workflowName}"?`)) {
      return;
    }

    try {
      await workflowService.delete(selectedWorkflow._id);
      createNewWorkflow();
      loadWorkflowsList();
      toast.success('Workflow deleted');
    } catch (error) {
      console.error('Error deleting workflow:', error);
      toast.error('Failed to delete workflow');
    }
  };

  // Execute workflow
  const executeWorkflow = async () => {
    if (!selectedWorkflow) {
      toast.error('Please save workflow before executing');
      return;
    }

    // First save the workflow to ensure latest data
    await saveWorkflow();

    setIsExecuting(true);

    // Set all imageGen nodes to running state
    setNodes((nds) =>
      nds.map((node) => {
        if (node.type === 'imageGen') {
          return {
            ...node,
            data: { ...node.data, isRunning: true },
          };
        }
        return node;
      })
    );

    try {
      const result = await workflowService.execute(selectedWorkflow._id);

      // Update nodes with generated images from results
      if (result.node_results) {
        setNodes((nds) =>
          nds.map((node) => {
            const nodeResult = result.node_results[node.id];
            if (nodeResult && nodeResult.image_data) {
              return {
                ...node,
                data: {
                  ...node.data,
                  generatedImage: nodeResult.image_data,
                  isRunning: false,
                },
              };
            }
            if (node.type === 'imageGen') {
              return {
                ...node,
                data: { ...node.data, isRunning: false },
              };
            }
            return node;
          })
        );
      }

      if (result.status === 'completed') {
        toast.success('Workflow completed successfully');
        // Auto-save to persist generated images
        setTimeout(() => saveWorkflow(), 500);
      } else if (result.status === 'failed') {
        toast.error(result.error || 'Workflow execution failed');
      }
      loadRunHistory();
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('Failed to execute workflow');

      // Reset running state on error
      setNodes((nds) =>
        nds.map((node) => {
          if (node.type === 'imageGen') {
            return {
              ...node,
              data: { ...node.data, isRunning: false },
            };
          }
          return node;
        })
      );
    } finally {
      setIsExecuting(false);
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

  useEffect(() => {
    loadWorkflowsList();
  }, []);

  useEffect(() => {
    if (selectedWorkflow && showRunHistory) {
      loadRunHistory();
    }
  }, [selectedWorkflow, showRunHistory]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Top Bar - Name & Description */}
      <div className="border-b border-border bg-background-secondary px-4 py-3">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1 text-foreground"
            placeholder="Workflow name"
          />
          <input
            type="text"
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            className="text-sm bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1 flex-1 text-foreground-secondary"
            placeholder="Description (optional)"
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Node Palette */}
        <div className="w-64 border-r border-border bg-background-secondary p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-foreground mb-4">Add Nodes</h3>

          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground-secondary mb-2">Input Nodes</p>
            <button
              onClick={() => addNode('imageUpload')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-background transition-colors text-sm text-left text-foreground"
            >
              <Upload className="w-4 h-4 text-accent" />
              <span>Image Upload</span>
            </button>

            <p className="text-xs font-medium text-foreground-secondary mb-2 mt-4">Generation Nodes</p>
            <button
              onClick={() => addNode('imageGen')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-background transition-colors text-sm text-left text-foreground"
            >
              <Sparkles className="w-4 h-4 text-success" />
              <span>Image Generate</span>
            </button>

            <div className="mt-6 p-3 bg-background rounded-lg border border-border">
              <p className="text-xs text-foreground-secondary">
                <strong className="text-foreground">Tip:</strong> Click to add nodes, drag outputs to inputs to connect them.
              </p>
            </div>
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="h-14 border-b border-border flex items-center gap-2 px-4 bg-background-secondary">
            <button
              onClick={createNewWorkflow}
              className="btn btn-secondary"
            >
              <Plus className="w-4 h-4" />
              New
            </button>

            <button
              onClick={saveWorkflow}
              className="btn btn-primary"
              disabled={!workflowName.trim()}
            >
              <Save className="w-4 h-4" />
              Save
            </button>

            <button
              onClick={() => {
                loadWorkflowsList();
                setShowLoadModal(true);
              }}
              className="btn btn-secondary"
            >
              <FolderOpen className="w-4 h-4" />
              Load
            </button>

            <button
              onClick={deleteWorkflow}
              className="btn btn-secondary text-error hover:bg-error/10"
              disabled={!selectedWorkflow}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>

            <div className="flex-1" />

            <button
              onClick={() => {
                setShowRunHistory(!showRunHistory);
                if (!showRunHistory) loadRunHistory();
              }}
              className={cn(
                "btn btn-secondary",
                showRunHistory && "bg-accent/10 text-accent"
              )}
              disabled={!selectedWorkflow}
            >
              <History className="w-4 h-4" />
              History
            </button>

            <button
              onClick={executeWorkflow}
              className="btn btn-primary"
              disabled={!selectedWorkflow || isExecuting || nodes.length === 0}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run All
                </>
              )}
            </button>
          </div>

          {/* React Flow Canvas */}
          <div className="flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeContextMenu={onNodeContextMenu}
              nodeTypes={nodeTypes}
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#404040" gap={16} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  if (node.type === 'imageUpload') return '#5c9aed';
                  if (node.type === 'imageGen') return '#4ade80';
                  return '#888';
                }}
                maskColor="rgba(0,0,0,0.8)"
              />
            </ReactFlow>
          </div>
        </div>

        {/* Right Sidebar - Run History */}
        {showRunHistory && selectedWorkflow && (
          <div className="w-80 border-l border-border bg-background-secondary p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold text-foreground mb-4">Run History</h3>

            {runHistory.length === 0 ? (
              <div className="text-sm text-foreground-secondary text-center py-8">
                No runs yet
              </div>
            ) : (
              <div className="space-y-3">
                {runHistory.map((run) => (
                  <div
                    key={run._id}
                    className="p-3 rounded-lg border border-border bg-background"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={cn(
                        "text-xs font-medium px-2 py-1 rounded",
                        run.status === 'completed' && "bg-success/10 text-success",
                        run.status === 'failed' && "bg-error/10 text-error",
                        run.status === 'running' && "bg-accent/10 text-accent"
                      )}>
                        {run.status}
                      </span>
                      <span className="text-xs text-foreground-tertiary">
                        {new Date(run.started_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Load Workflow Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl border border-border w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Load Workflow</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {workflows.length === 0 ? (
                <div className="text-center py-8 text-foreground-secondary">
                  No workflows yet. Create one to get started!
                </div>
              ) : (
                <div className="space-y-2">
                  {workflows.map((workflow) => (
                    <button
                      key={workflow._id}
                      onClick={() => loadWorkflow(workflow)}
                      className="w-full p-4 rounded-lg border border-border hover:border-accent hover:bg-background-tertiary transition-colors text-left"
                    >
                      <div className="font-medium text-foreground">{workflow.name}</div>
                      {workflow.description && (
                        <div className="text-sm text-foreground-secondary mt-1">
                          {workflow.description}
                        </div>
                      )}
                      <div className="text-xs text-foreground-tertiary mt-2">
                        {workflow.nodes?.length || 0} nodes
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border">
              <button
                onClick={() => setShowLoadModal(false)}
                className="btn btn-secondary w-full"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Node Context Menu */}
      {contextMenu && (
        <NodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          nodeType={contextMenu.nodeType}
          onDuplicate={duplicateNode}
          onDelete={deleteNode}
          onRunNode={executeSingleNode}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
