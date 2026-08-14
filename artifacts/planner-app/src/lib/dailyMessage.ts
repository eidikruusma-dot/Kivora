import { t } from '@/lib/translations'
import type { AppLang } from '@/lib/languageStore'

interface DailyMessageOptions {
  date: Date
  lang?: AppLang
}

/** Returns a motivational daily message for the given date, in the given language. */
export function getDailyMessage({ date, lang = 'et' }: DailyMessageOptions): string {
  const day = date.getDay() // 0 = Sunday, 1 = Monday, …, 6 = Saturday
  const keyMap = [
    'daily.sun', // 0
    'daily.mon', // 1
    'daily.tue', // 2
    'daily.wed', // 3
    'daily.thu', // 4
    'daily.fri', // 5
    'daily.sat', // 6
  ] as const
  const key = keyMap[day] ?? 'daily.default'
  return t(key as Parameters<typeof t>[0], lang)
}
