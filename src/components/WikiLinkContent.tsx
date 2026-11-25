import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkHighlight } from '@/lib/remarkHighlight'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import { parseAssetSrc } from '@/db/assets'
import { findHashtags } from '@/lib/tags'
import { entityRoute } from '@/lib/wikiRoutes'
import { findWikiEntity, findWikiLinks } from '@/lib/wikiLinks'
import { AssetImageDisplay } from '@/components/AssetImageDisplay'
import type { WikiEntity } from '@/types'

interface Props {
  children: string
  className?: string
  wikiEntities?: WikiEntity[]
}

export function WikiLinkContent({ children, className, wikiEntities: propEntities }: Props) {
  const navigate = useNavigate()
  const loadedEntities = useWikiEntities()
  const wikiEntities = propEntities ?? loadedEntities

  const processed = useMemo(() => {
    // Links are matched the same way the editor colours them (findWikiEntity), and
    // both [[Name]] and the serializer's escaped \[\[Name\]\] are recognised.
    let out = children
    for (const link of findWikiLinks(children).reverse()) {
      const entity = findWikiEntity(wikiEntities, link.name)
      // The name stays as written (escapes and all) so markdown renders it as typed
      const md = entity ? `[${link.name}](${entityRoute(entity)})` : `**\\[\\[${link.name}\\]\\]**`
      out = out.slice(0, link.index) + md + out.slice(link.index + link.length)
    }
    // #tags become links to the Tags screen (rendered as chips by the `a` override below).
    // Replaced back-to-front so earlier offsets stay valid.
    for (const tag of findHashtags(out).reverse()) {
      out = out.slice(0, tag.index) +
        `[#${tag.name}](/tags?tag=${encodeURIComponent(tag.name)})` +
        out.slice(tag.index + tag.length)
    }
    return out
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
              return <AssetImageDisplay filename={parts.filename} width={parts.width} unit={parts.unit} display={parts.display} />
            }
            return <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} className="inline-block max-w-full rounded border border-border align-top" />
          },
          a({ href, children, ...props }) {
            // Internal app routes start with / — use SPA navigation, never a new tab
            if (href?.startsWith('/tags?tag=')) {
              return (
                <button type="button" onClick={() => navigate(href!)} className="hashtag cursor-pointer border-none font-[inherit] inline">
                  {children}
                </button>
              )
            }
            if (href?.startsWith('/')) {
              return (
                <button
                  type="button"
                  onClick={() => navigate(href!)}
                  className="text-blue-600 dark:text-blue-400 underline decoration-dotted hover:opacity-75 cursor-pointer bg-transparent border-none p-0 font-[inherit] inline"
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
