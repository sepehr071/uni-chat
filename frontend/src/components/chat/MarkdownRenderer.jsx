import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

export default function MarkdownRenderer({ content }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
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
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt}
            className="max-w-full rounded-lg my-4"
            loading="lazy"
          />
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function CodeBlock({ node, inline, className, children, ...props }) {
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
    <div className="relative group my-4">
      {/* Language badge and copy button */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-background-tertiary/50 rounded-t-lg border-b border-border">
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

      {/* Code block */}
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        className="!mt-0 !rounded-t-none !bg-background-tertiary"
        customStyle={{
          margin: 0,
          marginTop: '36px',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          background: '#252525',
        }}
        {...props}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
