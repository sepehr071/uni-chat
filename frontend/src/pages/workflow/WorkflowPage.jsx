import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { ImageUploadNode, ImageGenNode, NodeContextMenu } from '../../components/workflow';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { WorkflowToolbar, WorkflowSidebar, LoadWorkflowModal, RunHistoryPanel } from './components';
import { useWorkflowState } from './hooks/useWorkflowState';

// Define node types outside component to prevent re-creation
const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
};

function WorkflowEditor() {
  const {
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
  } = useWorkflowState();

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
        <WorkflowSidebar
          showAIGenerator={showAIGenerator}
          onAddNode={addNode}
          onAIGenerate={handleAIGeneratedWorkflow}
          onToggleAIGenerator={setShowAIGenerator}
        />

        {/* Main Canvas */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <WorkflowToolbar
            workflowName={workflowName}
            selectedWorkflow={selectedWorkflow}
            nodes={nodes}
            isExecuting={isExecuting}
            showRunHistory={showRunHistory}
            importFileRef={importFileRef}
            onNew={createNewWorkflow}
            onSave={saveWorkflow}
            onLoad={() => {
              loadWorkflowsList();
              setShowLoadModal(true);
            }}
            onDuplicate={duplicateWorkflow}
            onDelete={deleteWorkflow}
            onImport={importWorkflow}
            onExport={exportWorkflow}
            onToggleHistory={() => {
              setShowRunHistory(!showRunHistory);
              if (!showRunHistory) loadRunHistory();
            }}
            onExecute={executeWorkflow}
          />

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
          <RunHistoryPanel runHistory={runHistory} />
        )}
      </div>

      {/* Load Workflow Modal */}
      {showLoadModal && (
        <LoadWorkflowModal
          workflows={workflows}
          templates={templates}
          activeTab={loadModalTab}
          onTabChange={setLoadModalTab}
          onLoadWorkflow={loadWorkflow}
          onLoadTemplate={loadTemplate}
          onClose={() => setShowLoadModal(false)}
        />
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteWorkflow}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${workflowName}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
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
