import { useState } from 'react';
import { ChevronRight, Loader2, MoreHorizontal, History, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '../../../utils/cn';

function relativeTime(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function WorkflowBreadcrumb({
  workflowName,
  onWorkflowNameChange,
  selectedWorkflow,
  nodes,
  isExecuting,
  onRun,
  onToggleHistory,
  showRunHistory,
  onNew,
  onSave,
  onLoad,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  importFileRef,
}) {
  const [editingName, setEditingName] = useState(false);

  const pill = nodes.length
    ? `${nodes.length} node${nodes.length !== 1 ? 's' : ''}${selectedWorkflow?.savedAt ? ' · saved ' + relativeTime(selectedWorkflow.savedAt) : ''}`
    : 'empty';

  return (
    <div className="h-11 border-b border-border bg-background-secondary flex items-center gap-2 px-3 shrink-0">
      {/* Breadcrumb trail */}
      <span className="text-xs text-foreground-tertiary whitespace-nowrap">Workflows</span>
      <ChevronRight className="w-3.5 h-3.5 text-foreground-tertiary shrink-0" />

      {/* Inline-editable name */}
      {editingName ? (
        <input
          autoFocus
          type="text"
          value={workflowName}
          onChange={(e) => onWorkflowNameChange(e.target.value)}
          onBlur={() => setEditingName(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false);
          }}
          className="flex-1 min-w-0 text-sm font-medium bg-transparent border border-accent rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-accent text-foreground"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="text-sm font-medium text-foreground hover:text-accent truncate max-w-[180px] focus:outline-none"
          title="Click to rename"
        >
          {workflowName || 'Untitled Workflow'}
        </button>
      )}

      {/* Node/saved pill */}
      <span className="hidden sm:inline text-xs text-foreground-tertiary bg-background-tertiary rounded-full px-2 py-0.5 whitespace-nowrap">
        {pill}
      </span>

      <div className="flex-1" />

      {/* Runs history button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleHistory}
            className={cn(
              'h-7 px-2 text-xs',
              showRunHistory && 'bg-accent-muted text-accent'
            )}
          >
            <History className="w-3.5 h-3.5 mr-1" />
            Runs
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle run history</TooltipContent>
      </Tooltip>

      {/* Run button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="default"
            size="sm"
            onClick={onRun}
            disabled={isExecuting || nodes.length === 0}
            className="h-7 px-3 text-xs gap-1"
          >
            {isExecuting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            Run
            <kbd className="ml-1 hidden sm:inline text-[10px] opacity-60 font-mono bg-white/10 rounded px-1">⌘↵</kbd>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Run workflow (⌘↵)</TooltipContent>
      </Tooltip>

      {/* Overflow menu */}
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={onNew}>New</DropdownMenuItem>
          <DropdownMenuItem onClick={onSave}>Save</DropdownMenuItem>
          <DropdownMenuItem onClick={onLoad}>Load</DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate} disabled={!selectedWorkflow}>
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            disabled={!selectedWorkflow}
            className="text-error focus:text-error focus:bg-error/10"
          >
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => importFileRef.current?.click()}>Import</DropdownMenuItem>
          <DropdownMenuItem onClick={onExport} disabled={nodes.length === 0}>
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input for import */}
      <input
        type="file"
        ref={importFileRef}
        accept=".json"
        onChange={onImport}
        className="hidden"
      />
    </div>
  );
}
