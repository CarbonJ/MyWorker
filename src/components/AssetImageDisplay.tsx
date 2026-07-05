import { useEffect, useState } from 'react'
import { ImageOff, Paperclip } from 'lucide-react'
import { getAssetUrl, type AssetDisplay } from '@/db/assets'

interface Props {
  filename: string
  width: number
  display: AssetDisplay
  /** Extra classes for the rendered image (e.g. selection ring in the editor). */
  imgClassName?: string
}

/**
 * Shared read/display rendering for a pasted image asset. Resolves the file
 * from the assets folder to an object URL, then renders either an inline image
 * (scaled to `width`% of the container) or a compact link chip. Clicking opens
 * a full-size lightbox overlay. Editing controls live in the editor node view,
 * not here.
 */
export function AssetImageDisplay({ filename, width, display, imgClassName }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [lightbox, setLightbox] = useState(false)

  useEffect(() => {
    let active = true
    getAssetUrl(filename)
      .then(u => { if (active) { setUrl(u); setFailed(!u) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [filename])

  if (failed) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded border border-dashed border-muted-foreground/40 px-2 py-1 text-xs text-muted-foreground align-middle"
        title={`Image unavailable — open this note in Edge/Chrome with a storage folder (${filename})`}
      >
        <ImageOff className="h-3.5 w-3.5" />
        Image unavailable
      </span>
    )
  }

  if (display === 'link') {
    return (
      <>
        <button
          type="button"
          onClick={() => url && setLightbox(true)}
          className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-xs text-foreground hover:opacity-80 align-middle max-w-full"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{filename}</span>
        </button>
        {lightbox && url && <Lightbox url={url} onClose={() => setLightbox(false)} />}
      </>
    )
  }

  return (
    <>
      {url ? (
        <img
          src={url}
          alt={filename}
          onClick={() => setLightbox(true)}
          style={{ width: `${width}%` }}
          className={`inline-block max-w-full cursor-zoom-in rounded border border-border align-top ${imgClassName ?? ''}`}
        />
      ) : (
        <span
          className="inline-block rounded border border-border bg-muted/40 animate-pulse align-top"
          style={{ width: `${width}%`, aspectRatio: '4 / 3' }}
        />
      )}
      {lightbox && url && <Lightbox url={url} onClose={() => setLightbox(false)} />}
    </>
  )
}

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 cursor-zoom-out"
    >
      <img src={url} alt="" className="max-h-full max-w-full rounded shadow-2xl" />
    </div>
  )
}
