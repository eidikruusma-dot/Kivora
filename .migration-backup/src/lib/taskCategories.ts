import type { TaskCategory } from '@/types'

export interface CategoryDef {
  value: TaskCategory
  label: string
  emoji: string
  color: string
}

export const TASK_CATEGORIES: CategoryDef[] = [
  { value: 'Töö',     label: 'Töö',     emoji: '💼',     color: '#F97316' },
  { value: 'Kool',    label: 'Kool',    emoji: '🎓',     color: '#0891B2' },
  { value: 'Isiklik', label: 'Isiklik', emoji: '👤',     color: '#60A5FA' },
  { value: 'Pere',    label: 'Pere',    emoji: '👨‍👩‍👧', color: '#EC4899' },
  { value: 'Tervis',  label: 'Tervis',  emoji: '❤️',     color: '#22C55E' },
  { value: 'Ostud',   label: 'Ostud',   emoji: '🛒',     color: '#14B8A6' },
]

export const CATEGORY_MAP: Record<TaskCategory, CategoryDef> = TASK_CATEGORIES.reduce(
  (acc, c) => { acc[c.value] = c; return acc },
  {} as Record<TaskCategory, CategoryDef>
)
