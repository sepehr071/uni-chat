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
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';

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
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onNew}
            variant="secondary"
            size="sm"
            className="md:h-9 md:px-4"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>New workflow</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onSave}
            variant="default"
            size="sm"
            className="md:h-9 md:px-4"
            disabled={!workflowName.trim()}
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Save workflow</TooltipContent>
      </Tooltip>

      {/* Desktop: Show all buttons */}
      {!isMobile && (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onLoad}
                variant="secondary"
                size="sm"
              >
                <FolderOpen className="w-4 h-4" />
                Load
              </Button>
            </TooltipTrigger>
            <TooltipContent>Load workflow</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onDuplicate}
                variant="secondary"
                size="sm"
                disabled={!selectedWorkflow}
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicate workflow</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onDelete}
                variant="secondary"
                size="sm"
                disabled={!selectedWorkflow}
                className="text-error hover:bg-error/10"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete workflow</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6 mx-1" />

          <input
            type="file"
            ref={importFileRef}
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => importFileRef.current?.click()}
                variant="secondary"
                size="sm"
              >
                <Upload className="w-4 h-4" />
                Import
              </Button>
            </TooltipTrigger>
            <TooltipContent>Import workflow</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onExport}
                variant="secondary"
                size="sm"
                disabled={nodes.length === 0}
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
            </TooltipTrigger>
            <TooltipContent>Export workflow</TooltipContent>
          </Tooltip>
        </>
      )}

      {/* Mobile: Overflow menu */}
      {isMobile && (
        <>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    data-testid="toolbar-overflow-menu"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>More actions</TooltipContent>
            </Tooltip>

            <DropdownMenuContent align="start" className="w-48">
              {secondaryActions.map((action, index) => (
                <div key={action.label}>
                  {index === 3 && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className={cn(
                      action.danger && "text-error focus:text-error focus:bg-error/10"
                    )}
                  >
                    <action.icon className="w-4 h-4 mr-2" />
                    {action.label}
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            type="file"
            ref={importFileRef}
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
        </>
      )}

      <div className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onToggleHistory}
            variant="secondary"
            size="sm"
            className={cn(
              "md:h-9 md:px-4",
              showRunHistory && "bg-accent/10 text-accent"
            )}
            disabled={!selectedWorkflow}
          >
            <History className="w-4 h-4" />
            <span className="hidden sm:inline">History</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Show run history</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onExecute}
            variant="default"
            size="sm"
            className="md:h-9 md:px-4"
            disabled={!selectedWorkflow || isExecuting || nodes.length === 0}
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
          </Button>
        </TooltipTrigger>
        <TooltipContent>Run workflow</TooltipContent>
      </Tooltip>
    </div>
  );
}
