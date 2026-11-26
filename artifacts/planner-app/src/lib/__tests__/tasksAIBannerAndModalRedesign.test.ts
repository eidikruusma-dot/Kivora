/**
 * Tasks module redesign (round 5): TasksAIBanner.tsx + AddTaskModal.tsx's
 * quick-date chips and mascot reuse. No React rendering harness exists for
 * these in this repo (same precedent as every other Tasks/dashboard
 * structural test) — verified against the component source.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const BANNER_SRC = readSrc('src/components/tasks/TasksAIBanner.tsx')
const MODAL_SRC = readSrc('src/components/tasks/AddTaskModal.tsx')
const TASKS_PAGE_SRC = readSrc('src/views/TasksPage.tsx')

describe('TasksAIBanner: reuses the confirmed Kivora AI mascot, free local suggestion only', () => {
  it('imports the same mascot asset used by the "Minu päev" Kivora AI card — never a new/different illustration', () => {
    expect(BANNER_SRC).toMatch(/import kivoraMascot from '@\/assets\/dashboard\/kivora-ai-mascot\.webp'/)
    expect(BANNER_SRC).toMatch(/<img\s*\n\s*src=\{kivoraMascot\}/)
  })

  it('computes its suggestion text purely from computeTaskSuggestion (real tasks), never calls an AI/model endpoint', () => {
    expect(BANNER_SRC).toMatch(/import \{ computeTaskSuggestion, getMostImportantTask, localTodayStr \} from '@\/lib\/tasksSummary'/)
    expect(BANNER_SRC).not.toMatch(/fetchAIReply|authenticatedFetch|\/api\/ai/)
  })

  it('the chevron button opens the most important task via the passed-in handler, only when one exists', () => {
    expect(BANNER_SRC).toMatch(/\{mostImportant && \(/)
    expect(BANNER_SRC).toMatch(/onClick=\{\(\) => onOpenMostImportant\(mostImportant\)\}/)
  })
})

describe('TasksPage wires the banner to the existing openEdit — no new navigation target', () => {
  it('passes openEdit directly as onOpenMostImportant, reusing the existing edit-modal flow', () => {
    expect(TASKS_PAGE_SRC).toMatch(/<TasksAIBanner tasks=\{tasks\} lang=\{lang\} onOpenMostImportant=\{openEdit\} \/>/)
  })
})

describe('AddTaskModal: quick-date chips are pure UI convenience over the existing `date` field — no new data model', () => {
  it('computes today/tomorrow via the shared local (never UTC) date helpers', () => {
    expect(MODAL_SRC).toMatch(/import \{ localTodayStr, localDateStrWithOffset \} from '@\/lib\/tasksSummary'/)
    expect(MODAL_SRC).toMatch(/const todayStr = localTodayStr\(\)/)
    expect(MODAL_SRC).toMatch(/const tomorrowStr = localDateStrWithOffset\(1\)/)
  })

  it('"Täna"/"Homme" chips just call setDate with today/tomorrow — no new task field, no separate code path', () => {
    expect(MODAL_SRC).toMatch(/onClick=\{\(\) => setDate\(todayStr\)\}/)
    expect(MODAL_SRC).toMatch(/onClick=\{\(\) => setDate\(tomorrowStr\)\}/)
  })

  it('the saved task payload is unchanged by the quick-date chips: still only date/time/priority/category fields, no estimated-duration or allDay property', () => {
    const fn = MODAL_SRC.match(/await \(onSave as[\s\S]*?\}\)\n/)?.[0] ?? ''
    expect(fn).not.toMatch(/allDay:|estimatedDuration/)
    expect(fn).toMatch(/date: date \|\| undefined/)
    expect(fn).toMatch(/time: allDay \? undefined : \(time \|\| undefined\)/)
  })

  it('reuses the same confirmed Kivora AI mascot image in its header banner — never a new illustration', () => {
    expect(MODAL_SRC).toMatch(/import kivoraMascot from '@\/assets\/dashboard\/kivora-ai-mascot\.webp'/)
    expect(MODAL_SRC).toMatch(/src=\{kivoraMascot\}/)
  })

  it('is a full-height sheet on mobile (h-full) and a centered dialog from sm: up (sm:h-auto sm:max-h-[90dvh]) — never losing the existing internal scroll/sticky-footer structure', () => {
    expect(MODAL_SRC).toMatch(/h-full sm:h-auto sm:max-h-\[90dvh\]/)
    expect(MODAL_SRC).toMatch(/flex-1 overflow-y-auto/)
  })

  it('the Save button keeps a safe-area-aware sticky footer so it is never hidden behind a mobile keyboard or home-indicator', () => {
    expect(MODAL_SRC).toMatch(/env\(safe-area-inset-bottom\)/)
  })

  it('all existing field handlers (title/description/date/time/allDay/priority/category) remain exactly as before', () => {
    expect(MODAL_SRC).toMatch(/const handleAllDayChange = \(checked: boolean\) => \{/)
    expect(MODAL_SRC).toMatch(/const handleSave = async \(\) => \{/)
    expect(MODAL_SRC).toMatch(/setPriority\(p\.value\)/)
    expect(MODAL_SRC).toMatch(/setCategory\(c\.value\); setCategoryOpen\(false\)/)
  })
})

describe('no estimated-duration field was added anywhere (explicitly deferred, no data model change)', () => {
  it('neither AddTaskModal nor the Task type reference an estimated-duration field', () => {
    expect(MODAL_SRC).not.toMatch(/estimatedDuration|durationMin/i)
    const typesSrc = readSrc('src/types/index.ts')
    expect(typesSrc).not.toMatch(/estimatedDuration|durationMin/i)
  })
})
