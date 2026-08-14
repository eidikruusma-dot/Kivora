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
