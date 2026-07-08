import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkHighlight } from '@/lib/remarkHighlight'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import { parseAssetSrc } from '@/db/assets'
import { AssetImageDisplay } from '@/components/AssetImageDisplay'
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
      if (entity) return `[${name}](${entityToRoute(entity)})`
      return `**[[${name}]]**`
    })
  }, [children, wikiEntities])

  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkHighlight]}
        // Preserve the custom asset:// scheme (react-markdown strips unknown schemes by default).
        urlTransform={(url) => (url.startsWith('asset://') ? url : defaultUrlTransform(url))}
        components={{
          img({ src, alt }) {
            const parts = parseAssetSrc(typeof src === 'string' ? src : '')
            if (parts) {
              return <AssetImageDisplay filename={parts.filename} width={parts.width} display={parts.display} />
            }
            return <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="inline-block max-w-full rounded border border-border align-top" />
          },
          a({ href, children, ...props }) {
            // Internal app routes start with / — use SPA navigation, never a new tab
            if (href?.startsWith('/')) {
              return (
                <button
                  type="button"
                  onClick={() => navigate(href!)}
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
