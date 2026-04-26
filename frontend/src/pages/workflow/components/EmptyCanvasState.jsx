import { Type, Upload, Bot, Sparkles, Volume2, Video } from 'lucide-react';

const HOTKEYS = [
  { key: 'T', label: 'Text Input',   icon: Type },
  { key: 'I', label: 'Image Upload', icon: Upload },
  { key: 'A', label: 'AI Agent',     icon: Bot },
  { key: 'G', label: 'Image Gen',    icon: Sparkles },
  { key: 'S', label: 'TTS',          icon: Volume2 },
  { key: 'V', label: 'Video Gen',    icon: Video },
];

export default function EmptyCanvasState() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="text-center max-w-md px-6">
        <h2 className="text-lg font-medium text-foreground mb-1">
          Start building your workflow
        </h2>
        <p className="text-sm text-foreground-secondary mb-6">
          Drag a node from the left rail or press a hotkey
        </p>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-left">
          {HOTKEYS.map(({ key, label, icon: Icon }) => (
            <li key={key} className="flex items-center gap-2 text-xs text-foreground-secondary">
              <Icon className="w-3.5 h-3.5 opacity-70" />
              <span className="flex-1">{label}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-secondary font-mono text-[10px]">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
