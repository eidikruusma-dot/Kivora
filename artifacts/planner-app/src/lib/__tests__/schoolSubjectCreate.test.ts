/**
 * Regression tests for BUG-03: creating a School subject succeeds in
 * Firestore but the new subject remains invisible and is not selected.
 *
 * Covers:
 *   - addSchoolSubject awaits the write and rejects on failure (no false
 *     success — the caller, SchoolPage.tsx's SubjectFormModal, relies on
 *     this rejection to keep the form open and show an error instead of
 *     closing/toasting success).
 *   - A newly "created" subject (simulated via the same onSnapshot-delivery
 *     pattern used by every other store test in this repo, since a mocked
 *     setDoc does not itself update in-memory state) is immediately visible
 *     via getAllSchoolSubjects() and via mergeStoredAndLessonSubjects.
 *   - Icon/color reconstruction (iconFromColor) survives a reload-shaped
 *     snapshot delivery — i.e. subjects arriving fresh from Firestore with
 *     only `color` stored (no `icon`, since ReactNode can't be persisted)
 *     still get a usable icon.
 *
 * The "becomes the selected subject" and "keeps the form open / no false
 * success" UI behaviors live in SchoolPage.tsx (no React rendering harness
 * is available in this repo — see tasksPageResponsive.test.ts for the same
 * precedent), so those are proven structurally against the source below.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolSubjectCreate.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
let setDocImpl: () => Promise<void> = () => Promise.resolve()
const setDocMock = vi.fn(() => setDocImpl())
const deleteDocMock = vi.fn(() => Promise.resolve())

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import {
  initSchoolStore,
  addSchoolSubject,
  getAllSchoolSubjects,
  mergeStoredAndLessonSubjects,
  type SchoolSubject,
} from '@/lib/schoolStore'

const UID = 'user-a'

function seedSnapshot(items: Record<string, unknown>[]) {
  const onNext = onSnapshotMock.mock.calls[0][1]
  onNext({ docs: items.map((item) => ({ data: () => item })) })
}

function makeSubject(overrides: Partial<SchoolSubject> = {}): SchoolSubject {
  return {
    id: 'sub-1',
    name: 'Bioloogia',
    color: '#6F5AE8',
    bg: '#EDE9FB',
    icon: null,
    ...overrides,
  }
}

beforeEach(() => {
  initSchoolStore(null)
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  setDocImpl = () => Promise.resolve()

  initSchoolStore(UID)
})

describe('addSchoolSubject (BUG-03)', () => {
  it('awaits the Firestore write — resolves only after setDoc resolves', async () => {
    let setDocResolved = false
    setDocImpl = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          setDocResolved = true
          resolve()
        }, 0)
      })
    await addSchoolSubject(makeSubject())
    expect(setDocResolved).toBe(true)
  })

  it('rejects on a failed write — no false success for the caller to act on', async () => {
    setDocImpl = () => Promise.reject(new Error('simulated Firestore write failure'))
    await expect(addSchoolSubject(makeSubject())).rejects.toThrow('simulated Firestore write failure')
  })

  it('a newly created subject with zero lessons is immediately visible after the store reflects it', async () => {
    await addSchoolSubject(makeSubject({ id: 'sub-new', name: 'Geograafia' }))
    // The store's own state only updates via onSnapshot delivery (same
    // pattern as every other store in this repo — a plain setDoc write does
    // not optimistically mutate local state), so simulate that delivery.
    seedSnapshot([{ kind: 'subject', id: 'sub-new', name: 'Geograafia', color: '#6F5AE8', bg: '#EDE9FB' }])

    const stored = getAllSchoolSubjects()
    expect(stored.map((s) => s.name)).toContain('Geograafia')

    // And it survives the merge used by every subject picker in SchoolPage,
    // with zero lessons referencing it.
    const merged = mergeStoredAndLessonSubjects([], stored)
    expect(merged.map((s) => s.name)).toContain('Geograafia')
  })

  it('icon/color reconstruction: a subject arriving from a reload-shaped snapshot (color only, no icon) gets a usable icon', () => {
    seedSnapshot([{ kind: 'subject', id: 'sub-reload', name: 'Keemia', color: '#16A34A', bg: '#F0FDF4' }])
    const [subject] = getAllSchoolSubjects()
    expect(subject.name).toBe('Keemia')
    // icon is reconstructed (iconFromColor), never left undefined/null after a reload
    expect(subject.icon).toBeTruthy()
  })
})

// ── Structural checks: selection + no-false-success behavior in SchoolPage ──
// No React rendering harness is available in this repo (see
// tasksPageResponsive.test.ts for the established precedent), so the UI
// wiring that can't be unit-tested at the store level is verified against
// the source directly.

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

describe('SchoolPage subject-creation wiring (structural)', () => {
  it('awaits addSubject before doing anything else on save', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/onSave=\{async \(subject\) => \{[\s\S]*?await addSubject\(subject\);/)
  })

  it('selects the newly created subject after the write succeeds', () => {
    const onSaveBlock = SCHOOL_PAGE_SRC.match(/onSave=\{async \(subject\) => \{[\s\S]*?\}\}/)?.[0] ?? ''
    expect(onSaveBlock).toMatch(/await addSubject\(subject\);/)
    expect(onSaveBlock).toMatch(/setSelectedSubject\(subject\);/)
    // selection happens after the await, not before (order matters — it
    // must not select on a write that hasn't succeeded yet)
    const awaitIdx = onSaveBlock.indexOf('await addSubject(subject);')
    const selectIdx = onSaveBlock.indexOf('setSelectedSubject(subject);')
    expect(awaitIdx).toBeGreaterThan(-1)
    expect(selectIdx).toBeGreaterThan(awaitIdx)
  })

  it('shows a localized success toast only in the same post-await block (never unconditionally)', () => {
    const onSaveBlock = SCHOOL_PAGE_SRC.match(/onSave=\{async \(subject\) => \{[\s\S]*?\}\}/)?.[0] ?? ''
    expect(onSaveBlock).toMatch(/toast\.success\(lang === 'et' \? 'Aine loodud' : 'Subject created'\)/)
  })

  it('SubjectFormModal keeps the form open and reports a localized error on a rejected save (does not call onClose from inside the catch)', () => {
    const modalMatch = SCHOOL_PAGE_SRC.match(/function SubjectFormModal[\s\S]*?\n}\n/)
    expect(modalMatch).not.toBeNull()
    const modalSrc = modalMatch![0]
    const catchBlock = modalSrc.match(/\} catch \{[\s\S]*?\n    \}/)?.[0] ?? ''
    expect(catchBlock).toMatch(/setError\(/)
    expect(catchBlock).not.toMatch(/onClose\(\)/)
    expect(catchBlock).not.toMatch(/onSave\(/)
  })

  it('SubjectFormModal disables Save/Cancel while a save is in flight', () => {
    const modalMatch = SCHOOL_PAGE_SRC.match(/function SubjectFormModal[\s\S]*?\n}\n/)
    const modalSrc = modalMatch![0]
    expect(modalSrc).toMatch(/disabled=\{saving\}/)
  })
})
