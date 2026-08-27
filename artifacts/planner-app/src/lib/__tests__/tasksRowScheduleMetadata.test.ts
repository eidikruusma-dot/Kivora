/**
 * Regression tests for the task-row scheduling metadata line on
 * TasksPage.tsx (added alongside the "All day" task-form option).
 *
 * Approved behavior:
 *   - All-day dated task: calendar icon + formatted date + "Kogu päev" /
 *     "All day" badge.
 *   - Timed task: calendar icon + formatted date + the selected time.
 *   - The "Kogu päev" badge never appears for a timed task.
 *   - An undated task shows no scheduling metadata line at all (never an
 *     empty one).
 *   - The row stays compact; existing category and priority badges are
 *     unaffected.
 *
 * formatTaskDate is a pure function (exported from TasksPage.tsx for this
 * reason, same "extract pure function for testability" precedent used
 * throughout this repo) and is exercised directly. The row JSX itself is
 * verified structurally, since this repo has no React rendering harness.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/tasksRowScheduleMetadata.test.ts
 */

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Importing TasksPage.tsx (even just for the exported formatTaskDate pure
// function) transitively pulls in tasksStore/automaticLinking/calendarStore/
// entityLinksStore, all of which import @/lib/firebase — mock it the same
// way every other store-touching test in this repo does, so module load
// never hits the real Firebase SDK.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  onSnapshot: vi.fn(() => vi.fn()),
}))
vi.mock('@/lib/firestoreUtils', () => ({ sanitizeForFirestore: (x: unknown) => x }))

const { formatTaskDate } = await import('@/views/TasksPage')

const SRC = readFileSync(resolve(process.cwd(), 'src/views/TasksPage.tsx'), 'utf8')

describe('formatTaskDate — compact, locale-correct, UTC-safe', () => {
  it('formats a date compactly in Estonian (day + short month, no year)', () => {
    const result = formatTaskDate('2026-08-26', 'et')
    expect(result).toContain('26')
    expect(result.toLowerCase()).toContain('aug')
    expect(result).not.toMatch(/2026/) // compact — no year
  })

  it('formats a date compactly in English (day + short month, no year)', () => {
    const result = formatTaskDate('2026-08-26', 'en')
    expect(result).toContain('26')
    expect(result).toMatch(/Aug/)
    expect(result).not.toMatch(/2026/)
  })

  it('parses via local midnight, never UTC — no off-by-one day at timezone boundaries', () => {
    expect(formatTaskDate.toString()).not.toMatch(/toISOString/)
    expect(formatTaskDate.toString()).toMatch(/T00:00:00/)
  })
})

function extractRowScheduleBlock(): string {
  const match = SRC.match(/\{task\.date && \([\s\S]*?\)\}\s*\n\s*<\/div>/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('task row: all-day dated task shows a calendar icon + date + "Kogu päev" badge', () => {
  it('renders the Calendar icon and formatTaskDate for any dated task', () => {
    const block = extractRowScheduleBlock()
    expect(block).toMatch(/<Calendar size=\{11\}/)
    expect(block).toMatch(/formatTaskDate\(task\.date, lang\)/)
  })

  it('renders the "Kogu päev"/"All day" badge only in the no-time branch', () => {
    const block = extractRowScheduleBlock()
    expect(block).toMatch(/task\.time \? \(/)
    expect(block).toMatch(/\) : \(\s*\n\s*<span className="ml-0\.5 px-1\.5 py-0\.5 rounded-full[\s\S]*?taskModal\.allDayLabel/)
  })
})

describe('task row: timed task shows the selected time, never the all-day badge', () => {
  it('the timed branch renders task.time as plain text, not the badge', () => {
    const block = extractRowScheduleBlock()
    const timedBranch = block.match(/task\.time \? \(([\s\S]*?)\) : \(/)?.[1] ?? ''
    expect(timedBranch).toMatch(/\{task\.time\}/)
    expect(timedBranch).not.toMatch(/taskModal\.allDayLabel/)
    expect(timedBranch).not.toMatch(/rounded-full/) // no badge pill in the timed branch
  })
})

describe('task row: an undated task shows no scheduling metadata line at all', () => {
  it('the entire schedule block is gated behind task.date — nothing renders when it is absent', () => {
    expect(SRC).toMatch(/\{task\.date && \(/)
    // The old unconditional "just show time if present" line is gone.
    expect(SRC).not.toMatch(/\{task\.time && \(\s*\n\s*<p className=\{`text-xs mt-0\.5/)
  })
})

describe('the row stays compact and existing category/priority badges are unaffected', () => {
  it('category and priority badges are still rendered, unchanged, alongside the schedule line', () => {
    expect(SRC).toMatch(/cat\.label/)
    expect(SRC).toMatch(/p\.label/)
    expect(SRC).toMatch(/PRIORITY_CONFIG\[task\.priority\]/)
  })

  it('the schedule line uses small, compact sizing (text-xs, small icon) consistent with the rest of the row', () => {
    const block = extractRowScheduleBlock()
    expect(block).toMatch(/text-xs/)
    expect(block).toMatch(/size=\{11\}/)
  })
})
