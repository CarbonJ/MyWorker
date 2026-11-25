/**
 * The one icon for each kind of thing and each screen, so the same thing looks
 * the same everywhere (navigation, command palette, Search, Tags, Trash,
 * backlinks, Calendar). Use these rather than importing a lucide icon directly
 * for any of the concepts below.
 */
import {
  FolderKanban, CheckSquare, ScrollText, BookOpen, CalendarDays, UserRound, Hash, Layers,
  CalendarRange, HeartPulse, BarChart2, FileText, Archive, Trash2, Settings, Search, FolderPlus, ListPlus, NotebookPen,
  type LucideIcon,
} from 'lucide-react'

/** Records: what a search result, tag use, trash item or link points at. */
export const ENTITY_ICONS = {
  project: FolderKanban,
  task: CheckSquare,
  worklog: ScrollText,
  note: BookOpen,
  journal: CalendarDays,
  contact: UserRound,
  tag: Hash,
  area: Layers,
} satisfies Record<string, LucideIcon>

/** Screens (the nav bar and the command palette's "Go to" list). */
export const SCREEN_ICONS = {
  projects: ENTITY_ICONS.project,
  digest: ENTITY_ICONS.journal,
  notebook: ENTITY_ICONS.note,
  contacts: ENTITY_ICONS.contact,
  tags: ENTITY_ICONS.tag,
  calendar: CalendarRange,
  dashboard: BarChart2,
  reports: FileText,
  archive: Archive,
  trash: Trash2,
  health: HeartPulse,
  settings: Settings,
  search: Search,
} satisfies Record<string, LucideIcon>

/** "New …" actions. */
export const NEW_ICONS = {
  project: FolderPlus,
  task: ListPlus,
  note: NotebookPen,
} satisfies Record<string, LucideIcon>
