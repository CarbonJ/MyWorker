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
export function MarkdownContent({ children, className }: Props) {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
