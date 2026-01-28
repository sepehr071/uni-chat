import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { X, GripVertical } from 'lucide-react'
import CodeCanvas from './index'

/**
 * Resizable side panel for Code Canvas
 */
const CodeCanvasPanel = memo(function CodeCanvasPanel({
  isOpen,
  onClose,
  initialCode = { html: '', css: '', js: '' }
}) {
  // Panel width state (persisted in localStorage)
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('codeCanvasPanelWidth')
    return saved ? parseInt(saved, 10) : 450
  })

  // Dragging state
  const [isDragging, setIsDragging] = useState(false)
  const panelRef = useRef(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  // Min/max width constraints
  const MIN_WIDTH = 300
  const MAX_WIDTH = 800

  // Handle resize drag start
  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
    startXRef.current = e.clientX
    startWidthRef.current = width
  }, [width])

  // Handle resize drag
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      const delta = startXRef.current - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidthRef.current + delta))
      setWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // Save width to localStorage
      localStorage.setItem('codeCanvasPanelWidth', width.toString())
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, width])

  // Handle keyboard shortcut to close (Escape)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay for drag events (prevents iframe from capturing mouse) */}
      {isDragging && (
        <div className="fixed inset-0 z-40 cursor-col-resize" />
      )}

      {/* Panel */}
      <div
        ref={panelRef}
        className="h-full flex-shrink-0 border-l border-border bg-background flex flex-col relative"
        style={{ width: `${width}px` }}
      >
        {/* Resize handle */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group z-10 ${
            isDragging ? 'bg-accent' : 'hover:bg-accent/50'
          }`}
          onMouseDown={handleDragStart}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 p-1 rounded bg-background-secondary border border-border opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-4 w-4 text-foreground-secondary" />
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-background-secondary">
          <span className="text-sm font-semibold text-foreground">Code Canvas</span>
          <button
            onClick={onClose}
            className="p-1 hover:bg-background-tertiary rounded text-foreground-secondary hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <CodeCanvas
            initialCode={initialCode}
            onClose={onClose}
          />
        </div>
      </div>
    </>
  )
})

export default CodeCanvasPanel
