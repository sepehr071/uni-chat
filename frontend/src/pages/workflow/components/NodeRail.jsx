import { Type, Upload, Bot, Sparkles, Volume2, Video } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '../../../utils/cn';

const NODE_TYPES = [
  { type: 'textInput',    icon: Type,     label: 'Text Input',  hotkey: 'T' },
  { type: 'imageUpload',  icon: Upload,   label: 'Image Upload', hotkey: 'I' },
  { type: 'aiAgent',      icon: Bot,      label: 'AI Agent',    hotkey: 'A' },
  { type: 'imageGen',     icon: Sparkles, label: 'Image Gen',   hotkey: 'G' },
  { type: 'ttsNode',      icon: Volume2,  label: 'TTS',         hotkey: 'S' },
  { type: 'videoGenNode', icon: Video,    label: 'Video Gen',   hotkey: 'V' },
];

export default function NodeRail({ onAddNode, onToggleAIGenerator }) {
  return (
    <div className="w-14 shrink-0 border-r border-border bg-background-secondary flex flex-col items-center py-3 gap-1">
      {NODE_TYPES.map(({ type, icon: Icon, label, hotkey }) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <button
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/reactflow', type);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onAddNode(type)}
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                'focus:outline-none focus:ring-2 focus:ring-accent'
              )}
              aria-label={`Add ${label} node`}
            >
              <Icon className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {label} · {hotkey}
          </TooltipContent>
        </Tooltip>
      ))}

      {/* Separator */}
      <div className="w-8 h-px bg-border my-1" />

      {/* AI Generate button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => onToggleAIGenerator(true)}
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
              'text-accent hover:bg-accent-muted',
              'focus:outline-none focus:ring-2 focus:ring-accent'
            )}
            aria-label="Generate workflow with AI"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Generate with AI</TooltipContent>
      </Tooltip>
    </div>
  );
}
