import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { Play, RotateCcw, ChevronUp, ChevronDown, Share2 } from 'lucide-react'
import { Panel, Group, Separator, usePanelRef } from 'react-resizable-panels'
import CodeEditor from './CodeEditor'
import CodePreview from './CodePreview'
import ConsolePanel from './ConsolePanel'
import ShareDialog from './ShareDialog'

/**
 * Main CodeCanvas component with tabbed editor, live preview, and console
 */
const CodeCanvas = memo(function CodeCanvas({
  initialCode = { html: '', css: '', js: '' },
  onClose
}) {
  // Code state
  const [code, setCode] = useState(initialCode)
  const [activeTab, setActiveTab] = useState('html')

  // Preview state (debounced)
  const [previewCode, setPreviewCode] = useState(initialCode)
  const debounceRef = useRef(null)

  // Console state
  const [logs, setLogs] = useState([])
  const [errors, setErrors] = useState([])

  // Track if code has been modified
  const [isModified, setIsModified] = useState(false)

  // Editor panel state for collapse/expand (using v4 API)
  const editorPanelRef = usePanelRef()
  const [isEditorCollapsed, setIsEditorCollapsed] = useState(false)

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false)

  // Tabs configuration
  const tabs = [
    { id: 'html', label: 'HTML' },
    { id: 'css', label: 'CSS' },
    { id: 'js', label: 'JS' }
  ]

  // Auto-detect which tab should be active based on initial code
  useEffect(() => {
    if (initialCode.html) {
      setActiveTab('html')
    } else if (initialCode.css) {
      setActiveTab('css')
    } else if (initialCode.js) {
      setActiveTab('js')
    }
  }, [])

  // Debounced preview update (500ms after typing stops)
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      setPreviewCode(code)
      // Clear previous errors when code changes
      setErrors([])
    }, 500)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [code])

  // Handle code change for a specific tab
  const handleCodeChange = useCallback((tab, value) => {
    setCode(prev => ({
      ...prev,
      [tab]: value
    }))
    setIsModified(true)
  }, [])

  // Handle manual run button
  const handleRun = useCallback(() => {
    setPreviewCode(code)
    setErrors([])
    setLogs([])
  }, [code])

  // Handle reset to original code
  const handleReset = useCallback(() => {
    setCode(initialCode)
    setPreviewCode(initialCode)
    setIsModified(false)
    setLogs([])
    setErrors([])
  }, [initialCode])

  // Handle console output from preview
  const handleConsole = useCallback((entry) => {
    setLogs(prev => [...prev, entry])
  }, [])

  // Handle errors from preview
  const handleError = useCallback((error) => {
    setErrors(prev => [...prev, error])
  }, [])

  // Clear console
  const handleClearConsole = useCallback(() => {
    setLogs([])
    setErrors([])
  }, [])

  // Toggle editor collapse/expand
  const toggleEditorCollapse = useCallback(() => {
    const panel = editorPanelRef.current
    if (panel) {
      if (panel.isCollapsed()) {
        panel.expand()
        setIsEditorCollapsed(false)
      } else {
        panel.collapse()
        setIsEditorCollapsed(true)
      }
    }
  }, [])

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header with tabs and actions */}
      <div className="flex items-center justify-between border-b border-border bg-background-secondary px-2 py-1.5">
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent text-white'
                  : 'text-foreground-secondary hover:text-foreground hover:bg-background-tertiary'
              }`}
            >
              {tab.label}
              {code[tab.id] && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-current inline-block opacity-50" />
              )}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleEditorCollapse}
            className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded transition-colors"
            title={isEditorCollapsed ? "Expand editor" : "Collapse editor"}
          >
            {isEditorCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={handleRun}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-white bg-success hover:bg-success/90 rounded transition-colors"
            title="Run code (Ctrl+Enter)"
          >
            <Play className="h-3.5 w-3.5" />
            Run
          </button>
          {isModified && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded transition-colors"
              title="Reset to original"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
          <button
            onClick={() => setShowShareDialog(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-foreground-secondary hover:text-foreground hover:bg-background-tertiary rounded transition-colors"
            title="Share canvas"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>
        </div>
      </div>

      {/* Main content - Resizable Editor and Preview */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Group orientation="vertical">
          {/* Editor Panel - Collapsible */}
          <Panel
            panelRef={editorPanelRef}
            collapsible
            collapsedSize={0}
            minSize={15}
            defaultSize={50}
          >
            <div className="h-full overflow-hidden">
              <CodeEditor
                value={code[activeTab] || ''}
                language={activeTab}
                onChange={(value) => handleCodeChange(activeTab, value)}
                height="100%"
              />
            </div>
          </Panel>

          {/* Resize Handle */}
          <Separator className="h-2 bg-border hover:bg-accent/50 cursor-row-resize flex items-center justify-center group">
            <div className="w-8 h-1 bg-foreground-tertiary rounded group-hover:bg-accent transition-colors" />
          </Separator>

          {/* Preview Panel */}
          <Panel minSize={20} defaultSize={50}>
            <div className="h-full p-2 bg-background-tertiary">
              <CodePreview
                html={previewCode.html}
                css={previewCode.css}
                js={previewCode.js}
                onConsole={handleConsole}
                onError={handleError}
              />
            </div>
          </Panel>
        </Group>
      </div>

      {/* Console */}
      <ConsolePanel
        logs={logs}
        errors={errors}
        onClear={handleClearConsole}
      />

      {/* Share Dialog */}
      {showShareDialog && (
        <ShareDialog
          code={code}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  )
})

export default CodeCanvas

// Helper function to parse HTML code and extract embedded CSS/JS
export const parseHtmlCode = (code, language) => {
  // If it's pure CSS or JS, return as-is
  if (language === 'css') {
    return { html: '', css: code, js: '' }
  }
  if (['javascript', 'js', 'jsx'].includes(language)) {
    return { html: '', css: '', js: code }
  }

  // For HTML, try to extract embedded style and script tags
  if (['html', 'htm'].includes(language)) {
    const cssMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    const jsMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/gi)

    let css = ''
    let js = ''
    let html = code

    // Extract CSS
    if (cssMatch) {
      cssMatch.forEach(match => {
        const content = match.replace(/<style[^>]*>/i, '').replace(/<\/style>/i, '')
        css += content + '\n'
        html = html.replace(match, '')
      })
    }

    // Extract JS
    if (jsMatch) {
      jsMatch.forEach(match => {
        const content = match.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '')
        js += content + '\n'
        html = html.replace(match, '')
      })
    }

    // Clean up HTML (remove doctype, html, head, body tags for inner content)
    html = html
      .replace(/<!DOCTYPE[^>]*>/i, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .trim()

    return {
      html: html.trim(),
      css: css.trim(),
      js: js.trim()
    }
  }

  // Default: treat as HTML
  return { html: code, css: '', js: '' }
}

// Helper to check if code is runnable
export const isRunnableCode = (language) => {
  const runnableLanguages = ['html', 'htm', 'css', 'javascript', 'js', 'jsx']
  return runnableLanguages.includes(language?.toLowerCase())
}
