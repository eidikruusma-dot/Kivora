/**
 * Regression tests for the simplified "No timetable" (mode === 'none')
 * panel in ScheduleTab.tsx:
 *   - the Tasks/Tests/Exams/AI Study Assistant bullet list is gone (those
 *     features already have their own tabs/areas);
 *   - the "Enable timetable" button is gone (it contradicted the user's
 *     deliberate "No timetable" choice — the mode selector above is the
 *     only way to switch modes);
 *   - no replacement quick-action buttons were added;
 *   - the new title/description text exists in ET and EN;
 *   - the mode selector is present and unchanged;
 *   - Traditional and E-learning/flexible branches are untouched;
 *   - the panel has no large fixed/minimum height.
 *
 * No React rendering harness is available in this repo (same precedent as
 * scheduleTabEmptyState.test.ts), so this is verified structurally against
 * the source. Real-browser layout verification (320/375/390/430/1440px, no
 * overflow/clipping/overlap) was done out-of-band with Playwright against
 * the compiled CSS — see the implementation report.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabNoTimetable.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEDULE_TAB_SRC = readFileSync(
  resolve(process.cwd(), 'src/components/school/ScheduleTab.tsx'),
  'utf8',
)
const TRANSLATIONS_SRC = readFileSync(
  resolve(process.cwd(), 'src/lib/translations.ts'),
  'utf8',
)

function extractNoTimetableBlock(): string {
  const match = SCHEDULE_TAB_SRC.match(/\{mode === 'none' \? \([\s\S]*?\) : \(/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('"No timetable" panel — redundant content removed', () => {
  it('the Tasks/Tests/Exams/AI Study Assistant bullet list is gone', () => {
    const block = extractNoTimetableBlock()
    expect(block).not.toMatch(/sched\.none\.feat1/)
    expect(block).not.toMatch(/sched\.none\.feat2/)
    expect(block).not.toMatch(/sched\.none\.feat3/)
    expect(block).not.toMatch(/sched\.none\.feat4/)
    expect(block).not.toMatch(/CheckCircle2/)
  })

  it('the "Enable timetable" button is gone', () => {
    const block = extractNoTimetableBlock()
    expect(block).not.toMatch(/<button/)
    expect(block).not.toMatch(/sched\.none\.enable/)
    const codeOnly = block.replace(/\/\/.*$/gm, '')
    expect(codeOnly).not.toMatch(/onModeChange\('traditional'\)/)
  })

  it('no replacement quick-action buttons were added — the panel is purely informational', () => {
    const block = extractNoTimetableBlock()
    const codeOnly = block.replace(/\/\/.*$/gm, '')
    expect(codeOnly).not.toMatch(/onClick/)
  })

  it('CheckCircle2 is no longer imported (its only use was the removed bullet list)', () => {
    expect(SCHEDULE_TAB_SRC).not.toMatch(/CheckCircle2/)
  })

  it('the removed labels\' translation keys (feat1-4, enable) no longer exist anywhere in translations.ts — not just unreferenced by ScheduleTab', () => {
    for (const key of ['sched.none.feat1', 'sched.none.feat2', 'sched.none.feat3', 'sched.none.feat4', 'sched.none.enable']) {
      expect(TRANSLATIONS_SRC).not.toMatch(new RegExp(`"${key.replace(/\./g, '\\.')}"`))
    }
  })
})

describe('"No timetable" panel — new compact content', () => {
  it('renders exactly the title and description, nothing else textual', () => {
    const block = extractNoTimetableBlock()
    expect(block).toMatch(/t\('sched\.none\.title', lang\)/)
    expect(block).toMatch(/t\('sched\.none\.sub', lang\)/)
    const pTagCount = (block.match(/<p /g) ?? []).length
    expect(pTagCount).toBe(2)
  })

  it('the calendar icon remains but is purely decorative (no onClick, no button wrapper)', () => {
    const block = extractNoTimetableBlock()
    expect(block).toMatch(/<Calendar size=\{20\}/)
    const iconContainerMatch = block.match(/<div className="w-10 h-10[\s\S]*?<\/div>/)
    expect(iconContainerMatch).not.toBeNull()
    expect(iconContainerMatch![0]).not.toMatch(/onClick|<button/)
  })

  it('the new ET/EN title and description text match exactly what was requested', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.none\.title":\s*"Tunniplaan on välja lülitatud"/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.none\.title":\s*"Timetable is turned off"/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.none\.sub":\s*\n?\s*"Aineid, ülesandeid, kontrolltöid ja eksameid saad endiselt kasutada\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.none\.sub":\s*"You can still use subjects, tasks, tests, and exams\."/)
  })

  it('no large fixed or minimum height was introduced on the panel', () => {
    const block = extractNoTimetableBlock()
    const panelDivMatch = block.match(/<div className="bg-white rounded-2xl border[^"]*"/)
    expect(panelDivMatch).not.toBeNull()
    expect(panelDivMatch![0]).not.toMatch(/\bh-\[|\bmin-h-\[|\bh-\d|\bmin-h-\d/)
    // padding reduced from the old p-6 to a more compact value
    expect(panelDivMatch![0]).not.toMatch(/\bp-6\b/)
  })
})

describe('mode selector — unchanged, still the only way to switch modes', () => {
  it('the mode selector block still renders all three modes with onModeChange wired', () => {
    const selectorBlock = SCHEDULE_TAB_SRC.match(/\{\/\* Mode selector \*\/\}[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? ''
    expect(selectorBlock).toMatch(/onClick=\{\(\) => onModeChange\(opt\.id\)\}/)
    expect(selectorBlock).toMatch(/MODES\.map/)
  })

  it('MODES still lists traditional, elearning, and none — selecting another mode remains possible', () => {
    const modesBlock = SCHEDULE_TAB_SRC.match(/const MODES: \{[\s\S]*?\]\s*\n/)?.[0] ?? ''
    expect(modesBlock).toMatch(/id: 'traditional'/)
    expect(modesBlock).toMatch(/id: 'elearning'/)
    expect(modesBlock).toMatch(/id: 'none'/)
  })

  it('selecting "No timetable" is persisted by the caller (SchoolPage.tsx), unaffected by this panel change', () => {
    const schoolPageSrc = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
    expect(schoolPageSrc).toMatch(/localStorage\.getItem\("kivora_schedule_mode"\)/)
    expect(schoolPageSrc).toMatch(/localStorage\.setItem\("kivora_schedule_mode", mode\)/)
  })
})

describe('unrelated ScheduleTab behavior is untouched', () => {
  it('the Traditional/E-learning (non-empty and empty list) branch is untouched', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/mode === 'traditional' \? t\('sched\.traditional\.title', lang\) : t\('sched\.elearning\.title', lang\)/)
    expect(SCHEDULE_TAB_SRC).toMatch(/onClick=\{openAdd\}/)
    expect(SCHEDULE_TAB_SRC).toMatch(/lessons\.map\(\(lesson\) => \{/)
  })

  it('the compact empty-state (lessons.length === 0) panel from the prior fix is untouched', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/lessons\.length === 0 \? \(/)
    expect(SCHEDULE_TAB_SRC).toMatch(/t\('sched\.empty\.titleBlock', lang\)/)
  })

  it('LessonModal and subject-creation/classifier wiring are untouched', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/function LessonModal\(/)
    expect(SCHEDULE_TAB_SRC).toMatch(/import \{ useSchoolSubjectsFromLessons, useSchoolSubjects, addSchoolSubject, classifySubject \} from '@\/lib\/schoolStore'/)
  })
})
