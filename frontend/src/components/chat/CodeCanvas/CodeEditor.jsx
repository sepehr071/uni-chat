import { memo, useCallback } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { langs } from '@uiw/codemirror-extensions-langs'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'

/**
 * CodeMirror-based code editor with language support
 */
const CodeEditor = memo(function CodeEditor({
  value,
  language = 'html',
  onChange,
  height = '100%',
  readOnly = false
}) {
  // Get language extension based on language type
  const getExtension = useCallback((lang) => {
    switch (lang?.toLowerCase()) {
      case 'html':
      case 'htm':
        return langs.html()
      case 'css':
        return langs.css()
      case 'javascript':
      case 'js':
      case 'jsx':
        return langs.jsx()
      case 'typescript':
      case 'ts':
      case 'tsx':
        return langs.tsx()
      case 'json':
        return langs.json()
      default:
        return langs.html()
    }
  }, [])

  const handleChange = useCallback((val) => {
    if (onChange) {
      onChange(val)
    }
  }, [onChange])

  // Ensure value is never undefined (causes CodeMirror issues)
  const safeValue = value ?? ''

  return (
    <CodeMirror
      key={language}  // Force clean remount on language change to prevent extension issues
      value={safeValue}
      height={height}
      theme={vscodeDark}
      extensions={[getExtension(language)]}
      onChange={handleChange}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightSpecialChars: true,
        history: true,
        foldGutter: true,
        drawSelection: true,
        dropCursor: true,
        allowMultipleSelections: true,
        indentOnInput: true,
        syntaxHighlighting: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        rectangularSelection: true,
        crosshairCursor: false,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        closeBracketsKeymap: true,
        defaultKeymap: true,
        searchKeymap: true,
        historyKeymap: true,
        foldKeymap: true,
        completionKeymap: true,
        lintKeymap: true,
      }}
      className="h-full text-sm"
    />
  )
})

export default CodeEditor
