import { getAllTasks } from '@/lib/tasksStore'
import { getAllGoals } from '@/lib/goalsStore'
import { getAllHabits } from '@/lib/habitsStore'
import { getAllNotes } from '@/lib/quickNotesStore'
import { getAllEvents } from '@/lib/calendarStore'
import type { MockCalendarEvent } from '@/lib/calendar/eventLayout'
import type { Task } from '@/types'
import type { Goal } from '@/data/goalsData'
import type { Habit } from '@/data/habitsData'
import type { Note } from '@/data/notesData'

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateEE(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('et-EE', { day: 'numeric', month: 'long', year: 'numeric' })
}

function buildTasksSection(tasks: Task[]): string {
  const pending = tasks.filter((t) => !t.completed)
  if (tasks.length === 0) return '### Ülesanded\nPraegu ei ole selles moodulis ühtegi kirjet.'
  if (pending.length === 0) return '### Ülesanded\nKõik ülesanded on tehtud.'
  const lines = pending.map((t) => {
    const parts = [t.title]
    if (t.priority) parts.push(`(prioriteet: ${t.priority})`)
    if (t.date) parts.push(`[kuupäev: ${t.date}]`)
    if (t.category) parts.push(`(kategooria: ${t.category})`)
    return `- ${parts.join(' ')}`
  })
  return `### Ülesanded (tegemata ${pending.length}/${tasks.length})\n${lines.join('\n')}`
}

function buildGoalsSection(goals: Goal[]): string {
  if (goals.length === 0) return '### Eesmärgid\nPraegu ei ole selles moodulis ühtegi kirjet.'
  const lines = goals.map((g) => {
    const pct = g.progressMax > 0 ? Math.round((g.progressValue / g.progressMax) * 100) : 0
    const steps = g.steps.length > 0
      ? `${g.steps.filter((s) => s.done).length}/${g.steps.length} sammu tehtud`
      : ''
    return `- ${g.title} — staatus: ${g.status}, edenemine: ${pct}%${steps ? `, ${steps}` : ''}${g.deadline ? `, tähtaeg: ${g.deadline}` : ''}`
  })
  return `### Eesmärgid (${goals.length})\n${lines.join('\n')}`
}

function buildHabitsSection(habits: Habit[]): string {
  if (habits.length === 0) return '### Harjumused\nPraegu ei ole selles moodulis ühtegi kirjet.'
  const lines = habits.map((h) => {
    const doneToday = h.weekDays.some((d) => d === true)
    return `- ${h.title} — staatus: ${h.status}, seeria: ${h.streak} päeva${doneToday ? ', täna tehtud' : ''}${h.description ? `, ${h.description}` : ''}`
  })
  return `### Harjumused (${habits.length})\n${lines.join('\n')}`
}

function buildNotesSection(notes: Note[]): string {
  if (notes.length === 0) return '### Märkmed\nPraegu ei ole selles moodulis ühtegi kirjet.'
  const lines = notes.map((n) => `- ${n.title} (kaust: ${n.folder})`)
  return `### Märkmed (${notes.length})\n${lines.join('\n')}`
}

function buildCalendarSection(events: MockCalendarEvent[]): string {
  if (events.length === 0) return '### Kalender\nPraegu ei ole selles moodulis ühtegi kirjet.'
  const today = todayISO()
  const tomorrow = tomorrowISO()
  const todayEvents = events.filter((e) => e.date === today)
  const tomorrowEvents = events.filter((e) => e.date === tomorrow)
  const lines: string[] = []
  if (todayEvents.length > 0) {
    lines.push(`Täna (${formatDateEE(today)}):`)
    todayEvents.forEach((e) => lines.push(`  - ${e.title} ${e.startTime}–${e.endTime || ''}${e.location ? `, asukoht: ${e.location}` : ''}`))
  }
  if (tomorrowEvents.length > 0) {
    lines.push(`Homme (${formatDateEE(tomorrow)}):`)
    tomorrowEvents.forEach((e) => lines.push(`  - ${e.title} ${e.startTime}–${e.endTime || ''}${e.location ? `, asukoht: ${e.location}` : ''}`))
  }
  if (lines.length === 0) {
    lines.push('Täna ja homme pole kalendris sündmusi.')
    const upcoming = events
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 5)
    if (upcoming.length > 0) {
      lines.push('Järgmised sündmused:')
      upcoming.forEach((e) => lines.push(`  - ${e.title} ${e.startTime}–${e.endTime || ''} [${e.date}]`))
    }
  }
  return `### Kalender\n${lines.join('\n')}`
}

function buildSchoolSection(school: unknown): string {
  if (!school || typeof school !== 'object') return ''
  const s = school as {
    subjects?: { name: string; teacher?: string; room?: string }[]
    tasks?: { subject: string; title: string; type: string; deadline: string; progress: number }[]
    exams?: { subject: string; title: string; date: string; type: string; status: string; daysLeft: number }[]
    scheduleMode?: string
    scheduleLessons?: { subject: string; day: string; startTime: string; endTime: string; room?: string; teacher?: string }[]
    links?: { moodle?: string; googleDrive?: string; custom?: { name: string; url: string }[] }
  }
  const lines: string[] = []

  // Aktiivsed õppeained
  const subjects = s.subjects ?? []
  if (subjects.length > 0) {
    lines.push('### Aktiivsed õppeained')
    subjects.forEach((sub) => {
      const parts = [sub.name]
      if (sub.teacher) parts.push(`õpetaja: ${sub.teacher}`)
      if (sub.room) parts.push(`ruum: ${sub.room}`)
      lines.push(`- ${parts.join(', ')}`)
    })
  }

  // Kooliülesanded
  const tasks = s.tasks ?? []
  if (tasks.length > 0) {
    lines.push('### Kooliülesanded')
    tasks.forEach((t) => {
      const status = t.progress >= 100 ? 'tehtud' : t.progress > 0 ? 'pooleli' : 'tegemata'
      lines.push(`- ${t.subject}: ${t.title} (${t.type}) — tähtaeg: ${t.deadline}, edenemine: ${t.progress}%, staatus: ${status}`)
    })
  }

  // Kontrolltööd ja eksamid
  const exams = s.exams ?? []
  if (exams.length > 0) {
    lines.push('### Kontrolltööd ja eksamid')
    exams.forEach((e) => {
      const days = e.status === 'tehtud' ? 'tehtud' : e.daysLeft <= 0 ? 'täna' : `${e.daysLeft} päeva pärast`
      lines.push(`- ${e.subject}: ${e.title} — ${e.date}, tüüp: ${e.type}, staatus: ${e.status}, ${days}`)
    })
  }

  // Tunniplaan / õppimisplaan
  const mode = s.scheduleMode ?? 'traditional'
  const lessons = s.scheduleLessons ?? []
  if (mode === 'none') {
    lines.push('### Tunniplaan\nKasutaja ei kasuta tunniplaani (e-õpe või iseseisev õpe). See ei ole viga – toeta seda valikut.')
  } else if (lessons.length > 0) {
    const modeLabel = mode === 'elearning' ? 'e-õpe' : 'traditsiooniline'
    lines.push(`### Tunniplaan (${modeLabel})`)
    lessons.forEach((l) => {
      const parts = [`${l.day} ${l.startTime}–${l.endTime}`, l.subject]
      if (l.room) parts.push(`ruum: ${l.room}`)
      if (l.teacher) parts.push(`õpetaja: ${l.teacher}`)
      lines.push(`- ${parts.join(', ')}`)
    })
  } else {
    lines.push('### Tunniplaan\nTunniplaani ei ole sisestatud. Kui kasutaja kasutab e-õpet, toeta seda valikut.')
  }

  // Õppelingid (ainult kui olemas)
  const links = s.links
  if (links) {
    const linkLines: string[] = []
    if (links.moodle) linkLines.push(`- Moodle: ${links.moodle}`)
    if (links.googleDrive) linkLines.push(`- Google Drive: ${links.googleDrive}`)
    if (links.custom && links.custom.length > 0) {
      links.custom.forEach((c) => linkLines.push(`- ${c.name}: ${c.url}`))
    }
    if (linkLines.length > 0) {
      lines.push('### Õppelingid')
      linkLines.forEach((l) => lines.push(l))
    }
  }

  if (lines.length === 0) return ''
  return `### KOOLI MOODUL\nKasutaja tuli Kooli moodulist. Ta võib küsida õppimise planeerimise, kontrolltööks/eksamiks valmistumise, ülesannete prioriseerimise, õppeteema selgitamise, kokkuvõtte koostamise või ainepõhise õppimisplaani loomise kohta. Kui kasutaja ei kasuta tunniplaani (e-õpe), ära käsitle seda veana.\n${lines.join('\n')}`
}

export function buildAIContext(): string {
  const sections = [
    buildTasksSection(getAllTasks()),
    buildGoalsSection(getAllGoals()),
    buildHabitsSection(getAllHabits()),
    buildNotesSection(getAllNotes()),
    buildCalendarSection(getAllEvents()),
  ]
  let schoolContext = ''
  try {
    const raw = sessionStorage.getItem('kivora_school_context')
    if (raw) schoolContext = buildSchoolSection(JSON.parse(raw))
  } catch { /* ignore */ }
  if (schoolContext) sections.push(schoolContext)
  return `See on Kivora kasutaja praegune andmete ülevaade. Vasta kasutaja küsimuste korral AINULT nende andmete põhjal. Ära kasuta oma üldisi teadmisi kasutaja isiklike andmete kohta.\n\n${sections.join('\n\n')}`
}
