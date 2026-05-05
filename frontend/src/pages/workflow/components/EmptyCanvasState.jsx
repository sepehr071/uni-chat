import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Type, Upload, Bot, Sparkles, Volume2, Video, Wand2, LayoutTemplate, Wrench } from 'lucide-react';
import { cn } from '../../../utils/cn';

const NODE_TYPE_ICONS = {
  textInput: Type,
  imageUpload: Upload,
  aiAgent: Bot,
  imageGen: Sparkles,
  ttsNode: Volume2,
  videoGenNode: Video,
};

const NODE_HOTKEYS = {
  textInput: 'T',
  imageUpload: 'I',
  aiAgent: 'A',
  imageGen: 'G',
  ttsNode: 'S',
  videoGenNode: 'V',
};

function SplashCard({ icon: Icon, title, description, onClick, className }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-3 rounded-xl border border-border bg-background-secondary',
        'p-5 text-start transition-all duration-150 pointer-events-auto',
        'hover:border-accent hover:bg-background-tertiary hover:shadow-md',
        'focus:outline-none focus:ring-2 focus:ring-accent',
        className
      )}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-accent/10 text-accent">
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-foreground-secondary mt-0.5">{description}</div>
      </div>
    </button>
  );
}

export default function EmptyCanvasState({ onOpenAIGenerator, onOpenTemplates }) {
  const { t } = useTranslation('workflow');
  const [showHotkeys, setShowHotkeys] = useState(false);

  const nodeTypes = Object.keys(NODE_TYPE_ICONS).map((type) => ({
    type,
    icon: NODE_TYPE_ICONS[type],
    hotkey: NODE_HOTKEYS[type],
    label: t(`nodeRail.nodes.${type}.label`),
    description: t(`nodeRail.nodes.${type}.description`),
  }));

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="max-w-lg w-full px-6">
        <h2 className="text-base font-semibold text-foreground text-center mb-1">
          {t('emptyCanvas.title')}
        </h2>
        <p className="text-xs text-foreground-secondary text-center mb-6">
          {t('emptyCanvas.subtitle')}
        </p>

        {!showHotkeys ? (
          <div className="grid grid-cols-3 gap-3">
            <SplashCard
              icon={Wand2}
              title={t('emptyCanvas.startFromBrief')}
              description={t('emptyCanvas.startFromBriefDesc')}
              onClick={onOpenAIGenerator}
            />
            <SplashCard
              icon={LayoutTemplate}
              title={t('emptyCanvas.browseTemplates')}
              description={t('emptyCanvas.browseTemplatesDesc')}
              onClick={onOpenTemplates}
            />
            <SplashCard
              icon={Wrench}
              title={t('emptyCanvas.manualBuilder')}
              description={t('emptyCanvas.manualBuilderDesc')}
              onClick={() => setShowHotkeys(true)}
            />
          </div>
        ) : (
          <div className="pointer-events-auto">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-start">
              {nodeTypes.map(({ type, hotkey, label, description, icon: Icon }) => (
                <li key={type} className="flex items-center gap-2 text-xs text-foreground-secondary">
                  <Icon className="w-3.5 h-3.5 opacity-70 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="block text-foreground-secondary/70 truncate">{description}</span>
                  </span>
                  <kbd className="px-1.5 py-0.5 rounded bg-background-tertiary text-foreground-secondary font-mono text-[10px] shrink-0">
                    {hotkey}
                  </kbd>
                </li>
              ))}
            </ul>
            <button
              onClick={() => setShowHotkeys(false)}
              className="mt-4 text-xs text-foreground-secondary hover:text-foreground transition-colors block mx-auto"
            >
              {t('emptyCanvas.backToOptions')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
