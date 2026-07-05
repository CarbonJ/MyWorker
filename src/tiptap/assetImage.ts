import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { AssetImageView } from './AssetImageView'

/**
 * Inline image node with a React node view for pasted asset images.
 *
 * `inline: true` matches markdown's inline-image semantics so images round-trip
 * cleanly through tiptap-markdown (which serializes/parses a node named `image`
 * as `![alt](src)` out of the box). All display state (width, link vs image) is
 * carried in the `src` query string, so the default src/alt/title attributes are
 * all that need to persist.
 */
export const AssetImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AssetImageView)
  },
}).configure({ inline: true, allowBase64: false })
