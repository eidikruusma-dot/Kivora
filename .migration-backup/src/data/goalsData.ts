export type GoalStatus = 'active' | 'paused' | 'completed' | 'expired'

export interface GoalStep {
  id: string
  title: string
  done: boolean
}

export interface Goal {
  id: string
  title: string
  description: string
  iconBg: string
  iconColor: string
  icon: 'personal' | 'career' | 'learning' | 'health' | 'money' | 'home' | 'family' | 'travel' | 'reading' | 'sport' | 'project' | 'other'
  status: GoalStatus
  progressType: 'fraction' | 'percent'
  progressValue: number   // derived from steps
  progressMax: number     // derived from steps
  deadline: string        // display string
  deadlineShort: string   // short form for sidebar, e.g. "30. aprill"
  barColor: string
  steps: GoalStep[]
}

function makeSteps(prefix: string, total: number, done: number): GoalStep[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `${prefix}-s${i + 1}`,
    title: `${prefix === 'book' ? 'Peatükk' : 'Samm'} ${i + 1}`,
    done: i < done,
  }))
}

export const mockGoals: Goal[] = [
  {
    id: '1',
    title: 'Parendada inglise keelt',
    description: 'Treenida inglise keelt 30 minutit päevas',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    icon: 'learning',
    status: 'active',
    progressType: 'fraction',
    progressValue: 3,
    progressMax: 7,
    deadline: '30. aprill 2026',
    deadlineShort: '30. aprill',
    barColor: '#22C55E',
    steps: makeSteps('s1', 7, 3),
  },
  {
    id: '2',
    title: 'Lõpetada raamat "Atomic Habits"',
    description: 'Lugeda ja rakendada harjumuste süsteem',
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    icon: 'reading',
    status: 'active',
    progressType: 'fraction',
    progressValue: 7,
    progressMax: 10,
    deadline: '12. sept 2026',
    deadlineShort: '12. sept',
    barColor: '#6F5AE8',
    steps: makeSteps('book', 10, 7),
  },
  {
    id: '3',
    title: 'Sama vormis püsida',
    description: 'Treenida 3× nädalas',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    icon: 'sport',
    status: 'paused',
    progressType: 'fraction',
    progressValue: 5,
    progressMax: 12,
    deadline: '30. nov 2026',
    deadlineShort: '30. nov',
    barColor: '#22C55E',
    steps: makeSteps('s3', 12, 5),
  },
  {
    id: '4',
    title: 'Reisida Aasiasse',
    description: 'Külastada Jaapani ja Taimaad',
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
    icon: 'travel',
    status: 'expired',
    progressType: 'fraction',
    progressValue: 1,
    progressMax: 10,
    deadline: '31. dets 2025',
    deadlineShort: '31. dets',
    barColor: '#22C55E',
    steps: makeSteps('s4', 10, 1),
  },
]

export const UPCOMING_DEADLINES = [
  { date: '30. aprill', label: 'Inglise keele harjutamine',   icon: 'learning', iconBg: '#DCFCE7', iconColor: '#16A34A' },
  { date: '12. sept',   label: 'Atomic Habits lõpetamine',    icon: 'reading',  iconBg: '#EDE9FB', iconColor: '#6F5AE8' },
  { date: '30. nov',    label: 'Treenimise järjepidevus',     icon: 'sport',    iconBg: '#DCFCE7', iconColor: '#16A34A' },
]
