import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

export interface Notification {
  id: string
  title: string
  description: string
  timeLabel: string
  read: boolean
  icon: 'clock' | 'calendar' | 'repeat'
  accent: string
}

export const initialNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'Ülesanne on peagi tähtajaks',
    description: 'Projektiraporti tähtaeg on täna kell 10:00.',
    timeLabel: 'Täna',
    read: false,
    icon: 'clock',
    accent: '#F59E0B',
  },
  {
    id: 'n2',
    title: 'Järgmine sündmus',
    description: 'Projektikoosolek algab kell 14:30.',
    timeLabel: 'Täna',
    read: false,
    icon: 'calendar',
    accent: '#2563EB',
  },
  {
    id: 'n3',
    title: 'Harjumuse meeldetuletus',
    description: 'Sul on täna veel kaks harjumust täitmata.',
    timeLabel: 'Täna',
    read: false,
    icon: 'repeat',
    accent: '#6F5AE8',
  },
]

/** Returns notifications with title, description, and timeLabel in the given language. */
export function getLocalizedNotifications(base: Notification[], lang: AppLang): Notification[] {
  const overrides: Record<string, { title: string; description: string }> = {
    n1: { title: t('notif.n1.title', lang), description: t('notif.n1.desc', lang) },
    n2: { title: t('notif.n2.title', lang), description: t('notif.n2.desc', lang) },
    n3: { title: t('notif.n3.title', lang), description: t('notif.n3.desc', lang) },
  }
  return base.map((n) => ({
    ...n,
    ...(overrides[n.id] ?? {}),
    timeLabel: t('notif.today', lang),
  }))
}
