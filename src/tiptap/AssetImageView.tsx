import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ImageIcon, Link2, Trash2 } from 'lucide-react'
import { AssetImageDisplay } from '@/components/AssetImageDisplay'
import { parseAssetSrc, buildAssetSrc, deleteAssetImage } from '@/db/assets'

/**
 * Editor node view for a pasted image. Renders the shared display component and
 * overlays a small toolbar (link/image toggle, width slider, delete) when the
 * node is selected. Display state is encoded in the node `src` so it round-trips
 * through markdown serialization; delete removes both the node and the file.
 */
export function AssetImageView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const src: string = node.attrs.src ?? ''
  const parts = parseAssetSrc(src)
  const editable = editor.isEditable

  // Non-asset image (e.g. a pasted external URL) — render plainly, no controls.
  if (!parts) {
    return (
      <NodeViewWrapper as="span" className="inline-block align-top">
        <img src={src} alt={node.attrs.alt ?? ''} className="inline-block max-w-full rounded border border-border" />
      </NodeViewWrapper>
    )
  }

  const { filename, width, display } = parts

  const setWidth = (w: number) => updateAttributes({ src: buildAssetSrc(filename, w, 'image') })
  const toggleDisplay = () =>
    updateAttributes({ src: buildAssetSrc(filename, width, display === 'link' ? 'image' : 'link') })
  const remove = () => {
    deleteAssetImage(filename).catch(() => {})
    deleteNode()
  }

  return (
    <NodeViewWrapper as="span" className="relative inline-block align-top" data-drag-handle>
      <span className={selected ? 'ring-2 ring-primary rounded inline-block' : 'inline-block'}>
        <AssetImageDisplay filename={filename} width={width} display={display} />
      </span>

      {editable && selected && (
        <span
          contentEditable={false}
          className="absolute left-1 top-1 z-10 flex items-center gap-1 rounded-md border border-border bg-popover/95 px-1.5 py-1 shadow-md backdrop-blur"
        >
          <button
            type="button"
            onClick={toggleDisplay}
            title={display === 'link' ? 'Show as image' : 'Show as link'}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            {display === 'link' ? <ImageIcon className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          </button>
          {display === 'image' && (
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              title={`Width: ${width}%`}
              className="h-1 w-24 cursor-pointer accent-primary"
            />
          )}
          <button
            type="button"
            onClick={remove}
            title="Delete image (removes the file)"
            className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-accent"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  )
}
