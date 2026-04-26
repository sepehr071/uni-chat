import { useState } from 'react';
import { Type, Upload, Bot, Sparkles, Volume2, Video, Search } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '../../../utils/cn';

const CATEGORY_ORDER = ['INPUT', 'AI', 'GEN'];
const CATEGORY_FULL_LABEL = { INPUT: 'Inputs', AI: 'AI', GEN: 'Generation' };

const NODE_TYPES = [
  { type: 'textInput',    icon: Type,     label: 'Text Input',   hotkey: 'T', category: 'INPUT', description: 'Static text node' },
  { type: 'imageUpload',  icon: Upload,   label: 'Image Upload', hotkey: 'I', category: 'INPUT', description: 'Upload reference image' },
  { type: 'aiAgent',      icon: Bot,      label: 'AI Agent',     hotkey: 'A', category: 'AI',    description: 'LLM processing node' },
  { type: 'ttsNode',      icon: Volume2,  label: 'TTS',          hotkey: 'S', category: 'AI',    description: 'Text-to-speech audio' },
  { type: 'imageGen',     icon: Sparkles, label: 'Image Gen',    hotkey: 'G', category: 'GEN',   description: 'Generate image with AI' },
  { type: 'videoGenNode', icon: Video,    label: 'Video Gen',    hotkey: 'V', category: 'GEN',   description: 'Generate video clip' },
];

function RailNodeButton({ type, icon: Icon, label, hotkey, description, onAddNode }) {
  return (
    <Tooltip>
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
      <TooltipContent side="right" className="max-w-[160px]">
        <div className="font-medium">{label} · {hotkey}</div>
        <div className="text-[10px] text-foreground-secondary mt-0.5">{description}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function NodeRail({ onAddNode, onToggleAIGenerator }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="w-14 shrink-0 border-r border-border bg-background-secondary flex flex-col items-center py-2 gap-0.5">
      {/* Search button */}
      <Popover open={searchOpen} onOpenChange={setSearchOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                  'text-foreground-secondary hover:bg-background-tertiary hover:text-foreground',
                  'focus:outline-none focus:ring-2 focus:ring-accent',
                  searchOpen && 'bg-background-tertiary text-foreground'
                )}
                aria-label="Search node types"
              >
                <Search className="w-4 h-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Search nodes</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search node types..." />
            <CommandList>
              <CommandEmpty>No nodes found.</CommandEmpty>
              {CATEGORY_ORDER.map((cat) => (
                <CommandGroup key={cat} heading={CATEGORY_FULL_LABEL[cat]}>
                  {NODE_TYPES.filter((n) => n.category === cat).map(
                    ({ type, icon: Icon, label, hotkey, description }) => (
                      <CommandItem
                        key={type}
                        value={`${label} ${description}`}
                        onSelect={() => {
                          onAddNode(type);
                          setSearchOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 truncate">{label}</span>
                        <span className="text-[10px] text-foreground-tertiary ml-2 shrink-0">{hotkey}</span>
                      </CommandItem>
                    )
                  )}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Separator below search */}
      <div className="w-8 h-px bg-border my-1" />

      {/* Grouped node buttons by category */}
      {CATEGORY_ORDER.map((cat) => {
        const nodes = NODE_TYPES.filter((n) => n.category === cat);
        return (
          <div key={cat} className="flex flex-col items-center w-full gap-0.5">
            <div className="text-[9px] tracking-wider text-foreground-tertiary font-medium mt-1.5 mb-0.5 uppercase select-none">
              {cat}
            </div>
            {nodes.map((node) => (
              <RailNodeButton key={node.type} {...node} onAddNode={onAddNode} />
            ))}
          </div>
        );
      })}

      {/* Separator before AI Generate */}
      <div className="w-8 h-px bg-border my-1 mt-auto" />

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
        <TooltipContent side="right" className="max-w-[160px]">
          <div className="font-medium">Generate with AI</div>
          <div className="text-[10px] text-foreground-secondary mt-0.5">Auto-build workflow from description</div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
