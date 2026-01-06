import { useState, useCallback, useEffect } from 'react';
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
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';

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
        nodes: nodes,
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
      setNodes(wf.nodes || []);
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

    setIsExecuting(true);
    try {
      const result = await workflowService.execute(selectedWorkflow._id);
      if (result.status === 'completed') {
        toast.success('Workflow completed successfully');
      } else if (result.status === 'failed') {
        toast.error(result.error || 'Workflow execution failed');
      }
      loadRunHistory();
    } catch (error) {
      console.error('Error executing workflow:', error);
      toast.error('Failed to execute workflow');
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

  // Add a placeholder node for testing
  const addTestNode = (type) => {
    const newNode = {
      id: `${type}-${Date.now()}`,
      type: 'default',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: {
        label: type === 'imageUpload' ? 'Image Upload' : 'Image Generate',
        type: type
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

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
              onClick={() => addTestNode('imageUpload')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-background transition-colors text-sm text-left text-foreground"
            >
              <Upload className="w-4 h-4" />
              <span>Image Upload</span>
            </button>

            <p className="text-xs font-medium text-foreground-secondary mb-2 mt-4">Generation Nodes</p>
            <button
              onClick={() => addTestNode('imageGen')}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-background transition-colors text-sm text-left text-foreground"
            >
              <Sparkles className="w-4 h-4" />
              <span>Image Generate</span>
            </button>

            <div className="mt-6 p-3 bg-background rounded-lg border border-border">
              <p className="text-xs text-foreground-secondary">
                <strong className="text-foreground">Tip:</strong> Click to add nodes, then drag to connect them.
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
              fitView
              attributionPosition="bottom-left"
            >
              <Background color="#404040" gap={16} />
              <Controls />
              <MiniMap
                nodeColor="#5c9aed"
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
