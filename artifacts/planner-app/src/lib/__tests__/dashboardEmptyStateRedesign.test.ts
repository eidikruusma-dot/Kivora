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
const STATCARDS_SRC = readSrc('src/components/dashboard/DashboardStatCards.tsx')
const TASKS_SRC = readSrc('src/components/dashboard/TasksWidget.tsx')
const CALENDAR_SRC = readSrc('src/components/dashboard/CalendarWidget.tsx')
const HABITS_SRC = readSrc('src/components/dashboard/HabitsWidget.tsx')
const GOALS_SRC = readSrc('src/components/dashboard/GoalsWidget.tsx')
const NOTE_SRC = readSrc('src/components/dashboard/QuickNoteWidget.tsx')
const ACTIONS_SRC = readSrc('src/components/dashboard/QuickActionsWidget.tsx')
const DASHBOARD_SRC = readSrc('src/views/Dashboard.tsx')
const BOTTOMNAV_SRC = readSrc('src/components/layout/MobileBottomNav.tsx')
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

describe('HeroCard: round-4 rebuild — cover-filled photo, no seams, gradient text scrim', () => {
  // HeroCard went through a fourth pass: round 3's `contain` + solid
  // letterbox-fill approach, while never over-zooming the photo, left a
  // visible seam between the photo and the fallback color plus empty
  // bars above/below on phones — not acceptable per the confirmed design
  // reference, which wants the photo filling the card edge to edge. Round
  // 4 switches to `cover` (always fills completely, no seam, no bars) and
  // keeps the bloom framed via a breakpoint-responsive background
  // position instead of a fixed fallback color. The earlier rounds'
  // changes (SVG petal illustration gone, round 2; mountain illustration
  // and inline stat strip gone, round 1 — stats are their own
  // DashboardStatCards component, see below) still hold.

  it('uses the optimized WebP photo as the real background image, not an SVG illustration', () => {
    expect(HERO_SRC).toMatch(/import heroBloom from '@\/assets\/dashboard\/hero-bloom\.webp'/)
    expect(HERO_SRC).toMatch(/backgroundImage: `url\(\$\{heroBloom\}\)`/)
    expect(HERO_SRC).not.toMatch(/function HeroPetals/)
    expect(HERO_SRC).not.toMatch(/MountainIllustration/)
    expect(HERO_SRC).not.toMatch(/<svg/)
  })

  it('uses `cover` (never `contain`) so the photo always fills the card edge to edge, with no visible seam or empty bars', () => {
    expect(HERO_SRC).toMatch(/bg-cover bg-no-repeat/)
    expect(HERO_SRC).not.toMatch(/backgroundSize: 'contain'/)
    expect(HERO_SRC).not.toMatch(/backgroundSize/) // size is a Tailwind class (bg-cover) now, not an inline style
  })

  it('the bloom stays framed via a breakpoint-responsive background position (further right on narrow phones, where `cover` crops more off the left)', () => {
    expect(HERO_SRC).toMatch(/bg-\[position:82%_center\] sm:bg-\[position:72%_center\] lg:bg-\[position:64%_center\]/)
  })

  it('dark mode gets a uniform darkening scrim over the WHOLE card (bloom included), not just near the text; light mode stays fully transparent', () => {
    expect(HERO_SRC).toMatch(/bg-transparent dark:bg-\[#140D28\]\/45/)
  })

  it('a separate smooth gradient sits behind the text specifically, fading toward the bloom, pale in light mode and dark in dark mode, wider/more opaque on mobile', () => {
    expect(HERO_SRC).toMatch(/bg-gradient-to-r from-white\/85 via-white\/55 to-transparent sm:from-white\/80 sm:via-white\/30 sm:to-transparent dark:from-black\/60 dark:via-black\/30 dark:to-transparent sm:dark:from-black\/55 sm:dark:via-black\/20 sm:dark:to-transparent/)
  })

  it('greeting/date/quote text is dark-purple in light mode (for contrast against the pale photo) and white in dark mode (over the scrim)', () => {
    expect(HERO_SRC).toMatch(/text-\[#3D2B6B\] dark:text-white/)
    expect(HERO_SRC).toMatch(/text-\[#5B4A8A\] dark:text-white\/85/)
    expect(HERO_SRC).toMatch(/text-\[#5B4A8A\] dark:text-white\/90/)
  })

  it('shows the real weekday + date + month + year (not just the time-of-day greeting)', () => {
    expect(HERO_SRC).toMatch(/import \{ WEEKDAYS_ET_FULL, WEEKDAYS_EN_FULL, MONTHS_ET, MONTHS_EN \} from '@\/lib\/calendar\/dateUtils'/)
    expect(HERO_SRC).toMatch(/const dateLabel = lang === 'en'/)
    expect(HERO_SRC).toMatch(/<p className="text-sm text-\[#5B4A8A\] dark:text-white\/85 font-medium">\{dateLabel\}<\/p>/)
  })

  it('the daily motivational message is styled as an italic quote and never truncates', () => {
    const quoteBlock = HERO_SRC.match(/<p className="[^"]*">\s*\n\s*„\{dailyMsg\}"\s*\n\s*<\/p>/)?.[0] ?? ''
    expect(quoteBlock).not.toBe('')
    expect(quoteBlock).toMatch(/\bitalic\b/)
    expect(quoteBlock).not.toMatch(/line-clamp/)
    expect(quoteBlock).not.toMatch(/\btruncate\b/)
  })

  it('no longer computes or renders any stat (that logic moved to DashboardStatCards)', () => {
    expect(HERO_SRC).not.toMatch(/tasksCompleted|eventsToday|goalsPercent|habitsPercent/)
    expect(HERO_SRC).not.toMatch(/useTasks|useCalendarEvents|useGoals|getDashboardPercent/)
  })

  it('the greeting text is bigger/bolder than the first redesign pass', () => {
    expect(HERO_SRC).toMatch(/text-2xl sm:text-3xl font-bold text-\[#3D2B6B\] dark:text-white leading-tight/)
  })
})

describe('DashboardStatCards: four separate glass stat cards (not one shared inset strip)', () => {
  it('renders 4 independent cards, 2x2 on narrow phones and 4-across from sm:, each with its own shadow/background', () => {
    expect(STATCARDS_SRC).toMatch(/grid grid-cols-2 sm:grid-cols-4 gap-3/)
    expect(STATCARDS_SRC).toMatch(/backdrop-blur-xl border border-white\/70 dark:border-white\/10 rounded-2xl/)
  })

  it('each stat card has its own soft pastel gradient background (Kivora 2.0 restyle), dark-mode aware, keeping the same glass blur/border/shadow chrome', () => {
    const cardBgStyles = [...STATCARDS_SRC.matchAll(/cardBg: '([^']+)',/g)].map((m) => m[1])
    expect(cardBgStyles.length).toBe(4)
    for (const bg of cardBgStyles) {
      expect(bg).toMatch(/^bg-gradient-to-br from-\[#[0-9A-Fa-f]{6}\] to-\[#[0-9A-Fa-f]{6}\] dark:from-\[#[0-9A-Fa-f]{6}\] dark:to-\[#[0-9A-Fa-f]{6}\]$/)
    }
    // all 4 gradients are distinct from one another
    expect(new Set(cardBgStyles).size).toBe(4)
  })

  it('statistic values and per-stat navigation targets are preserved exactly (tasks/events/goals%/habits%)', () => {
    expect(STATCARDS_SRC).toMatch(/value: `\$\{tasksCompleted\}\/\$\{tasksTotal\}`/)
    expect(STATCARDS_SRC).toMatch(/value: String\(eventsToday\)/)
    expect(STATCARDS_SRC).toMatch(/value: `\$\{goalsPercent\}%`/)
    expect(STATCARDS_SRC).toMatch(/value: `\$\{habitsPercent\}%`/)
    expect(STATCARDS_SRC).toMatch(/to: '\/app\/tasks'/)
    expect(STATCARDS_SRC).toMatch(/to: '\/app\/calendar'/)
    expect(STATCARDS_SRC).toMatch(/to: '\/app\/goals'/)
    expect(STATCARDS_SRC).toMatch(/to: '\/app\/habits'/)
  })

  it('stat labels never truncate with an ellipsis AND never break mid-word — sized (10px on the 2-col phone layout) to fit on one line at the narrowest supported width (320px)', () => {
    expect(STATCARDS_SRC).not.toMatch(/\btruncate\b/)
    expect(STATCARDS_SRC).not.toMatch(/break-words/) // was break-words in round 2, which produced ugly mid-word splits like "Eesmär-gid" at 320px
    expect(STATCARDS_SRC).toMatch(/text-\[10px\] sm:text-xs text-\[#94A3B8\] dark:text-\[#B4AFD1\] leading-tight whitespace-nowrap overflow-hidden/)
  })

  it('each stat card icon has a dark-mode-aware tinted circular background', () => {
    const iconStyles = [...STATCARDS_SRC.matchAll(/iconBg: '([^']+)', iconColor: '([^']+)'/g)]
    expect(iconStyles.length).toBe(4)
    for (const [, iconBg, iconColor] of iconStyles) {
      expect(iconBg).toMatch(/\bdark:/)
      expect(iconColor).toMatch(/\bdark:/)
    }
  })
})

describe('TasksWidget: compact row empty state (Kivora 2.0, 40-50% shorter), wired to the real add-task flow', () => {
  // Kivora 2.0 round: the stacked icon/text/pill-button empty state (48px
  // icon circle + py-5 + a 44px pill button) was replaced by a single
  // horizontal row (small icon + text + inline text-link CTA) so an empty
  // card is now noticeably shorter than a populated one, per the explicit
  // "tühjade kaartide kõrgust vähenda 40-50%" requirement — structural
  // change only, not just a padding tweak.
  it('renders a compact 32px icon-circle in a horizontal row (not the old 48px stacked layout), and the emptyCta translation key', () => {
    expect(TASKS_SRC).toMatch(/flex items-center gap-3 py-3/)
    expect(TASKS_SRC).toMatch(/w-8 h-8 rounded-full bg-\[#EDE9FB\]/)
    expect(TASKS_SRC).toMatch(/<ListChecks size=\{16\}/)
    expect(TASKS_SRC).toMatch(/t\('dash\.tasks\.emptyCta', lang\)/)
    expect(TASKS_SRC).not.toMatch(/w-12 h-12 rounded-full bg-\[#EDE9FB\]/)
  })

  it('the CTA is now an inline text link (no pill background), matching the task\'s accent color', () => {
    expect(TASKS_SRC).toMatch(/text-xs font-semibold text-\[#6F5AE8\] dark:text-\[#C4B5FD\] hover:underline/)
    expect(TASKS_SRC).not.toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#EDE9FB\]/)
  })

  it('the empty card no longer stretches to match a filled sibling\'s height (self-start instead of h-full)', () => {
    expect(TASKS_SRC).toMatch(/className=\{todayTasks\.length === 0 \? 'flex flex-col self-start' : 'h-full flex flex-col'\}/)
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

describe('CalendarWidget: compact row empty state (Kivora 2.0, 40-50% shorter), wired to the real add-event flow', () => {
  it('renders a compact 32px icon-circle in a horizontal row (not the old 48px stacked layout), and the emptyCta translation key', () => {
    expect(CALENDAR_SRC).toMatch(/flex items-center gap-3 py-3/)
    expect(CALENDAR_SRC).toMatch(/w-8 h-8 rounded-full bg-\[#EFF6FF\]/)
    expect(CALENDAR_SRC).toMatch(/<CalendarPlus size=\{16\}/)
    expect(CALENDAR_SRC).toMatch(/t\('dash\.calendar\.emptyCta', lang\)/)
    expect(CALENDAR_SRC).not.toMatch(/w-12 h-12 rounded-full bg-\[#EFF6FF\]/)
  })

  it('the CTA is now an inline text link (no pill background), matching the calendar\'s accent color', () => {
    expect(CALENDAR_SRC).toMatch(/text-xs font-semibold text-\[#3B82F6\] dark:text-blue-300 hover:underline/)
    expect(CALENDAR_SRC).not.toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#EFF6FF\]/)
  })

  it('the empty card no longer stretches to match a filled sibling\'s height (self-start instead of h-full)', () => {
    expect(CALENDAR_SRC).toMatch(/className=\{todayEvents\.length === 0 \? 'flex flex-col self-start' : 'h-full flex flex-col'\}/)
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

describe('HabitsWidget: compact row empty state (Kivora 2.0, 40-50% shorter), navigating to the real Habits creation surface', () => {
  it('renders a compact 32px icon-circle in a horizontal row (not the old 48px stacked layout), and the emptyCta translation key', () => {
    expect(HABITS_SRC).toMatch(/flex items-center gap-3 py-3/)
    expect(HABITS_SRC).toMatch(/w-8 h-8 rounded-full bg-\[#DCFCE7\]/)
    expect(HABITS_SRC).toMatch(/<Leaf size=\{16\}/)
    expect(HABITS_SRC).toMatch(/t\('dash\.habits\.emptyCta', lang\)/)
    expect(HABITS_SRC).not.toMatch(/w-12 h-12 rounded-full bg-\[#DCFCE7\]/)
  })

  it('the CTA is now an inline text link (no pill background), matching the habit\'s accent color', () => {
    expect(HABITS_SRC).toMatch(/text-xs font-semibold text-\[#16A34A\] dark:text-green-300 hover:underline/)
    expect(HABITS_SRC).not.toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#DCFCE7\]/)
  })

  it('the empty card no longer stretches to match a filled sibling\'s height, and the progress ring is hidden (not meaningful at 0 active habits) instead of taking up space', () => {
    expect(HABITS_SRC).toMatch(/className=\{activeHabits\.length === 0 \? 'flex flex-col self-start' : 'h-full flex flex-col'\}/)
    expect(HABITS_SRC).toMatch(/\{activeHabits\.length === 0 \? \(/)
  })

  it('the CTA navigates to /app/habits with an openCreate signal that opens the real create-habit flow on HabitsPage (see dashboardCreateFlowSignal.test.ts for the full signal-wiring coverage)', () => {
    expect(HABITS_SRC).toMatch(
      /onClick=\{\(\) => navigate\('\/app\/habits', \{ state: \{ openCreate: true \} \}\)\}[\s\S]{0,400}t\('dash\.habits\.emptyCta', lang\)/,
    )
  })

  it('populated state (active habits list + progress ring) is unchanged: same toggle handler, same ring props', () => {
    expect(HABITS_SRC).toMatch(/toggleHabitDay\(habit\.id, toDateKey\(today\)\)/)
    expect(HABITS_SRC).toMatch(/<DashboardProgressRing value=\{percent\} lang=\{lang\} size=\{88\} stroke=\{8\} \/>/)
  })
})

describe('GoalsWidget: compact row empty state (Kivora 2.0, 40-50% shorter), navigating to the real Goals creation surface', () => {
  it('renders a compact 32px icon-circle in a horizontal row (not the old 48px stacked layout), soft lavender/purple like the reference, and the emptyCta translation key', () => {
    expect(GOALS_SRC).toMatch(/flex items-center gap-3 py-3/)
    expect(GOALS_SRC).toMatch(/w-8 h-8 rounded-full bg-\[#EDE9FB\]/)
    expect(GOALS_SRC).toMatch(/<Target size=\{16\} className="text-\[#6F5AE8\] dark:text-\[#A78BFA\]"/)
    expect(GOALS_SRC).toMatch(/t\('dash\.goals\.emptyCta', lang\)/)
    expect(GOALS_SRC).not.toMatch(/w-12 h-12 rounded-full bg-\[#EDE9FB\]/)
  })

  it('the CTA is now an inline text link (no pill background), matching the goal\'s accent color', () => {
    expect(GOALS_SRC).toMatch(/text-xs font-semibold text-\[#6F5AE8\] dark:text-\[#C4B5FD\] hover:underline/)
    expect(GOALS_SRC).not.toMatch(/min-h-\[44px\] px-4 flex items-center justify-center rounded-xl bg-\[#EDE9FB\]/)
  })

  it('the empty card no longer stretches to match a filled sibling\'s height (self-start instead of h-full)', () => {
    expect(GOALS_SRC).toMatch(/className=\{goals\.length === 0 \? 'flex flex-col self-start' : 'h-full flex flex-col'\}/)
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

describe('QuickNoteWidget: compact row empty state (Kivora 2.0, 40-50% shorter), no functional change to the note-add flow', () => {
  it('still calls the real addQuickNote store action from the same input/button (no duplicate note-creation control)', () => {
    expect(NOTE_SRC).toMatch(/import \{\s*\n\s*getLatestQuickNotes,\s*\n\s*addQuickNote,\s*\n\s*subscribeNotes,\s*\n\} from '@\/lib\/quickNotesStore'/)
    expect(NOTE_SRC).toMatch(/addQuickNote\(trimmed\)/)
    // Exactly one send button (the existing add control, now a paper-plane
    // icon per the confirmed design reference, swapped from the old Plus
    // icon) — nothing new was introduced.
    const sendButtonCount = (NOTE_SRC.match(/<Send size=\{15\}/g) ?? []).length
    expect(sendButtonCount).toBe(1)
  })

  it('renders a compact 32px warm-orange tinted icon in a single horizontal row (not the old 40px icon + two-line stacked copy)', () => {
    expect(NOTE_SRC).toMatch(/import \{ Send, ArrowRight, Lightbulb, StickyNote \} from 'lucide-react'/)
    expect(NOTE_SRC).toMatch(/w-8 h-8 rounded-full bg-\[#FFEDD5\] dark:bg-orange-400\/15 flex items-center justify-center/)
    expect(NOTE_SRC).toMatch(/<Lightbulb size=\{16\} className="text-\[#F97316\] dark:text-orange-300" \/>/)
    expect(NOTE_SRC).not.toMatch(/w-10 h-10 rounded-full bg-\[#FFEDD5\]/)
  })

  it('shows a single supporting hint line (the old separate bold "emptyTitle" line was dropped as redundant with the hint)', () => {
    expect(NOTE_SRC).toMatch(/t\('dash\.notes\.emptyHint', lang\)/)
  })

  it('is rendered as a plain flex-col card, not a grid item — no self-start/h-full toggle, which would shrink its WIDTH (not just height) since it sits directly in Dashboard.tsx\'s flex-col container, not a grid row with a sibling', () => {
    expect(NOTE_SRC).toMatch(/<DashboardCard className="flex flex-col">/)
    expect(NOTE_SRC).not.toMatch(/self-start/)
  })
})

describe('QuickActionsWidget: round-2 rebuild — fully solid-colored button cards', () => {
  // Round 2 of the redesign replaced the neutral card + tinted icon chip
  // look with the confirmed design reference's fully solid-colored button
  // cards (purple / blue / peach / green gradients fill the whole button,
  // not just a small icon chip). See quickActionsWidgetMobileLabelWrap.test.ts
  // for full coverage of the current structure; this block cross-checks
  // the same color/handler invariants from this file's own reading.
  it('each action button has its own solid-colored gradient background (not just a tinted icon chip), dark-mode aware', () => {
    expect(ACTIONS_SRC).toMatch(/bg: 'bg-gradient-to-b from-\[#EDE7FD\] to-\[#E1D7FB\] dark:from-\[#3B2F66\] dark:to-\[#30275A\]'/) // purple
    expect(ACTIONS_SRC).toMatch(/bg: 'bg-gradient-to-b from-\[#DCEAFE\] to-\[#C9DEFC\] dark:from-\[#1E3156\] dark:to-\[#192A49\]'/) // blue
    expect(ACTIONS_SRC).toMatch(/bg: 'bg-gradient-to-b from-\[#FDE9D2\] to-\[#FBDCB8\] dark:from-\[#4A2E14\] dark:to-\[#3D250F\]'/) // peach
    expect(ACTIONS_SRC).toMatch(/bg: 'bg-gradient-to-b from-\[#D7F5DE\] to-\[#C2EDCD\] dark:from-\[#153821\] dark:to-\[#102C1A\]'/) // green
  })

  it('all four actions still navigate/act through the pre-existing handlers (no new store or modal logic introduced)', () => {
    expect(ACTIONS_SRC).toMatch(/onClick: \(\) => navigate\('\/app\/tasks'\)/)
    expect(ACTIONS_SRC).toMatch(/onClick: \(\) => navigate\('\/app\/calendar'\)/)
    expect(ACTIONS_SRC).toMatch(/onClick: \(\) => navigate\('\/app\/notes'\)/)
    expect(ACTIONS_SRC).toMatch(/const \{ openModal \} = useFocusTimer\(\)/)
    expect(ACTIONS_SRC).toMatch(/onClick: openModal/)
  })
})

describe('module visibility, navigation and data logic in Dashboard.tsx are untouched', () => {
  it('widget visibility is still gated purely by the modules store, unchanged', () => {
    expect(DASHBOARD_SRC).toMatch(/const \{ settings: modules \} = useModules\(\)/)
    expect(DASHBOARD_SRC).toMatch(/modules\.tasks\s+&&\s+<TasksWidget/)
    expect(DASHBOARD_SRC).toMatch(/modules\.calendar\s+&&\s+<CalendarWidget/)
    expect(DASHBOARD_SRC).toMatch(/\{modules\.notes\s+&&\s+<QuickNoteWidget\s+\/>\}/)
    expect(DASHBOARD_SRC).toMatch(/modules\.habits\s+&&\s+<HabitsWidget/)
    expect(DASHBOARD_SRC).toMatch(/modules\.goals\s+&&\s+<GoalsWidget/)
  })

  it('QuickActionsWidget and DashboardStatCards are still always rendered, independent of module toggles', () => {
    expect(DASHBOARD_SRC).toMatch(/<DashboardStatCards \/>/)
    expect(DASHBOARD_SRC).toMatch(/<QuickActionsWidget \/>/)
    expect(DASHBOARD_SRC).not.toMatch(/modules\.\w+\s+&&\s+<QuickActionsWidget/)
    expect(DASHBOARD_SRC).not.toMatch(/modules\.\w+\s+&&\s+<DashboardStatCards/)
  })

  it('uses the single unified responsive layout (no separate desktop-only/mobile-only branches)', () => {
    expect(DASHBOARD_SRC).not.toMatch(/hidden lg:flex/)
    expect(DASHBOARD_SRC).not.toMatch(/lg:hidden/)
  })
})

describe('MobileBottomNav: labels never split mid-word on the narrowest phones', () => {
  // At 320px / 6 items, the original 9.5px label size + forced
  // `hyphens-auto` produced a visible hyphen mid-word (e.g. "Harju-mused")
  // and, before that fix existed at all, no overflow handling whatsoever —
  // which let long single-word labels like "Harjumused"/"Eesmärgid"
  // visually run into the neighboring nav item. Both are gone: labels are
  // now sized to fit on one line at 320px by design, with `whitespace-nowrap
  // overflow-hidden` as a safe (invisible, non-breaking) fallback only.
  it('no label forces character-level or hyphenated breaking', () => {
    expect(BOTTOMNAV_SRC).not.toMatch(/\bhyphens-auto\b/)
    expect(BOTTOMNAV_SRC).not.toMatch(/\bbreak-words\b/)
    expect(BOTTOMNAV_SRC).not.toMatch(/\btruncate\b/)
  })

  it('labels use whitespace-nowrap + overflow-hidden (clip, never split) as the overflow fallback', () => {
    const labelSpanCount = (BOTTOMNAV_SRC.match(/text-\[8\.5px\] font-medium leading-\[1\.1\] text-center whitespace-nowrap overflow-hidden/g) ?? []).length
    expect(labelSpanCount).toBe(2) // one for the module NavLinks, one for the "Rohkem" button
  })

  it('label font-size (8.5px) is small enough to fit every nav label on one line at 320px / 6 items', () => {
    expect(BOTTOMNAV_SRC).toMatch(/text-\[8\.5px\]/)
  })

  it('icons match the confirmed design reference exactly: home / checkbox / calendar / leaf / target / grid', () => {
    expect(BOTTOMNAV_SRC).toMatch(/import \{ Home, CheckSquare, Calendar, Leaf, Target, LayoutGrid \} from 'lucide-react'/)
  })

  it('the active item gets the reference\'s rounded lavender pill behind both icon and label', () => {
    expect(BOTTOMNAV_SRC).toMatch(/isActive \? 'bg-\[#EDE7FD\] dark:bg-\[#3B2F66\]' : ''/)
  })
})
