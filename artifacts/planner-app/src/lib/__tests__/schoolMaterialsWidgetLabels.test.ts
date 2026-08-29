/**
 * Final School cleanup — the sidebar MaterialsLinks() card was titled
 * "Õppimise statistika" / "Study statistics" despite containing zero
 * statistics (Google Drive link + custom OneDrive/Dropbox-style links),
 * and two of its "+" buttons were mislabeled by reusing unrelated
 * translation keys: the Google Drive empty-state button showed
 * "Lisa õppeaine" / "Add subject" (school.action.addSubject) and the
 * custom-link button showed "Lisa ülesanne" / "Add task"
 * (school.action.addTask) — neither adds a subject or a task; both open
 * a link-entry form. The Drive empty-state subtitle also incorrectly
 * reused school.empty.schedule ("Tunniplaani pole." / "No schedule.",
 * meant for the timetable), and the "OneDrive, Dropbox vms" hint was a
 * hardcoded Estonian string never run through tr()/t().
 *
 * This is a text/label-only fix:
 *   - card title -> "Õppematerjalid" / "Study materials"
 *   - both mislabeled buttons -> reuse the existing school.action.addLink
 *     key ("Lisa link" / "Add link", from School change #13) — no new key
 *     needed there, since school.action.addSubject/addTask must keep
 *     their correct text for the real add-subject/add-task buttons
 *     elsewhere in this file
 *   - new school.empty.googleDrive key for the Drive empty-state subtitle
 *   - new school.hint.otherLinkTypes key replacing the hardcoded string
 *
 * No persistence, Firestore document shape, settingsStore, AIStudyHelper/
 * _cachedLinks, or Drive/custom-link functionality changed — only the
 * displayed text in MaterialsLinks().
 *
 * No React rendering harness exists for SchoolPage.tsx in this repo —
 * verified via structural regex assertions against the raw source and
 * direct translation-key assertions, matching the pattern used throughout
 * this session's School tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolMaterialsWidgetLabels.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

const MATERIALS_LINKS_BLOCK =
  SCHOOL_PAGE_SRC.match(/function MaterialsLinks\(\) \{[\s\S]*?\n}\n/)?.[0] ?? ''

describe('MaterialsLinks() card title', () => {
  it('block was found (sanity check on the regex slice)', () => {
    expect(MATERIALS_LINKS_BLOCK.length).toBeGreaterThan(0)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/Google Drive/)
  })

  it('ET title reads "Õppematerjalid"', () => {
    expect(t('school.widget.stats', 'et')).toBe('Õppematerjalid')
  })
  it('EN title reads "Study materials"', () => {
    expect(t('school.widget.stats', 'en')).toBe('Study materials')
  })
  it('no longer reads like a statistics label in either language', () => {
    expect(t('school.widget.stats', 'et')).not.toMatch(/statistika/i)
    expect(t('school.widget.stats', 'en')).not.toMatch(/statistic/i)
  })
})

describe('Google Drive empty-state action button', () => {
  it('uses school.action.addLink, not the mislabeled school.action.addSubject', () => {
    const startIdx = MATERIALS_LINKS_BLOCK.indexOf('onClick={startEditGdrive}', MATERIALS_LINKS_BLOCK.indexOf(') : ('))
    expect(startIdx).toBeGreaterThan(-1)
    const block = MATERIALS_LINKS_BLOCK.slice(startIdx, startIdx + 400)
    expect(block).toMatch(/tr\("school\.action\.addLink", lang\)/)
    expect(block).not.toMatch(/school\.action\.addSubject/)
  })

  it('school.action.addLink still reads "Lisa link" / "Add link" (unchanged, reused key)', () => {
    expect(t('school.action.addLink', 'et')).toBe('Lisa link')
    expect(t('school.action.addLink', 'en')).toBe('Add link')
  })
})

describe('Custom ("other") link add action button', () => {
  it('uses school.action.addLink, not the mislabeled school.action.addTask', () => {
    const setAddingCustomIdx = MATERIALS_LINKS_BLOCK.indexOf('setAddingCustom(true);')
    expect(setAddingCustomIdx).toBeGreaterThan(-1)
    const block = MATERIALS_LINKS_BLOCK.slice(setAddingCustomIdx, setAddingCustomIdx + 400)
    expect(block).toMatch(/tr\("school\.action\.addLink", lang\)/)
    expect(block).not.toMatch(/school\.action\.addTask/)
  })
})

describe('school.action.addSubject / school.action.addTask keep their correct text (used correctly elsewhere)', () => {
  it('addSubject still reads "Lisa õppeaine" / "Add subject"', () => {
    expect(t('school.action.addSubject', 'et')).toBe('Lisa õppeaine')
    expect(t('school.action.addSubject', 'en')).toBe('Add subject')
  })
  it('addTask still reads "Lisa ülesanne" / "Add task"', () => {
    expect(t('school.action.addTask', 'et')).toBe('Lisa ülesanne')
    expect(t('school.action.addTask', 'en')).toBe('Add task')
  })
  it('the real add-subject and add-task buttons elsewhere in SchoolPage.tsx still use these keys', () => {
    const addSubjectUses = SCHOOL_PAGE_SRC.match(/tr\("school\.action\.addSubject", lang\)/g) ?? []
    const addTaskUses = SCHOOL_PAGE_SRC.match(/tr\("school\.action\.addTask", lang\)/g) ?? []
    // Their one mislabeled use inside MaterialsLinks was removed for each
    // key; the real, correct uses elsewhere are untouched.
    expect(addSubjectUses.length).toBe(2)
    expect(addTaskUses.length).toBe(1)
  })
})

describe('Google Drive empty-state subtitle', () => {
  it('uses the new school.empty.googleDrive key, not the unrelated school.empty.schedule', () => {
    expect(MATERIALS_LINKS_BLOCK).toMatch(/stored\.googleDrive \|\| tr\("school\.empty\.googleDrive", lang\)/)
    expect(MATERIALS_LINKS_BLOCK).not.toMatch(/school\.empty\.schedule/)
  })

  it('ET reads "Google Drive linki pole lisatud."', () => {
    expect(t('school.empty.googleDrive', 'et')).toBe('Google Drive linki pole lisatud.')
  })
  it('EN reads "No Google Drive link added yet."', () => {
    expect(t('school.empty.googleDrive', 'en')).toBe('No Google Drive link added yet.')
  })
})

describe('"OneDrive, Dropbox" hint is now translated, not hardcoded', () => {
  it('MaterialsLinks renders it via tr(), no literal Estonian string left in the JSX', () => {
    expect(MATERIALS_LINKS_BLOCK).toMatch(/\{tr\("school\.hint\.otherLinkTypes", lang\)\}/)
    expect(MATERIALS_LINKS_BLOCK).not.toMatch(/OneDrive, Dropbox vms/)
  })

  it('ET reads "OneDrive, Dropbox vms"', () => {
    expect(t('school.hint.otherLinkTypes', 'et')).toBe('OneDrive, Dropbox vms')
  })
  it('EN reads "OneDrive, Dropbox, etc."', () => {
    expect(t('school.hint.otherLinkTypes', 'en')).toBe('OneDrive, Dropbox, etc.')
  })
})

describe('Scope: no behavior, persistence, or unrelated UI changed', () => {
  it('Google Drive save/edit still writes via persist()/saveSettings to the schoolLinks doc — unchanged', () => {
    expect(MATERIALS_LINKS_BLOCK).toMatch(/saveSettings\(uid, "schoolLinks", next\)/)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/subscribeSettings<StoredLinks>\(\s*uid,\s*"schoolLinks"/)
  })

  it('custom-link add/edit/delete handlers are unchanged', () => {
    expect(MATERIALS_LINKS_BLOCK).toMatch(/const addCustomLink = \(\) => \{/)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/const saveEditCustom = \(\) => \{/)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/const deleteCustomLink = \(id: string\) => \{/)
  })

  it('_cachedLinks is still updated the same way (AIStudyHelper\'s context source untouched)', () => {
    expect(MATERIALS_LINKS_BLOCK).toMatch(/_cachedLinks = s;/)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/_cachedLinks = next;/)
  })

  it('no OAuth or real Drive-API call was introduced — still a plain stored URL opened via <a target="_blank">', () => {
    expect(MATERIALS_LINKS_BLOCK).not.toMatch(/oauth/i)
    expect(MATERIALS_LINKS_BLOCK).not.toMatch(/googleapis\.com/)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/href=\{stored\.googleDrive\}/)
    expect(MATERIALS_LINKS_BLOCK).toMatch(/target="_blank"/)
  })

  it('the "School link custom"/"School link none" row-label keys are untouched', () => {
    expect(t('School link custom', 'et')).toBe('Lisa lisalink')
    expect(t('School link none', 'et')).toBe('Ühtegi lisalinki pole lisatud.')
  })
})
