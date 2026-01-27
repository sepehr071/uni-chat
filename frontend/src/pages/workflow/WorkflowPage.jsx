import { useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Menu, X, Layers } from 'lucide-react';

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
  // Mobile state management
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileHistory, setShowMobileHistory] = useState(false);

  // Detect mobile breakpoint
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        // Close mobile overlays when switching to desktop
        setShowMobileSidebar(false);
        setShowMobileHistory(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
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
      <div className="border-b border-border bg-background-secondary px-3 md:px-4 py-2 md:py-3">
        <div className="flex items-center gap-2 md:gap-4">
          {/* Mobile menu button */}
          {isMobile && (
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="p-2 -ml-1 rounded-lg hover:bg-background-tertiary"
              data-testid="workflow-menu-button"
              aria-label="Open node palette"
            >
              <Menu className="h-5 w-5 text-foreground-secondary" />
            </button>
          )}

          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="text-lg md:text-xl font-semibold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1 text-foreground flex-1 min-w-0"
            placeholder="Workflow name"
          />

          {/* Description hidden on mobile */}
          <input
            type="text"
            value={workflowDescription}
            onChange={(e) => setWorkflowDescription(e.target.value)}
            className="hidden md:block text-sm bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-accent rounded px-2 py-1 flex-1 text-foreground-secondary"
            placeholder="Description (optional)"
          />
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop Sidebar */}
        {!isMobile && (
          <WorkflowSidebar
            showAIGenerator={showAIGenerator}
            onAddNode={addNode}
            onAIGenerate={handleAIGeneratedWorkflow}
            onToggleAIGenerator={setShowAIGenerator}
          />
        )}

        {/* Mobile Sidebar Overlay */}
        {isMobile && showMobileSidebar && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowMobileSidebar(false)}
              data-testid="sidebar-backdrop"
            />
            <div className="fixed inset-y-0 left-0 w-72 z-50 bg-background-secondary border-r border-border overflow-y-auto animate-slide-in-left" data-testid="workflow-sidebar">
              <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background-secondary z-10">
                <h3 className="font-semibold text-foreground">Add Nodes</h3>
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-2 rounded-lg hover:bg-background-tertiary"
                  aria-label="Close sidebar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4">
                <WorkflowSidebar
                  showAIGenerator={showAIGenerator}
                  onAddNode={(type) => {
                    addNode(type);
                    setShowMobileSidebar(false);
                  }}
                  onAIGenerate={handleAIGeneratedWorkflow}
                  onToggleAIGenerator={setShowAIGenerator}
                />
              </div>
            </div>
          </>
        )}

        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <WorkflowToolbar
            isMobile={isMobile}
            workflowName={workflowName}
            selectedWorkflow={selectedWorkflow}
            nodes={nodes}
            isExecuting={isExecuting}
            showRunHistory={showRunHistory || showMobileHistory}
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
              if (isMobile) {
                setShowMobileHistory(!showMobileHistory);
                if (!showMobileHistory) loadRunHistory();
              } else {
                setShowRunHistory(!showRunHistory);
                if (!showRunHistory) loadRunHistory();
              }
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
              {/* Hide MiniMap on mobile */}
              {!isMobile && (
                <MiniMap
                  nodeColor={(node) => {
                    if (node.type === 'imageUpload') return '#5c9aed';
                    if (node.type === 'imageGen') return '#4ade80';
                    return '#888';
                  }}
                  maskColor="rgba(0,0,0,0.8)"
                />
              )}
            </ReactFlow>
          </div>
        </div>

        {/* Desktop History Panel */}
        {!isMobile && showRunHistory && selectedWorkflow && (
          <RunHistoryPanel runHistory={runHistory} />
        )}

        {/* Mobile History Overlay */}
        {isMobile && showMobileHistory && selectedWorkflow && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowMobileHistory(false)}
            />
            <div className="fixed inset-x-0 bottom-0 z-50 bg-background-secondary border-t border-border rounded-t-2xl max-h-[70vh] overflow-y-auto animate-slide-in-bottom" data-testid="run-history-panel">
              <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border bg-background-secondary">
                <h3 className="font-semibold text-foreground">Run History</h3>
                <button
                  onClick={() => setShowMobileHistory(false)}
                  className="p-2 rounded-lg hover:bg-background-tertiary"
                  aria-label="Close history"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4">
                <RunHistoryPanel runHistory={runHistory} />
              </div>
            </div>
          </>
        )}

        {/* Mobile FAB for quick node add */}
        {isMobile && !showMobileSidebar && (
          <button
            onClick={() => setShowMobileSidebar(true)}
            className="fixed bottom-20 right-4 z-30 p-4 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg transition-transform hover:scale-110"
            aria-label="Add nodes"
          >
            <Layers className="h-6 w-6" />
          </button>
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
