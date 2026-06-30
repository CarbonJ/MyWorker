import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import type { WikiEntity } from '@/types'

interface Props {
  children: string
  className?: string
  wikiEntities?: WikiEntity[]
}

function entityToRoute(entity: WikiEntity): string {
  switch (entity.type) {
    case 'page': return `/notebook?page=${entity.id}`
    case 'project': return `/projects/${entity.id}`
    case 'contact': return `/contacts`
    case 'area': return `/`
  }
}

export function WikiLinkContent({ children, className, wikiEntities: propEntities }: Props) {
  const navigate = useNavigate()
  const loadedEntities = useWikiEntities()
  const wikiEntities = propEntities ?? loadedEntities

  const processed = useMemo(() => {
    // tiptap-markdown escapes [ as \[ — normalize before scanning for wiki links
    const normalized = children.replace(/\\\[/g, '[').replace(/\\\]/g, ']')
    return normalized.replace(/\[\[([^\]]+)\]\]/g, (_, name: string) => {
      const entity = wikiEntities.find(e => e.name.toLowerCase() === name.trim().toLowerCase())
      if (entity) return `[${name}](wikilink:${entityToRoute(entity)})`
      return `**[[${name}]]**`
    })
  }, [children, wikiEntities])

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            if (href?.startsWith('wikilink:')) {
              const route = href.slice('wikilink:'.length)
              return (
                <button
                  type="button"
                  onClick={() => navigate(route)}
                  className="text-primary underline decoration-dotted hover:opacity-75 cursor-pointer bg-transparent border-none p-0 font-[inherit] text-[inherit] inline"
                >
                  {children}
                </button>
              )
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:opacity-80 break-all"
                {...props}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
