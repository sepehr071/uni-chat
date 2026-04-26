import { Plus, Copy, Trash2, Type, Upload, Bot, Sparkles, Volume2, Video } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '../../../utils/cn';

const NODE_TYPES = [
  { type: 'textInput',    icon: Type,     label: 'Text Input'  },
  { type: 'imageUpload',  icon: Upload,   label: 'Image Upload' },
  { type: 'aiAgent',      icon: Bot,      label: 'AI Agent'    },
  { type: 'imageGen',     icon: Sparkles, label: 'Image Gen'   },
  { type: 'ttsNode',      icon: Volume2,  label: 'TTS'         },
  { type: 'videoGenNode', icon: Video,    label: 'Video Gen'   },
];

function BarButton({ icon: Icon, label, hotkey, onClick, disabled }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
            'focus:outline-none focus:ring-2 focus:ring-accent',
            disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent hover:text-foreground-secondary'
          )}
          aria-label={label}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}{hotkey ? ` · ${hotkey}` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

export default function CanvasCommandBar({
  selectedNodeId,
  onAddNode,
  onDuplicate,
  onDelete,
}) {
  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-background border border-border rounded-xl shadow-md p-1 z-10">
      {/* Add popover */}
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                  'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-accent'
                )}
                aria-label="Add node"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Add node · A</TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="center" className="w-44 p-1">
          {NODE_TYPES.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => onAddNode(type)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <BarButton
        icon={Copy}
        label="Duplicate"
        hotkey="⌘D"
        onClick={onDuplicate}
        disabled={!selectedNodeId}
      />

      <BarButton
        icon={Trash2}
        label="Delete"
        hotkey="⌫"
        onClick={onDelete}
        disabled={!selectedNodeId}
      />
    </div>
  );
}
