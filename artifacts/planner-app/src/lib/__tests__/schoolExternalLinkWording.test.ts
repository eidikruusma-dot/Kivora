/**
 * School change #1 — terminology only: the user-facing label/button text
 * for the School task/exam "external URL" field no longer says "Moodle",
 * since `moodleUrl` is just a generic external link, not a Moodle
 * integration. The underlying data field name (`moodleUrl`) and every
 * other School behavior (CRUD, Calendar/Tasks linking, etc.) are
 * completely unchanged — only the two translation strings' wording moved:
 *
 *   school.field.examMoodle:  "Moodle link"      -> "Veebilink" / "Web link"
 *   school.action.openMoodle: "Ava Moodle'is"    -> "Ava veebileht"
 *                              "Open in Moodle"  -> "Open website"
 *
 * Both keys are reused across multiple call sites in SchoolPage.tsx (the
 * task form/detail view AND the exam/test form/detail views all share
 * these same two keys) — a translation-only change here updates every one
 * of them consistently, with no per-call-site edits needed.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolExternalLinkWording.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

describe('school.field.examMoodle: the field label reads "Veebilink" / "Web link"', () => {
  it('ET', () => {
    expect(t('school.field.examMoodle', 'et')).toBe('Veebilink')
  })
  it('EN', () => {
    expect(t('school.field.examMoodle', 'en')).toBe('Web link')
  })
})

describe('school.action.openMoodle: the open-link button reads "Ava veebileht" / "Open website"', () => {
  it('ET', () => {
    expect(t('school.action.openMoodle', 'et')).toBe('Ava veebileht')
  })
  it('EN', () => {
    expect(t('school.action.openMoodle', 'en')).toBe('Open website')
  })
})

describe('the word "Moodle" is gone from both user-facing strings, in both languages', () => {
  it('neither key\'s ET or EN text mentions Moodle any more', () => {
    for (const lang of ['et', 'en'] as const) {
      expect(t('school.field.examMoodle', lang)).not.toMatch(/moodle/i)
      expect(t('school.action.openMoodle', lang)).not.toMatch(/moodle/i)
    }
  })
})

// ── The underlying data field and every call site are untouched ────────────

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')
const ALL_EXAMS_MODAL_SRC = readFileSync(resolve(process.cwd(), 'src/components/school/AllExamsModal.tsx'), 'utf8')

describe('the internal moodleUrl field/schema is completely unchanged (terminology-only change)', () => {
  it('moodleUrl is still the field name everywhere — never renamed', () => {
    expect(SCHOOL_STORE_SRC).toMatch(/moodleUrl: string/)
    expect(SCHOOL_PAGE_SRC).toMatch(/moodleUrl: string/)
    expect(ALL_EXAMS_MODAL_SRC).toMatch(/moodleUrl\?: string/)
  })

  it('every remaining task/exam call site still reads the same two translation keys — none were swapped for a new key or hardcoded text', () => {
    const openMoodleUses = SCHOOL_PAGE_SRC.match(/tr\("school\.action\.openMoodle", lang\)/g) ?? []
    const examMoodleUses = SCHOOL_PAGE_SRC.match(/tr\("school\.field\.examMoodle", lang\)/g) ?? []
    // Both the exam/test views/forms and (for School change #13's fallback
    // name on an unnamed legacy link, see schoolTaskWebLinks.test.ts) the
    // task detail view reuse these same two keys — several call sites each,
    // none renamed or replaced. School change #13 intentionally removed the
    // Task add/edit forms' own single-Veebilink-input usages of
    // school.field.examMoodle (replaced by the new webLinks section's own
    // school.field.webLinks label), which is why this key's count is lower
    // than school.action.openMoodle's — that drop is expected, not a
    // regression of this wording-only change.
    expect(openMoodleUses.length).toBeGreaterThanOrEqual(4)
    expect(examMoodleUses.length).toBeGreaterThanOrEqual(3)
  })

  it('no School CRUD/store function names changed as part of this wording-only edit', () => {
    expect(SCHOOL_STORE_SRC).toMatch(/export async function addSchoolTask/)
    expect(SCHOOL_STORE_SRC).toMatch(/export async function updateSchoolTask/)
    expect(SCHOOL_STORE_SRC).toMatch(/export async function addSchoolExam/)
    expect(SCHOOL_STORE_SRC).toMatch(/export async function updateSchoolExam/)
  })
})
