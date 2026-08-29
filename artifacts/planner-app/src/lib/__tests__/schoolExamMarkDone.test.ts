/**
 * School change #8 — Kontrolltööd ("tests") already persisted a
 * `status: 'ootel' | 'tehtud'` field, but the Kontrolltööd UI (ExamsTab /
 * ExamDetailModal in SchoolPage.tsx) never exposed a way to change it. This
 * adds only that missing interaction to ExamDetailModal's existing footer
 * (Delete / Close / Edit), reusing:
 *   - the existing `status` field (no new completion field);
 *   - the existing `updateExam(id, patch)` wrapper SchoolPage.tsx already
 *     uses for Eksamid's own working mark-done/undone (which itself calls
 *     schoolStore's storeUpdateSchoolExam + a calendar sync that already
 *     no-ops for a status-only patch — see the comment on `updateExam`).
 *
 * Edit and Delete keep their exact existing buttons/handlers/positions in
 * the footer; only one new button (Märgi tehtuks / Märgi tegemata) was
 * inserted beside them. Eksamid/EksamidTab/EksamDetailModal — which already
 * had this exact feature — are untouched.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolSubjectCreate.test.ts and later precedents), so:
 *   - persistence (pending -> completed, completed -> pending, and the
 *     underlying Firestore write) is proven by exercising the REAL
 *     schoolStore.updateSchoolExam against a mocked Firestore;
 *   - the UI wiring (the new action's presence/labels/conditions, and that
 *     Edit/Delete/Close are untouched) is proven structurally against the
 *     source, as in every prior School-change test in this suite.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolExamMarkDone.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function examDetailModalSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function ExamDetailModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

function footerSource(): string {
  const src = examDetailModalSource()
  const match = src.match(/<div className="flex items-center justify-between px-5 py-4 border-t border-\[#ECECF2\]">[\s\S]*?\n {12}<\/div>\n {10}<\/>/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── 1 & 2. structural: the new action toggles both ways off `status` ───────

describe('1 & 2. ExamDetailModal exposes a Märgi tehtuks / Märgi tegemata action driven by the existing `status` field', () => {
  const footer = footerSource()

  it('a pending exam (status !== "tehtud") shows a "mark done" button calling onMarkDone(exam.id)', () => {
    const branch = footer.match(/\) : \([\s\S]*?onMarkDone\(exam\.id\)[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(branch).toMatch(/tr\("school\.action\.markDone", lang\)/)
  })

  it('a completed exam (status === "tehtud") shows a "mark undone" button calling onMarkUndone(exam.id)', () => {
    const branch = footer.match(/exam\.status === "tehtud" \? \([\s\S]*?onMarkUndone\(exam\.id\)[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(branch).toMatch(/tr\("school\.action\.markUndone", lang\)/)
  })

  it('no new/duplicated completion field is introduced — the toggle reads exam.status only', () => {
    expect(footer).toMatch(/exam\.status === "tehtud"/)
    expect(footer).not.toMatch(/exam\.completed/)
    expect(footer).not.toMatch(/exam\.archived/)
  })
})

// ── 4. existing edit/delete/close actions remain intact ────────────────────

describe('4. existing Edit/Delete/Close actions in ExamDetailModal are unchanged', () => {
  const src = examDetailModalSource()
  const footer = footerSource()

  it('Delete still opens the same confirm-delete flow and still calls onDelete(exam.id) on confirm', () => {
    expect(footer).toMatch(/onClick=\{\(\) => setConfirmDelete\(true\)\}/)
    expect(src).toMatch(/onClick=\{\(\) => onDelete\(exam\.id\)\}/)
    expect(src).toMatch(/Kas soovid kontrolltöö „\{exam\.title\}“ kindlasti kustutada\?/)
  })

  it('Close still calls onClose with no args', () => {
    expect(footer).toMatch(/onClick=\{onClose\}[\s\S]*?\{tr\("school\.action\.close", lang\)\}/)
  })

  it('Edit still calls onEdit(exam), unchanged', () => {
    expect(footer).toMatch(/onClick=\{\(\) => onEdit\(exam\)\}/)
    expect(footer).toMatch(/\{tr\("school\.action\.edit", lang\)\}/)
  })

  it('the footer button order is Delete, [Mark done/undone,] Close, Edit — Mark done/undone is inserted, not replacing anything', () => {
    const deleteIdx = footer.indexOf('setConfirmDelete(true)')
    const markIdx = Math.max(footer.indexOf('onMarkDone(exam.id)'), footer.indexOf('onMarkUndone(exam.id)'))
    const closeIdx = footer.indexOf('onClick={onClose}')
    const editIdx = footer.indexOf('onClick={() => onEdit(exam)}')
    expect(deleteIdx).toBeGreaterThan(-1)
    expect(markIdx).toBeGreaterThan(deleteIdx)
    expect(closeIdx).toBeGreaterThan(markIdx)
    expect(editIdx).toBeGreaterThan(closeIdx)
  })
})

// ── Call-site wiring: reuses the existing updateExam(id, patch) flow ───────

describe('the ExamDetailModal call site wires the new action through the existing updateExam(id, patch) flow (same one Eksamid already uses)', () => {
  it('onMarkDone/onMarkUndone call updateExam with a status-only patch and close the modal, mirroring the Eksamid call site', () => {
    const callSiteMatch = SCHOOL_PAGE_SRC.match(/\{selectedExam && \([\s\S]*?<ExamDetailModal[\s\S]*?\n\s*\/>\n\s*\)\}/)
    expect(callSiteMatch).not.toBeNull()
    const callSite = callSiteMatch![0]
    expect(callSite).toMatch(/onMarkDone=\{\(id\) => \{\s*\n\s*updateExam\(id, \{ status: "tehtud" \}\);\s*\n\s*setSelectedExam\(null\);/)
    expect(callSite).toMatch(/onMarkUndone=\{\(id\) => \{\s*\n\s*updateExam\(id, \{ status: "ootel" \}\);\s*\n\s*setSelectedExam\(null\);/)
  })

  it('Eksamid (EksamidTab/EksamDetailModal) is untouched — it already had this feature and this change is scoped to Kontrolltööd only', () => {
    expect(SCHOOL_PAGE_SRC).toMatch(/onMarkDone=\{\(id\) => updateExam\(id, \{ status: "tehtud" \}\)\}/)
    expect(SCHOOL_PAGE_SRC).toMatch(/onMarkUndone=\{\(id\) => updateExam\(id, \{ status: "ootel" \}\)\}/)
  })
})

// ── 3. Persistence — the real schoolStore write, through the same flow ─────

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

vi.mock('@/lib/firestoreUtils', () => ({
  sanitizeForFirestore: (x: unknown) => x,
}))

import { initSchoolStore, updateSchoolExam, getAllSchoolExams } from '@/lib/schoolStore'

function pumpSchool() {
  const onNext = onSnapshotMock.mock.calls[0][1]
  const docs = [...fakeDb.entries()]
    .filter(([path]) => path.startsWith(`users/${UID}/schoolItems/`))
    .map(([, data]) => ({ data: () => data }))
  onNext({ docs })
}

function seedExam(overrides: Record<string, unknown> = {}) {
  const exam = {
    kind: 'exam',
    id: 1,
    subject: 'Matemaatika',
    title: 'Kontrolltöö: murrud',
    type: 'kontrolltöö',
    date: '2026-09-01',
    status: 'ootel',
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    ...overrides,
  }
  fakeDb.set(schoolItemPath(`exam-${exam.id}`), exam)
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

describe('3. persistence: updateSchoolExam({ status }) is the write path the new action uses', () => {
  it('pending -> completed: status becomes "tehtud" in Firestore and in the store', async () => {
    seedExam({ status: 'ootel' })
    pumpSchool()

    await updateSchoolExam(1, { status: 'tehtud' })
    pumpSchool()

    expect((fakeDb.get(schoolItemPath('exam-1')) as { status: string }).status).toBe('tehtud')
    expect(getAllSchoolExams().find((e) => e.id === 1)?.status).toBe('tehtud')
  })

  it('completed -> pending: status reverts to "ootel" in Firestore and in the store (mistakes can be reversed)', async () => {
    seedExam({ status: 'tehtud' })
    pumpSchool()

    await updateSchoolExam(1, { status: 'ootel' })
    pumpSchool()

    expect((fakeDb.get(schoolItemPath('exam-1')) as { status: string }).status).toBe('ootel')
    expect(getAllSchoolExams().find((e) => e.id === 1)?.status).toBe('ootel')
  })

  it('the status-only patch never touches unrelated fields (title, date, subject, moodleUrl, notes)', async () => {
    seedExam({ status: 'ootel', title: 'Algebra test', date: '2026-10-10', notes: 'Bring calculator' })
    pumpSchool()

    await updateSchoolExam(1, { status: 'tehtud' })
    pumpSchool()

    const stored = fakeDb.get(schoolItemPath('exam-1')) as Record<string, unknown>
    expect(stored.title).toBe('Algebra test')
    expect(stored.date).toBe('2026-10-10')
    expect(stored.notes).toBe('Bring calculator')
    expect(stored.subject).toBe('Matemaatika')
  })

  it('a missing exam id is a safe no-op (fails safe, no throw)', async () => {
    await expect(updateSchoolExam(999, { status: 'tehtud' })).resolves.toBeUndefined()
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
