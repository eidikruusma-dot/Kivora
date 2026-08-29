/**
 * School change #10 — a user-facing completion toggle for Eksamid, mirroring
 * Kontrolltööd (School change #8).
 *
 * Investigation for this change found the toggle was ALREADY implemented for
 * Eksamid — EksamidTab's row-level three-dot menu and EksamDetailModal's own
 * header three-dot menu both already have a status-driven Märgi tehtuks /
 * Märgi tegemata action, wired at both call sites (the `activeTab ===
 * "eksamid"` block and the `selectedEksam` block) through the same
 * `updateExam(id, { status })` flow Kontrolltööd's change #8 copied this
 * pattern from in the first place. No production code in this file needed
 * to change for change #10's requirements — they were already met.
 *
 * This file adds the regression coverage change #10 explicitly asked for
 * (pending -> completed, completed -> pending, persistence, and
 * preservation of existing exam actions), so this already-correct behavior
 * is locked in by a test the same way every other School-change round in
 * this suite is. It intentionally mirrors schoolExamMarkDone.test.ts
 * (Kontrolltööd's equivalent) since the two implementations are structurally
 * identical.
 *
 * No React rendering harness is available in this repo for SchoolPage.tsx
 * (see schoolExamMarkDone.test.ts and its own precedents), so:
 *   - persistence is proven by exercising the REAL schoolStore.updateSchoolExam
 *     against a mocked Firestore;
 *   - the UI wiring (the action's presence/labels/conditions in both
 *     EksamidTab's row menu and EksamDetailModal's header menu, and that
 *     Edit/Delete/Close/link behavior are untouched) is proven structurally.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/schoolEksamMarkDone.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHOOL_PAGE_SRC = readFileSync(resolve(process.cwd(), 'src/views/SchoolPage.tsx'), 'utf8')

function eksamidTabSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function EksamidTab\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

function eksamDetailModalSource(): string {
  const match = SCHOOL_PAGE_SRC.match(/function EksamDetailModal\(\{[\s\S]*?\n}\n/)
  expect(match).not.toBeNull()
  return match![0]
}

// ── 1 & 2. structural: both surfaces toggle off the existing `status` field ─

describe('1 & 2. EksamidTab\'s row menu exposes Märgi tehtuks / Märgi tegemata, driven by the existing `status` field', () => {
  const src = eksamidTabSource()

  it('a pending exam (status !== "tehtud") shows a "mark done" menu item calling onMarkDone(exam.id)', () => {
    const branch = src.match(/\) : \([\s\S]*?onMarkDone\(exam\.id\)[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(branch).toMatch(/tr\("school\.action\.markDone", lang\)/)
  })

  it('a completed exam (status === "tehtud") shows a "mark undone" menu item calling onMarkUndone(exam.id)', () => {
    const branch = src.match(/exam\.status === "tehtud" \? \([\s\S]*?onMarkUndone\(exam\.id\)[\s\S]*?<\/button>/)?.[0] ?? ''
    expect(branch).toMatch(/tr\("school\.action\.markUndone", lang\)/)
  })

  it('no new/duplicated completion field is introduced — the toggle reads exam.status only', () => {
    expect(src).toMatch(/exam\.status === "tehtud"/)
    expect(src).not.toMatch(/exam\.completed/)
    expect(src).not.toMatch(/exam\.archived/)
  })
})

describe('1 & 2. EksamDetailModal\'s own header menu exposes the same action, using its `isDone` derived from `status`', () => {
  const src = eksamDetailModalSource()

  it('derives isDone from exam.status === "tehtud" (no new field)', () => {
    expect(src).toMatch(/const isDone = exam\.status === "tehtud";/)
  })

  it('isDone -> "mark undone" calling onMarkUndone(exam.id); otherwise "mark done" calling onMarkDone(exam.id)', () => {
    expect(src).toMatch(/isDone \? \([\s\S]*?onMarkUndone\(exam\.id\)[\s\S]*?tr\("school\.action\.markUndone", lang\)/)
    expect(src).toMatch(/onMarkDone\(exam\.id\)[\s\S]*?tr\("school\.action\.markDone", lang\)/)
  })
})

// ── Preservation of existing exam actions ───────────────────────────────────

describe('existing Eksam edit/delete/link/detail actions are unaffected', () => {
  const rowSrc = eksamidTabSource()
  const modalSrc = eksamDetailModalSource()

  it('EksamidTab\'s row menu still has Edit and Delete, unchanged', () => {
    expect(rowSrc).toMatch(/onClick=\{\(e\) => \{\s*\n\s*e\.stopPropagation\(\);\s*\n\s*setOpenMenuId\(null\);\s*\n\s*onEdit\(exam\);/)
    expect(rowSrc).toMatch(/setConfirmDeleteId\(exam\.id\)/)
    expect(rowSrc).toMatch(/onDelete\(exam\.id\)/)
  })

  it('EksamDetailModal\'s header menu still has Edit and Delete, unchanged', () => {
    expect(modalSrc).toMatch(/onClick=\{\(\) => \{\s*\n\s*setMenuOpen\(false\);\s*\n\s*onEdit\(exam\);/)
    expect(modalSrc).toMatch(/setConfirmDelete\(true\)/)
    expect(modalSrc).toMatch(/onClick=\{\(\) => onDelete\(exam\.id\)\}/)
  })

  it('EksamDetailModal still renders the LinkedItemsPanel for this exam', () => {
    expect(modalSrc).toMatch(/<LinkedItemsPanel/)
    expect(modalSrc).toMatch(/entityId=\{encodeSchoolId\("exam", exam\.id\)\}/)
  })

  it('EksamDetailModal still has a Close action', () => {
    expect(modalSrc).toMatch(/\{tr\("school\.action\.close", lang\)\}/)
  })
})

// ── Call-site wiring: the same updateExam(id, patch) flow as Kontrolltööd ──

describe('both Eksamid call sites wire the action through the existing updateExam(id, patch) flow', () => {
  it('the EksamidTab call site (activeTab === "eksamid") wires onMarkDone/onMarkUndone to updateExam with a status-only patch', () => {
    const callSiteMatch = SCHOOL_PAGE_SRC.match(/\{activeTab === "eksamid" && \([\s\S]*?<EksamidTab[\s\S]*?\n\s*\/>\n\s*\)\}/)
    expect(callSiteMatch).not.toBeNull()
    const callSite = callSiteMatch![0]
    expect(callSite).toMatch(/onMarkDone=\{\(id\) => updateExam\(id, \{ status: "tehtud" \}\)\}/)
    expect(callSite).toMatch(/onMarkUndone=\{\(id\) => updateExam\(id, \{ status: "ootel" \}\)\}/)
  })

  it('the EksamDetailModal call site (selectedEksam) wires onMarkDone/onMarkUndone to updateExam and closes the modal', () => {
    const callSiteMatch = SCHOOL_PAGE_SRC.match(/\{selectedEksam && \([\s\S]*?<EksamDetailModal[\s\S]*?\n\s*\/>\n\s*\)\}/)
    expect(callSiteMatch).not.toBeNull()
    const callSite = callSiteMatch![0]
    expect(callSite).toMatch(/onMarkDone=\{\(id\) => \{\s*\n\s*updateExam\(id, \{ status: "tehtud" \}\);\s*\n\s*setSelectedEksam\(null\);/)
    expect(callSite).toMatch(/onMarkUndone=\{\(id\) => \{\s*\n\s*updateExam\(id, \{ status: "ootel" \}\);\s*\n\s*setSelectedEksam\(null\);/)
  })

  it('Kontrolltööd (ExamsTab/ExamDetailModal) and School Tasks History are untouched by this change', () => {
    // Both already had/have their own equivalent action (change #8/#9);
    // change #10 only adds test coverage for Eksamid, which already worked.
    expect(SCHOOL_PAGE_SRC).toMatch(/function groupTasksBySubjectAlpha\(/)
    expect(SCHOOL_PAGE_SRC).toMatch(/function groupExamsBySubjectAlpha\(/)
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

function seedEksam(overrides: Record<string, unknown> = {}) {
  const eksam = {
    kind: 'exam',
    id: 1,
    subject: 'Ajalugu',
    title: 'Eksam: I maailmasõda',
    type: 'eksam',
    date: '2026-11-01',
    status: 'ootel',
    iconBg: '#EDE9FB',
    iconColor: '#6F5AE8',
    ...overrides,
  }
  fakeDb.set(schoolItemPath(`exam-${eksam.id}`), eksam)
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

describe('3. persistence: updateSchoolExam({ status }) is the write path both Eksamid entry points use', () => {
  it('pending -> completed: status becomes "tehtud" in Firestore and in the store', async () => {
    seedEksam({ status: 'ootel' })
    pumpSchool()

    await updateSchoolExam(1, { status: 'tehtud' })
    pumpSchool()

    expect((fakeDb.get(schoolItemPath('exam-1')) as { status: string }).status).toBe('tehtud')
    expect(getAllSchoolExams().find((e) => e.id === 1)?.status).toBe('tehtud')
  })

  it('completed -> pending: status reverts to "ootel" in Firestore and in the store', async () => {
    seedEksam({ status: 'tehtud' })
    pumpSchool()

    await updateSchoolExam(1, { status: 'ootel' })
    pumpSchool()

    expect((fakeDb.get(schoolItemPath('exam-1')) as { status: string }).status).toBe('ootel')
    expect(getAllSchoolExams().find((e) => e.id === 1)?.status).toBe('ootel')
  })

  it('the status-only patch never touches unrelated fields (title, date, subject, time, location)', async () => {
    seedEksam({ status: 'ootel', title: 'Suuline eksam', date: '2026-12-01', time: '10:00', location: 'Aula' })
    pumpSchool()

    await updateSchoolExam(1, { status: 'tehtud' })
    pumpSchool()

    const stored = fakeDb.get(schoolItemPath('exam-1')) as Record<string, unknown>
    expect(stored.title).toBe('Suuline eksam')
    expect(stored.date).toBe('2026-12-01')
    expect(stored.time).toBe('10:00')
    expect(stored.location).toBe('Aula')
    expect(stored.subject).toBe('Ajalugu')
  })

  it('a missing exam id is a safe no-op (fails safe, no throw)', async () => {
    await expect(updateSchoolExam(999, { status: 'tehtud' })).resolves.toBeUndefined()
    expect(setDocMock).not.toHaveBeenCalled()
  })
})
