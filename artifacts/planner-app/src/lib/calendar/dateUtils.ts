import type { StartOfWeek } from '@/types'
import type { AppLang } from '@/lib/languageStore'

export const WEEKDAYS_ET = [
  'E', 'T', 'K', 'N', 'R', 'L', 'P',
] as const

export const WEEKDAYS_EN = [
  'M', 'T', 'W', 'T', 'F', 'S', 'S',
] as const

export const WEEKDAYS_ET_FULL = [
  'Esmaspäev', 'Teisipäev', 'Kolmapäev', 'Neljapäev', 'Reede', 'Laupäev', 'Pühapäev',
] as const

export const WEEKDAYS_EN_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const

export const MONTHS_ET = [
  'Jaanuar', 'Veebruar', 'Märts', 'Aprill', 'Mai', 'Juuni',
  'Juuli', 'August', 'September', 'Oktoober', 'November', 'Detsember',
] as const

export const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export function getStartOfWeekOffset(startOfWeek: StartOfWeek): number {
  return startOfWeek === 'monday' ? 1 : 0
}

export function startOfWeek(date: Date, startOfWeekPref: StartOfWeek): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  const offset = getStartOfWeekOffset(startOfWeekPref)
  const diff = (day - offset + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7)
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function getMonthMatrix(year: number, month: number, startOfWeekPref: StartOfWeek): Date[][] {
  const firstOfMonth = new Date(year, month, 1)
  const gridStart = startOfWeek(firstOfMonth, startOfWeekPref)
  const weeks: Date[][] = []
  let current = gridStart
  for (let w = 0; w < 6; w++) {
    const row: Date[] = []
    for (let d = 0; d < 7; d++) {
      row.push(current)
      current = addDays(current, 1)
    }
    weeks.push(row)
    if (w >= 3 && isSameMonth(row[6], firstOfMonth) && w === 5) break
  }
  return weeks
}

function months(lang?: AppLang) {
  return lang === 'en' ? MONTHS_EN : MONTHS_ET
}

function weekdaysFull(lang?: AppLang) {
  return lang === 'en' ? WEEKDAYS_EN_FULL : WEEKDAYS_ET_FULL
}

export function formatWeekRange(weekStart: Date, lang?: AppLang): string {
  const m = months(lang)
  const weekEnd = addDays(weekStart, 6)
  const startDay = weekStart.getDate()
  const endDay = weekEnd.getDate()
  const year = weekEnd.getFullYear()
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    const month = m[weekEnd.getMonth()].toLowerCase()
    if (lang === 'en') return `${m[weekEnd.getMonth()]} ${startDay}–${endDay}, ${year}`
    return `${startDay}–${endDay}. ${month} ${year}`
  }
  if (lang === 'en') {
    return `${m[weekStart.getMonth()]} ${startDay} – ${m[weekEnd.getMonth()]} ${endDay}, ${year}`
  }
  const startMonth = m[weekStart.getMonth()].toLowerCase()
  const endMonth = m[weekEnd.getMonth()].toLowerCase()
  return `${startDay}. ${startMonth} – ${endDay}. ${endMonth} ${year}`
}

export function formatDaySingle(date: Date, lang?: AppLang): string {
  const m = months(lang)
  const wf = weekdaysFull(lang)
  const day = date.getDate()
  const year = date.getFullYear()
  const weekday = wf[(date.getDay() + 6) % 7]
  if (lang === 'en') {
    return `${weekday}, ${m[date.getMonth()]} ${day}, ${year}`
  }
  const month = m[date.getMonth()].toLowerCase()
  return `${day}. ${month} ${year}, ${weekday}`
}

export function formatMonthYear(date: Date, lang?: AppLang): string {
  const m = months(lang)
  if (lang === 'en') return `${m[date.getMonth()]} ${date.getFullYear()}`
  return `${m[date.getMonth()]} ${date.getFullYear()}`
}

export function formatTimeRange(startTime: string, endTime: string, timeFormat: '24h' | '12h'): string {
  if (timeFormat === '24h') return `${startTime} – ${endTime}`
  return `${to12h(startTime)} – ${to12h(endTime)}`
}

/** Format a single "HH:MM" string per the user's time-format preference. */
export function formatEventTime(time: string, fmt: '24h' | '12h'): string {
  if (fmt === '24h') return time
  return to12h(time)
}

function to12h(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
