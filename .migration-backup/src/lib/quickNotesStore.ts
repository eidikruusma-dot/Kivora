import type { Note, NoteFolder } from '@/data/notesData'
import { mockNotes } from '@/data/notesData'

let notes: Note[] = [...mockNotes]
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function nowTimestamp(): string {
  return new Intl.DateTimeFormat('et-EE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function folderIcon(folder: NoteFolder): { icon: Note['icon']; iconBg: string; iconColor: string } {
  switch (folder) {
    case 'Kool':    return { icon: 'graduation', iconBg: '#DBEAFE', iconColor: '#2563EB' }
    case 'Töö':     return { icon: 'briefcase',  iconBg: '#F1F5F9', iconColor: '#475569' }
    case 'Kodu':    return { icon: 'cart',       iconBg: '#DCFCE7', iconColor: '#16A34A' }
    case 'Ideed':   return { icon: 'bulb',      iconBg: '#FEF9C3', iconColor: '#CA8A04' }
    case 'Isiklik':
    default:        return { icon: 'document',   iconBg: '#EDE9FB', iconColor: '#6F5AE8' }
  }
}

export function getAllNotes(): Note[] {
  return notes
}

export function getLatestQuickNotes(count: number): Note[] {
  return notes.filter((n) => n.id.startsWith('quick-')).slice(0, count)
}

export function subscribeNotes(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function addQuickNote(content: string): Note {
  const trimmed = content.trim()
  const { icon, iconBg, iconColor } = folderIcon('Isiklik')
  const note: Note = {
    id: `quick-${Date.now()}`,
    title: trimmed.slice(0, 40),
    preview: trimmed,
    folder: 'Isiklik',
    timestamp: nowTimestamp(),
    starred: false,
    iconBg,
    iconColor,
    icon,
  }
  notes = [note, ...notes]
  emit()
  return note
}

export function addNote(title: string, content: string, folder: NoteFolder, starred: boolean): Note {
  const { icon, iconBg, iconColor } = folderIcon(folder)
  const note: Note = {
    id: `note-${Date.now()}`,
    title: title.trim(),
    preview: content.trim(),
    folder,
    timestamp: nowTimestamp(),
    starred,
    iconBg,
    iconColor,
    icon,
  }
  notes = [note, ...notes]
  emit()
  return note
}

export function updateNote(id: string, updates: Partial<Pick<Note, 'title' | 'preview' | 'folder' | 'starred'>>): void {
  let changed = false
  notes = notes.map((n) => {
    if (n.id !== id) return n
    changed = true
    const next: Note = { ...n, ...updates }
    if (updates.folder && updates.folder !== n.folder) {
      const fi = folderIcon(updates.folder)
      next.icon = fi.icon
      next.iconBg = fi.iconBg
      next.iconColor = fi.iconColor
    }
    if (updates.title !== undefined) next.title = updates.title.trim()
    if (updates.preview !== undefined) next.preview = updates.preview.trim()
    next.timestamp = nowTimestamp()
    return next
  })
  if (changed) emit()
}

export function moveNote(id: string, folder: NoteFolder): void {
  updateNote(id, { folder })
}

export function toggleStar(id: string): void {
  let changed = false
  notes = notes.map((n) => {
    if (n.id !== id) return n
    changed = true
    return { ...n, starred: !n.starred }
  })
  if (changed) emit()
}

export function deleteNote(id: string): void {
  const before = notes.length
  notes = notes.filter((n) => n.id !== id)
  if (notes.length !== before) emit()
}
