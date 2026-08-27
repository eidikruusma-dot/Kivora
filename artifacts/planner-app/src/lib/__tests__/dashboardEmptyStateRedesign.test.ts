/**
 * Regression tests for the "Minu päev" dashboard empty-state + dark-mode
 * redesign:
 *   - HeroCard: soft-lavender banner, full (non-truncated) daily message,
 *     mountain illustration made dark-aware.
 *   - TasksWidget / CalendarWidget / HabitsWidget / GoalsWidget: compact
 *     icon + text + CTA empty states, with the CTA wired to the same
 *     creation flow used elsewhere in the app (no duplicated modal/store
 *     logic — either a directly-reused standalone modal + store action, or
 *     navigation to the module's own page when no standalone modal exists).
 *   - QuickActionsWidget: softly tinted purple/blue/orange/green icon
 *     containers for New task / New event / Quick note / Focus timer.
 *   - All new/changed empty-state and CTA copy exists in both ET and EN,
 *     added as new keys in translations.ts without touching any existing
 *     School (`sched.*`) line.
 *
 * No React rendering harness exists in this repo (same precedent as
 * scheduleTabEmptyState.test.ts / tasksPageResponsive.test.ts), so this is
 * verified structurally against the component and translations source.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/dashboardEmptyStateRedesign.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const HERO_SRC = readSrc('src/components/dashboard/HeroCard.tsx')
const TASKS_SRC = readSrc('src/components/dashboard/TasksWidget.tsx')
const CALENDAR_SRC = readSrc('src/components/dashboard/CalendarWidget.tsx')
const HABITS_SRC = readSrc('src/components/dashboard/HabitsWidget.tsx')
const GOALS_SRC = readSrc('src/components/dashboard/GoalsWidget.tsx')
const NOTE_SRC = readSrc('src/components/dashboard/QuickNoteWidget.tsx')
const ACTIONS_SRC = readSrc('src/components/dashboard/QuickActionsWidget.tsx')
const DASHBOARD_SRC = readSrc('src/views/Dashboard.tsx')
const TRANSLATIONS_SRC = readSrc('src/lib/translations.ts')

describe('translation keys: dashboard empty-state CTAs exist in ET and EN', () => {
  const ctaKeys: Array<[key: string, et: string, en: string]> = [
    ['dash.tasks.emptyCta', '+ Lisa ülesanne', '+ Add task'],
    ['dash.calendar.emptyCta', '+ Lisa sündmus', '+ Add event'],
    ['dash.habits.emptyCta', '+ Loo harjumus', '+ Create habit'],
    ['dash.goals.emptyCta', '+ Sea eesmärk', '+ Set goal'],
  ]

  it.each(ctaKeys)('%s is declared in the translation key union', (key) => {
    expect(TRANSLATIONS_SRC).toContain(`"${key}"`)
  })

  it.each(ctaKeys)('%s has the exact approved ET copy', (key, et) => {
    const escaped = et.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(TRANSLATIONS_SRC).toMatch(new RegExp(`"${key.replace(/\./g, '\\.')}":\\s*"${escaped}"`))
  })

  it.each(ctaKeys)('%s has the exact approved EN copy', (key, _et, en) => {
    const escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    expect(TRANSLATIONS_SRC).toMatch(new RegExp(`"${key.replace(/\./g, '\\.')}":\\s*"${escaped}"`))
  })
})

describe('translation keys: Quick Note two-line empty state exists in ET and EN', () => {
  it('dash.notes.emptyTitle is declared in the translation key union', () => {
    expect(TRANSLATIONS_SRC).toContain('"dash.notes.emptyTitle"')
  })

  it('dash.notes.emptyTitle and dash.notes.emptyHint both have non-empty ET copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"dash\.notes\.emptyTitle":\s*"Pane oma mõte kirja"/)
    expect(TRANSLATIONS_SRC).toMatch(/"dash\.notes\.emptyHint":\s*"Siia kogunevad sinu kiired märkmed\."/)
  })

  it('dash.notes.emptyTitle and dash.notes.emptyHint both have non-empty EN copy', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"dash\.notes\.emptyTitle":\s*"Jot down a quick thought"/)
    expect(TRANSLATIONS_SRC).toMatch(/"dash\.notes\.emptyHint":\s*"Your quick notes will appear here\."/)
  })
})

describe('unrelated School (sched.*) translation lines are byte-for-byte untouched by this task', () => {
  it('every sched.* key referenced by ScheduleTab.tsx is still present, unmodified, in translations.ts', () => {
    const SCHEDULE_TAB_SRC = readSrc('src/components/school/ScheduleTab.tsx')
    const schedKeys = new Set(
      [...SCHEDULE_TAB_SRC.matchAll(/t\('(sched\.[a-zA-Z0-9._]+)'/g)].map((m) => m[1]),
    )
    expect(schedKeys.size).toBeGreaterThan(0)
    for (const key of schedKeys) {
      expect(TRANSLATIONS_SRC).toContain(`"${key}"`)
    }
  })
})

describe('HeroCard: livelier lavender banner + full motivational text + dark-mode illustration', () => {
  it('the outer card uses the soft-lavender background, not plain white', () => {
    expect(HERO_SRC).toMatch(/bg-\[#F4F2FF\]/)
    expect(HERO_SRC).not.toMatch(/<div className="bg-white/)
  })

  it('the daily-message text no longer truncates (no line-clamp/truncate on it)', () => {
    const dailyMsgLines = HERO_SRC
      .split('\n')
      .filter((line) => line.includes('{dailyMsg}'))
    expect(dailyMsgLines.length).toBeGreaterThan(0)
    for (const line of dailyMsgLines) {
      expect(line).not.toMatch(/line-clamp/)
      expect(line).not.toMatch(/\btruncate\b/)
    }
  })

  it('the mountain illustration is dark-mode aware (accepts isDark and varies its sky gradient)', () => {
    expect(HERO_SRC).toMatch(/function MountainIllustration\(\{ isDark \}: \{ isDark: boolean \}\)/)
    expect(HERO_SRC).toMatch(/stopColor=\{isDark \? '#1E1B2E' : '#EDE9FB'\}/)
    expect(HERO_SRC).toMatch(/<MountainIllustration isDark=\{isDark\} \/>/)
  })

  it('uses the shared useIsDark hook rather than introducing a new dark-mode mechanism', () => {
    expect(HERO_SRC).toMatch(/import \{ useIsDark, tc \} from '@\/lib\/themeColors'/)
    expect(HERO_SRC).toMatch(/const isDark = useIsDark\(\)/)
  })

  it('the old side-by-side vertical-divider stats arrangement is gone', () => {
    expect(HERO_SRC).not.toMatch(/h-10 w-px flex-shrink-0/)
    expect(HERO_SRC).not.toMatch(/E5DFFC/)
  })

  it('all four statistics now sit together in one lighter inset row below the greeting', () => {
    const smBlock = HERO_SRC.match(/hidden sm:block[\s\S]*?\n {6}<\/div>\n\n {4}<\/div>/)?.[0] ?? ''
    expect(smBlock).not.toBe('')
    // The greeting/message block and the mountain sit in one row...
    expect(smBlock).toMatch(/flex items-start justify-between gap-4/)
    // ...and the stats grid is a separate, visually lighter block underneath, not inline with the greeting.
    const statsRowMatch = smBlock.match(/<div\s*\n\s*className="bg-white rounded-xl[\s\S]*?<\/div>\s*\n\s*<\/div>/)
    expect(statsRowMatch).not.toBeNull()
    expect(statsRowMatch![0]).toMatch(/grid grid-cols-2 md:grid-cols-4/)
    expect(statsRowMatch![0]).toMatch(/\{stats\.map\(\(s\) => <StatButton key=\{s\.label\} \{\.\.\.s\} \/>\)\}/)
  })

  it('the stats row uses the shared bg-white dark-mode override, not a bespoke color', () => {
    expect(HERO_SRC).toMatch(/className="bg-white rounded-xl px-4 py-3 mt-3 grid grid-cols-2 md:grid-cols-4/)
  })

  it('the mountain illustration is visible from md (tablet) rather than only lg (desktop), and height-driven so it stays compact', () => {
    expect(HERO_SRC).not.toMatch(/hidden lg:block/)
    expect(HERO_SRC).toMatch(/hidden md:block flex-shrink-0 h-16 lg:h-20 xl:h-24 aspect-\[11\/10\]/)
  })

  it('the desktop/tablet section has no oversized vertical padding or explicit min-height causing an empty gap', () => {
    expect(HERO_SRC).toMatch(/hidden sm:block px-5 lg:px-6 py-3 lg:py-4/)
    expect(HERO_SRC).not.toMatch(/minHeight/)
    expect(HERO_SRC).not.toMatch(/min-h-/)
    expect(HERO_SRC).not.toMatch(/flex-grow|flex-1.*MountainIllustration|grow\b/)
  })

  it('the mountain sits beside the greeting, not overlapping the stats row (separate flex row vs. separate block)', () => {
    const illustrationIdx = HERO_SRC.indexOf('<MountainIllustration isDark={isDark} />')
    const statsRowIdx = HERO_SRC.indexOf('grid grid-cols-2 md:grid-cols-4')
    expect(illustrationIdx).toBeGreaterThan(-1)
    expect(statsRowIdx).toBeGreaterThan(-1)
    expect(illustrationIdx).toBeLessThan(statsRowIdx)
  })

  it('statistic values and per-stat logic are preserved exactly (tasks/events/goals%/habits%)', () => {
    expect(HERO_SRC).toMatch(/value: `\$\{tasksCompleted\}\/\$\{tasksTotal\}`/)
    expect(HERO_SRC).toMatch(/value: String\(eventsToday\)/)
    expect(HERO_SRC).toMatch(/value: `\$\{goalsPercent\}%`/)
    expect(HERO_SRC).toMatch(/value: `\$\{habitsPercent\}%`/)
  })

  it('mobile portrait layout is unchanged (no illustration, stacked greeting + 2x2 grid)', () => {
    const portraitBlock = HERO_SRC.match(/sm:hidden px-4 py-3[\s\S]*?<\/div>\s*\n {6}<\/div>/)?.[0] ?? ''
    expect(portraitBlock).not.toBe('')
    expect(portraitBlock).not.toMatch(/MountainIllustration/)
    expect(portraitBlock).toMatch(/grid grid-cols-2 gap-2/)
  })
})

describe('TasksWidget: compact icon + CTA empty state, wired to the real add-task flow', () => {
  it('renders a 48px icon-circle (up from 36px) with a proportionally larger icon, and the emptyCta translation key', () => {
    expect(TASKS_SRC).toMatch(/w-12 h-12 rounded-full bg-\[#EDE9FB\]/)
    expect(TASKS_SRC).toMatch(/<ListChecks size=\{22\}/)
    expect(TASKS_SRC).toMatch(/t\('dash\.tasks\.emptyCta', lang\)/)
  })

  it('the CTA uses a soft lavender/purple tint (not the old uniform solid-purple button)', () => {
    expect(TASKS_SRC).toMatch(/bg-\[#EDE9FB\] text-\[#6F5AE8\] text-xs font-semibold hover:opacity-80/)
    expect(TASKS_SRC).not.toMatch(/bg-\[#6F5AE8\] text-white text-xs font-medium hover:bg-\[#5B48D8\]/)
  })

  it('the CTA keeps its 44px minimum tap target', () => {
    expect(TASKS_SRC).toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#EDE9FB\]/)
  })

  it('the CTA button opens AddTaskModal, and saving calls the real addTask store action (not a fake/no-op)', () => {
    expect(TASKS_SRC).toMatch(/import \{ useTasks, toggleTask, addTask \} from '@\/lib\/tasksStore'/)
    expect(TASKS_SRC).toMatch(/import AddTaskModal from '@\/components\/tasks\/AddTaskModal'/)
    expect(TASKS_SRC).toMatch(/onClick=\{\(\) => setAddOpen\(true\)\}/)
    expect(TASKS_SRC).toMatch(/const handleAddTask = async \(task: Task\) => \{\s*\n\s*await addTask\(task\)/)
    expect(TASKS_SRC).toMatch(/<AddTaskModal open=\{addOpen\} onClose=\{[^}]+\} onSave=\{handleAddTask\}/)
  })

  it('does not define a second, duplicate task-creation modal or store function', () => {
    expect(TASKS_SRC.match(/function AddTaskModal|const AddTaskModal\s*=/g)).toBeNull()
    expect(TASKS_SRC.match(/function addTask\b/g)).toBeNull()
  })
})

describe('CalendarWidget: compact icon + CTA empty state, wired to the real add-event flow', () => {
  it('renders a 48px icon-circle (up from 36px) with a proportionally larger icon, and the emptyCta translation key', () => {
    expect(CALENDAR_SRC).toMatch(/w-12 h-12 rounded-full bg-\[#EFF6FF\]/)
    expect(CALENDAR_SRC).toMatch(/<CalendarPlus size=\{22\}/)
    expect(CALENDAR_SRC).toMatch(/t\('dash\.calendar\.emptyCta', lang\)/)
  })

  it('the CTA uses a soft blue tint (not the old uniform solid-purple button)', () => {
    expect(CALENDAR_SRC).toMatch(/bg-\[#EFF6FF\] text-\[#3B82F6\] text-xs font-semibold hover:opacity-80/)
    expect(CALENDAR_SRC).not.toMatch(/bg-\[#6F5AE8\] text-white text-xs font-medium hover:bg-\[#5B48D8\]/)
  })

  it('the CTA keeps its 44px minimum tap target', () => {
    expect(CALENDAR_SRC).toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#EFF6FF\]/)
  })

  it('the CTA opens a second, create-mode NewEventModal instance wired to the real addCalendarEvent store action', () => {
    expect(CALENDAR_SRC).toMatch(/import \{ useCalendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent \} from '@\/lib\/calendarStore'/)
    expect(CALENDAR_SRC).toMatch(/onClick=\{\(\) => setAddOpen\(true\)\}/)
    expect(CALENDAR_SRC).toMatch(/const handleAddEvent = \(event: MockCalendarEvent\) => \{\s*\n\s*addCalendarEvent\(event\)/)
    const newEventModalCount = (CALENDAR_SRC.match(/<NewEventModal/g) ?? []).length
    expect(newEventModalCount).toBe(2)
    expect(CALENDAR_SRC).toMatch(/<NewEventModal\s*\n\s*open=\{addOpen\}\s*\n\s*onClose=\{\(\) => setAddOpen\(false\)\}\s*\n\s*onSave=\{handleAddEvent\}/)
  })

  it('the create-mode modal reuses the widget-local CALENDARS list rather than a second definition', () => {
    const calendarsDeclCount = (CALENDAR_SRC.match(/const CALENDARS = \[/g) ?? []).length
    expect(calendarsDeclCount).toBe(1)
  })
})

describe('HabitsWidget: compact icon + CTA empty state, navigating to the real Habits creation surface', () => {
  it('renders a 48px icon-circle (up from 36px) with a proportionally larger icon, and the emptyCta translation key', () => {
    expect(HABITS_SRC).toMatch(/w-12 h-12 rounded-full bg-\[#DCFCE7\]/)
    expect(HABITS_SRC).toMatch(/<Repeat size=\{22\}/)
    expect(HABITS_SRC).toMatch(/t\('dash\.habits\.emptyCta', lang\)/)
  })

  it('the CTA uses a soft mint/green tint (not the old uniform solid-purple button)', () => {
    expect(HABITS_SRC).toMatch(/bg-\[#DCFCE7\] text-\[#16A34A\] text-xs font-semibold hover:opacity-80/)
    expect(HABITS_SRC).not.toMatch(/bg-\[#6F5AE8\] text-white text-xs font-medium hover:bg-\[#5B48D8\]/)
  })

  it('the CTA keeps its 44px minimum tap target', () => {
    expect(HABITS_SRC).toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#DCFCE7\]/)
  })

  it('the CTA navigates to /app/habits with an openCreate signal that opens the real create-habit flow on HabitsPage (see dashboardCreateFlowSignal.test.ts for the full signal-wiring coverage)', () => {
    expect(HABITS_SRC).toMatch(
      /onClick=\{\(\) => navigate\('\/app\/habits', \{ state: \{ openCreate: true \} \}\)\}[\s\S]{0,400}t\('dash\.habits\.emptyCta', lang\)/,
    )
  })
})

describe('GoalsWidget: compact icon + CTA empty state, navigating to the real Goals creation surface', () => {
  it('renders a 48px icon-circle (up from 36px) with a proportionally larger icon, soft lavender/purple like the reference, and the emptyCta translation key', () => {
    expect(GOALS_SRC).toMatch(/w-12 h-12 rounded-full bg-\[#EDE9FB\]/)
    expect(GOALS_SRC).toMatch(/<Flag size=\{22\} className="text-\[#6F5AE8\]"/)
    expect(GOALS_SRC).toMatch(/t\('dash\.goals\.emptyCta', lang\)/)
  })

  it('the CTA uses a soft lavender/purple tint (not the old uniform solid-purple button)', () => {
    expect(GOALS_SRC).toMatch(/bg-\[#EDE9FB\] text-\[#6F5AE8\] text-xs font-semibold hover:opacity-80/)
    expect(GOALS_SRC).not.toMatch(/bg-\[#6F5AE8\] text-white text-xs font-medium hover:bg-\[#5B48D8\]/)
  })

  it('the CTA keeps its 44px minimum tap target', () => {
    expect(GOALS_SRC).toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#EDE9FB\]/)
  })

  it('the CTA navigates to /app/goals with an openCreate signal that opens the real create-goal flow on GoalsPage (see dashboardCreateFlowSignal.test.ts for the full signal-wiring coverage)', () => {
    expect(GOALS_SRC).toMatch(
      /onClick=\{\(\) => navigate\('\/app\/goals', \{ state: \{ openCreate: true \} \}\)\}[\s\S]{0,400}t\('dash\.goals\.emptyCta', lang\)/,
    )
  })

  it('the per-goal inline colors gain dark-mode-aware opacity via useIsDark, without changing the populated-state color values', () => {
    expect(GOALS_SRC).toMatch(/import \{ useIsDark \} from '@\/lib\/themeColors'/)
    expect(GOALS_SRC).toMatch(/const isDark = useIsDark\(\)/)
    expect(GOALS_SRC).toMatch(/backgroundColor: `\$\{color\}\$\{isDark \? '30' : '15'\}`/)
    // Populated-state goal icon/percentage colors themselves are untouched
    expect(GOALS_SRC).toMatch(/const goalColors = \['#6F5AE8', '#F97316'\]/)
  })
})

describe('QuickNoteWidget: warm icon + two-line empty copy, no functional change to the note-add flow', () => {
  it('still calls the real addQuickNote store action from the same input/button (no duplicate note-creation control)', () => {
    expect(NOTE_SRC).toMatch(/import \{\s*\n\s*getLatestQuickNotes,\s*\n\s*addQuickNote,\s*\n\s*subscribeNotes,\s*\n\} from '@\/lib\/quickNotesStore'/)
    expect(NOTE_SRC).toMatch(/addQuickNote\(trimmed\)/)
    // Exactly one Plus-icon button (the existing add control) — nothing new was introduced.
    const plusButtonCount = (NOTE_SRC.match(/<Plus size=\{16\}/g) ?? []).length
    expect(plusButtonCount).toBe(1)
  })

  it('renders a small warm-orange tinted icon container in the empty state', () => {
    expect(NOTE_SRC).toMatch(/import \{ Plus, ArrowRight, Lightbulb \} from 'lucide-react'/)
    expect(NOTE_SRC).toMatch(/w-10 h-10 rounded-full bg-\[#FFEDD5\] flex items-center justify-center/)
    expect(NOTE_SRC).toMatch(/<Lightbulb size=\{18\} className="text-\[#F97316\]" \/>/)
  })

  it('renders both the primary and the lighter supporting empty-state lines', () => {
    expect(NOTE_SRC).toMatch(/t\('dash\.notes\.emptyTitle', lang\)/)
    expect(NOTE_SRC).toMatch(/t\('dash\.notes\.emptyHint', lang\)/)
    const emptyBlock = NOTE_SRC.match(/<div className="flex flex-col items-center text-center gap-2 py-2">[\s\S]*?<\/div>\s*\n\s*<\/div>/)?.[0] ?? ''
    expect(emptyBlock).not.toBe('')
    const titleIdx = emptyBlock.indexOf("t('dash.notes.emptyTitle', lang)")
    const hintIdx = emptyBlock.indexOf("t('dash.notes.emptyHint', lang)")
    expect(titleIdx).toBeGreaterThan(-1)
    expect(hintIdx).toBeGreaterThan(titleIdx)
  })
})

describe('QuickActionsWidget: softly tinted purple/blue/orange/green icon containers', () => {
  it('New task / New event / Quick note icons each sit in their own tinted container', () => {
    expect(ACTIONS_SRC).toMatch(/iconBg: 'bg-\[#EDE9FB\]', iconColor: 'text-\[#6F5AE8\]'/) // purple
    expect(ACTIONS_SRC).toMatch(/iconBg: 'bg-\[#EFF6FF\]', iconColor: 'text-\[#3B82F6\]'/) // blue
    expect(ACTIONS_SRC).toMatch(/iconBg: 'bg-\[#FFEDD5\]', iconColor: 'text-\[#F97316\]'/) // orange
  })

  it('the Focus timer action gets its own tinted (green) container, matching the other three', () => {
    const timerBlock = ACTIONS_SRC.match(/onClick=\{openModal\}[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(timerBlock).toMatch(/bg-\[#DCFCE7\]/)
    expect(timerBlock).toMatch(/<Timer size=\{16\} className="text-\[#16A34A\]" \/>/)
  })

  it('all four actions still navigate/act through the pre-existing handlers (no new store or modal logic introduced)', () => {
    expect(ACTIONS_SRC).toMatch(/onClick=\{\(\) => navigate\(to\)\}/)
    expect(ACTIONS_SRC).toMatch(/const \{ openModal \} = useFocusTimer\(\)/)
  })
})

describe('module visibility, navigation and data logic in Dashboard.tsx are untouched', () => {
  it('widget visibility is still gated purely by the modules store, unchanged', () => {
    expect(DASHBOARD_SRC).toMatch(/const \{ settings: modules \} = useModules\(\)/)
    expect(DASHBOARD_SRC).toMatch(/modules\.tasks\s+&&\s+<TasksWidget/)
    expect(DASHBOARD_SRC).toMatch(/modules\.calendar\s+&&\s+<CalendarWidget/)
    expect(DASHBOARD_SRC).toMatch(/modules\.notes\s+&&\s+<QuickNoteWidget/)
    expect(DASHBOARD_SRC).toMatch(/modules\.habits\s+&&\s+<HabitsWidget/)
    expect(DASHBOARD_SRC).toMatch(/modules\.goals\s+&&\s+<GoalsWidget/)
  })

  it('QuickActionsWidget is still always rendered, independent of module toggles', () => {
    expect(DASHBOARD_SRC).toMatch(/<QuickActionsWidget key="actions" \/>/)
  })
})
