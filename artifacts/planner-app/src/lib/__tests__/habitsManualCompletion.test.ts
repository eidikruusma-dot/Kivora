/**
 * Regression tests for a live bug: the Habits module marked activity
 * automatically instead of requiring a manual click.
 *
 * Root cause: `Habit.weekDays` was used for TWO different things at once —
 * the weekly recurrence SCHEDULE (which weekdays the habit occurs on) and
 * the DAY'S COMPLETION (was it done). addHabit() set every scheduled
 * weekday to `true` at creation time, and since the UI read `weekDays[i]
 * === true` as "done", a brand-new daily habit rendered as already
 * completed on all 7 days, the week-view header showed 100% / "7/7", and
 * there was no way to mark an arbitrary day — only "today" could be
 * toggled, via a single fixed index.
 *
 * Fix:
 *   - `weekDays` now means SCHEDULE ONLY — never touched by completion.
 *   - A new `completions: Record<dateKey, true>` map (dateKey = local
 *     "YYYY-MM-DD", see toDateKey()) is the single source of truth for
 *     "was this habit marked done on this real calendar date" — shared by
 *     the week-view header, every habit row's day buttons, the sidebar's
 *     weekly percent, the AI context builder, and the dashboard widget.
 *   - A new `createdDate` (local "YYYY-MM-DD") marks when the habit was
 *     created; days before it, days after "today", and days the habit
 *     isn't scheduled on are never markable and never counted.
 *   - `toggleHabitDay(id, dateKey, today?)` (habitsStore.ts) is the sole
 *     write path for completion — reused by the Habits page's per-day
 *     buttons, its "mark today" shortcut, and the dashboard widget. It
 *     re-validates eligibility server-side (defense in depth), updates
 *     Firestore optimistically, and reverts + rethrows on failure.
 *   - Streak is now computed fresh from `completions` (computeHabitStreak)
 *     rather than a separately-incremented counter that could drift.
 *
 * The store/pure-function half is verified functionally against a mocked
 * Firestore (same harness pattern as taskDeleteCascade.test.ts). The page's
 * button/keyboard/aria wiring has no React rendering harness in this repo,
 * so it's verified structurally against component source, consistent with
 * every other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/habitsManualCompletion.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Habit } from '@/data/habitsData'

// ── Fake Firestore, same shape as taskDeleteCascade.test.ts ────────────────

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError?: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(() => Promise.resolve())
const updateDocMock = vi.fn(() => Promise.resolve())
const deleteDocMock = vi.fn(() => Promise.resolve())

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

const {
  initHabitsStore,
  addHabit,
  toggleHabitDay,
  getAllHabits,
} = await import('@/lib/habitsStore')

const {
  toDateKey,
  isDayMarkableForHabit,
  isHabitDoneOnDate,
  computeDayStats,
  computeWeekStats,
  computeHabitStreak,
  getCurrentWeekDates,
} = await import('@/data/habitsData')

const UID_A = 'user-a'
const UID_B = 'user-b'

function seed(habits: Habit[]) {
  const lastCall = onSnapshotMock.mock.calls[onSnapshotMock.mock.calls.length - 1]
  lastCall[1]({ docs: habits.map((h) => ({ data: () => h })) })
}

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: 'habit-1',
    title: 'Joo vett',
    description: '',
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    icon: 'droplet',
    streak: 0,
    status: 'active',
    category: 'Isiklik',
    weekDays: [true, true, true, true, true, true, true],
    completions: {},
    createdDate: '2000-01-01',
    ...overrides,
  }
}

const DAILY_INPUT = {
  title: 'Joo vett',
  description: '8 klaasi',
  category: 'Isiklik' as const,
  icon: 'droplet' as const,
  iconColor: '#6F5AE8',
  iconBg: '#EDE9FB',
  recurrence: 'daily' as const,
}

beforeEach(() => {
  initHabitsStore(null)
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  updateDocMock.mockClear()
  deleteDocMock.mockClear()
  unsubscribeMock.mockClear()
  initHabitsStore(UID_A)
})

describe('a new habit starts completely undone', () => {
  it('addHabit writes an empty completions map regardless of recurrence, even though every day is scheduled', async () => {
    const habit = await addHabit(DAILY_INPUT)
    expect(habit.completions).toEqual({})
    expect(habit.weekDays.every((d) => d === true)).toBe(true) // scheduled every day...
    expect(isHabitDoneOnDate(habit, new Date())).toBe(false) // ...but never pre-marked done

    expect(setDocMock).toHaveBeenCalledTimes(1)
    const written = setDocMock.mock.calls[0][1] as Habit
    expect(written.completions).toEqual({})
    expect(written.createdDate).toBe(toDateKey(new Date()))
  })

  it('a freshly created habit contributes 0 to any day\'s "done" count but still counts toward "total" once scheduled+created', async () => {
    const habit = await addHabit(DAILY_INPUT)
    const today = new Date()
    expect(computeDayStats([habit], today, today)).toEqual({ done: 0, total: 1 })
  })
})

describe('marking and unmarking a day', () => {
  it('the first toggle marks a scheduled, eligible day done; the second toggle removes the mark', async () => {
    const habit = await addHabit(DAILY_INPUT)
    const todayKey = toDateKey(new Date())

    await toggleHabitDay(habit.id, todayKey)
    let stored = getAllHabits().find((h) => h.id === habit.id)!
    expect(isHabitDoneOnDate(stored, new Date())).toBe(true)
    expect(updateDocMock).toHaveBeenCalledTimes(1)
    expect((updateDocMock.mock.calls[0][1] as { completions: Record<string, boolean> }).completions[todayKey]).toBe(true)

    await toggleHabitDay(habit.id, todayKey)
    stored = getAllHabits().find((h) => h.id === habit.id)!
    expect(isHabitDoneOnDate(stored, new Date())).toBe(false)
    expect(updateDocMock).toHaveBeenCalledTimes(2)
    const secondWrite = updateDocMock.mock.calls[1][1] as { completions: Record<string, boolean> }
    expect(todayKey in secondWrite.completions).toBe(false)
  })

  it('toggling one day never touches any other day\'s completion', async () => {
    const habit = await addHabit(DAILY_INPUT)
    const todayKey = toDateKey(new Date())
    const yesterdayKey = toDateKey(new Date(Date.now() - 86400000))

    await toggleHabitDay(habit.id, todayKey)
    const afterFirst = getAllHabits().find((h) => h.id === habit.id)!
    expect(afterFirst.completions[yesterdayKey]).toBeUndefined()
  })
})

describe('data persists after a store reload (logout/login or page refresh)', () => {
  it('re-initialising the store and re-delivering the same persisted doc restores the completion', async () => {
    const habit = await addHabit(DAILY_INPUT)
    const todayKey = toDateKey(new Date())
    await toggleHabitDay(habit.id, todayKey)
    const persisted = (updateDocMock.mock.calls[0][1] as { completions: Record<string, boolean> }).completions

    // Simulate a reload: the store tears down, then re-subscribes.
    initHabitsStore(null)
    expect(getAllHabits()).toEqual([])
    onSnapshotMock.mockClear()
    initHabitsStore(UID_A)
    seed([{ ...habit, completions: persisted }])

    const reloaded = getAllHabits()[0]
    expect(isHabitDoneOnDate(reloaded, new Date())).toBe(true)
  })
})

describe('user data is isolated — nothing leaks between accounts', () => {
  it('switching to a different uid clears all habits, and each account only ever sees its own seeded data', async () => {
    const habitA = await addHabit({ ...DAILY_INPUT, title: 'A habit' })
    seed([habitA])
    expect(getAllHabits()).toEqual([habitA])

    initHabitsStore(null)
    expect(getAllHabits()).toEqual([])

    onSnapshotMock.mockClear()
    initHabitsStore(UID_B)
    const habitB = makeHabit({ id: 'habit-b', title: 'B habit' })
    seed([habitB])
    expect(getAllHabits()).toEqual([habitB])
  })

  it('writes always target the currently authenticated user\'s own Firestore path', async () => {
    const habitA = await addHabit(DAILY_INPUT)
    expect((setDocMock.mock.calls[0][0] as { path: string }).path).toBe(`users/${UID_A}/habits/${habitA.id}`)

    initHabitsStore(null)
    initHabitsStore(UID_B)
    const habitB = await addHabit(DAILY_INPUT)
    expect((setDocMock.mock.calls[1][0] as { path: string }).path).toBe(`users/${UID_B}/habits/${habitB.id}`)
  })
})

describe('future, pre-creation, and non-scheduled days can never be marked', () => {
  // Mon 24 Aug 2026 .. Fri 28 Aug 2026, habit scheduled Mon-Fri only, created on the Monday.
  const habit = makeHabit({ weekDays: [true, true, true, true, true, false, false], createdDate: '2026-08-24' })
  const today = new Date(2026, 7, 28) // Friday

  it('a future scheduled date is never markable', () => {
    expect(isDayMarkableForHabit(habit, new Date(2026, 7, 31), today)).toBe(false) // Mon 31 Aug — future
  })

  it('a date before the habit\'s creation is never markable, even if scheduled', () => {
    expect(isDayMarkableForHabit(habit, new Date(2026, 7, 20), today)).toBe(false) // Thu 20 Aug — before createdDate
  })

  it('a date the habit doesn\'t recur on is never markable', () => {
    expect(isDayMarkableForHabit(habit, new Date(2026, 7, 29), today)).toBe(false) // Saturday — not scheduled
  })

  it('today itself, being scheduled and within range, IS markable', () => {
    expect(isDayMarkableForHabit(habit, today, today)).toBe(true)
  })

  it('toggleHabitDay silently no-ops for an ineligible day instead of writing bad data', async () => {
    const created = await addHabit({ ...DAILY_INPUT, recurrence: 'weekdays' })
    const futureKey = toDateKey(new Date(Date.now() + 30 * 86400000))
    await toggleHabitDay(created.id, futureKey)
    expect(updateDocMock).not.toHaveBeenCalled()
  })
})

describe('daily X/Y and the weekly percent derive from the same real, stored data', () => {
  const today = new Date(2026, 7, 28) // Friday 28 Aug 2026

  it('computeDayStats counts only active, scheduled, post-creation habits — done vs total', () => {
    const done = makeHabit({ id: 'h1', completions: { '2026-08-28': true }, createdDate: '2026-08-01' })
    const notDone = makeHabit({ id: 'h2', completions: {}, createdDate: '2026-08-01' })
    const paused = makeHabit({ id: 'h3', status: 'paused', completions: { '2026-08-28': true }, createdDate: '2026-08-01' })
    expect(computeDayStats([done, notDone, paused], today, today)).toEqual({ done: 1, total: 2 })
  })

  it('a future date always returns {0, 0}, regardless of how many habits are scheduled', () => {
    const scheduled = makeHabit({ createdDate: '2026-08-01' })
    expect(computeDayStats([scheduled], new Date(2026, 7, 31), today)).toEqual({ done: 0, total: 0 })
  })

  it('computeWeekStats maps computeDayStats across the week in Monday-first order, future days zeroed', () => {
    const h = makeHabit({
      createdDate: '2026-08-24',
      completions: { '2026-08-24': true, '2026-08-25': true },
    })
    const weekDates = getCurrentWeekDates(today)
    const stats = computeWeekStats([h], weekDates, today)
    expect(stats).toHaveLength(7)
    expect(stats[0]).toEqual({ done: 1, total: 1 }) // Monday — done
    expect(stats[1]).toEqual({ done: 1, total: 1 }) // Tuesday — done
    expect(stats[4]).toEqual({ done: 0, total: 1 }) // Friday (today) — scheduled, not done
    expect(stats[5]).toEqual({ done: 0, total: 0 }) // Saturday — future, never counted
    expect(stats[6]).toEqual({ done: 0, total: 0 }) // Sunday — future, never counted
  })

  it('computeHabitStreak counts consecutive done scheduled days ending today, deriving from the same completions map', () => {
    const h = makeHabit({
      createdDate: '2026-08-24',
      completions: { '2026-08-24': true, '2026-08-25': true, '2026-08-26': true, '2026-08-27': true, '2026-08-28': true },
    })
    expect(computeHabitStreak(h, today)).toBe(5)
  })

  it('a scheduled-but-undone today breaks the streak at 0, even if yesterday was done', () => {
    const h = makeHabit({ createdDate: '2026-08-24', completions: { '2026-08-27': true } })
    expect(computeHabitStreak(h, today)).toBe(0)
  })
})

describe('switching weeks opens the correct week with that week\'s own saved results', () => {
  it('marking a day in a different (past) week persists under that exact date key', async () => {
    // Seeded directly (rather than via addHabit) so createdDate is a fixed
    // date well before the navigated week, independent of the real clock.
    const habit = makeHabit({ createdDate: '2026-01-01' })
    seed([habit])
    const pastMonday = toDateKey(new Date(2026, 7, 17))
    const fixedToday = new Date(2026, 7, 28)
    await toggleHabitDay(habit.id, pastMonday, fixedToday)
    expect((updateDocMock.mock.calls[0][1] as { completions: Record<string, boolean> }).completions[pastMonday]).toBe(true)
  })

  it('getCurrentWeekDates resolves the correct Monday-start week for any reference date, not just "now"', () => {
    const prevWeek = getCurrentWeekDates(new Date(2026, 7, 21))
    expect(toDateKey(prevWeek[0])).toBe('2026-08-17')
    expect(toDateKey(prevWeek[6])).toBe('2026-08-23')

    const nextWeek = getCurrentWeekDates(new Date(2026, 8, 2))
    expect(toDateKey(nextWeek[0])).toBe('2026-08-31')
    expect(toDateKey(nextWeek[6])).toBe('2026-09-06')
  })
})

describe('Firestore error behavior: a failed write never leaves a wrong result on screen', () => {
  it('a rejected updateDoc reverts the optimistic completion and rethrows for the caller to show its own error toast', async () => {
    const habit = await addHabit(DAILY_INPUT)
    const todayKey = toDateKey(new Date())
    updateDocMock.mockImplementationOnce(() => Promise.reject(new Error('simulated Firestore failure')))

    await expect(toggleHabitDay(habit.id, todayKey)).rejects.toThrow('simulated Firestore failure')

    const reverted = getAllHabits().find((h) => h.id === habit.id)!
    expect(isHabitDoneOnDate(reverted, new Date())).toBe(false)
  })

  it('a subsequent successful toggle still works after a prior failure (the revert left state consistent)', async () => {
    const habit = await addHabit(DAILY_INPUT)
    const todayKey = toDateKey(new Date())
    updateDocMock.mockImplementationOnce(() => Promise.reject(new Error('simulated failure')))
    await expect(toggleHabitDay(habit.id, todayKey)).rejects.toThrow()

    await toggleHabitDay(habit.id, todayKey)
    const stored = getAllHabits().find((h) => h.id === habit.id)!
    expect(isHabitDoneOnDate(stored, new Date())).toBe(true)
  })
})

// ── Component wiring: verified structurally (no React rendering harness) ──

const HABITS_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/HabitsPage.tsx'), 'utf8')
const HABITS_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/habitsStore.ts'), 'utf8')
const HABITS_WIDGET_SRC = readFileSync(resolve(process.cwd(), 'src/components/dashboard/HabitsWidget.tsx'), 'utf8')

describe('per-day marking uses real buttons with keyboard support and descriptive aria-labels', () => {
  it('each day circle in the habit row is a real, keyboard-activatable <button>', () => {
    expect(HABITS_PAGE_SRC).toMatch(/<button\s*\n\s*type="button"\s*\n\s*disabled=\{!markable \|\| pendingToggleKey === pendingKey\}\s*\n\s*onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\);\s*\n\s*handleToggleDay\(habit\.id, dateKey\);\s*\n\s*\}\}/)
  })

  it('the button exposes aria-pressed for its done state and an aria-label naming the habit, the date, and the action', () => {
    expect(HABITS_PAGE_SRC).toMatch(/aria-pressed=\{done\}/)
    expect(HABITS_PAGE_SRC).toMatch(/aria-label=\{`\$\{habit\.title\} — \$\{dayLabel\} — \$\{/)
    expect(HABITS_PAGE_SRC).toMatch(/const dayLabel = formatDaySingle\(date, lang\);/)
  })

  it('ineligible days are disabled via the real isDayMarkableForHabit check, not merely styled differently', () => {
    expect(HABITS_PAGE_SRC).toMatch(/const markable = habit\.status === "active" && isDayMarkableForHabit\(habit, date, today\);/)
  })
})

describe('a habit is never marked done automatically', () => {
  it('addHabit always writes an empty completions map', () => {
    expect(HABITS_STORE_SRC).toMatch(/completions: \{\},/)
  })

  it('exactly one place in the store ever sets a completions entry to true', () => {
    expect((HABITS_STORE_SRC.match(/nextCompletions\[dateKey\] = true/g) ?? []).length).toBe(1)
  })
})

describe('week switching is wired to real navigation, reusing the same store data — no parallel system', () => {
  it('Prev/Next week buttons change weekOffset', () => {
    expect(HABITS_PAGE_SRC).toMatch(/onClick=\{\(\) => setWeekOffset\(\(o\) => o - 1\)\}/)
    expect(HABITS_PAGE_SRC).toMatch(/onClick=\{\(\) => setWeekOffset\(\(o\) => o \+ 1\)\}/)
  })

  it('the sidebar\'s "This week" stat always uses the real current week, independent of weekOffset', () => {
    expect(HABITS_PAGE_SRC).toMatch(/const currentWeekDates = getCurrentWeekDates\(today\);/)
    expect(HABITS_PAGE_SRC).toMatch(/const currentWeekTotals = computeWeekStats\(habits, currentWeekDates, today\);/)
    expect(HABITS_PAGE_SRC).toMatch(/const weekDone = currentWeekTotals\.reduce/)
  })

  it('navigating to the Habits page resets weekOffset back to the real current week', () => {
    const effect = HABITS_PAGE_SRC.match(/useEffect\(\(\) => \{\s*\n\s*setFilter\("all"\);[\s\S]*?\n\s*\}, \[location\.key\]\);/)?.[0] ?? ''
    expect(effect).not.toBe('')
    expect(effect).toMatch(/setWeekOffset\(0\);/)
  })
})

describe('no duplicate/parallel completion system was introduced', () => {
  it('exactly one handleToggleDay exists, reused by the week-view row buttons and the manage-modal shortcut', () => {
    expect((HABITS_PAGE_SRC.match(/const handleToggleDay = async/g) ?? []).length).toBe(1)
    expect((HABITS_PAGE_SRC.match(/handleToggleDay\(habit\.id, /g) ?? []).length).toBe(2)
  })

  it('the dashboard widget reuses the same toggleHabitDay store action instead of its own logic', () => {
    expect(HABITS_WIDGET_SRC).toMatch(/toggleHabitDay\(/)
    expect(HABITS_WIDGET_SRC).not.toMatch(/toggleToday/)
  })

  it('toggleToday no longer exists anywhere — toggleHabitDay is the sole completion write path', () => {
    expect(HABITS_STORE_SRC).not.toMatch(/export async function toggleToday/)
    expect(HABITS_PAGE_SRC).not.toMatch(/\btoggleToday\b/)
  })
})

describe('Firestore error behavior uses the existing generic error-toast pattern and guards against double-submit', () => {
  it('handleToggleDay catches a rejected toggle and shows toast.error with the same inline ET/EN style used elsewhere on this page', () => {
    const fn = HABITS_PAGE_SRC.match(/const handleToggleDay = async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).not.toBe('')
    expect(fn).toMatch(/catch \{/)
    expect(fn).toMatch(/toast\.error\(lang === 'et' \? '[^']+' : '[^']+'\)/)
  })

  it('a second click while one toggle is already in flight is ignored', () => {
    const fn = HABITS_PAGE_SRC.match(/const handleToggleDay = async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/if \(pendingToggleKey\) return;/)
  })

  it('pendingToggleKey is always cleared in a finally block, so a failure never leaves buttons permanently disabled', () => {
    const fn = HABITS_PAGE_SRC.match(/const handleToggleDay = async[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/finally \{\s*\n\s*setPendingToggleKey\(null\);\s*\n\s*\}/)
  })
})

describe('unrelated Habits behavior is untouched by this fix', () => {
  it('the habit form, category/icon/color selection, recurrence, and custom weekday picking are unaffected', () => {
    expect(HABITS_PAGE_SRC).toMatch(/const handleCategoryChange = \(category: HabitCategory\) => \{/)
    expect(HABITS_PAGE_SRC).toMatch(/const CATEGORY_DEFAULTS: Record<HabitCategory/)
    expect(HABITS_PAGE_SRC).toMatch(/form\.recurrence === "custom"/)
    expect(HABITS_PAGE_SRC).toMatch(/goalPerDay: Math\.max\(1, Number\(e\.target\.value\)\),/)
  })

  it('filters, edit/delete flows, and the create/edit modal validation are unaffected', () => {
    expect(HABITS_PAGE_SRC).toMatch(/const filtered = habits\.filter\(\(h\) => \{/)
    expect(HABITS_PAGE_SRC).toMatch(/const handleDelete = async \(id: string\) => \{/)
    expect(HABITS_PAGE_SRC).toMatch(/if \(!form\.title\.trim\(\)\) \{/)
  })

  it('openEditModal still derives recurrence purely from the schedule (weekDays), unrelated to completions', () => {
    const fn = HABITS_PAGE_SRC.match(/const openEditModal = \(habit: Habit\) => \{[\s\S]*?\n  \};/)?.[0] ?? ''
    expect(fn).toMatch(/habit\.weekDays\.every\(/)
    expect(fn).not.toMatch(/completions/)
  })
})
