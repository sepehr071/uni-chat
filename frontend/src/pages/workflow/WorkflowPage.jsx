import { useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  MiniMap,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Layers, X } from 'lucide-react';

import { ImageUploadNode, ImageGenNode, TextInputNode, AIAgentNode, TTSNode, VideoGenNode, NodeContextMenu, WorkflowGenerator } from '../../components/workflow';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { LoadWorkflowModal, EmptyCanvasState } from './components';
import ScheduleWorkflowModal from '../../components/workflow/ScheduleWorkflowModal';
import {
  WorkflowBreadcrumb,
  NodeRail,
  NodeInspector,
  CanvasCommandBar,
  CanvasZoomBar,
  RunHistoryPanel,
} from './components';
import { useWorkflowState } from './hooks/useWorkflowState';

// Define node types outside component to prevent re-creation on render
const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
  textInput: TextInputNode,
  aiAgent: AIAgentNode,
  ttsNode: TTSNode,
  videoGenNode: VideoGenNode,
};

function WorkflowEditor() {
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Right-click hint chip — dismissed forever via localStorage
  const [rclickHintDismissed, setRclickHintDismissed] = useState(
    () => typeof window !== 'undefined' &&
      localStorage.getItem('workflow-rclick-hint-dismissed') === '1'
  );
  const dismissRclickHint = () => {
    localStorage.setItem('workflow-rclick-hint-dismissed', '1');
    setRclickHintDismissed(true);
  };

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setShowMobileSidebar(false);
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
    showLoadModal,
    showRunHistory,
    loadModalTab,
    showAIGenerator,
    showDeleteConfirm,
    contextMenu,
    importFileRef,
    selectedNodeId,
    selectedNode,

    // New fields from state-hook agent (wired through to breadcrumb)
    isSaving,
    hasUnsavedChanges,
    lastSavedAt,

    // Setters
    setWorkflowName,
    setShowLoadModal,
    setShowRunHistory,
    setLoadModalTab,
    setShowAIGenerator,
    setShowDeleteConfirm,
    setSelectedNodeId,

    // React Flow handlers
    onNodesChange,
    onEdgesChange,
    onConnect,
    onNodeContextMenu,
    onSelectionChange,
    closeContextMenu,

    // Node handlers
    addNode,
    duplicateNode,
    deleteNode,
    executeSingleNode,
    updateNodeData,

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

  const handleToggleHistory = () => {
    setShowRunHistory((prev) => {
      if (!prev) loadRunHistory();
      return !prev;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (type) addNode(type);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="workflow-surface h-full flex flex-col bg-background">
      {/* Breadcrumb / top bar */}
      <WorkflowBreadcrumb
        workflowName={workflowName}
        onWorkflowNameChange={setWorkflowName}
        selectedWorkflow={selectedWorkflow}
        nodes={nodes}
        isExecuting={isExecuting}
        onRun={executeWorkflow}
        onToggleHistory={handleToggleHistory}
        showRunHistory={showRunHistory}
        onNew={createNewWorkflow}
        onSave={saveWorkflow}
        onLoad={() => { loadWorkflowsList(); setShowLoadModal(true); }}
        onDuplicate={duplicateWorkflow}
        onDelete={deleteWorkflow}
        onImport={importWorkflow}
        onExport={exportWorkflow}
        importFileRef={importFileRef}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        lastSavedAt={lastSavedAt}
        onOpenTemplates={() => {
          loadWorkflowsList();
          setLoadModalTab('templates');
          setShowLoadModal(true);
        }}
        onOpenAIGenerator={() => setShowAIGenerator(true)}
        onSchedule={() => setScheduleOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Desktop node rail */}
        {!isMobile && (
          <NodeRail
            onAddNode={addNode}
            onAIGenerate={handleAIGeneratedWorkflow}
            showAIGenerator={showAIGenerator}
            onToggleAIGenerator={setShowAIGenerator}
          />
        )}

        {/* Mobile rail overlay */}
        {isMobile && showMobileSidebar && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setShowMobileSidebar(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-16 bg-background-secondary border-r border-border flex flex-col">
              <div className="flex items-center justify-end p-2 border-b border-border">
                <button
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1 rounded hover:bg-background-tertiary"
                  aria-label="Close node rail"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <NodeRail
                onAddNode={(type) => { addNode(type); setShowMobileSidebar(false); }}
                onAIGenerate={handleAIGeneratedWorkflow}
                showAIGenerator={showAIGenerator}
                onToggleAIGenerator={setShowAIGenerator}
              />
            </div>
          </>
        )}

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeContextMenu={onNodeContextMenu}
            onSelectionChange={onSelectionChange}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-right"
            deleteKeyCode={null}
          >
            <Background color="#404040" gap={16} />
            {!isMobile && (
              <MiniMap
                nodeColor={(node) => {
                  if (node.type === 'imageUpload') return '#5c9aed';
                  if (node.type === 'imageGen') return '#4ade80';
                  if (node.type === 'textInput') return '#38bdf8';
                  if (node.type === 'aiAgent') return '#a78bfa';
                  if (node.type === 'ttsNode') return '#fbbf24';
                  if (node.type === 'videoGenNode') return '#f87171';
                  return '#888';
                }}
                maskColor="rgba(0,0,0,0.8)"
              />
            )}
          </ReactFlow>

          {/* Empty canvas onboarding — hides as soon as first node is added */}
          {nodes.length === 0 && (
            <EmptyCanvasState
              onOpenAIGenerator={() => setShowAIGenerator(true)}
              onOpenTemplates={() => {
                loadWorkflowsList();
                setLoadModalTab('templates');
                setShowLoadModal(true);
              }}
            />
          )}

          {/* Right-click hint chip — shown once, dismissed forever via localStorage */}
          {nodes.length > 0 && !rclickHintDismissed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-background-secondary/90 backdrop-blur border border-border shadow-sm text-xs text-foreground-secondary">
              <span>Right-click any node for actions</span>
              <button
                onClick={dismissRclickHint}
                className="p-0.5 rounded hover:bg-background-tertiary text-foreground-secondary/70 hover:text-foreground"
                aria-label="Dismiss hint"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Floating UI overlays inside the canvas container */}
          <CanvasZoomBar />
          <CanvasCommandBar
            selectedNodeId={selectedNodeId}
            onAddNode={addNode}
            onDuplicate={() => selectedNodeId && duplicateNode(selectedNodeId)}
            onDelete={() => selectedNodeId && deleteNode(selectedNodeId)}
          />

          {/* Pan/zoom hint footer — always visible, non-intrusive */}
          <div className="absolute bottom-2 left-2 z-10 text-[10px] text-foreground-secondary opacity-40 pointer-events-none">
            Scroll to zoom · Drag to pan
          </div>
        </div>

        {/* Desktop inspector */}
        {!isMobile && selectedNodeId && (
          <NodeInspector
            node={selectedNode}
            updateNodeData={updateNodeData}
            onClose={() => setSelectedNodeId(null)}
            onRunNode={executeSingleNode}
            onDuplicate={() => duplicateNode(selectedNodeId)}
            onDelete={() => deleteNode(selectedNodeId)}
            runHistory={runHistory}
            isExecuting={isExecuting}
          />
        )}
      </div>

      {/* Mobile inspector as bottom sheet */}
      {isMobile && selectedNodeId && (
        <NodeInspector
          node={selectedNode}
          updateNodeData={updateNodeData}
          onClose={() => setSelectedNodeId(null)}
          onRunNode={executeSingleNode}
          onDuplicate={() => duplicateNode(selectedNodeId)}
          onDelete={() => deleteNode(selectedNodeId)}
          runHistory={runHistory}
          isExecuting={isExecuting}
          isMobile
        />
      )}

      {/* Mobile FAB to open node rail */}
      {isMobile && !showMobileSidebar && (
        <button
          onClick={() => setShowMobileSidebar(true)}
          className="fixed bottom-20 right-4 z-30 p-4 bg-accent hover:bg-accent-hover text-white rounded-full shadow-lg transition-transform hover:scale-110"
          aria-label="Add nodes"
        >
          <Layers className="h-6 w-6" />
        </button>
      )}

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

      {/* Schedule Workflow Modal */}
      <ScheduleWorkflowModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        workflow={selectedWorkflow}
      />

      {/* AI Workflow Generator Modal */}
      {showAIGenerator && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAIGenerator(false); }}
        >
          <div className="max-w-lg w-full">
            <WorkflowGenerator
              onGenerate={handleAIGeneratedWorkflow}
              onClose={() => setShowAIGenerator(false)}
            />
          </div>
        </div>
      )}

      {/* Run History Drawer */}
      {showRunHistory && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setShowRunHistory(false)}
        >
          <div
            className="absolute right-0 top-0 bottom-0 w-full sm:w-[600px] bg-background border-l border-border shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-12 px-4 border-b border-border flex items-center justify-between shrink-0">
              <h2 className="text-sm font-semibold text-foreground">Run History</h2>
              <button
                onClick={() => setShowRunHistory(false)}
                className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-accent"
                aria-label="Close run history"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <RunHistoryPanel runHistory={runHistory} nodes={nodes} onRunNode={executeSingleNode} />
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
