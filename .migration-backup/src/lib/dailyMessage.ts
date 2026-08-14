export type DailyMessageContext = {
  date: Date
  stats?: {
    tasksTotal: number
    tasksCompleted: number
    eventsToday: number
    habitsPercent: number
    goalsPercent: number
  }
}

type MessageProvider = {
  id: string
  priority: number
  select: (ctx: DailyMessageContext) => boolean
  message: (ctx: DailyMessageContext) => string
}

const weekdayMessages: Record<number, string> = {
  1: 'Uus nädal, uued võimalused. Alustame kõige olulisemast.',
  2: 'Väikesed sammud viivad suurte tulemusteni.',
  3: 'Pool nädalat on tehtud. Jätka samas tempos.',
  4: 'Täna on hea päev lõpetada pooleliolevad ülesanded.',
  5: 'Nädal hakkab lõppema. Teeme tugeva lõpu.',
  6: 'Võta rahulikult ja leia aega ka iseendale.',
  0: 'Hea aeg uue nädala planeerimiseks.',
}

const providers: MessageProvider[] = [
  {
    id: 'weekday',
    priority: 10,
    select: () => true,
    message: (ctx) => weekdayMessages[ctx.date.getDay()] ?? 'Täna on hea päev oma eesmärkidele lähemale liikuda.',
  },
]

export function getDailyMessage(ctx: DailyMessageContext): string {
  const sorted = [...providers].sort((a, b) => b.priority - a.priority)
  for (const p of sorted) {
    if (p.select(ctx)) return p.message(ctx)
  }
  return weekdayMessages[ctx.date.getDay()] ?? 'Täna on hea päev oma eesmärkidele lähemale liikuda.'
}
