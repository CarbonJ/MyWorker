import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useSearchParams } from 'react-router-dom'
import { UserRound, Plus, Pencil, Trash2, Search, X, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { MarkdownField } from '@/components/MarkdownField'
import { TagInput } from '@/components/TagInput'
import { getAllContacts, createContact, updateContact, deleteContact } from '@/db/contacts'
import { getAllTagNames } from '@/db/projects'
import { BacklinksPanel } from '@/components/BacklinksPanel'
import type { Contact } from '@/types'
import { isStubContact } from '@/types'

interface FormState {
  name: string
  role: string
  groupName: string
  notes: string
  tags: string[]
}

const EMPTY_FORM: FormState = { name: '', role: '', groupName: '', notes: '', tags: [] }

function ContactForm({
  initial,
  onSave,
  onCancel,
  tagSuggestions,
  saving,
}: {
  initial: FormState
  onSave: (f: FormState) => void
  onCancel: () => void
  tagSuggestions: string[]
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
          <Label htmlFor="contact-role">Role / Title</Label>
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
      />

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
  const highlightRef = useRef<HTMLDivElement | null>(null)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [saving, setSaving] = useState(false)

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

  // Scroll the highlighted contact into view when arriving via ?q= link
  useEffect(() => {
    if (!loading && highlightRef.current && searchParams.get('q')) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [loading, searchParams])

  const groups = [...new Set(contacts.map(c => c.groupName).filter(Boolean))].sort()

  const filtered = contacts.filter(c => {
    const q = search.trim().toLowerCase()
    const matchesSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.role.toLowerCase().includes(q) ||
      c.groupName.toLowerCase().includes(q) ||
      c.tags.some(t => t.toLowerCase().includes(q))
    const matchesGroup = !groupFilter || c.groupName === groupFilter
    return matchesSearch && matchesGroup
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
  })

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

        {/* Group filter pills */}
        {groups.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setGroupFilter(null)}
              className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${
                !groupFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            {groups.map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupFilter(prev => prev === g ? null : g)}
                className={`h-7 px-2.5 rounded-full border text-xs font-medium transition-colors ${
                  groupFilter === g ? 'bg-primary text-primary-foreground border-primary' : 'border-input text-muted-foreground hover:text-foreground'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
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
              const stub = isStubContact(contact)
              const isEditing = editingId === contact.id
              const isHighlighted = idx === 0 && !!searchParams.get('q')
              return (
                <div
                  key={contact.id}
                  ref={isHighlighted ? highlightRef : undefined}
                  className={`px-6 py-3${isHighlighted ? ' ring-2 ring-primary/30 ring-inset bg-primary/5 rounded' : ''}`}
                >
                  {isEditing ? (
                    <div className="space-y-4">
                      <h2 className="text-sm font-medium">Edit — {contact.name}</h2>
                      <ContactForm
                        initial={initialForEdit(contact)}
                        onSave={handleSave}
                        onCancel={() => setEditingId(null)}
                        tagSuggestions={tagSuggestions}
                        saving={saving}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start gap-3 group">
                        {/* Avatar */}
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-medium text-muted-foreground mt-0.5">
                          {contact.name.charAt(0).toUpperCase()}
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{contact.name}</span>
                            {/* Stub indicator */}
                            {stub && (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                <AlertCircle className="h-3 w-3" />
                                Name only
                              </span>
                            )}
                            {contact.role && (
                              <span className="text-xs text-muted-foreground">{contact.role}</span>
                            )}
                            {contact.groupName && (
                              <span className="text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground">
                                {contact.groupName}
                              </span>
                            )}
                            {contact.tags.map(tag => (
                              <span key={tag} className="text-xs bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                          {contact.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {contact.notes.replace(/[#*_`[\]]/g, '').slice(0, 120)}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingId(contact.id)}
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
                      <BacklinksPanel targetType="contact" targetId={contact.id} entityName={contact.name} />
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
