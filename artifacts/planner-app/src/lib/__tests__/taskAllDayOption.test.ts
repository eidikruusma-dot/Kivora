/**
 * Regression tests for the explicit "All day" ("Kogu päev") option in
 * AddTaskModal.tsx — the single shared modal used for both the Add Task
 * and Edit Task forms (no second form was created).
 *
 * Approved behavior:
 *   - The option sits alongside the Date/Time fields in both create and
 *     edit modes (same component, same JSX).
 *   - Checking it clears + disables the time input, and saves the task
 *     with no time.
 *   - Unchecking it re-enables the time input; if a date is selected, a
 *     time becomes required, with an inline validation message if missing.
 *   - Editing an existing dated task with no time opens with the checkbox
 *     already checked; editing a task with a time opens it unchecked with
 *     the saved time shown.
 *   - There is no `allDay` field on the task model — "all day" is purely
 *     "has a date but no time" (requirement 9). Checking/unchecking just
 *     changes what `time` ends up being in the saved task, which is what
 *     src/lib/automaticLinking.ts's syncTaskCalendarEvent (already covered
 *     by taskCalendarAllDayLinking.test.ts) uses to convert the task's
 *     linked calendar event between all-day and timed.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component source, consistent with every other
 * regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/taskAllDayOption.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(process.cwd(), 'src/components/tasks/AddTaskModal.tsx'), 'utf8')
const TRANSLATIONS_SRC = readFileSync(resolve(process.cwd(), 'src/lib/translations.ts'), 'utf8')

describe('AddTaskModal is the single shared form for both create and edit (no second form)', () => {
  it('the all-day checkbox is declared once, in the one exported component used by both modes', () => {
    const checkboxOccurrences = (SRC.match(/type="checkbox"[\s\S]{0,120}checked=\{allDay\}/g) ?? []).length
    expect(checkboxOccurrences).toBe(1)
    // isEdit is derived from whether initialTask was passed to THIS SAME component.
    expect(SRC).toMatch(/const isEdit = Boolean\(initialTask\)/)
  })

  it('the all-day option renders alongside the Date/Time grid, not on a separate screen', () => {
    const dateTimeIdx = SRC.indexOf("t('taskModal.timeLabel', lang)")
    const allDayIdx = SRC.indexOf("t('taskModal.allDayLabel', lang)")
    expect(dateTimeIdx).toBeGreaterThan(-1)
    expect(allDayIdx).toBeGreaterThan(dateTimeIdx)
    expect(allDayIdx - dateTimeIdx).toBeLessThan(1000) // immediately following, same form section
  })
})

describe('checking "Kogu päev" clears and disables the time input', () => {
  it('handleAllDayChange clears time (and any time error) when checked', () => {
    const fn = SRC.match(/const handleAllDayChange = \(checked: boolean\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/setAllDay\(checked\)/)
    expect(fn).toMatch(/if \(checked\) \{[\s\S]*?setTime\(''\)/)
  })

  it('the time input is disabled when allDay is checked', () => {
    const timeInputBlock = SRC.match(/type="time"[\s\S]{0,500}/)?.[0] ?? ''
    expect(timeInputBlock).toMatch(/disabled=\{allDay\}/)
    expect(timeInputBlock).toMatch(/disabled:opacity-50 disabled:cursor-not-allowed/)
  })
})

describe('unchecking "Kogu päev" enables the time input and requires a time when a date is set', () => {
  it('the checkbox is a normal, always-enabled control (never itself disabled)', () => {
    const checkboxBlock = SRC.match(/type="checkbox"[\s\S]{0,200}/)?.[0] ?? ''
    expect(checkboxBlock).not.toMatch(/disabled/)
  })

  it('handleSave blocks saving a dated, non-all-day task with no time', () => {
    const fn = SRC.match(/const handleSave = async \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/if \(date && !allDay && !time\) \{/)
    expect(fn).toMatch(/setTimeError\(t\('taskModal\.error\.timeRequired', lang\)\)/)
  })

  it('the inline validation message renders directly under the all-day control, not conflated with the title error', () => {
    const allDayBlockIdx = SRC.indexOf("t('taskModal.allDayLabel', lang)")
    const timeErrorIdx = SRC.indexOf('{timeError &&', allDayBlockIdx)
    expect(timeErrorIdx).toBeGreaterThan(allDayBlockIdx)
    expect(timeErrorIdx - allDayBlockIdx).toBeLessThan(200)
  })
})

describe('editing an existing task pre-fills the correct all-day state', () => {
  it('a dated task with no time opens with allDay checked', () => {
    const fn = SRC.match(/useEffect\(\(\) => \{\s*\n\s*if \(open\) \{[\s\S]*?\n\s*\}\s*\n\s*\}, \[open, initialTask\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/setAllDay\(Boolean\(initialTask\?\.date\) && !initialTask\?\.time\)/)
  })

  it('a task with a time opens with allDay unchecked and the saved time shown', () => {
    // Boolean(date) && !time is false whenever a time is present — same
    // expression covers both the "unchecked" and "shown" requirements: the
    // time field is independently pre-filled from initialTask.time right
    // above, unaffected by the allDay computation.
    const fn = SRC.match(/useEffect\(\(\) => \{\s*\n\s*if \(open\) \{[\s\S]*?\n\s*\}\s*\n\s*\}, \[open, initialTask\]\)/)?.[0] ?? ''
    expect(fn).toMatch(/setTime\(initialTask\?\.time \?\? ''\)/)
    expect(fn).toMatch(/setAllDay\(Boolean\(initialTask\?\.date\) && !initialTask\?\.time\)/)
  })
})

describe('no redundant allDay field is added to the task model', () => {
  it('the saved task payload never includes an allDay property — only date/time', () => {
    const fn = SRC.match(/await \(onSave as[\s\S]*?\}\)\n/)?.[0] ?? ''
    expect(fn).not.toMatch(/allDay:/) // no `allDay:` property on the saved object — only `time` encodes it
    expect(fn).toMatch(/date: date \|\| undefined/)
    expect(fn).toMatch(/time: allDay \? undefined : \(time \|\| undefined\)/)
  })

  it('the Task type itself is not imported/extended with an allDay field here', () => {
    expect(SRC).toMatch(/import type \{ Task, Priority, TaskCategory \} from '@\/types'/)
  })
})

describe('translation keys: ET/EN copy for the all-day option and its validation message', () => {
  it('taskModal.allDayLabel is "Kogu päev" (et) / "All day" (en)', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"taskModal\.allDayLabel":\s*"Kogu päev"/)
    expect(TRANSLATIONS_SRC).toMatch(/"taskModal\.allDayLabel":\s*"All day"/)
  })

  it('taskModal.error.timeRequired exists in both languages', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"taskModal\.error\.timeRequired":\s*".+"/)
    const occurrences = (TRANSLATIONS_SRC.match(/"taskModal\.error\.timeRequired":/g) ?? []).length
    expect(occurrences).toBe(2) // once per language block
  })

  it('the new keys are declared in the TranslationKey union', () => {
    expect(TRANSLATIONS_SRC).toMatch(/\| "taskModal\.allDayLabel"/)
    expect(TRANSLATIONS_SRC).toMatch(/\| "taskModal\.error\.timeRequired"/)
  })
})
