import { useTranslation } from 'react-i18next';
import { Plus, Copy, Trash2, Type, Upload, Bot, Sparkles, Volume2, Video } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '../../../utils/cn';

const NODE_TYPE_KEYS = [
  { type: 'textInput',    icon: Type     },
  { type: 'imageUpload',  icon: Upload   },
  { type: 'aiAgent',      icon: Bot      },
  { type: 'imageGen',     icon: Sparkles },
  { type: 'ttsNode',      icon: Volume2  },
  { type: 'videoGenNode', icon: Video    },
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
  const { t } = useTranslation('workflow');

  return (
    <div className="absolute bottom-5 start-1/2 -translate-x-1/2 flex items-center gap-1 bg-background border border-border rounded-xl shadow-md p-1 z-10">
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
                aria-label={t('commandBar.addNode')}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t('commandBar.addNodeHotkey')}</TooltipContent>
        </Tooltip>
        <PopoverContent side="top" align="center" className="w-44 p-1">
          {NODE_TYPE_KEYS.map(({ type, icon: Icon }) => (
            <button
              key={type}
              onClick={() => onAddNode(type)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md hover:bg-background-tertiary text-foreground-secondary hover:text-foreground transition-colors"
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {t(`commandBar.nodeTypes.${type}`)}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <BarButton
        icon={Copy}
        label={t('commandBar.duplicate')}
        hotkey="⌘D"
        onClick={onDuplicate}
        disabled={!selectedNodeId}
      />

      <BarButton
        icon={Trash2}
        label={t('commandBar.delete')}
        hotkey="⌫"
        onClick={onDelete}
        disabled={!selectedNodeId}
      />
    </div>
  );
}
