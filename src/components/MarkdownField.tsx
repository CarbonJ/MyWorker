import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Label } from '@/components/ui/label'
import type { WikiEntity } from '@/types'
import { Maximize2, Fullscreen, Minimize2, Bold, Italic, Heading1, Heading2, Heading3, Pilcrow, Code2 } from 'lucide-react'

type SizeMode = 'default' | 'large' | 'fullscreen'

// Unescape markdown link patterns that prosemirror-markdown bracket-escapes in plain text.
const unescapeLinks = (s: string) => s.replace(/\\\[([^\]\\]+)\\\]\(([^)]+)\)/g, '[$1]($2)')

function ToolbarBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1 rounded transition-colors ${active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
    >
      {children}
    </button>
  )
}

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
}

export function MarkdownField({ id, label, headerLabel, value, onChange, placeholder, rows = 2, onKeyDown, initialFocused = false, expandable = false, enableWikiLinks = false, wikiEntities = [] }: Props) {
  const [focused, setFocused] = useState(initialFocused)
  const [sizeMode, setSizeMode] = useState<SizeMode>('default')
  const [rawMode, setRawMode] = useState(false)
  const sizeModeRef = useRef(sizeMode)
  sizeModeRef.current = sizeMode
  const onKeyDownRef = useRef(onKeyDown)
  onKeyDownRef.current = onKeyDown

  // Wiki-link suggestion state + refs (refs keep handleKeyDown inside useEditor free of stale closures)
  type WikiSuggestState = { active: boolean; partial: string; coords: { left: number; top: number } }
  const [wikiSuggest, setWikiSuggest] = useState<WikiSuggestState>({ active: false, partial: '', coords: { left: 0, top: 0 } })
  const [wikiHighlight, setWikiHighlight] = useState(-1)
  const wikiSuggestRef = useRef(wikiSuggest)
  const wikiHighlightRef = useRef(wikiHighlight)
  const wikiSuggestionsRef = useRef<WikiEntity[]>([])
  const selectWikiSuggestionRef = useRef<((entity: WikiEntity) => void) | null>(null)
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

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, tightLists: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Link.configure({ openOnClick: false, autolink: false }),
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
      handleKeyDown: (_view, event) => {
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
            setWikiSuggest(s => ({ ...s, active: false }))
            return true
          }
        }
        if (event.key === 'Escape' && sizeModeRef.current === 'fullscreen') {
          setSizeMode('default')
          return true
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let md: string = (editor.storage as any).markdown.getMarkdown()
      md = unescapeLinks(md)
      onChange(md)
    },
  })

  // Sync external value changes without clobbering the cursor.
  // Use normalised comparison so bracket-escaped link patterns don't trigger
  // a setContent that would convert typed [text](url) into a hidden link node.
  useEffect(() => {
    if (!editor || rawMode) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as any).markdown.getMarkdown()
    if (unescapeLinks(current) !== unescapeLinks(value)) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [value, editor, rawMode])

  // Focus editor when entering fullscreen
  useEffect(() => {
    if (sizeMode === 'fullscreen' && !rawMode) {
      requestAnimationFrame(() => editor?.commands.focus())
    }
  }, [sizeMode, editor, rawMode])

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
    const alreadyTyped = match[1]
    const toInsert = entity.name.slice(alreadyTyped.length) + ']]'
    editor.commands.insertContent(toInsert)
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

  const labelRow = (label || expandable) && (
    <div className="flex items-center justify-between">
      {label ? <Label htmlFor={id}>{label}</Label> : <span />}
      <div className="flex items-center gap-1">
        {rawMode && rawBtn}
        {expandBtn}
      </div>
    </div>
  )

  const minHeight = `${rows * 1.5 + 1}rem`

  const containerClass = [
    'rounded-md border px-3 py-2 text-sm cursor-text transition-colors overflow-y-auto overflow-x-hidden',
    focused
      ? 'border-ring ring-1 ring-ring bg-background'
      : 'border-input bg-background hover:border-ring/50',
    sizeMode === 'large' ? 'h-64 overflow-y-auto' : '',
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

  const toolbar = editor && !rawMode && (
    <BubbleMenu
      editor={editor}
      shouldShow={({ editor: e, state }) => {
        const { empty } = state.selection
        return e.isFocused || !empty || e.isActive('heading')
      }}
      options={{ placement: 'top-start' }}
    >
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-popover shadow-md p-0.5">
        <ToolbarBtn
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (⌘B)"
        ><Bold size={13} /></ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (⌘I)"
        ><Italic size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolbarBtn
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        ><Heading1 size={13} /></ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        ><Heading2 size={13} /></ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        ><Heading3 size={13} /></ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('paragraph')}
          onClick={() => editor.chain().focus().setParagraph().run()}
          title="Plain text"
        ><Pilcrow size={13} /></ToolbarBtn>
        <div className="w-px h-4 bg-border mx-0.5" />
        <ToolbarBtn
          active={false}
          onClick={toggleRaw}
          title="Edit raw markdown (view/edit URLs and source)"
        ><Code2 size={13} /></ToolbarBtn>
      </div>
    </BubbleMenu>
  )

  // Wiki-link suggestion dropdown (position: fixed so it renders above everything)
  const wikiDropdown = enableWikiLinks && wikiSuggest.active && wikiSuggestions.length > 0 && (
    <div
      style={{ position: 'fixed', left: wikiSuggest.coords.left, top: wikiSuggest.coords.top, zIndex: 200 }}
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
    </div>
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
            <div className="ml-auto flex items-center gap-2">
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
            >
              <EditorContent editor={editor} className="text-base min-h-full break-words" />
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
    <div className="space-y-1.5">
      {toolbar}
      {labelRow}
      {rawMode ? rawTextarea : (
        <div
          className={containerClass}
          style={{ minHeight }}
          onClick={() => editor?.chain().focus().run()}
        >
          <EditorContent editor={editor} />
        </div>
      )}
      {wikiDropdown}
    </div>
  )
}
