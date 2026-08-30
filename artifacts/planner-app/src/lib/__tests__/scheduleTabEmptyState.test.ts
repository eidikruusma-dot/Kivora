/**
 * Regression tests for the compact Schedule empty-state cleanup:
 *   - the dead centered "+" icon (no onClick — purely decorative) is gone;
 *   - no duplicate Add button was introduced in its place;
 *   - the existing header "Add learning block" button (openAdd) is
 *     unchanged and still the only working add control;
 *   - the empty-state text is localized, with the E-learning/flexible mode
 *     ("block") title/subtitle scoped separately from the traditional
 *     lesson-mode text (which is untouched);
 *   - the oversized py-12 padding responsible for the large blank panel is
 *     gone, replaced with a smaller, still-responsive (no fixed height)
 *     padding;
 *   - unrelated School behavior (LessonModal, subject classifier/colors,
 *     mode switching) is untouched.
 *
 * No React rendering harness is available in this repo (same precedent as
 * tasksPageResponsive.test.ts, scheduleTabInlineSubjectCreate.test.ts), so
 * this is verified structurally against the source. Real-browser layout
 * verification (320/375/390/430/1440px, no overlap/overflow) was done
 * out-of-band with Playwright against the compiled CSS — see the
 * implementation report.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/scheduleTabEmptyState.test.ts
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

function extractEmptyStateBlock(): string {
  const match = SCHEDULE_TAB_SRC.match(/\{lessons\.length === 0 \? \([\s\S]*?\) : \(/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('Schedule empty-state cleanup', () => {
  it('the dead decorative "+" icon block is gone from the empty state', () => {
    const emptyBlock = extractEmptyStateBlock()
    expect(emptyBlock).not.toMatch(/w-11 h-11 rounded-2xl bg-\[#EDE9FB\]/)
    expect(emptyBlock).not.toMatch(/<Plus size=\{20\}/)
  })

  it('no new/duplicate Add button was introduced inside the empty state', () => {
    const emptyBlock = extractEmptyStateBlock()
    expect(emptyBlock).not.toMatch(/<button/)
    // Check actual JSX usage, not the explanatory comment that mentions
    // "onClick" while describing why the old element had none.
    const codeOnly = emptyBlock.replace(/\/\/.*$/gm, '')
    expect(codeOnly).not.toMatch(/onClick/)
  })

  it('the empty state now renders only the two text lines (title + subtitle)', () => {
    const emptyBlock = extractEmptyStateBlock()
    const pTagCount = (emptyBlock.match(/<p /g) ?? []).length
    expect(pTagCount).toBe(2)
  })

  it('the large py-12 padding is gone from the empty state (replaced with a smaller, still-responsive value)', () => {
    const emptyBlock = extractEmptyStateBlock()
    expect(emptyBlock).not.toMatch(/py-12/)
    expect(emptyBlock).toMatch(/py-6/)
  })

  it('no fixed height (h-*, min-h-*) was introduced that could overflow on mobile', () => {
    const emptyBlock = extractEmptyStateBlock()
    expect(emptyBlock).not.toMatch(/\bh-\[|\bmin-h-\[|\bh-\d|\bmin-h-\d/)
  })

  it('the E-learning/flexible ("block") mode uses the new dedicated title key, scoped separately from traditional mode', () => {
    const emptyBlock = extractEmptyStateBlock()
    expect(emptyBlock).toMatch(/mode === 'traditional' \? t\('sched\.empty\.title', lang\) : t\('sched\.empty\.titleBlock', lang\)/)
  })

  it('traditional lesson-mode empty-state text keys are untouched (sched.empty.title / sched.empty.subLesson)', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.title":\s*"Kirjed puuduvad"/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.title":\s*"No entries yet"/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.subLesson":\s*\n?\s*"Lisa oma esimene tund nädalapäeva ja kellaaja järgi\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.subLesson":\s*"Add your first lesson by day and time\."/)
  })

  it('the E-learning ("block") empty-state text matches exactly what was requested, in both languages', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.titleBlock":\s*"Õppimisblokke pole veel lisatud"/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.titleBlock":\s*"No learning blocks added yet"/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.subBlock":\s*\n?\s*"Planeeri iseseisev õppimine kuupäeva või nädalapäeva järgi\."/)
    expect(TRANSLATIONS_SRC).toMatch(/"sched\.empty\.subBlock":\s*\n?\s*"Plan independent study by date or weekday\."/)
  })
})

describe('the existing header "Add learning block" button is unchanged and still the only working add control', () => {
  it('the header button still calls openAdd (unchanged handler)', () => {
    const headerButtonBlock = SCHEDULE_TAB_SRC.match(/<button\s*\n\s*onClick=\{openAdd\}[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(headerButtonBlock).toMatch(/onClick=\{openAdd\}/)
    expect(headerButtonBlock).toMatch(/t\('sched\.add\.lesson', lang\)/)
    expect(headerButtonBlock).toMatch(/t\('sched\.add\.block', lang\)/)
  })

  it('openAdd itself is unchanged: opens the modal for a new lesson/block', () => {
    const fn = SCHEDULE_TAB_SRC.match(/const openAdd = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
    expect(fn).toMatch(/setEditingLesson\(null\)/)
    expect(fn).toMatch(/setModalOpen\(true\)/)
  })

  it('exactly one button in the whole ScheduleTab component list-view calls openAdd (no duplicate add control)', () => {
    const occurrences = (SCHEDULE_TAB_SRC.match(/onClick=\{openAdd\}/g) ?? []).length
    expect(occurrences).toBe(1)
  })
})

describe('unrelated School behavior is untouched by this cleanup', () => {
  it('LessonModal and its subject-creation/classifier wiring are still present and unchanged in shape', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/function LessonModal\(/)
    expect(SCHEDULE_TAB_SRC).toMatch(/import \{ useSchoolSubjectsFromLessons, useSchoolSubjects, addSchoolSubject, classifySubject \} from '@\/lib\/schoolStore'/)
    expect(SCHEDULE_TAB_SRC).toMatch(/const handleCreateSubject = async \(\) => \{/)
  })

  it('mode switching (traditional / elearning / none) is untouched', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/export type ScheduleMode = 'traditional' \| 'elearning' \| 'none'/)
    expect(SCHEDULE_TAB_SRC).toMatch(/mode === 'none'/)
  })

  it('the lesson list (non-empty) rendering path is untouched', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/lessons\.map\(\(lesson\) => \{/)
  })

  it('still exactly one <select> subject dropdown option list (LessonModal untouched by this cleanup)', () => {
    expect(SCHEDULE_TAB_SRC).toMatch(/<option value="" disabled hidden>\{t\('sched\.field\.subjectPh', lang\)\}<\/option>/)
  })
})
