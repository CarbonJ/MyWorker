import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { UserRound, Plus, Pencil, Trash2, Search, X, ChevronDown, ChevronRight, Check, ChevronsUpDown, ExternalLink } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MarkdownField } from '@/components/MarkdownField'
import { MarkdownContent } from '@/components/MarkdownContent'
import { TagInput } from '@/components/TagInput'
import { getAllContacts, createContact, updateContact, deleteContact } from '@/db/contacts'
import { getAllTagNames } from '@/db/projects'
import { BacklinksPanel } from '@/components/BacklinksPanel'
import { useWikiEntities } from '@/hooks/useWikiEntities'
import type { Contact, WikiEntity } from '@/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'

interface FormState {
  name: string
  role: string
  groupName: string
  notes: string
  tags: string[]
  whosWho: string
}

const EMPTY_FORM: FormState = { name: '', role: '', groupName: '', notes: '', tags: [], whosWho: '' }

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  allLabel,
}: {
  value: string | null
  onChange: (v: string | null) => void
  options: string[]
  placeholder: string
  allLabel: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`h-8 pl-3 pr-2 rounded-md border text-sm flex items-center gap-1.5 transition-colors min-w-[110px] ${
            value ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
        >
          <span className="flex-1 text-left truncate">{value ?? allLabel}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-48" align="start">
        <Command>
          <CommandInput placeholder={placeholder} className="h-8 text-sm" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandItem
              value={allLabel}
              onSelect={() => { onChange(null); setOpen(false) }}
              className="text-sm"
            >
              <Check className={`h-3.5 w-3.5 mr-2 ${value === null ? 'opacity-100' : 'opacity-0'}`} />
              {allLabel}
            </CommandItem>
            {options.map(opt => (
              <CommandItem
                key={opt}
                value={opt}
                onSelect={() => { onChange(opt === value ? null : opt); setOpen(false) }}
                className="text-sm"
              >
                <Check className={`h-3.5 w-3.5 mr-2 ${value === opt ? 'opacity-100' : 'opacity-0'}`} />
                {opt}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ContactForm({
  initial,
  onSave,
  onCancel,
  tagSuggestions,
  wikiEntities,
  saving,
}: {
  initial: FormState
  onSave: (f: FormState) => void
  onCancel: () => void
  tagSuggestions: string[]
  wikiEntities: WikiEntity[]
  saving: boolean
}) {
  const [form, setForm] = useState<FormState>(initial)
  const set = (k: keyof FormState) => (v: string | string[]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Name is required'); return }
    onSave(form)
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSubmit(e) } }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Name <span className="text-destructive">*</span></Label>
          <Input
            id="contact-name"
            value={form.name}
            onChange={e => set('name')(e.target.value)}
            placeholder="Full name"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-role">Title | Role</Label>
          <Input
            id="contact-role"
            value={form.role}
            onChange={e => set('role')(e.target.value)}
            placeholder="e.g. Product Manager"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="contact-group">Group</Label>
          <Input
            id="contact-group"
            value={form.groupName}
            onChange={e => set('groupName')(e.target.value)}
            placeholder="e.g. Engineering, Legal"
          />
        </div>
        <TagInput
          id="contact-tags"
          value={form.tags}
          onChange={v => set('tags')(v)}
          suggestions={tagSuggestions}
        />
      </div>

      <MarkdownField
        id="contact-notes"
        label="Notes"
        value={form.notes}
        onChange={v => set('notes')(v)}
        placeholder="Any context, preferences, or background…"
        rows={3}
        expandable
        enableWikiLinks
        wikiEntities={wikiEntities}
      />

      <div className="space-y-1.5">
        <Label htmlFor="contact-whos-who">Who's Who URL</Label>
        <Input
          id="contact-whos-who"
          type="url"
          value={form.whosWho}
          onChange={e => set('whosWho')(e.target.value)}
          placeholder="https://…"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save Contact'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground ml-1">⌘/Ctrl+↵ to save</span>
      </div>
    </form>
  )
}

export default function ContactsPage() {
  const [searchParams] = useSearchParams()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '')
  const [groupFilter, setGroupFilter] = useState<string | null>(null)
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const wikiEntities = useWikiEntities()

  const load = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([getAllContacts(), getAllTagNames()])
      setContacts(c)
      setTagSuggestions(t)
    } catch (err) {
      toast.error(`Failed to load contacts: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!loading && highlightRef.current && searchParams.get('q')) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [loading, searchParams])

  const groups = [...new Set(contacts.map(c => c.groupName).filter(Boolean))].sort()
  const allTags = [...new Set(contacts.flatMap(c => c.tags))].sort()

  const filtered = contacts.filter(c => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.groupName.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    const matchesGroup = !groupFilter || c.groupName === groupFilter
    const matchesTag = tagFilters.length === 0 || tagFilters.some(t => c.tags.includes(t))
    return matchesSearch && matchesGroup && matchesTag
  })

  const handleSave = async (form: FormState) => {
    setSaving(true)
    try {
      if (editingId === 'new') {
        await createContact(form)
        toast.success('Contact added')
      } else if (typeof editingId === 'number') {
        await updateContact({ id: editingId, ...form })
        toast.success('Contact updated')
      }
      setEditingId(null)
      await load()
    } catch (err) {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: Contact) => {
    if (!confirm(`Delete contact "${c.name}"? This cannot be undone.`)) return
    try {
      await deleteContact(c.id)
      toast.success('Contact deleted')
      await load()
    } catch (err) {
      toast.error(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const initialForEdit = (c: Contact): FormState => ({
    name: c.name,
    role: c.role,
    groupName: c.groupName,
    notes: c.notes,
    tags: c.tags,
    whosWho: c.whosWho,
  })

  const toggleExpand = (id: number) =>
    setExpandedId(prev => (prev === id ? null : id))

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Header toolbar */}
      <div className="border-b bg-background px-6 py-3 shrink-0 flex items-center gap-3 flex-wrap">
        <h1 className="text-base font-semibold mr-2">Contacts</h1>

        {/* Search */}
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="h-8 pl-8 pr-7 w-52 text-sm"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Group filter — searchable dropdown */}
        {groups.length > 0 && (
          <SearchableSelect
            value={groupFilter}
            onChange={setGroupFilter}
            options={groups}
            placeholder="Search groups…"
            allLabel="All Groups"
          />
        )}

        {/* Tag filter — multi-select (same style as the main project screen) */}
        {allTags.length > 0 && (
          <MultiSelectFilter
            options={allTags.map(t => ({ value: t, label: t }))}
            value={tagFilters}
            onChange={setTagFilters}
            placeholder="All Tags"
            width="w-[110px]"
            searchable
          />
        )}

        {/* Clear filters */}
        {(groupFilter || tagFilters.length > 0) && (
          <button
            type="button"
            onClick={() => { setGroupFilter(null); setTagFilters([]) }}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <Button
          size="sm"
          className="ml-auto"
          onClick={() => setEditingId('new')}
          disabled={editingId === 'new'}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Contact
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {/* New contact form */}
        {editingId === 'new' && (
          <div className="px-6 py-4 border-b bg-muted/20">
            <h2 className="text-sm font-medium mb-4">New Contact</h2>
            <ContactForm
              initial={EMPTY_FORM}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
              tagSuggestions={tagSuggestions}
              wikiEntities={wikiEntities}
              saving={saving}
            />
          </div>
        )}

        {/* Empty states */}
        {!loading && contacts.length === 0 && editingId !== 'new' && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <UserRound className="h-12 w-12 opacity-20" />
            <p className="text-sm">No contacts yet.</p>
            <Button size="sm" onClick={() => setEditingId('new')}>
              <Plus className="h-4 w-4 mr-1" />Add your first contact
            </Button>
          </div>
        )}

        {!loading && contacts.length > 0 && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Search className="h-8 w-8 opacity-20" />
            <p className="text-sm">No contacts match your search.</p>
          </div>
        )}

        {/* Contact list */}
        {filtered.length > 0 && (
          <div className="divide-y divide-border">
            {filtered.map((contact, idx) => {
              const isEditing = editingId === contact.id
              const isExpanded = expandedId === contact.id
              const isHighlighted = idx === 0 && !!searchParams.get('q')
              const firstNoteLine = contact.notes
                ? contact.notes.replace(/[#*_`[\]]/g, '').split('\n').find(l => l.trim()) ?? ''
                : ''

              return (
                <div
                  key={contact.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={isHighlighted ? 'ring-2 ring-primary/30 ring-inset bg-primary/5 rounded' : ''}
                >
                  {isEditing ? (
                    <div className="px-6 py-4 space-y-4">
                      <h2 className="text-sm font-medium">Edit — {contact.name}</h2>
                      <ContactForm
                        initial={initialForEdit(contact)}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                        tagSuggestions={tagSuggestions}
                        wikiEntities={wikiEntities}
                        saving={saving}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Contact row — 3-column layout */}
                      <div
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,2.5fr)] gap-4 px-6 py-2.5 group cursor-pointer hover:bg-accent/40 transition-colors items-center"
                        onClick={() => { if (editingId === null) toggleExpand(contact.id) }}
                      >
                        {/* Col 1: Avatar + Name + Role */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-muted-foreground">
                            {contact.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isExpanded
                                ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              }
                              <span className="text-sm font-medium truncate">{contact.name}</span>
                              {contact.whosWho && (
                                <a
                                  href={contact.whosWho}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Who's Who profile"
                                  onClick={e => e.stopPropagation()}
                                  className="text-muted-foreground hover:text-primary transition-colors shrink-0"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              )}
                            </div>
                            {contact.role && (
                              <div className="text-xs text-muted-foreground truncate ml-4.5 pl-0.5">{contact.role}</div>
                            )}
                          </div>
                        </div>

                        {/* Col 2: Group */}
                        <div className="min-w-0">
                          {contact.groupName && (
                            <span className="inline-block text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground truncate max-w-full">
                              {contact.groupName}
                            </span>
                          )}
                        </div>

                        {/* Col 3: Tags + Notes first line + Actions */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex-1 min-w-0">
                            {contact.tags.length > 0 && (
                              <div className="flex gap-1 flex-wrap mb-0.5">
                                {contact.tags.map(tag => (
                                  <span key={tag} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                            {firstNoteLine && (
                              <p className="text-xs text-muted-foreground truncate">{firstNoteLine}</p>
                            )}
                          </div>

                          {/* Action buttons */}
                          <div
                            className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => { setExpandedId(null); setEditingId(contact.id) }}
                              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                              title="Edit contact"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(contact)}
                              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                              title="Delete contact"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expanded detail panel */}
                      {isExpanded && (
                        <div className="px-6 pb-4 pt-1 border-t border-border/50 bg-muted/20">
                          <div className="ml-9 space-y-3">
                            {contact.notes ? (
                              <MarkdownContent>{contact.notes}</MarkdownContent>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">No notes.</p>
                            )}
                            <BacklinksPanel targetType="contact" targetId={contact.id} entityName={contact.name} />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && contacts.length > 0 && (
        <div className="border-t px-6 py-1.5 shrink-0 text-xs text-muted-foreground">
          {filtered.length === contacts.length
            ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
            : `${filtered.length} of ${contacts.length} contacts`}
        </div>
      )}
    </div>
  )
}
