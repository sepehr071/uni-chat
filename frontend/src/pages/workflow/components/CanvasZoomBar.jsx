import { useTranslation } from 'react-i18next';
import { useReactFlow } from 'reactflow';

export default function CanvasZoomBar() {
  const { t } = useTranslation('workflow');
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();

  return (
    <div className="absolute bottom-5 start-5 flex items-center bg-background border border-border rounded-lg shadow-sm z-10 overflow-hidden">
      <button
        onClick={() => zoomOut()}
        className="w-7 h-7 flex items-center justify-center text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors border-e border-border focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
        aria-label={t('zoomBar.zoomOut')}
      >
        −
      </button>
      <button
        onClick={() => zoomTo(1)}
        className="h-7 px-2 text-xs text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors border-e border-border focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
        aria-label={t('zoomBar.resetZoom')}
      >
        100%
      </button>
      <button
        onClick={() => zoomIn()}
        className="w-7 h-7 flex items-center justify-center text-sm text-foreground-secondary hover:bg-background-tertiary hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-accent"
        aria-label={t('zoomBar.zoomIn')}
      >
        +
      </button>
    </div>
  );
}
