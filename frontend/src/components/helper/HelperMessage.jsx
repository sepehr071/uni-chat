import ReactMarkdown from 'react-markdown'
import { cn } from '../../utils/cn'
import HelperDeepLink from './HelperDeepLink'

/**
 * Single helper message renderer.
 *
 * - `role: 'user'` → right-aligned bubble (`ms-auto` flips correctly in RTL).
 * - `role: 'assistant'` → left-aligned, transparent background.
 *
 * Internal markdown links (`href` starts with `/`) become `<HelperDeepLink>`
 * (React Router navigation). External links render as `<a target="_blank">`
 * with `rel="noopener noreferrer"`.
 */
export default function HelperMessage({ role, content }) {
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="ms-auto max-w-[85%] rounded-2xl rounded-ee-sm bg-accent/15 px-3 py-2 text-sm text-foreground">
        <div className="whitespace-pre-wrap break-words leading-relaxed">{content}</div>
      </div>
    )
  }

  return (
    <div className="me-auto max-w-full text-sm text-foreground leading-relaxed">
      <div
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none',
          // Tighten default markdown spacing for the rail's narrow column
          '[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5',
          '[&_pre]:my-2 [&_pre]:text-xs',
          '[&_code]:text-xs [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-background-tertiary',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
        )}
      >
        <ReactMarkdown
          components={{
            a: ({ href, children, ...rest }) => {
              if (typeof href === 'string' && href.startsWith('/')) {
                return <HelperDeepLink to={href}>{children}</HelperDeepLink>
              }
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                  {...rest}
                >
                  {children}
                </a>
              )
            },
          }}
        >
          {content || ''}
        </ReactMarkdown>
      </div>
    </div>
  )
}
