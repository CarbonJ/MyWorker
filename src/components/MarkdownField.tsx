import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import { Label } from '@/components/ui/label'
import type { WikiEntity } from '@/types'
import { Maximize2, Fullscreen, Minimize2, Bold, Italic, Heading1, Heading2, Heading3, Pilcrow, Code2, Highlighter, Strikethrough, Code, Quote, ListChecks, List, ListOrdered } from 'lucide-react'
import { Table as TipTapTable, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { ToolbarBtn, TableInsertPopover, TableControlsRow } from '@/components/MarkdownTableControls'
import Highlight from '@tiptap/extension-highlight'
import Typography from '@tiptap/extension-typography'
import markdownItMark from 'markdown-it-mark'
import { toast } from 'sonner'
import { AssetImage } from '@/tiptap/assetImage'
import { assetsSupported, saveAssetImage, buildAssetSrc, DEFAULT_ASSET_WIDTH } from '@/db/assets'

// Extend Highlight with tiptap-markdown serializer so ==text== roundtrips correctly.
const HighlightMarkdown = Highlight.extend({
  addStorage() {
    return {
      markdown: {
        serialize: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
        parse: {
          setup(md: { use: (plugin: unknown) => void }) {
            md.use(markdownItMark)
          },
        },
      },
    }
  },
})

// ProseMirror decoration plugin: highlights [[Name]] as blue (live) or muted (dead).
// Takes a ref so it always reads the latest entity list without needing to be recreated.
function createWikiLinkDecorationExtension(entitiesRef: React.MutableRefObject<WikiEntity[]>) {
  return Extension.create({
    name: 'wikiLinkDecoration',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('wikiLinkDecoration'),
          props: {
            decorations(state) {
              const decorations: Decoration[] = []
              const entities = entitiesRef.current
              const pattern = /\[\[([^\]]+)\]\]/g
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return
                pattern.lastIndex = 0
                let match: RegExpExecArray | null
                while ((match = pattern.exec(node.text)) !== null) {
                  const name = match[1]
                  const isLive = entities.some(e => e.name.toLowerCase() === name.trim().toLowerCase())
                  decorations.push(
                    Decoration.inline(
                      pos + match.index,
                      pos + match.index + match[0].length,
                      { class: `wiki-link ${isLive ? 'wiki-link-live' : 'wiki-link-dead'}`, title: `Go to: ${name}` }
                    )
                  )
                }
              })
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
      ]
    },
  })
}

// Paste plain text as block-level markdown so bullets, headings, etc. parse correctly
// instead of landing as a plain paragraph and getting characters escaped on serialization.
// Shift+paste bypasses this for literal plain-text paste (standard browser behaviour).
const MarkdownBlockPasteExtension = Extension.create({
  name: 'markdownBlockPaste',
  addProseMirrorPlugins() {
    const editor = this.editor
    return [
      new Plugin({
        key: new PluginKey('markdownBlockPaste'),
        props: {
          handlePaste: (view, event) => {
            // Image paste takes priority: store the file in the assets folder and
            // insert an inline asset image node. Requires a storage folder (Edge/Chrome).
            const items = event.clipboardData?.items
            const imageItem = items && Array.from(items).find(it => it.type.startsWith('image/'))
            if (imageItem) {
              const file = imageItem.getAsFile()
              if (file) {
                event.preventDefault()
                if (!assetsSupported()) {
                  toast.error('Pasting images needs a storage folder — open in Edge/Chrome and pick a folder in Settings → Data.')
                  return true
                }
                saveAssetImage(file)
                  .then(filename => {
                    editor.chain().focus().insertContent({
                      type: 'image',
                      attrs: { src: buildAssetSrc(filename, DEFAULT_ASSET_WIDTH, 'image') },
                    }).run()
                  })
                  .catch(err => toast.error(`Failed to save image: ${err instanceof Error ? err.message : String(err)}`))
                return true
              }
            }
            const text = event.clipboardData?.getData('text/plain')
            if (!text) return false
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const html = (editor.storage as any).markdown.parser.parse(text)
            const el = document.createElement('div')
            el.innerHTML = html
            const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(el, { preserveWhitespace: true })
            view.dispatch(view.state.tr.replaceSelection(slice))
            return true
          },
        },
      }),
    ]
  },
})

type SizeMode = 'default' | 'large' | 'fullscreen'

// Unescape patterns that prosemirror-markdown escapes unnecessarily.
// 1. Bracket-escaped link patterns: \[text\](url) → [text](url)
// 2. Escaped horizontal rules: \--- → ---  (Espanso templates paste --- and it gets escaped)
// 3. Escaped list markers at line start: \- → -
// 4. Escaped bracket characters: \[ → [  and  \] → ]  (wiki links, etc.)
const unescapeLinks = (s: string) =>
  s.replace(/\\\[([^\]\\]+)\\\]\(([^)]+)\)/g, '[$1]($2)')
   .replace(/^\\---$/gm, '---')
   .replace(/^\\- /gm, '- ')
   .replace(/\\\[/g, '[')
   .replace(/\\\]/g, ']')

interface Props {
  id: string
  label?: string
  headerLabel?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  initialFocused?: boolean
  expandable?: boolean
  enableWikiLinks?: boolean
  wikiEntities?: WikiEntity[]
  /** Override wiki-link click behaviour. Called with the link name; skips default entity lookup + navigate. */
  onWikiLinkClick?: (name: string) => void
  /** Remove the minimum height floor so the editor shrinks to fit its content. */
  autoHeight?: boolean
  /** Extra action buttons rendered in the header row, left of the raw/expand icons. */
  headerActions?: React.ReactNode
  /** Stretch the editor to fill the parent's available height instead of sizing to content.
   *  The parent must be a flex column with a defined height. */
  fillHeight?: boolean
  /** Show a static formatting toolbar in the header row instead of the floating bubble menu.
   *  Best for large editors (the Notebook) where the bubble would cover referenced content. */
  fixedToolbar?: boolean
}

export function MarkdownField({ id, label, headerLabel, value, onChange, placeholder, rows = 2, onKeyDown, initialFocused = false, expandable = false, enableWikiLinks = false, wikiEntities = [], onWikiLinkClick, autoHeight = false, headerActions, fillHeight = false, fixedToolbar = false }: Props) {
  const [focused, setFocused] = useState(initialFocused)
  const [sizeMode, setSizeMode] = useState<SizeMode>('default')
  const [rawMode, setRawMode] = useState(false)
  const sizeModeRef = useRef(sizeMode)
  sizeModeRef.current = sizeMode
  const onKeyDownRef = useRef(onKeyDown)
  onKeyDownRef.current = onKeyDown
  // The visible bordered box. The floating bubble anchors to its top edge (not the
  // caret) so it floats above the whole field instead of covering the text being read.
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Navigation + entity refs (used in handleClick inside useEditor — stale-closure safe via refs)
  const navigate = useNavigate()
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const wikiEntitiesRef = useRef(wikiEntities)
  wikiEntitiesRef.current = wikiEntities
  const enableWikiLinksRef = useRef(enableWikiLinks)
  enableWikiLinksRef.current = enableWikiLinks
  const onWikiLinkClickRef = useRef(onWikiLinkClick)
  onWikiLinkClickRef.current = onWikiLinkClick

  // Stable extension instance — created once; reads latest entities via ref on each decoration pass
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const wikiLinkExtension = useMemo(() => createWikiLinkDecorationExtension(wikiEntitiesRef), [])

  // Wiki-link suggestion state + refs (refs keep handleKeyDown inside useEditor free of stale closures)
  type WikiSuggestState = { active: boolean; partial: string; coords: { left: number; top: number } }
  const [wikiSuggest, setWikiSuggest] = useState<WikiSuggestState>({ active: false, partial: '', coords: { left: 0, top: 0 } })
  const [wikiHighlight, setWikiHighlight] = useState(-1)
  const wikiSuggestRef = useRef(wikiSuggest)
  const wikiHighlightRef = useRef(wikiHighlight)
  const wikiSuggestionsRef = useRef<WikiEntity[]>([])
  const selectWikiSuggestionRef = useRef<((entity: WikiEntity) => void) | null>(null)

  // Tracks whether the last value change came from the editor itself.
  // Prevents setContent (which clears undo history) from firing for internal edits.
  const isInternalUpdateRef = useRef(false)
  wikiSuggestRef.current = wikiSuggest
  wikiHighlightRef.current = wikiHighlight

  const cycleSize = () => setSizeMode(m => m === 'default' ? 'large' : m === 'large' ? 'fullscreen' : 'default')

  const toggleRaw = () => {
    if (rawMode) {
      // Switching back to rich: sync current textarea value into editor
      editor?.commands.setContent(value, { emitUpdate: false })
    }
    setRawMode(r => !r)
  }

  // Wiki-link navigation via mousedown (fires before cursor repositioning,
  // so preventDefault() stops the cursor from moving into the [[Name]] text
  // and triggering the suggestion dropdown).
  const handleWikiLinkMouseDown = (e: React.MouseEvent) => {
    if (!enableWikiLinks) return
    const target = e.target as HTMLElement
    const wikiEl = target.classList.contains('wiki-link')
      ? target
      : (target.closest?.('.wiki-link') as HTMLElement | null)
    if (!wikiEl) return
    e.preventDefault()
    const name = wikiEl.getAttribute('title')?.replace('Go to: ', '') ?? ''
    if (!name) return
    // Delegate to caller if provided (e.g. auto-create note on Digest page)
    if (onWikiLinkClickRef.current) {
      onWikiLinkClickRef.current(name)
      return
    }
    const entity = wikiEntitiesRef.current.find(en => en.name.toLowerCase() === name.toLowerCase())
    if (!entity) return
    navigateRef.current(
      entity.type === 'page' ? `/notebook?page=${entity.id}` :
      entity.type === 'project' ? `/projects/${entity.id}` :
      entity.type === 'contact' ? `/contacts?q=${encodeURIComponent(entity.name)}` : `/`
    )
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, tightLists: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Link.configure({ openOnClick: false, autolink: false }),
      TipTapTable.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      HighlightMarkdown,
      Typography,
      TaskList,
      TaskItem.configure({ nested: true }),
      AssetImage,
      MarkdownBlockPasteExtension,
      ...(enableWikiLinks ? [wikiLinkExtension] : []),
    ],
    content: value,
    autofocus: initialFocused,
    editorProps: {
      attributes: {
        id,
        spellcheck: 'true',
        // break-words prevents long URLs from causing horizontal overflow
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none break-words',
      },
      handleKeyDown: (view, event) => {
        // Wiki-link suggestion keyboard navigation (refs prevent stale closure)
        if (wikiSuggestRef.current.active && wikiSuggestionsRef.current.length > 0) {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setWikiHighlight(i => {
              const next = Math.min(i + 1, wikiSuggestionsRef.current.length - 1)
              wikiHighlightRef.current = next
              return next
            })
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setWikiHighlight(i => {
              const next = Math.max(i - 1, -1)
              wikiHighlightRef.current = next
              return next
            })
            return true
          }
          if ((event.key === 'Enter' || event.key === 'Tab') && wikiHighlightRef.current >= 0) {
            event.preventDefault()
            selectWikiSuggestionRef.current?.(wikiSuggestionsRef.current[wikiHighlightRef.current])
            return true
          }
          if (event.key === 'Escape') {
            event.stopPropagation()
            setWikiSuggest(s => ({ ...s, active: false }))
            return true
          }
        }
        if (event.key === 'Escape') {
          // Always stop propagation so the global App.tsx Escape → navigate('/') handler
          // doesn't fire while the user is typing inside any MarkdownField.
          event.stopPropagation()
          if (sizeModeRef.current === 'fullscreen') {
            setSizeMode('default')
            return true
          }
          return false
        }
        // Block Enter / Shift+Enter inside a table cell: a second block or a
        // hard break in a cell makes the table unserializable as GFM, and
        // tiptap-markdown (html: false) then saves the whole table as the
        // literal string "[table]" — silent data loss. Tab / Shift+Tab move
        // between cells; click or arrow below the table to leave it.
        if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
          const { $from } = view.state.selection
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === 'table') {
              event.preventDefault()
              return true
            }
          }
        }
        // Always intercept Cmd/Ctrl+Enter to prevent TipTap inserting a line
        // break. preventDefault doesn't stop propagation, so window-level save
        // listeners (e.g. ProjectModal) still fire normally.
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault()
          onKeyDownRef.current?.(event as unknown as React.KeyboardEvent<HTMLTextAreaElement>)
          return true
        }
        if (onKeyDownRef.current) {
          onKeyDownRef.current(event as unknown as React.KeyboardEvent<HTMLTextAreaElement>)
          if (event.defaultPrevented) return true
        }
        return false
      },
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
    onUpdate: ({ editor }) => {
      // Mark this as an internal update so the sync effect below skips setContent.
      // setContent resets ProseMirror's undo history — calling it for our own
      // edits would wipe Cmd+Z history after every keystroke.
      isInternalUpdateRef.current = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let md: string = (editor.storage as any).markdown.getMarkdown()
      md = unescapeLinks(md)
      onChange(md)
    },
  })

  // Toolbar active/contextual states. TipTap v3 doesn't re-render the host
  // component on every transaction, so isActive() calls in render can go
  // stale — useEditorState subscribes to transactions and re-renders only
  // when the selected snapshot changes (e.g. caret enters/leaves a table).
  const tb = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      highlight: e.isActive('highlight'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      paragraph: e.isActive('paragraph'),
      blockquote: e.isActive('blockquote'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      inTable: e.isActive('table'),
      inHeaderRow: e.isActive('tableHeader'),
    } : null,
  })

  // Sync external value changes (e.g. initial load, parent reset) into the editor.
  // Skip when the change came from the editor itself — detected via isInternalUpdateRef —
  // to avoid calling setContent unnecessarily (setContent resets undo history).
  useEffect(() => {
    if (!editor || rawMode) return
    if (isInternalUpdateRef.current) {
      isInternalUpdateRef.current = false
      return
    }
    editor.commands.setContent(value, { emitUpdate: false })
  }, [value, editor, rawMode])

  // Focus editor when entering fullscreen
  useEffect(() => {
    if (sizeMode === 'fullscreen' && !rawMode) {
      requestAnimationFrame(() => editor?.commands.focus())
    }
  }, [sizeMode, editor, rawMode])

  // Re-run wiki-link decorations only when the set of entity NAMES actually changes.
  // Callers (e.g. NotebookPage) hand us a fresh wikiEntities array after every autosave;
  // dispatching a transaction each time forces an editor re-render that resets the
  // browser's spell-check pass mid-writing (squiggles flicker / go missing). The live/dead
  // colouring only depends on which names exist, so a stable signature avoids the churn.
  const entitySigRef = useRef('')
  useEffect(() => {
    if (!editor || !enableWikiLinks) return
    const sig = wikiEntities.map(e => e.name.toLowerCase()).sort().join(' ')
    if (sig === entitySigRef.current) return
    entitySigRef.current = sig
    editor.view.dispatch(editor.state.tr)
  }, [wikiEntities, editor, enableWikiLinks])

  // Wiki-link detection: watch cursor position for [[ pattern
  useEffect(() => {
    if (!editor || !enableWikiLinks) return
    const check = () => {
      const { state } = editor
      const { $from } = state.selection
      const textBefore = state.doc.textBetween(
        Math.max(0, $from.pos - 200), $from.pos, '\n', '\0'
      )
      const match = /\[\[([^\[\]\n]*)$/.exec(textBefore)
      if (match) {
        // Suppress suggestion when cursor is inside a completed [[Name]] — look
        // for a closing ]] before any opening [[ in the text after the cursor.
        const textAfter = state.doc.textBetween(
          $from.pos, Math.min(state.doc.content.size, $from.pos + 200), '\n', '\0'
        )
        const closingIdx = textAfter.indexOf(']]')
        const openingIdx = textAfter.indexOf('[[')
        const insideCompletedLink = closingIdx !== -1 && (openingIdx === -1 || closingIdx < openingIdx)
        if (insideCompletedLink) {
          setWikiSuggest(s => s.active ? { ...s, active: false } : s)
          return
        }
        const coords = editor.view.coordsAtPos($from.pos)
        setWikiSuggest({ active: true, partial: match[1], coords: { left: coords.left, top: coords.bottom + 4 } })
        setWikiHighlight(-1)
      } else {
        setWikiSuggest(s => s.active ? { ...s, active: false } : s)
      }
    }
    editor.on('update', check)
    editor.on('selectionUpdate', check)
    return () => {
      editor.off('update', check)
      editor.off('selectionUpdate', check)
    }
  }, [editor, enableWikiLinks])

  // Computed wiki suggestions filtered by partial text
  const wikiSuggestions = useMemo(() => {
    if (!wikiSuggest.active || !wikiEntities.length) return []
    const partial = wikiSuggest.partial.toLowerCase()
    return wikiEntities
      .filter(e => !partial || e.name.toLowerCase().includes(partial))
      .slice(0, 12)
  }, [wikiSuggest.active, wikiSuggest.partial, wikiEntities])
  wikiSuggestionsRef.current = wikiSuggestions

  // Insert the chosen entity as a completed [[...]] link
  const selectWikiSuggestion = useCallback((entity: WikiEntity) => {
    if (!editor) return
    const { $from } = editor.state.selection
    const textBefore = editor.state.doc.textBetween(
      Math.max(0, $from.pos - 200), $from.pos, '\n', '\0'
    )
    const match = /\[\[([^\[\]\n]*)$/.exec(textBefore)
    if (!match) return
    const partial = match[1]
    const pos = $from.pos
    // Delete the partial text the user has typed so far, then insert the full entity name + ]]
    editor.chain()
      .deleteRange({ from: pos - partial.length, to: pos })
      .insertContent(entity.name + ']]')
      .run()
    setWikiSuggest(s => ({ ...s, active: false }))
  }, [editor])
  selectWikiSuggestionRef.current = selectWikiSuggestion

  const sizeIcon = sizeMode === 'default'
    ? <Maximize2 size={14} />
    : sizeMode === 'large'
      ? <Fullscreen size={14} />
      : <Minimize2 size={14} />

  const sizeTitle = sizeMode === 'default'
    ? 'Expand editor'
    : sizeMode === 'large'
      ? 'Enter fullscreen'
      : 'Collapse editor'

  const rawBtn = (
    <button
      type="button"
      onClick={toggleRaw}
      title={rawMode ? 'Switch to rich editor' : 'Edit raw markdown (view/edit URLs and source)'}
      className={`transition-colors p-0.5 rounded ${rawMode ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
    >
      <Code2 size={14} />
    </button>
  )

  const expandBtn = expandable && (
    <button
      type="button"
      onClick={cycleSize}
      title={sizeTitle}
      className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
    >
      {sizeIcon}
    </button>
  )

  // When expanded to large/fullscreen, always use the fixed toolbar: a floating bubble
  // would cover the very content the user enlarged the editor to reference. Small
  // default-size fields keep the floating bubble unless a caller opts into fixedToolbar.
  const useFixedToolbar = fixedToolbar || sizeMode !== 'default'

  // Shared formatting button set — used by both the floating bubble menu (small inline
  // fields) and the fixed toolbar (large editors, via fixedToolbar).
  const formatButtons = editor && tb && (
    <div className="flex items-center gap-0.5 flex-wrap">
      <ToolbarBtn active={tb.bold} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (⌘B)"><Bold size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.italic} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (⌘I)"><Italic size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.highlight} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight (==text==)"><Highlighter size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.strike} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough (~~text~~)"><Strikethrough size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.code} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code (`text`)"><Code size={13} /></ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn active={tb.h1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1"><Heading1 size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.h2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2"><Heading2 size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.h3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3"><Heading3 size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.paragraph} onClick={() => editor.chain().focus().setParagraph().run()} title="Plain text"><Pilcrow size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote (> text)"><Quote size={13} /></ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn active={tb.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list (- item)"><List size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list (1. item)"><ListOrdered size={13} /></ToolbarBtn>
      <ToolbarBtn active={tb.taskList} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list ([ ] item)"><ListChecks size={13} /></ToolbarBtn>
      <div className="w-px h-4 bg-border mx-0.5" />
      <TableInsertPopover editor={editor} disabled={tb.inTable} />
      <div className="w-px h-4 bg-border mx-0.5" />
      <ToolbarBtn active={false} onClick={toggleRaw} title="Edit raw markdown (view/edit URLs and source)"><Code2 size={13} /></ToolbarBtn>
    </div>
  )
  const tableControlsRow = editor && tb && tb.inTable && (
    <TableControlsRow editor={editor} inHeaderRow={tb.inHeaderRow} />
  )

  const labelRow = (label || expandable || headerActions || useFixedToolbar) && (
    <div className={useFixedToolbar ? 'space-y-1' : undefined}>
      <div className="flex items-center justify-between gap-2">
        {useFixedToolbar && !rawMode
          ? formatButtons
          : (label ? <Label htmlFor={id}>{label}</Label> : <span />)}
        <div className="flex items-center gap-1 shrink-0">
          {headerActions}
          {rawMode && rawBtn}
          {expandBtn}
        </div>
      </div>
      {useFixedToolbar && !rawMode && tableControlsRow}
    </div>
  )

  const minHeight = (autoHeight || fillHeight) ? undefined : `${rows * 1.5 + 1}rem`

  const containerClass = [
    'rounded-md border px-3 py-2 text-sm cursor-text transition-colors overflow-y-auto overflow-x-hidden',
    focused
      ? 'border-ring ring-1 ring-ring bg-background'
      : 'border-input bg-background hover:border-ring/50',
    fillHeight ? 'flex-1 min-h-0' : (sizeMode === 'large' ? 'h-64 overflow-y-auto' : ''),
  ].filter(Boolean).join(' ')

  const rawTextarea = (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      className={containerClass + ' font-mono resize-none w-full'}
      style={{ minHeight }}
      spellCheck
    />
  )

  const toolbar = editor && tb && !rawMode && !useFixedToolbar && (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state }) => {
        const { empty } = state.selection
        return e.isFocused || !empty || e.isActive('heading')
      }}
      // Anchor to the field's top edge rather than the caret so the palette floats
      // above the whole text box and never covers the line being edited. flip lets it
      // drop below only when there's no room above (e.g. field at the top of the viewport).
      getReferencedVirtualElement={() =>
        containerRef.current ? { getBoundingClientRect: () => containerRef.current!.getBoundingClientRect() } : null
      }
      options={{ placement: 'top-start', offset: 6 }}
    >
      <div className="flex flex-col rounded-md border border-border bg-popover shadow-md p-0.5">
        {formatButtons}
        {tableControlsRow}
      </div>
    </BubbleMenu>
  )

  // Wiki-link suggestion dropdown. Rendered in a portal to document.body: it uses
  // position:fixed with viewport coords (from coordsAtPos), but when MarkdownField
  // sits inside a transformed ancestor (e.g. a Radix Dialog centered via translate),
  // a fixed child would resolve against that transform and land far off-screen.
  // Portalling to body escapes the transform so the coords stay viewport-relative.
  const wikiDropdown = enableWikiLinks && wikiSuggest.active && wikiSuggestions.length > 0 && createPortal(
    <div
      style={{
        position: 'fixed',
        // Clamp left so the 288px (w-72) dropdown doesn't overflow the viewport
        left: Math.min(wikiSuggest.coords.left, Math.max(0, window.innerWidth - 288 - 16)),
        top: wikiSuggest.coords.top,
        zIndex: 200,
      }}
      className="bg-popover border border-border rounded-md shadow-lg w-72 max-h-72 overflow-y-auto"
    >
      {wikiSuggestions.map((entity, idx) => (
        <button
          key={`${entity.type}-${entity.id}`}
          type="button"
          tabIndex={-1}
          onMouseDown={e => { e.preventDefault(); selectWikiSuggestion(entity) }}
          className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 transition-colors ${
            idx === wikiHighlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          <span className="text-[10px] text-muted-foreground w-14 shrink-0 uppercase tracking-wide">
            {entity.type === 'page' ? 'Note' : entity.type === 'project' ? 'Project' : entity.type === 'contact' ? 'Contact' : 'Area'}
          </span>
          <span className="truncate">{entity.name}</span>
        </button>
      ))}
    </div>,
    document.body,
  )

  if (sizeMode === 'fullscreen') {
    return (
      <>
        {toolbar}
        <div className="space-y-1.5">
          {labelRow}
          <div className="h-10 rounded-md border border-dashed border-input bg-muted/20 px-3 py-2 text-sm text-muted-foreground/60 flex items-center">
            Editing in fullscreen…
          </div>
        </div>
        {/* Render inline (not portal) so Radix Dialog's focus trap includes this element */}
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <div className="flex items-center border-b px-4 py-2 gap-2">
            {(headerLabel || label) && (
              <span className="text-sm font-medium">{headerLabel ?? label}</span>
            )}
            {useFixedToolbar && !rawMode && formatButtons}
            <div className="ml-auto flex items-center gap-2">
              {headerActions}
              {rawBtn}
              <button
                type="button"
                onClick={() => setSizeMode('default')}
                title="Exit fullscreen (Esc)"
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
              >
                <Minimize2 size={16} />
              </button>
            </div>
          </div>
          {rawMode ? (
            <textarea
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              className="flex-1 p-4 font-mono text-base resize-none outline-none bg-background"
              spellCheck
            />
          ) : (
            <div
              className="flex-1 overflow-y-auto p-4 cursor-text"
              onClick={() => editor?.chain().focus().run()}
              onMouseDown={handleWikiLinkMouseDown}
            >
              <EditorContent editor={editor} className="text-base min-h-full break-words wiki-link-styles" />
            </div>
          )}
          <div className="border-t px-4 py-1.5 text-xs text-muted-foreground/50">
            Esc · exit fullscreen
          </div>
        </div>
        {wikiDropdown}
      </>
    )
  }

  return (
    <div className={fillHeight ? 'flex flex-col flex-1 min-h-0 gap-1.5' : 'space-y-1.5'}>
      {toolbar}
      {labelRow}
      {rawMode ? rawTextarea : (
        <div
          ref={containerRef}
          className={containerClass}
          style={{ minHeight }}
          onClick={() => editor?.chain().focus().run()}
          onMouseDown={handleWikiLinkMouseDown}
        >
          <EditorContent editor={editor} className="wiki-link-styles" />
        </div>
      )}
      {wikiDropdown}
    </div>
  )
}
