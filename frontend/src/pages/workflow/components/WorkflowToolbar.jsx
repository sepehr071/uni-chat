import { useState } from 'react';
import {
  Save,
  FolderOpen,
  Trash2,
  Plus,
  Play,
  Upload,
  History,
  Loader2,
  Copy,
  Download,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function WorkflowToolbar({
  isMobile,
  workflowName,
  selectedWorkflow,
  nodes,
  isExecuting,
  showRunHistory,
  importFileRef,
  onNew,
  onSave,
  onLoad,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  onToggleHistory,
  onExecute,
}) {
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);

  // Secondary actions for overflow menu on mobile
  const secondaryActions = [
    { label: 'Load', icon: FolderOpen, onClick: onLoad },
    { label: 'Duplicate', icon: Copy, onClick: onDuplicate, disabled: !selectedWorkflow },
    { label: 'Delete', icon: Trash2, onClick: onDelete, disabled: !selectedWorkflow, danger: true },
    { label: 'Import', icon: Upload, onClick: () => importFileRef.current?.click() },
    { label: 'Export', icon: Download, onClick: onExport, disabled: nodes.length === 0 },
  ];

  return (
    <div className="h-12 md:h-14 border-b border-border flex items-center gap-1 md:gap-2 px-2 md:px-4 bg-background-secondary">
      {/* Primary actions - always visible */}
      <button
        onClick={onNew}
        className="btn btn-secondary btn-sm md:btn-md"
        title="New workflow"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">New</span>
      </button>

      <button
        onClick={onSave}
        className="btn btn-primary btn-sm md:btn-md"
        disabled={!workflowName.trim()}
        title="Save workflow"
      >
        <Save className="w-4 h-4" />
        <span className="hidden sm:inline">Save</span>
      </button>

      {/* Desktop: Show all buttons */}
      {!isMobile && (
        <>
          <button
            onClick={onLoad}
            className="btn btn-secondary"
          >
            <FolderOpen className="w-4 h-4" />
            Load
          </button>

          <button
            onClick={onDuplicate}
            className="btn btn-secondary"
            disabled={!selectedWorkflow}
          >
            <Copy className="w-4 h-4" />
            Duplicate
          </button>

          <button
            onClick={onDelete}
            className="btn btn-secondary text-error hover:bg-error/10"
            disabled={!selectedWorkflow}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>

          <div className="w-px h-6 bg-border mx-1" />

          <input
            type="file"
            ref={importFileRef}
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
          <button
            onClick={() => importFileRef.current?.click()}
            className="btn btn-secondary"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>

          <button
            onClick={onExport}
            className="btn btn-secondary"
            disabled={nodes.length === 0}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </>
      )}

      {/* Mobile: Overflow menu */}
      {isMobile && (
        <div className="relative">
          <button
            onClick={() => setShowOverflowMenu(!showOverflowMenu)}
            className="btn btn-secondary btn-sm"
            data-testid="toolbar-overflow-menu"
            title="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showOverflowMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowOverflowMenu(false)}
              />
              <div className="absolute left-0 top-full mt-1 w-48 bg-background-elevated border border-border rounded-lg shadow-dropdown py-1 z-50">
                {secondaryActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      action.onClick();
                      setShowOverflowMenu(false);
                    }}
                    disabled={action.disabled}
                    className={cn(
                      "flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors text-left",
                      action.disabled
                        ? "opacity-50 cursor-not-allowed"
                        : action.danger
                        ? "text-error hover:bg-error/10"
                        : "text-foreground-secondary hover:bg-background-tertiary hover:text-foreground"
                    )}
                  >
                    <action.icon className="w-4 h-4" />
                    {action.label}
                  </button>
                ))}
              </div>
            </>
          )}
          <input
            type="file"
            ref={importFileRef}
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
        </div>
      )}

      <div className="flex-1" />

      <button
        onClick={onToggleHistory}
        className={cn(
          "btn btn-secondary btn-sm md:btn-md",
          showRunHistory && "bg-accent/10 text-accent"
        )}
        disabled={!selectedWorkflow}
        title="Show run history"
      >
        <History className="w-4 h-4" />
        <span className="hidden sm:inline">History</span>
      </button>

      <button
        onClick={onExecute}
        className="btn btn-primary btn-sm md:btn-md"
        disabled={!selectedWorkflow || isExecuting || nodes.length === 0}
        title="Run workflow"
      >
        {isExecuting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="hidden sm:inline">Running...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            <span className="hidden sm:inline">Run</span>
          </>
        )}
      </button>
    </div>
  );
}
