import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import { Highlight, themes } from 'prism-react-renderer'
import { Copy, Check, Download, ExternalLink, ZoomIn } from 'lucide-react'
import { useState, memo } from 'react'
import toast from 'react-hot-toast'
import 'katex/dist/katex.min.css'

const MarkdownRenderer = memo(function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex]}
      components={{
        code: CodeBlock,
        pre: ({ children }) => <>{children}</>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse">{children}</table>
          </div>
        ),
        img: ImageRenderer,
      }}
    >
      {content}
    </ReactMarkdown>
  )
})

export default MarkdownRenderer

const ImageRenderer = memo(function ImageRenderer({ src, alt }) {
  const [isZoomed, setIsZoomed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleDownload = async () => {
    try {
      const response = await fetch(src)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = alt || 'image'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Image downloaded')
    } catch (err) {
      toast.error('Failed to download image')
    }
  }

  const handleOpenNew = () => {
    window.open(src, '_blank')
  }

  if (hasError) {
    return (
      <div className="my-4 p-4 bg-background-tertiary rounded-lg text-foreground-secondary text-sm">
        Failed to load image
      </div>
    )
  }

  return (
    <>
      <div className="relative my-4 group inline-block max-w-full">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background-tertiary rounded-lg">
            <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <img
          src={src}
          alt={alt}
          className="max-w-full rounded-lg cursor-zoom-in transition-opacity"
          style={{ opacity: isLoading ? 0 : 1 }}
          loading="lazy"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false)
            setHasError(true)
          }}
          onClick={() => setIsZoomed(true)}
        />

        {/* Action buttons overlay */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm"
            title="Download"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={handleOpenNew}
            className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm"
            title="Open in new tab"
          >
            <ExternalLink className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsZoomed(true)}
            className="p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm"
            title="Zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        {/* Alt text */}
        {alt && (
          <div className="absolute bottom-0 left-0 right-0 px-3 py-1.5 text-xs text-white bg-black/50 backdrop-blur-sm rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity truncate">
            {alt}
          </div>
        )}
      </div>

      {/* Zoomed modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleDownload()
              }}
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              title="Download"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleOpenNew()
              }}
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20"
              title="Open in new tab"
            >
              <ExternalLink className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
})

const CodeBlock = memo(function CodeBlock({ node, inline, className, children, ...props }) {
  const [copied, setCopied] = useState(false)
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const code = String(children).replace(/\n$/, '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  if (inline) {
    return (
      <code className="rounded bg-background-tertiary px-1.5 py-0.5 text-accent font-mono text-sm" {...props}>
        {children}
      </code>
    )
  }

  return (
    <div className="group my-4 rounded-lg overflow-hidden border border-border">
      {/* Language badge and copy button */}
      <div className="flex items-center justify-between px-4 py-2 bg-background-tertiary border-b border-border">
        <span className="text-xs text-foreground-secondary font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-foreground-secondary hover:text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-success" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code block with prism-react-renderer */}
      <Highlight
        theme={themes.oneDark}
        code={code}
        language={language || 'text'}
      >
        {({ className: highlightClassName, style, tokens, getLineProps, getTokenProps }) => (
          <pre
            className={highlightClassName}
            style={{
              ...style,
              margin: 0,
              padding: '1rem',
              background: '#1e1e1e',
              overflow: 'auto',
              fontSize: '0.875rem',
              lineHeight: '1.5',
            }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  )
})
