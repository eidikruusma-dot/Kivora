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

// Intentionally empty — new users start with no demo goals.
export const mockGoals: Goal[] = []

// Intentionally empty — upcoming deadlines are derived from real user goals at render time.
export const UPCOMING_DEADLINES: {
  date: string
  label: string
  icon: string
  iconBg: string
  iconColor: string
}[] = []
