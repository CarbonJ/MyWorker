import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import { getAllProjects } from '@/db/projects'
import { getAllNotebookPages } from '@/db/notebook'
import { getAllContacts } from '@/db/contacts'
import { defaultFilter } from 'cmdk'
import type { Project, NotebookPage, Contact } from '@/types'
import { ENTITY_ICONS, SCREEN_ICONS, NEW_ICONS } from '@/lib/icons'

interface Props {
  open: boolean
  onClose: () => void
  onNewTask: () => void
  onNewProject: () => void
}

// cmdk never reorders groups (its group sort can't find them), so the
// Navigate group always lists first. Drop matches whose letters are only
// scattered across words (e.g. "task" in "calendar due dates schedule week")
// so a weak match there can't sit above a real one in a later group.
const MIN_SCORE = 0.1
const paletteFilter = (value: string, search: string, keywords?: string[]) => {
  const score = defaultFilter(value, search, keywords)
  return score >= MIN_SCORE ? score : 0
}

export function CommandPalette({ open, onClose, onNewTask, onNewProject }: Props) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [notes, setNotes] = useState<NotebookPage[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])

  useEffect(() => {
    if (!open) return
    getAllProjects().then(setProjects).catch(() => {})
    getAllNotebookPages().then(setNotes).catch(() => {})
    getAllContacts().then(setContacts).catch(() => {})
  }, [open])

  const go = (path: string) => { navigate(path); onClose() }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 max-w-lg overflow-hidden">
        <Command filter={paletteFilter}>
          <CommandInput placeholder="Search projects, notes, contacts or jump to…" autoFocus />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Navigate">
              <CommandItem value="projects dashboard" onSelect={() => go('/')}>
                <SCREEN_ICONS.projects className="text-muted-foreground" /> Projects
              </CommandItem>
              <CommandItem value="daily digest journal" onSelect={() => go('/digest')}>
                <SCREEN_ICONS.digest className="text-muted-foreground" /> Daily Digest
              </CommandItem>
              <CommandItem value="weekly report status" onSelect={() => go('/weekly')}>
                <SCREEN_ICONS.reports className="text-muted-foreground" /> Weekly Report
              </CommandItem>
              <CommandItem value="monthly report status" onSelect={() => go('/monthly')}>
                <SCREEN_ICONS.reports className="text-muted-foreground" /> Monthly Report
              </CommandItem>
              <CommandItem value="dashboard reporting meeting table" onSelect={() => go('/reporting')}>
                <SCREEN_ICONS.dashboard className="text-muted-foreground" /> Dashboard
              </CommandItem>
              <CommandItem value="archive" onSelect={() => go('/archive')}>
                <SCREEN_ICONS.archive className="text-muted-foreground" /> Archive
              </CommandItem>
              <CommandItem value="contacts people" onSelect={() => go('/contacts')}>
                <SCREEN_ICONS.contacts className="text-muted-foreground" /> Contacts
              </CommandItem>
              <CommandItem value="calendar due dates schedule week month" onSelect={() => go('/calendar')}>
                <SCREEN_ICONS.calendar className="text-muted-foreground" /> Calendar
              </CommandItem>
              <CommandItem value="trash deleted restore recycle bin" onSelect={() => go('/trash')}>
                <SCREEN_ICONS.trash className="text-muted-foreground" /> Trash
              </CommandItem>
              <CommandItem value="tags hashtags labels" onSelect={() => go('/tags')}>
                <SCREEN_ICONS.tags className="text-muted-foreground" /> Tags
              </CommandItem>
              <CommandItem value="notebook notes pages" onSelect={() => go('/notebook')}>
                <SCREEN_ICONS.notebook className="text-muted-foreground" /> Notebook
              </CommandItem>
              <CommandItem value="data health cleanup broken links duplicates tidy" onSelect={() => go('/health')}>
                <SCREEN_ICONS.health className="text-muted-foreground" /> Data health
              </CommandItem>
              <CommandItem value="settings" onSelect={() => go('/settings')}>
                <SCREEN_ICONS.settings className="text-muted-foreground" /> Settings
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Actions">
              <CommandItem value="new project create" onSelect={() => { onNewProject(); onClose() }}>
                <NEW_ICONS.project className="text-muted-foreground" /> New Project
              </CommandItem>
              <CommandItem value="new task create" onSelect={() => { onNewTask(); onClose() }}>
                <NEW_ICONS.task className="text-muted-foreground" /> New Task
              </CommandItem>
              <CommandItem value="new note notebook page create" onSelect={() => { go('/notebook?new=1') }}>
                <NEW_ICONS.note className="text-muted-foreground" /> New Note
              </CommandItem>
            </CommandGroup>

            {projects.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Projects">
                  {projects.map(p => (
                    <CommandItem
                      key={p.id}
                      value={p.workItem}
                      onSelect={() => go(`/projects/${p.id}`)}
                    >
                      <ENTITY_ICONS.project className="text-muted-foreground" />
                      <span className="flex-1 truncate">{p.workItem}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {notes.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Notes">
                  {notes.map(n => (
                    <CommandItem
                      key={n.id}
                      value={`note ${n.id} ${n.title}`}
                      onSelect={() => go(`/notebook?page=${n.id}`)}
                    >
                      <ENTITY_ICONS.note className="text-muted-foreground" />
                      <span className="flex-1 truncate">{n.title || 'Untitled'}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {contacts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Contacts">
                  {contacts.map(c => (
                    <CommandItem
                      key={c.id}
                      value={`contact ${c.id} ${c.name}`}
                      onSelect={() => go(`/contacts?q=${encodeURIComponent(c.name)}`)}
                    >
                      <ENTITY_ICONS.contact className="text-muted-foreground" />
                      <span className="flex-1 truncate">{c.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
