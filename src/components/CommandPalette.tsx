import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import { getAllProjects } from '@/db/projects'
import type { Project } from '@/types'
import { LayoutDashboard, BarChart2, Archive, Settings, BookOpen, FolderOpen, Plus, ClipboardList } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onNewTask: () => void
}

export function CommandPalette({ open, onClose, onNewTask }: Props) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    if (open) getAllProjects().then(setProjects).catch(() => {})
  }, [open])

  const go = (path: string) => { navigate(path); onClose() }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent showCloseButton={false} className="p-0 gap-0 max-w-lg overflow-hidden">
        <Command>
          <CommandInput placeholder="Search projects or jump to…" autoFocus />
          <CommandList className="max-h-[420px]">
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Navigate">
              <CommandItem value="prime dashboard" onSelect={() => go('/')}>
                <LayoutDashboard className="text-muted-foreground" /> Prime
              </CommandItem>
              <CommandItem value="daily digest journal" onSelect={() => go('/digest')}>
                <BookOpen className="text-muted-foreground" /> Daily Digest
              </CommandItem>
              <CommandItem value="reporting view" onSelect={() => go('/reporting')}>
                <BarChart2 className="text-muted-foreground" /> Reporting
              </CommandItem>
              <CommandItem value="archive" onSelect={() => go('/archive')}>
                <Archive className="text-muted-foreground" /> Archive
              </CommandItem>
              <CommandItem value="settings" onSelect={() => go('/settings')}>
                <Settings className="text-muted-foreground" /> Settings
              </CommandItem>
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Actions">
              <CommandItem value="new project create" onSelect={() => go('/projects/new')}>
                <Plus className="text-muted-foreground" /> New Project
              </CommandItem>
              <CommandItem value="new task create" onSelect={() => { onNewTask(); onClose() }}>
                <ClipboardList className="text-muted-foreground" /> New Task
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
                      <FolderOpen className="text-muted-foreground" />
                      <span className="flex-1 truncate">{p.workItem}</span>
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
