import type { StartOfWeek, TimeFormat, DateFormat } from '@/types'

// Ajutine UI väärtus — tulevikus hakkab see tulema Subscription/Billing moodulist
export const PLAN_LABEL = 'Tasuta'

export const SUPPORTED_LANGUAGES: { value: string; label: string }[] = [
  { value: 'et', label: 'Eesti' },
  { value: 'en', label: 'English' },
]

export const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.value, l.label]),
)

export const START_OF_WEEK_OPTIONS: { value: StartOfWeek; label: string }[] = [
  { value: 'monday', label: 'Esmaspäev' },
  { value: 'sunday', label: 'Pühapäev' },
]

export const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '24h', label: '24-tunnine (14:30)' },
  { value: '12h', label: '12-tunnine (2:30 PM)' },
]

export const DATE_FORMAT_OPTIONS: { value: DateFormat; label: string }[] = [
  { value: 'DD.MM.YYYY', label: 'PP.KK.AAAA (23.07.2026)' },
  { value: 'MM/DD/YYYY', label: 'KK/PP/AAAA (07/23/2026)' },
  { value: 'YYYY-MM-DD', label: 'AAAA-KK-PP (2026-07-23)' },
]

export const START_OF_WEEK_LABELS: Record<string, string> = Object.fromEntries(
  START_OF_WEEK_OPTIONS.map((o) => [o.value, o.label]),
)

export const TIME_FORMAT_LABELS: Record<string, string> = {
  '24h': '24-tunnine',
  '12h': '12-tunnine',
}

export const DATE_FORMAT_LABELS: Record<string, string> = {
  'DD.MM.YYYY': 'PP.KK.AAAA',
  'MM/DD/YYYY': 'KK/PP/AAAA',
  'YYYY-MM-DD': 'AAAA-KK-PP',
}
