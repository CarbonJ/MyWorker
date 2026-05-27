import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  children: string
  className?: string
}

/**
 * Renders markdown text as formatted HTML.
 * Uses remark-gfm for GitHub Flavoured Markdown support:
 * tables, task lists (- [ ]), strikethrough, autolinks.
 */
const components = {
  a: ({ href, children }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:opacity-80 break-all">{children}</a>
  ),
}

export function MarkdownContent({ children, className }: Props) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
