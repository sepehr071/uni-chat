import { useEffect, useRef, memo } from 'react'

/**
 * Helper to escape closing tags that would break srcdoc
 * Prevents user code containing </script> or </style> from breaking HTML structure
 */
const escapeClosingTags = (code, tag) => {
  if (!code) return ''
  const regex = new RegExp(`</${tag}>`, 'gi')
  return code.replace(regex, `<\\/${tag}>`)
}

/**
 * Sandboxed iframe preview for HTML/CSS/JS code
 * Uses srcdoc for secure, instant preview without server
 */
const CodePreview = memo(function CodePreview({ html, css, js, onConsole, onError }) {
  const iframeRef = useRef(null)

  // Generate full HTML document with console/error capture
  const generatePreviewDoc = () => {
    // Escape closing tags to prevent breaking out of script/style blocks
    const safeCSS = escapeClosingTags(css, 'style')
    const safeJS = escapeClosingTags(js, 'script')

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Reset styles */
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: system-ui, -apple-system, sans-serif;
      background: white;
      color: #1a1a1a;
    }
    /* User CSS */
    ${safeCSS}
  </style>
</head>
<body>
  ${html}
  <script>
    // Console capture - send to parent
    const originalConsole = { ...console };
    ['log', 'warn', 'error', 'info'].forEach(method => {
      console[method] = (...args) => {
        const formatted = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        });
        parent.postMessage({
          type: 'console',
          method,
          args: formatted,
          timestamp: Date.now()
        }, '*');
        originalConsole[method](...args);
      };
    });

    // Error capture
    window.onerror = (msg, url, line, col, error) => {
      parent.postMessage({
        type: 'error',
        message: msg,
        line,
        col,
        stack: error?.stack
      }, '*');
      return false; // Allow errors to also show in browser console for debugging
    };

    // Unhandled promise rejection
    window.onunhandledrejection = (event) => {
      parent.postMessage({
        type: 'error',
        message: 'Unhandled Promise Rejection: ' + event.reason,
        line: 0,
        col: 0
      }, '*');
    };

    // User JavaScript - wrapped in DOMContentLoaded for safety
    // This ensures DOM elements are available when user code runs
    function runUserCode() {
      try {
        ${safeJS}
      } catch(e) {
        console.error(e.message);
        parent.postMessage({
          type: 'error',
          message: e.message,
          line: e.lineNumber || 0,
          col: e.columnNumber || 0,
          stack: e.stack
        }, '*');
      }
    }

    // Check if DOM is already ready, otherwise wait for DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', runUserCode);
    } else {
      runUserCode();
    }
  </script>
</body>
</html>`
  }

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event) => {
      // Only accept messages from our iframe
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        const { type, method, args, message, line, col, timestamp } = event.data

        if (type === 'console' && onConsole) {
          onConsole({ method, args, timestamp })
        } else if (type === 'error' && onError) {
          onError({ message, line, col })
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [onConsole, onError])

  // Update iframe content when code changes
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = generatePreviewDoc()
    }
  }, [html, css, js])

  return (
    <div className="h-full w-full bg-white rounded-lg overflow-hidden">
      <iframe
        ref={iframeRef}
        title="Code Preview"
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-full border-0"
        srcDoc={generatePreviewDoc()}
      />
    </div>
  )
})

export default CodePreview
