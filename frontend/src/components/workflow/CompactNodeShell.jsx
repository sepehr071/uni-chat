import { Loader2 } from 'lucide-react';
import { Handle, Position } from 'reactflow';
import { cn } from '../../utils/cn';

/**
 * Shared 170px-wide compact shell for all workflow node types.
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
 *   leftHandles    {Array<{id, top, tone}>}  - type="target" handles on left
 *   rightHandles   {Array<{id, top, tone}>}  - type="source" handles on right
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
  leftHandles = [],
  rightHandles = [],
  isConnectable = true,
}) {
  return (
    <div
      className={cn(
        'w-[170px] rounded-xl border bg-background transition-shadow',
        selected ? 'border-accent shadow-glow-accent' : 'border-border shadow-sm',
        hasError && 'border-error/60',
        isRunning && 'animate-pulse-soft',
      )}
    >
      {/* Left (target) handles */}
      {leftHandles.map((h) => (
        <Handle
          key={h.id}
          type="target"
          position={Position.Left}
          id={h.id}
          style={{ top: h.top || '50%' }}
          className="!w-3 !h-3 !bg-accent !border-2 !border-background"
          isConnectable={isConnectable}
        />
      ))}

      {/* Right (source) handles */}
      {rightHandles.map((h) => (
        <Handle
          key={h.id}
          type="source"
          position={Position.Right}
          id={h.id}
          style={{ top: h.top || '50%' }}
          className="!w-3 !h-3 !bg-accent !border-2 !border-background"
          isConnectable={isConnectable}
        />
      ))}

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

      {/* Summary row */}
      <div className="px-2.5 pb-2 text-[11px] text-foreground-secondary leading-tight truncate">
        {summary ?? <span className="opacity-50 italic">Empty</span>}
      </div>
    </div>
  );
}
