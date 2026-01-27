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
  Download
} from 'lucide-react';
import { cn } from '../../../utils/cn';

export default function WorkflowToolbar({
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
  return (
    <div className="h-14 border-b border-border flex items-center gap-2 px-4 bg-background-secondary">
      <button
        onClick={onNew}
        className="btn btn-secondary"
      >
        <Plus className="w-4 h-4" />
        New
      </button>

      <button
        onClick={onSave}
        className="btn btn-primary"
        disabled={!workflowName.trim()}
      >
        <Save className="w-4 h-4" />
        Save
      </button>

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

      <div className="flex-1" />

      <button
        onClick={onToggleHistory}
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
        onClick={onExecute}
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
  );
}
