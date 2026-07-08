/**
 * remark plugin: render `==text==` as `<mark>text</mark>`.
 *
 * remark-gfm has no highlight syntax, so without this the read-only markdown renderer
 * (WikiLinkContent / MarkdownContent) shows the literal "==text==" even though the TipTap
 * editor renders it highlighted (via markdown-it-mark) and the note export converts it too.
 * This keeps the read view in sync. `<mark>` is already styled in index.css (`.prose mark`).
 */

interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: Record<string, unknown>
}

const HIGHLIGHT_RE = /==([^=]+)==/g

export function remarkHighlight() {
  return (tree: MdNode) => transform(tree)
}

function transform(node: MdNode): void {
  if (!node.children) return
  const next: MdNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('==')) {
      next.push(...split(child.value))
    } else {
      transform(child)
      next.push(child)
    }
  }
  node.children = next
}

function split(value: string): MdNode[] {
  const out: MdNode[] = []
  let last = 0
  HIGHLIGHT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = HIGHLIGHT_RE.exec(value)) !== null) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    // Unknown node type → mdast-util-to-hast uses data.hName/hChildren to build the element.
    out.push({
      type: 'highlight',
      data: { hName: 'mark', hChildren: [{ type: 'text', value: m[1] }] },
    })
    last = HIGHLIGHT_RE.lastIndex
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out.length ? out : [{ type: 'text', value }]
}
