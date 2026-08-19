export type NoteFolder = 'Isiklik' | 'Kool' | 'Töö' | 'Kodu' | 'Ideed' | 'Päevik'

export interface Note {
  id: string
  title: string
  preview: string
  folder: NoteFolder
  timestamp: string
  starred: boolean
  iconBg: string
  iconColor: string
  icon: 'document' | 'graduation' | 'cart' | 'bulb' | 'heart' | 'briefcase'
}

// Intentionally empty — new users start with no demo notes.
export const mockNotes: Note[] = []

export const FOLDER_CONFIG: Record<NoteFolder, { color: string; bg: string }> = {
  Isiklik: { color: '#6F5AE8', bg: '#EDE9FB' },
  Kool:    { color: '#2563EB', bg: '#DBEAFE' },
  Töö:     { color: '#F97316', bg: '#FFF0E6' },
  Kodu:    { color: '#16A34A', bg: '#DCFCE7' },
  Ideed:   { color: '#CA8A04', bg: '#FEF9C3' },
  Päevik:  { color: '#E11D48', bg: '#FFE4E6' },
}

// Counts are always 0 here; actual counts come from real user notes at render time.
export const DONUT_SEGMENTS = [
  { label: 'Isiklik', count: 0, color: '#6F5AE8' },
  { label: 'Kool',    count: 0, color: '#3B82F6' },
  { label: 'Töö',     count: 0, color: '#FB7185' },
  { label: 'Kodu',    count: 0, color: '#4ADE80' },
  { label: 'Ideed',   count: 0, color: '#CA8A04' },
]

export const FOLDER_LIST: Array<{ name: NoteFolder; count: number; iconColor: string }> = [
  { name: 'Isiklik', count: 0, iconColor: '#6F5AE8' },
  { name: 'Kool',    count: 0, iconColor: '#2563EB' },
  { name: 'Töö',     count: 0, iconColor: '#F97316' },
  { name: 'Kodu',    count: 0, iconColor: '#16A34A' },
  { name: 'Ideed',   count: 0, iconColor: '#CA8A04' },
]
