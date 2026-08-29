/**
 * School change #13 — School tasks support multiple named web links,
 * replacing the single-URL "Veebilink" input with a "Veebilingid" section
 * (name + URL per row, add/remove before saving).
 *
 * Additive-only data model: `webLinks?: { name: string; url: string }[]` on
 * SchoolTask/StoredTask (schoolStore.tsx) and the page-local Task type
 * (SchoolPage.tsx). The legacy `moodleUrl: string` field is never migrated
 * or discarded — addSchoolTask/updateSchoolTask/taskToStored needed only
 * one added line each (the same `...(x !== undefined ? {...} : {})` spread
 * pattern already used for prevProgress/parts/linkedTaskId), no special
 * casing.
 *
 * The two are combined for display/editing by `mergeTaskWebLinks`
 * (schoolStore.tsx, exported and unit-tested directly below): webLinks
 * first, then the legacy moodleUrl appended (with an empty name, since it
 * was never named) only if it's a real link ("#" is the old mock-data
 * placeholder) and not already present among webLinks by URL — so the same
 * link is never shown or pre-filled twice.
 *
 * TaskEditModal pre-fills its editable list from mergeTaskWebLinks, and on
 * save consolidates a real legacy link into webLinks by clearing
 * moodleUrl — this only ever happens as a result of the user explicitly
 * saving the edit form (never automatically), and is what makes removing
 * the legacy link in that form actually stick instead of reappearing on
 * the next edit. TaskAddModal never had a legacy link to consider.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolSubjectCreate.test.ts and later precedents), so:
 *   - the merge algorithm and persistence are proven by exercising
 *     mergeTaskWebLinks directly and the real schoolStore functions
 *     (addSchoolTask/updateSchoolTask) against a mocked Firestore with the
 *     REAL sanitizeForFirestore;
 *   - the UI wiring (editor add/remove, pre-fill, save payload, detail
 *     display by name, legacy consolidation) is proven structurally.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolTaskWebLinks.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')
const SCHOOL_STORE_SRC = readFileSync(resolve(process.cwd(), 'src/lib/schoolStore.tsx'), 'utf8')

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))
vi.mock('@/lib/tasksStore', () => ({ setTaskCompleted: vi.fn() }))

const fakeDb = new Map<string, Record<string, unknown>>()
const UID = 'user-a'
function schoolItemPath(docId: string) { return `users/${UID}/schoolItems/${docId}` }

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
  fakeDb.set(ref.path, { ...data })
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: vi.fn(),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

// Real sanitizeForFirestore (not the identity mock some sibling tests use)
// so field-removal-on-clear is actually exercised.

import {
  initSchoolStore,
  addSchoolTask,
  updateSchoolTask,
  getAllSchoolTasks,
  mergeTaskWebLinks,
} from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function baseTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, subject: 'Matemaatika', subjectColor: '#6F5AE8', subjectBg: '#EDE9FB', subjectIcon: null,
    title: 'Kodutöö', type: 'homework', deadlineLabel: '', deadline: '2026-09-01', progress: 0,
    moodleUrl: '',
    ...overrides,
  }
}

beforeEach(() => {
  initSchoolStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  initSchoolStore(UID) // onSnapshot call index 0
  pumpSchool()
})

// ── mergeTaskWebLinks: the pure merge/dedup algorithm ───────────────────────

describe('1. adding one named link is represented by mergeTaskWebLinks', () => {
  it('a single webLinks entry passes through unchanged', () => {
    const result = mergeTaskWebLinks([{ name: 'Taskutark', url: 'https://taskutark.ee' }], undefined)
    expect(result).toEqual([{ name: 'Taskutark', url: 'https://taskutark.ee' }])
  })
})

describe('2. adding multiple links preserves all of them, in order', () => {
  it('several webLinks entries all pass through, unmodified, in order', () => {
    const links = [
      { name: 'Taskutark', url: 'https://taskutark.ee' },
      { name: 'Õpetaja materjal', url: 'https://example.com/materjal' },
    ]
    expect(mergeTaskWebLinks(links, undefined)).toEqual(links)
  })
})

describe('6. existing legacy moodleUrl remains usable via the merge', () => {
  it('a task with only moodleUrl (no webLinks) surfaces it as one link with an empty name', () => {
    const result = mergeTaskWebLinks(undefined, 'https://moodle.example.com/course')
    expect(result).toEqual([{ name: '', url: 'https://moodle.example.com/course' }])
  })

  it('the "#" mock-data placeholder is never treated as a real legacy link', () => {
    expect(mergeTaskWebLinks(undefined, '#')).toEqual([])
  })

  it('a blank/whitespace-only moodleUrl is never treated as a real link', () => {
    expect(mergeTaskWebLinks(undefined, '   ')).toEqual([])
    expect(mergeTaskWebLinks([], '')).toEqual([])
  })
})

describe('7. no duplicate when legacy and new data contain the same URL', () => {
  it('a webLinks entry with the same URL as moodleUrl suppresses the legacy merge', () => {
    const result = mergeTaskWebLinks(
      [{ name: 'Taskutark', url: 'https://taskutark.ee' }],
      'https://taskutark.ee',
    )
    expect(result).toEqual([{ name: 'Taskutark', url: 'https://taskutark.ee' }])
  })

  it('URLs are compared trimmed', () => {
    const result = mergeTaskWebLinks(
      [{ name: 'Taskutark', url: '  https://taskutark.ee  ' }],
      'https://taskutark.ee',
    )
    expect(result).toHaveLength(1)
  })
})

describe('8. tasks with no links remain unchanged (empty result, not a placeholder row)', () => {
  it('no webLinks and no moodleUrl -> empty array', () => {
    expect(mergeTaskWebLinks(undefined, undefined)).toEqual([])
    expect(mergeTaskWebLinks([], undefined)).toEqual([])
  })

  it('a webLinks entry with an empty URL is dropped, never shown as an empty row', () => {
    expect(mergeTaskWebLinks([{ name: 'Nameless', url: '' }], undefined)).toEqual([])
    expect(mergeTaskWebLinks([{ name: 'Nameless', url: '   ' }], undefined)).toEqual([])
  })
})

// ── Persistence — real store functions against a mocked Firestore ─────────

describe('1 & 2 (persistence). adding one or multiple links', () => {
  it('addSchoolTask with webLinks stores them verbatim', async () => {
    await addSchoolTask(baseTask({
      webLinks: [
        { name: 'Taskutark', url: 'https://taskutark.ee' },
        { name: 'Õpetaja materjal', url: 'https://example.com/materjal' },
      ],
    }) as never)

    const stored = fakeDb.get(schoolItemPath('task-1')) as Record<string, unknown>
    expect(stored.webLinks).toEqual([
      { name: 'Taskutark', url: 'https://taskutark.ee' },
      { name: 'Õpetaja materjal', url: 'https://example.com/materjal' },
    ])
  })
})

describe('3 & 4. removing a link, persistence, and edit pre-fill', () => {
  it('updateSchoolTask can replace webLinks with a shorter list (a link removed) and it persists', async () => {
    await addSchoolTask(baseTask({
      webLinks: [
        { name: 'Taskutark', url: 'https://taskutark.ee' },
        { name: 'Õpetaja materjal', url: 'https://example.com/materjal' },
      ],
    }) as never)
    pumpSchool()

    await updateSchoolTask(1, { webLinks: [{ name: 'Taskutark', url: 'https://taskutark.ee' }] })
    pumpSchool()

    const stored = fakeDb.get(schoolItemPath('task-1')) as Record<string, unknown>
    expect(stored.webLinks).toEqual([{ name: 'Taskutark', url: 'https://taskutark.ee' }])
    const loaded = getAllSchoolTasks().find((t) => t.id === 1)
    expect(loaded?.webLinks).toEqual([{ name: 'Taskutark', url: 'https://taskutark.ee' }])
  })

  it('removing every link (webLinks: undefined) clears the field entirely', async () => {
    await addSchoolTask(baseTask({ webLinks: [{ name: 'Taskutark', url: 'https://taskutark.ee' }] }) as never)
    pumpSchool()

    await updateSchoolTask(1, { webLinks: undefined })

    const stored = fakeDb.get(schoolItemPath('task-1')) as Record<string, unknown>
    expect('webLinks' in stored).toBe(false)
  })

  it('edit pre-fill: mergeTaskWebLinks on the loaded task reconstructs the same editable list', async () => {
    await addSchoolTask(baseTask({
      webLinks: [{ name: 'Taskutark', url: 'https://taskutark.ee' }],
    }) as never)
    pumpSchool()

    const loaded = getAllSchoolTasks().find((t) => t.id === 1)!
    expect(mergeTaskWebLinks(loaded.webLinks, loaded.moodleUrl)).toEqual([
      { name: 'Taskutark', url: 'https://taskutark.ee' },
    ])
  })
})

describe('6 (persistence). an existing task with only legacy moodleUrl round-trips it unchanged', () => {
  it('a task stored with only moodleUrl (no webLinks) loads with moodleUrl intact and webLinks undefined', async () => {
    fakeDb.set(schoolItemPath('task-2'), {
      kind: 'task', ...baseTask({ id: 2, moodleUrl: 'https://moodle.example.com/course' }),
    })
    pumpSchool()

    const loaded = getAllSchoolTasks().find((t) => t.id === 2)
    expect(loaded?.moodleUrl).toBe('https://moodle.example.com/course')
    expect(loaded?.webLinks).toBeUndefined()
    expect(mergeTaskWebLinks(loaded?.webLinks, loaded?.moodleUrl)).toEqual([
      { name: '', url: 'https://moodle.example.com/course' },
    ])
  })
})

describe('8 (persistence). a task with no links at all is unaffected by this change', () => {
  it('addSchoolTask/updateSchoolTask work exactly as before when webLinks is never set', async () => {
    await addSchoolTask(baseTask({ id: 3 }) as never)
    pumpSchool()
    expect(fakeDb.get(schoolItemPath('task-3'))).not.toHaveProperty('webLinks')

    await updateSchoolTask(3, { title: 'Uus pealkiri' })
    pumpSchool()

    const loaded = getAllSchoolTasks().find((t) => t.id === 3)
    expect(loaded?.title).toBe('Uus pealkiri')
    expect(loaded?.webLinks).toBeUndefined()
  })
})

// ── UI wiring (structural) ──────────────────────────────────────────────────

function taskWebLinksEditorSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function TaskWebLinksEditor\(\{[\s\S]*?\n\}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

describe('TaskWebLinksEditor: add/remove rows, name + URL per row', () => {
  const src = taskWebLinksEditorSource()

  it('addLink appends an empty {name, url} row', () => {
    expect(src).toMatch(/const addLink = \(\) => onChange\(\[\.\.\.links, \{ name: "", url: "" \}\]\);/)
  })

  it('removeLink drops exactly the row at that index', () => {
    expect(src).toMatch(/const removeLink = \(idx: number\) => onChange\(links\.filter\(\(_, i\) => i !== idx\)\);/)
  })

  it('renders one Name input and one URL input per row', () => {
    expect(src).toMatch(/tr\("school\.field\.linkNamePh", lang\)/)
    expect(src).toMatch(/placeholder="https:\/\/\.\.\."/)
  })

  it('uses the existing generic school.action.addLink / school.field.webLinks labels', () => {
    expect(src).toMatch(/tr\("school\.field\.webLinks", lang\)/)
    expect(src).toMatch(/tr\("school\.action\.addLink", lang\)/)
  })
})

describe('TaskAddModal and TaskEditModal both use TaskWebLinksEditor instead of a single Veebilink input', () => {
  it('TaskAddModal renders TaskWebLinksEditor bound to its own webLinks state, and never sets moodleUrl from user input', () => {
    const block = SCHOOL_PAGE_SRC.match(/function TaskAddModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(block).toMatch(/<TaskWebLinksEditor links=\{webLinks\} onChange=\{setWebLinks\} \/>/)
    expect(block).toMatch(/moodleUrl: "",/)
    expect(block).not.toMatch(/setMoodleUrl/)
  })

  it('TaskEditModal renders TaskWebLinksEditor pre-filled via mergeTaskWebLinks', () => {
    const block = SCHOOL_PAGE_SRC.match(/function TaskEditModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(block).toMatch(/<TaskWebLinksEditor links=\{webLinks\} onChange=\{setWebLinks\} \/>/)
    expect(block).toMatch(/useState\(\(\) => mergeTaskWebLinks\(task\.webLinks, task\.moodleUrl\)\)/)
  })

  it('TaskEditModal clears moodleUrl on save only when the original task actually had a real legacy link', () => {
    const block = SCHOOL_PAGE_SRC.match(/function TaskEditModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(block).toMatch(/const hadRealLegacyLink = !!legacyUrl && legacyUrl !== "#";/)
    expect(block).toMatch(/\.\.\.\(hadRealLegacyLink \? \{ moodleUrl: "" \} : \{\}\),/)
  })

  it('both modals filter blank rows (no URL) out of the saved webLinks', () => {
    const addBlock = SCHOOL_PAGE_SRC.match(/function TaskAddModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    const editBlock = SCHOOL_PAGE_SRC.match(/function TaskEditModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    for (const block of [addBlock, editBlock]) {
      expect(block).toMatch(/\.filter\(\(l\) => l\.url !== ""\);/)
    }
  })
})

describe('5. TaskDetailModal displays links by their name, each with its own URL', () => {
  const block = SCHOOL_PAGE_SRC.match(/function TaskDetailModal\(\{[\s\S]*?\n}\n/)?.[0] ?? ''

  it('computes the merged link list once via mergeTaskWebLinks', () => {
    expect(block).toMatch(/const webLinks = mergeTaskWebLinks\(task\.webLinks, task\.moodleUrl\);/)
  })

  it('renders one <a> per link, keyed and using each link\'s own url and name', () => {
    expect(block).toMatch(/\{webLinks\.map\(\(link, idx\) => \(/)
    expect(block).toMatch(/href=\{link\.url\}/)
    expect(block).toMatch(/\{link\.name\.trim\(\) \|\| tr\("school\.field\.examMoodle", lang\)\}/)
  })

  it('renders nothing when there are no links (not an empty section)', () => {
    expect(block).toMatch(/\{webLinks\.length > 0 && \(/)
  })
})

describe('TaskRow (the Tasks-tab row/list display) is untouched by this change', () => {
  it('still keys its single quick-open button off task.moodleUrl directly, unrelated to webLinks', () => {
    const rowBlock = SCHOOL_PAGE_SRC.match(/function TaskRow\(\{[\s\S]*?\n}\n/)?.[0] ?? ''
    expect(rowBlock).toMatch(/task\.moodleUrl &&/)
    expect(rowBlock).not.toMatch(/webLinks/)
  })
})

describe('data model: webLinks is additive-only, no other field/shape touched', () => {
  it('SchoolTask, StoredTask, and the page-local Task interface all declare webLinks?: {name;url}[] alongside the unchanged moodleUrl: string', () => {
    const schoolTaskBlock = SCHOOL_STORE_SRC.match(/interface SchoolTask \{[\s\S]*?\n\}/)?.[0] ?? ''
    const storedTaskBlock = SCHOOL_STORE_SRC.match(/interface StoredTask \{[\s\S]*?\n\}/)?.[0] ?? ''
    const pageTaskBlock = SCHOOL_PAGE_SRC.match(/interface Task \{[\s\S]*?\n\}/)?.[0] ?? ''
    for (const block of [schoolTaskBlock, storedTaskBlock, pageTaskBlock]) {
      expect(block).toMatch(/moodleUrl: string;?/)
      expect(block).toMatch(/webLinks\?:/)
    }
  })

  it('taskToStored includes webLinks only via the same optional-spread pattern as prevProgress/parts/linkedTaskId', () => {
    const fn = SCHOOL_STORE_SRC.match(/function taskToStored\([\s\S]*?\n\}/)?.[0] ?? ''
    expect(fn).toMatch(/\.\.\.\(t\.webLinks !== undefined \? \{ webLinks: t\.webLinks \} : \{\}\),/)
  })

  it('Kontrolltööd/Eksamid (StoredExam/SchoolExam) are untouched — this change is School tasks only', () => {
    const storedExamBlock = SCHOOL_STORE_SRC.match(/interface StoredExam \{[\s\S]*?\n\}/)?.[0] ?? ''
    expect(storedExamBlock).not.toMatch(/webLinks/)
  })
})
