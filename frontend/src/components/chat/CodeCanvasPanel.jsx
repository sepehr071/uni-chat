import { useEffect, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRailData } from '../../context/RailDataContext'
import CodeCanvas from './CodeCanvas'

/**
 * Code Canvas tab body.
 *
 * RightRail owns width / collapse / chrome — this component is just the
 * `<CodeCanvas>` editor + iframe inside a flex column. Reads its current
 * code payload from RailDataContext (ChatPage pushes there when a user
 * hits "Run" on an HTML/CSS/JS block or `/canvas` fires).
 *
 * Iframe sandbox is owned by `CodeCanvas/CodePreview.jsx` and stays at
 * `sandbox="allow-scripts"` — DO NOT add `allow-same-origin` (security
 * regression per CLAUDE.md Code Canvas notes).
 */
const CodeCanvasPanel = memo(function CodeCanvasPanel() {
  const { t } = useTranslation('chat')
  const { codeCanvasCode, codeCanvasOpen, onCloseCanvas } = useRailData()

  // Escape key still closes — but inside the rail, "close" means "go back to
  // Helper tab". RightRail handles the tab switch; we just signal intent.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && codeCanvasOpen && onCloseCanvas) {
        onCloseCanvas()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [codeCanvasOpen, onCloseCanvas])

  return (
    <div className="flex h-full flex-col">
      {/* Compact header — just a label. Closing the panel = switch back to
          Helper tab via RailTabs; no separate close button needed here. */}
      <div className="flex items-center px-3 py-2 border-b border-line bg-background-secondary">
        <span className="text-sm font-semibold text-foreground">
          {t('codeCanvas.title')}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeCanvas
          initialCode={codeCanvasCode || { html: '', css: '', js: '' }}
          onClose={onCloseCanvas || (() => {})}
        />
      </div>
    </div>
  )
})

export default CodeCanvasPanel
