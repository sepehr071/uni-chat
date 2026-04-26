import { Loader2 } from 'lucide-react';
import { Handle, Position } from 'reactflow';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../../utils/cn';

/**
 * Shared 180px-wide compact shell for all workflow node types.
 *
 * Props:
 *   selected       {boolean}
 *   isRunning      {boolean}
 *   hasError       {boolean}
 *   icon           {React.ComponentType}  - Lucide icon component
 *   iconColor      {string}               - Tailwind bg-* class for icon badge, e.g. 'bg-accent/10'
 *   iconTextColor  {string}               - Tailwind text-* class for the icon itself
 *   title          {string}
 *   statusDot      {'ok'|'error'|null}
 *   summary        {string|React.ReactNode}
 *   lastRunAt      {number|null}          - ms timestamp from Date.now(); shows "Last run X ago"
 *   leftHandles    {Array<{id, top, label}>}  - type="target" handles on left.
 *                  When any handle has a `label`, all left handles render as
 *                  inline labeled rows inside the node body (always visible).
 *                  Otherwise handles render absolutely on left edge using `top` (%).
 *   rightHandles   {Array<{id, top, label}>}  - type="source" handles on right.
 *                  Always render absolutely on right edge using `top` (%);
 *                  `label` shown as hover-chip only.
 *   isConnectable  {boolean}
 */
export default function CompactNodeShell({
  selected = false,
  isRunning = false,
  hasError = false,
  icon: Icon,
  iconColor = 'bg-accent/10',
  iconTextColor = 'text-accent',
  title,
  statusDot = null,
  summary,
  lastRunAt = null,
  leftHandles = [],
  rightHandles = [],
  isConnectable = true,
}) {
  const useInputRows = leftHandles.some((h) => h.label);
  const showTimestamp = !isRunning && !!lastRunAt;

  return (
    <div
      className={cn(
        'group relative w-[180px] rounded-xl border bg-background transition-shadow',
        selected ? 'border-accent shadow-glow-accent' : 'border-border shadow-sm',
        hasError && 'border-error/60',
        isRunning && 'animate-pulse-soft',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        {Icon && (
          <div className={cn('p-1 rounded-md flex-shrink-0', iconColor)}>
            <Icon className={cn('h-3.5 w-3.5', iconTextColor)} />
          </div>
        )}
        <span className="text-xs font-semibold truncate flex-1 text-foreground">
          {title}
        </span>
        {isRunning && (
          <Loader2 className="h-3 w-3 animate-spin text-accent flex-shrink-0" />
        )}
        {!isRunning && statusDot === 'ok' && (
          <span className="h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />
        )}
        {!isRunning && statusDot === 'error' && (
          <span className="h-1.5 w-1.5 rounded-full bg-destructive flex-shrink-0" />
        )}
      </div>

      {/* Input rows: labeled handles rendered inline so labels never overlap */}
      {useInputRows && (
        <div className="border-t border-border/40 py-1">
          {leftHandles.map((h) => (
            <div
              key={h.id}
              className="relative flex items-center gap-2 px-2.5 py-1 text-[10px] font-medium text-foreground-secondary"
            >
              <Handle
                type="target"
                position={Position.Left}
                id={h.id}
                className="!w-3 !h-3 !bg-accent !border-2 !border-background"
                isConnectable={isConnectable}
                title={h.label || h.id}
              />
              <span className="truncate">{h.label || h.id}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fallback: distributed left handles (no labels) */}
      {!useInputRows && leftHandles.map((h) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Left}
          id={h.id}
          style={{ top: h.top || '50%' }}
          className="!w-3 !h-3 !bg-accent !border-2 !border-background"
          isConnectable={isConnectable}
          title={h.label || h.id}
        />
      ))}

      {/* Summary row */}
      <div
        className={cn(
          'px-2.5 text-[11px] text-foreground-secondary leading-tight truncate',
          useInputRows
            ? 'border-t border-border/40 py-1.5'
            : showTimestamp ? 'pt-2' : 'pb-2',
        )}
      >
        {summary ?? <span className="opacity-50 italic">Empty</span>}
      </div>

      {/* Last-run timestamp */}
      {showTimestamp && (
        <div className="px-2.5 pb-1.5 text-[9px] text-foreground-tertiary truncate">
          Last run {formatDistanceToNow(new Date(lastRunAt), { addSuffix: true })}
        </div>
      )}

      {/* Right (source) handles - positioned on outer container */}
      {rightHandles.map((h) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Right}
          id={h.id}
          style={{ top: h.top || '50%' }}
          className="!w-3 !h-3 !bg-accent !border-2 !border-background"
          isConnectable={isConnectable}
          title={h.label || h.id}
        />
      ))}

      {/* Right handle hover labels (single output - hover only) */}
      {rightHandles.filter((h) => h.label).map((h) => (
        <div
          key={`lbl-${h.id}`}
          className="absolute left-full ml-2 -translate-y-1/2 text-[10px] font-medium text-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm z-10"
          style={{ top: h.top || '50%' }}
        >
          {h.label}
        </div>
      ))}
    </div>
  );
}
