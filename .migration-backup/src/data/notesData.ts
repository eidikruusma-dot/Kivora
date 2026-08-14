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

export const mockNotes: Note[] = [
  {
    id: '1',
    title: 'Ideed uue projekti jaoks',
    preview: 'Mõned esialgsed mõtted ja ideed, mida tahan arendada...',
    folder: 'Isiklik',
    timestamp: '10:12',
    starred: true,
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    icon: 'document',
  },
  {
    id: '2',
    title: 'Kooli märkmed',
    preview: 'Füüsika – elektromagnetiline induktsioon\nÕigus – lepingute liigid...',
    folder: 'Kool',
    timestamp: 'Eile',
    starred: false,
    iconBg: '#DBEAFE',
    iconColor: '#2563EB',
    icon: 'graduation',
  },
  {
    id: '3',
    title: 'Ostunimekiri',
    preview: 'Piim, munad, banaanid, kanaliha, köögiviljad, kohv...',
    folder: 'Kodu',
    timestamp: 'Eile',
    starred: false,
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    icon: 'cart',
  },
  {
    id: '4',
    title: 'Raamatud, mida lugeda',
    preview: '1. Atomic Habits – James Clear\n2. The 5 AM Club – Robin Sharma...',
    folder: 'Isiklik',
    timestamp: '24. juuli',
    starred: false,
    iconBg: '#FEF9C3',
    iconColor: '#CA8A04',
    icon: 'bulb',
  },
  {
    id: '5',
    title: 'Tänulikkuse märkmik',
    preview: 'Täna olen tänulik selle eest, et...\nPäike paistis ja lapsed olid rõõmsad...',
    folder: 'Päevik',
    timestamp: '23. juuli',
    starred: true,
    iconBg: '#FFE4E6',
    iconColor: '#E11D48',
    icon: 'heart',
  },
  {
    id: '6',
    title: 'Töö ideed',
    preview: 'Kodulehe uus kujundus\nTurundusplaan...',
    folder: 'Töö',
    timestamp: '22. juuli',
    starred: false,
    iconBg: '#F1F5F9',
    iconColor: '#475569',
    icon: 'briefcase',
  },
]

export const FOLDER_CONFIG: Record<NoteFolder, { color: string; bg: string }> = {
  Isiklik: { color: '#6F5AE8', bg: '#EDE9FB' },
  Kool:    { color: '#2563EB', bg: '#DBEAFE' },
  Töö:     { color: '#F97316', bg: '#FFF0E6' },
  Kodu:    { color: '#16A34A', bg: '#DCFCE7' },
  Ideed:   { color: '#CA8A04', bg: '#FEF9C3' },
  Päevik:  { color: '#E11D48', bg: '#FFE4E6' },
}

export const DONUT_SEGMENTS = [
  { label: 'Isiklik', count: 5, color: '#6F5AE8' },
  { label: 'Kool',    count: 2, color: '#3B82F6' },
  { label: 'Töö',     count: 2, color: '#FB7185' },
  { label: 'Kodu',    count: 2, color: '#4ADE80' },
  { label: 'Ideed',   count: 1, color: '#CA8A04' },
]

export const FOLDER_LIST: Array<{ name: NoteFolder; count: number; iconColor: string }> = [
  { name: 'Isiklik', count: 5, iconColor: '#6F5AE8' },
  { name: 'Kool',    count: 2, iconColor: '#2563EB' },
  { name: 'Töö',     count: 2, iconColor: '#F97316' },
  { name: 'Kodu',    count: 2, iconColor: '#16A34A' },
  { name: 'Ideed',   count: 1, iconColor: '#CA8A04' },
]
