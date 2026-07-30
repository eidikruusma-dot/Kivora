import type { TaskCategory } from '@/types'
import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

/** The canonical (ET) category values — used as data keys in tasks. */
export const TASK_CATEGORIES: TaskCategory[] = [
  'Töö', 'Kool', 'Isiklik', 'Pere', 'Tervis', 'Ostud',
]

/** Category colors (design-system only, not i18n-sensitive). */
const CATEGORY_COLORS: Record<TaskCategory, string> = {
  'Töö':     '#6F5AE8',
  'Kool':    '#2563EB',
  'Isiklik': '#16A34A',
  'Pere':    '#CA8A04',
  'Tervis':  '#DC2626',
  'Ostud':   '#F97316',
}

/**
 * Backward-compatible CATEGORY_MAP used by legacy code that reads .color and .label.
 * Points to the ET label — components should use getTaskCategories(lang) for display.
 */
export const CATEGORY_MAP: Record<TaskCategory, { color: string; label: string }> = {
  'Töö':     { color: CATEGORY_COLORS['Töö'],     label: 'Töö'     },
  'Kool':    { color: CATEGORY_COLORS['Kool'],    label: 'Kool'    },
  'Isiklik': { color: CATEGORY_COLORS['Isiklik'], label: 'Isiklik' },
  'Pere':    { color: CATEGORY_COLORS['Pere'],    label: 'Pere'    },
  'Tervis':  { color: CATEGORY_COLORS['Tervis'],  label: 'Tervis'  },
  'Ostud':   { color: CATEGORY_COLORS['Ostud'],   label: 'Ostud'   },
}

/** Returns category objects with translated labels for the given language. */
export function getTaskCategories(lang: AppLang): { value: TaskCategory; label: string; color: string }[] {
  return [
    { value: 'Töö',     label: t('cat.work',     lang), color: CATEGORY_COLORS['Töö']     },
    { value: 'Kool',    label: t('cat.school',   lang), color: CATEGORY_COLORS['Kool']    },
    { value: 'Isiklik', label: t('cat.personal', lang), color: CATEGORY_COLORS['Isiklik'] },
    { value: 'Pere',    label: t('cat.family',   lang), color: CATEGORY_COLORS['Pere']    },
    { value: 'Tervis',  label: t('cat.health',   lang), color: CATEGORY_COLORS['Tervis']  },
    { value: 'Ostud',   label: t('cat.shopping', lang), color: CATEGORY_COLORS['Ostud']   },
  ]
}

/** Build a map from canonical ET value → { label, color } for display in a given language. */
export function getCategoryDisplayMap(lang: AppLang): Record<TaskCategory, { label: string; color: string }> {
  const map: Partial<Record<TaskCategory, { label: string; color: string }>> = {}
  getTaskCategories(lang).forEach(({ value, label, color }) => { map[value] = { label, color } })
  return map as Record<TaskCategory, { label: string; color: string }>
}
