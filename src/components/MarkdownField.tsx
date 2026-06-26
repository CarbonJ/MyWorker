import { useState, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Label } from '@/components/ui/label'
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
}

export function MarkdownField({ id, label, headerLabel, value, onChange, placeholder, rows = 2, onKeyDown, initialFocused = false, expandable = false }: Props) {
  const [focused, setFocused] = useState(initialFocused)
  const [sizeMode, setSizeMode] = useState<SizeMode>('default')
  const [rawMode, setRawMode] = useState(false)
  const sizeModeRef = useRef(sizeMode)
  sizeModeRef.current = sizeMode
  const onKeyDownRef = useRef(onKeyDown)
  onKeyDownRef.current = onKeyDown

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
        if (event.key === 'Escape' && sizeModeRef.current === 'fullscreen') {
          setSizeMode('default')
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
    </div>
  )
}
