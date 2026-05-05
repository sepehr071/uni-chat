import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const NODE_ICON_MAP = {
  textInput: Type,
  imageUpload: Upload,
  aiAgent: Bot,
  ttsNode: Volume2,
  imageGen: Sparkles,
  videoGenNode: Video,
};

const NODE_HOTKEYS = {
  textInput: 'T',
  imageUpload: 'I',
  aiAgent: 'A',
  ttsNode: 'S',
  imageGen: 'G',
  videoGenNode: 'V',
};

const NODE_CATEGORIES = {
  textInput: 'INPUT',
  imageUpload: 'INPUT',
  aiAgent: 'AI',
  ttsNode: 'AI',
  imageGen: 'GEN',
  videoGenNode: 'GEN',
};

function RailNodeButton({ type, icon: Icon, label, hotkey, description, onAddNode }) {
  const { t } = useTranslation('workflow');
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
          aria-label={t('nodeRail.addNode', { label })}
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
  const { t } = useTranslation('workflow');
  const [searchOpen, setSearchOpen] = useState(false);

  const NODE_TYPES = Object.keys(NODE_ICON_MAP).map((type) => ({
    type,
    icon: NODE_ICON_MAP[type],
    label: t(`nodeRail.nodes.${type}.label`),
    hotkey: NODE_HOTKEYS[type],
    category: NODE_CATEGORIES[type],
    description: t(`nodeRail.nodes.${type}.description`),
  }));

  return (
    <div className="w-14 shrink-0 border-e border-border bg-background-secondary flex flex-col items-center py-2 gap-0.5">
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
                aria-label={t('nodeRail.searchNodes')}
              >
                <Search className="w-4 h-4" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{t('nodeRail.searchNodes')}</TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="start" className="w-64 p-0">
          <Command>
            <CommandInput placeholder={t('nodeRail.searchPlaceholder')} />
            <CommandList>
              <CommandEmpty>{t('nodeRail.noNodesFound')}</CommandEmpty>
              {CATEGORY_ORDER.map((cat) => (
                <CommandGroup key={cat} heading={t(`nodeRail.categories.${cat}`)}>
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
                        <span className="text-[10px] text-foreground-tertiary ms-2 shrink-0">{hotkey}</span>
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
            aria-label={t('nodeRail.generateWithAI')}
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[160px]">
          <div className="font-medium">{t('nodeRail.generateWithAI')}</div>
          <div className="text-[10px] text-foreground-secondary mt-0.5">{t('nodeRail.generateDescription')}</div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
