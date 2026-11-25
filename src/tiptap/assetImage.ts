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
    return ReactNodeViewRenderer(AssetImageView, {
      // The editor ignores events from the image's own controls (toolbar, resize
      // handle) so using them never moves the selection off the image.
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null
        if (!target?.closest) return false
        if (target.closest('[data-image-controls]')) return true
        return ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName) && !event.type.startsWith('drag') && event.type !== 'drop'
      },
    })
  },
}).configure({ inline: true, allowBase64: false })
