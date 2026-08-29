import React, { useState, useEffect, useMemo } from 'react'
import { BookOpen, FlaskConical, MessageSquare, Globe, HardDrive } from 'lucide-react'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import { setTaskCompleted } from '@/lib/tasksStore'

// ── Icon reconstruction ──────────────────────────────────────────────────────
// ReactNode icons cannot be stored in Firestore. They are rebuilt from the
// color string that IS stored, using the same SUBJECT_PALETTE mapping the page uses.
function iconFromColor(color: string): React.ReactNode {
  switch (color) {
    case '#6F5AE8': return <BookOpen  size={16} strokeWidth={1.8} />
    case '#16A34A': return <FlaskConical size={16} strokeWidth={1.8} />
    case '#CA8A04': return <MessageSquare size={16} strokeWidth={1.8} />
    case '#DC2626': return <Globe      size={16} strokeWidth={1.8} />
    case '#2563EB': return <HardDrive  size={16} strokeWidth={1.8} />
    default:        return <BookOpen  size={16} strokeWidth={1.8} />
  }
}

// ── Automatic subject categorization & color ─────────────────────────────────
//
// One shared, deterministic helper reused by both subject-creation UIs —
// SchoolPage.tsx's standalone "Ained" form and ScheduleTab.tsx's inline
// "Add learning block" creator — to suggest a category + color as the user
// types a subject name. Reuses the SAME 5-color palette every stored
// subject's color already round-trips through via iconFromColor above; no
// new color system is introduced.

// Canonical (color, bg) pairs. Order and values match SchoolPage.tsx's
// SUBJECT_PALETTE exactly — that is the array iconFromColor's switch above
// was built against, so picking indices into this array keeps icon
// reconstruction working for every color this classifier can suggest.
export const SUBJECT_COLOR_PALETTE: { color: string; bg: string }[] = [
  { color: '#6F5AE8', bg: '#EDE9FB' }, // 0 purple
  { color: '#16A34A', bg: '#DCFCE7' }, // 1 green
  { color: '#CA8A04', bg: '#FEF9C3' }, // 2 yellow
  { color: '#DC2626', bg: '#FEE2E2' }, // 3 red
  { color: '#2563EB', bg: '#EFF6FF' }, // 4 blue
]

export type SubjectCategory =
  | 'mathematics'
  | 'estonian'
  | 'english'
  | 'other_languages'
  | 'natural_sciences'
  | 'humanities_social'
  | 'information_technology'
  | 'arts'
  | 'music'
  | 'physical_education'
  | 'general_study'
  | 'other'

export interface SubjectClassification {
  category: SubjectCategory
  colorIndex: number // index into SUBJECT_COLOR_PALETTE — stable per category
  color: string
  bg: string
}

// Documented category → palette-index mapping. Only 5 real colors exist, so
// categories intentionally share a color where that reads sensibly (e.g.
// natural sciences and physical education both read as "active/green").
// This table is the single source of truth for "known" category colors —
// change the mapping here, not per call site.
const CATEGORY_COLOR_INDEX: Record<Exclude<SubjectCategory, 'other'>, number> = {
  mathematics: 0,             // purple
  estonian: 3,                // red
  english: 4,                 // blue
  other_languages: 4,         // blue — grouped with English as "languages"
  natural_sciences: 1,        // green
  humanities_social: 2,       // yellow
  information_technology: 4,  // blue
  arts: 0,                    // purple — creative cluster
  music: 0,                   // purple — creative cluster
  physical_education: 1,      // green
  general_study: 2,           // yellow
}

// Keyword lists — checked in this order; the first category with a matching
// keyword wins. Multi-word phrases are matched as substrings of the
// normalized text; single words are matched as whole tokens only (never a
// bare substring), so a short keyword like "it" can't accidentally match
// inside an unrelated word (e.g. Estonian "käsitöö" contains the letters
// "it" but is an arts subject, not information technology).
const CATEGORY_KEYWORDS: { category: Exclude<SubjectCategory, 'other'>; keywords: string[] }[] = [
  { category: 'mathematics',            keywords: ['matemaatika', 'math', 'algebra', 'geomeetria'] },
  { category: 'estonian',               keywords: ['eesti keel', 'eesti kirjandus'] },
  { category: 'english',                keywords: ['inglise keel', 'english'] },
  { category: 'other_languages',        keywords: ['vene keel', 'saksa keel', 'prantsuse keel', 'russian', 'german', 'french'] },
  { category: 'natural_sciences',       keywords: ['loodusõpetus', 'bioloogia', 'keemia', 'füüsika', 'geography', 'geograafia'] },
  { category: 'humanities_social',      keywords: ['ajalugu', 'ühiskonnaõpetus', 'inimeseõpetus', 'history', 'social studies'] },
  { category: 'information_technology', keywords: ['informaatika', 'arvutiõpetus', 'programmeerimine', 'it'] },
  { category: 'arts',                   keywords: ['kunst', 'käsitöö', 'art'] },
  { category: 'music',                  keywords: ['muusika', 'music'] },
  { category: 'physical_education',     keywords: ['kehaline kasvatus', 'sport', 'physical education'] },
  { category: 'general_study',          keywords: ['iseseisev õppimine', 'moodle ülesanne', 'projektitöö', 'homework', 'project work'] },
]

function normalizeSubjectText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Words in `text`, splitting on anything that isn't a Latin/Estonian letter or digit. */
function wordsOf(text: string): Set<string> {
  return new Set(text.split(/[^a-zäöüõšž0-9]+/i).filter(Boolean))
}

function matchesKeyword(normalized: string, words: Set<string>, keyword: string): boolean {
  const kw = keyword.toLowerCase()
  if (kw.includes(' ')) return normalized.includes(kw) // phrase — substring match
  return words.has(kw)                                  // single word — whole-token match
}

/**
 * Deterministic fallback index for an unrecognised subject: the same
 * normalized name always produces the same index (stable), spread across
 * the palette by a simple string hash instead of always landing on one
 * fixed "unknown" color.
 */
function fallbackColorIndex(normalized: string): number {
  let hash = 0
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0
  }
  return hash % SUBJECT_COLOR_PALETTE.length
}

/**
 * Classifies a subject name — optionally with a description/activity text,
 * for callers that have one — into a semantic category and a stable color
 * from the existing SUBJECT_COLOR_PALETTE. None of the current
 * subject-creation forms have a description field, so both current call
 * sites classify from the name only (see the implementation report).
 *
 * Pure and deterministic: the same input always produces the same output.
 * Shared by both subject-creation UIs so automatic color suggestion behaves
 * identically in SchoolPage.tsx's standalone form and ScheduleTab.tsx's
 * inline "Add learning block" creator.
 */
export function classifySubject(name: string, description?: string): SubjectClassification {
  const normalized = normalizeSubjectText(`${name} ${description ?? ''}`)
  const words = wordsOf(normalized)

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => matchesKeyword(normalized, words, kw))) {
      const colorIndex = CATEGORY_COLOR_INDEX[category]
      return { category, colorIndex, ...SUBJECT_COLOR_PALETTE[colorIndex] }
    }
  }

  const colorIndex = fallbackColorIndex(normalized)
  return { category: 'other', colorIndex, ...SUBJECT_COLOR_PALETTE[colorIndex] }
}

// ── Date utilities ───────────────────────────────────────────────────────────
// daysLeft is computed fresh on every snapshot read — never stored in Firestore.
const MONTHS: Record<string, number> = {
  // Estonian
  jaanuar: 0, veebruar: 1, märts: 2, aprill: 3, mai: 4, juuni: 5,
  juuli: 6, august: 7, september: 8, oktoober: 9, november: 10, detsember: 11,
  // English (lowercase)
  january: 0, february: 1, march: 2, june: 5,
  july: 6, october: 9,
}

function parseDateStr(s: string): number {
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00')
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }
  // Estonian/English "D. month YYYY" format
  const m = s.match(/(\d+)\.\s+(\w+)\s+(\d+)/)
  if (!m) return 0
  const month = MONTHS[m[2].toLowerCase()]
  if (month === undefined) return 0
  return new Date(parseInt(m[3]), month, parseInt(m[1])).getTime()
}

function computeDaysLeft(dateStr: string): number {
  const ts = parseDateStr(dateStr)
  if (!ts) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((ts - today.getTime()) / (1000 * 60 * 60 * 24))
}

// ── Runtime types (mirror the page's types — structural compatibility) ───────

interface TaskPart {
  id: string
  label: string
  done: boolean
}

/** One named web resource on a School task — School change #13 */
interface TaskWebLink {
  name: string
  url: string
}

/**
 * Combines a task's new multi-link `webLinks` with its legacy single
 * `moodleUrl` for display/editing, without ever writing to or discarding
 * `moodleUrl` (School change #13 is additive-only). The legacy URL is
 * appended — with an empty name, since it was never named — only when it's
 * a real link ("#" is the placeholder used by old seed/mock data) and its
 * URL isn't already present among `webLinks`, so the same link is never
 * shown twice. Rows with no URL are dropped (an empty row is never a real
 * link either way).
 */
export function mergeTaskWebLinks(
  webLinks: TaskWebLink[] | undefined,
  moodleUrl: string | undefined,
): TaskWebLink[] {
  const links = (webLinks ?? []).filter((l) => l.url.trim() !== '')
  const legacyUrl = moodleUrl?.trim()
  if (legacyUrl && legacyUrl !== '#' && !links.some((l) => l.url.trim() === legacyUrl)) {
    return [...links, { name: '', url: legacyUrl }]
  }
  return links
}

// Mirrors SchoolPage's Task interface
interface SchoolTask {
  id: number
  subject: string
  subjectId?: string
  subjectColor: string
  subjectBg: string
  subjectIcon: React.ReactNode  // reconstructed from subjectColor; not stored
  title: string
  type: string
  deadlineLabel: string
  deadline: string
  progress: number
  moodleUrl: string
  prevProgress?: number
  parts?: TaskPart[]
  linkedTaskId?: string
  /** Multiple named web resources — School change #13. Additive alongside
   * the legacy moodleUrl (never migrated/discarded); see mergeTaskWebLinks
   * for how the two are combined without duplication for display/editing. */
  webLinks?: TaskWebLink[]
}

// Mirrors AllExamsModal's ExamItem interface
interface SchoolExam {
  id: number
  subject: string
  subjectId?: string
  title: string
  type: 'kontrolltöö' | 'eksam'
  date: string
  daysLeft: number  // computed from date; not stored
  status: 'ootel' | 'tehtud'
  iconBg: string
  iconColor: string
  notes?: string
  moodleUrl?: string
  time?: string
  location?: string
}

// Mirrors SchoolPage's Subject interface
export interface SchoolSubject {
  id: string
  name: string
  teacher?: string
  room?: string
  color: string
  bg: string
  icon: React.ReactNode  // reconstructed from color; not stored
  /** Free-text course assessment info (grading schedule/rules) — School change #12A */
  assessment?: string
}

// Mirrors ScheduleTab's ScheduleLesson interface
export interface SchoolLesson {
  id: string
  subject: string
  subjectId?: string
  day?: string
  date?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  room?: string
  teacher?: string
  dotColor: string
  cardBg: string
  /** Free-text assessment guide/rules for this specific learning block (not the Subject) */
  assessment?: string
}

// ── Stored shapes (no ReactNode; daysLeft omitted) ───────────────────────────

type SchoolItemKind = 'task' | 'exam' | 'subject' | 'lesson'

interface StoredTask {
  kind: 'task'
  id: number
  subject: string
  subjectId?: string
  subjectColor: string
  subjectBg: string
  title: string
  type: string
  deadlineLabel: string
  deadline: string
  progress: number
  moodleUrl: string
  prevProgress?: number
  parts?: TaskPart[]
  linkedTaskId?: string
  webLinks?: TaskWebLink[]
}

interface StoredExam {
  kind: 'exam'
  id: number
  subject: string
  subjectId?: string
  title: string
  type: 'kontrolltöö' | 'eksam'
  date: string
  status: 'ootel' | 'tehtud'
  iconBg: string
  iconColor: string
  notes?: string
  moodleUrl?: string
  time?: string
  location?: string
}

interface StoredSubject {
  kind: 'subject'
  id: string
  name: string
  teacher?: string
  room?: string
  color: string
  bg: string
  assessment?: string
}

interface StoredLesson {
  kind: 'lesson'
  id: string
  subject: string
  subjectId?: string
  day?: string
  date?: string
  startDate?: string
  endDate?: string
  startTime?: string
  endTime?: string
  room?: string
  teacher?: string
  dotColor: string
  cardBg: string
  assessment?: string
}

type StoredItem = StoredTask | StoredExam | StoredSubject | StoredLesson

// ── Conversion helpers ───────────────────────────────────────────────────────

function storedToTask(s: StoredTask): SchoolTask {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...rest } = s
  return { ...rest, subjectIcon: iconFromColor(s.subjectColor) }
}

function storedToExam(s: StoredExam): SchoolExam {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...rest } = s
  return { ...rest, daysLeft: computeDaysLeft(s.date) }
}

function storedToSubject(s: StoredSubject): SchoolSubject {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...rest } = s
  return { ...rest, icon: iconFromColor(s.color) }
}

function storedToLesson(s: StoredLesson): SchoolLesson {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { kind, ...rest } = s
  return rest
}

// Task → StoredTask (strips subjectIcon)
function taskToStored(t: SchoolTask): StoredTask {
  return {
    kind: 'task',
    id: t.id,
    subject: t.subject,
    subjectColor: t.subjectColor,
    subjectBg: t.subjectBg,
    title: t.title,
    type: t.type,
    deadlineLabel: t.deadlineLabel,
    deadline: t.deadline,
    progress: t.progress,
    moodleUrl: t.moodleUrl,
    ...(t.prevProgress !== undefined ? { prevProgress: t.prevProgress } : {}),
    ...(t.parts !== undefined ? { parts: t.parts } : {}),
    ...(t.linkedTaskId !== undefined ? { linkedTaskId: t.linkedTaskId } : {}),
    ...(t.webLinks !== undefined ? { webLinks: t.webLinks } : {}),
  }
}

// ── Firestore paths ──────────────────────────────────────────────────────────

function schoolCol(uid: string) {
  return collection(db, 'users', uid, 'schoolItems')
}

function schoolDoc(uid: string, docId: string) {
  return doc(db, 'users', uid, 'schoolItems', docId)
}

// ── Pub/sub types ────────────────────────────────────────────────────────────

type TaskListener    = (items: SchoolTask[])    => void
type ExamListener    = (items: SchoolExam[])    => void
type SubjectListener = (items: SchoolSubject[]) => void
type LessonListener  = (items: SchoolLesson[])  => void
type LoadingListener = (loading: boolean)       => void

// ── Module-level state ───────────────────────────────────────────────────────

let _tasks:    SchoolTask[]    = []
let _exams:    SchoolExam[]    = []
let _subjects: SchoolSubject[] = []
let _lessons:  SchoolLesson[]  = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

const _taskListeners    = new Set<TaskListener>()
const _examListeners    = new Set<ExamListener>()
const _subjectListeners = new Set<SubjectListener>()
const _lessonListeners  = new Set<LessonListener>()
const _loadingListeners = new Set<LoadingListener>()

function emitTasks()    { for (const l of _taskListeners)    l(_tasks) }
function emitExams()    { for (const l of _examListeners)    l(_exams) }
function emitSubjects() { for (const l of _subjectListeners) l(_subjects) }
function emitLessons()  { for (const l of _lessonListeners)  l(_lessons) }

function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Initialisation ───────────────────────────────────────────────────────────

export function initSchoolStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _tasks = []; _exams = []; _subjects = []; _lessons = []
  emitTasks(); emitExams(); emitSubjects(); emitLessons()

  if (!uid) {
    setLoading(false)
    return
  }

  setLoading(true)

  _unsubscribe = onSnapshot(
    schoolCol(uid),
    (snap) => {
      const tasks:    SchoolTask[]    = []
      const exams:    SchoolExam[]    = []
      const subjects: SchoolSubject[] = []
      const lessons:  SchoolLesson[]  = []

      for (const d of snap.docs) {
        const item = d.data() as StoredItem
        switch (item.kind) {
          case 'task':    tasks.push(storedToTask(item));       break
          case 'exam':    exams.push(storedToExam(item));       break
          case 'subject': subjects.push(storedToSubject(item)); break
          case 'lesson':  lessons.push(storedToLesson(item));   break
        }
      }

      _tasks    = tasks
      _exams    = exams
      _subjects = subjects
      _lessons  = lessons

      emitTasks(); emitExams(); emitSubjects(); emitLessons()
      setLoading(false)
    },
    () => { setLoading(false) },
  )
}

// ── Task CRUD ────────────────────────────────────────────────────────────────

export async function addSchoolTask(task: SchoolTask): Promise<void> {
  if (!_currentUid) return
  await setDoc(schoolDoc(_currentUid, `task-${task.id}`), sanitizeForFirestore(taskToStored(task)))
}

export async function updateSchoolTask(
  id: number,
  patch: Partial<Omit<SchoolTask, 'subjectIcon'>>,
): Promise<void> {
  if (!_currentUid) return
  const task = _tasks.find((t) => t.id === id)
  if (!task) return
  const updated = taskToStored({ ...task, ...patch } as SchoolTask)
  await setDoc(schoolDoc(_currentUid, `task-${id}`), sanitizeForFirestore(updated))
}

export async function deleteSchoolTask(id: number): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(schoolDoc(_currentUid, `task-${id}`))
}

export async function markSchoolTaskDone(id: number): Promise<void> {
  if (!_currentUid) return
  const task = _tasks.find((t) => t.id === id)
  if (!task) return
  const parts = task.parts?.map((p) => ({ ...p, done: true }))
  await setDoc(schoolDoc(_currentUid, `task-${id}`), sanitizeForFirestore({
    ...taskToStored(task),
    prevProgress: task.progress,
    progress: 100,
    ...(parts !== undefined ? { parts } : {}),
  }))
  // Mirror completion onto the linked Tasks-module task (if the user chose
  // "add to Tasks" for this assignment) — no-op if there is none, or if the
  // linked task no longer exists (this School task's own write above has
  // already succeeded either way).
  if (task.linkedTaskId) await setTaskCompleted(task.linkedTaskId, true)
}

export async function markSchoolTaskUndone(id: number): Promise<void> {
  if (!_currentUid) return
  const task = _tasks.find((t) => t.id === id)
  if (!task) return
  const parts = task.parts?.map((p) => ({ ...p, done: false }))
  const progress = task.prevProgress ?? 0
  const stored = taskToStored(task)
  const update: StoredTask = {
    ...stored,
    progress,
    ...(parts !== undefined ? { parts } : {}),
  }
  // Remove prevProgress field
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (update as any).prevProgress
  await setDoc(schoolDoc(_currentUid, `task-${id}`), sanitizeForFirestore(update))
  if (task.linkedTaskId) await setTaskCompleted(task.linkedTaskId, false)
}

/**
 * Mirrors a linked Tasks-module task's completion back onto its School
 * task — the reverse direction of markSchoolTaskDone/Undone's own sync
 * call above. Reuses those exact same functions (never a second, divergent
 * write path) so School's progress/prevProgress/parts semantics are
 * derived identically regardless of which side the change started on.
 *
 * Guarded by comparing against the School task's CURRENT derived done
 * state (progress >= 100 — the same mapping SchoolPage.tsx's own
 * statusFromProgress uses) before writing anything: this is what stops
 * School<->Tasks completion sync from ping-ponging, since propagating a
 * change back to a side that's already there is always a no-op.
 *
 * No-op (fails safe) if no School task links to this Tasks-module task —
 * e.g. it was never linked, or the School task was since deleted.
 */
export async function syncSchoolTaskFromLinkedTask(taskId: string, completed: boolean): Promise<void> {
  const schoolTask = _tasks.find((t) => t.linkedTaskId === taskId)
  if (!schoolTask) return
  const currentlyDone = schoolTask.progress >= 100
  if (currentlyDone === completed) return
  if (completed) await markSchoolTaskDone(schoolTask.id)
  else await markSchoolTaskUndone(schoolTask.id)
}

export async function toggleSchoolTaskPart(
  taskId: number,
  partId: string,
): Promise<void> {
  if (!_currentUid) return
  const task = _tasks.find((t) => t.id === taskId)
  if (!task || !task.parts) return
  const parts = task.parts.map((p) =>
    p.id === partId ? { ...p, done: !p.done } : p,
  )
  const done  = parts.filter((p) => p.done).length
  const pct   = parts.length > 0 ? Math.round((done / parts.length) * 100) : -1
  const progress = pct < 0 ? task.progress : pct
  await setDoc(schoolDoc(_currentUid, `task-${taskId}`), sanitizeForFirestore({
    ...taskToStored(task),
    parts,
    progress,
  }))
}

// ── Exam CRUD ────────────────────────────────────────────────────────────────

export async function addSchoolExam(exam: SchoolExam): Promise<void> {
  if (!_currentUid) return
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { daysLeft, ...stored } = exam
  await setDoc(schoolDoc(_currentUid, `exam-${exam.id}`), sanitizeForFirestore({
    ...stored,
    kind: 'exam' as const,
  }))
}

export async function updateSchoolExam(
  id: number,
  patch: Partial<SchoolExam>,
): Promise<void> {
  if (!_currentUid) return
  const exam = _exams.find((e) => e.id === id)
  if (!exam) return
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { daysLeft: _dl1, ...baseStored } = exam
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { daysLeft: _dl2, ...patchStored } = patch
  const updated: StoredExam = { kind: 'exam', ...baseStored, ...patchStored }
  await setDoc(schoolDoc(_currentUid, `exam-${id}`), sanitizeForFirestore(updated))
}

export async function deleteSchoolExam(id: number): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(schoolDoc(_currentUid, `exam-${id}`))
}

// ── Subject CRUD ─────────────────────────────────────────────────────────────

export async function addSchoolSubject(subject: SchoolSubject): Promise<void> {
  if (!_currentUid) return
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { icon, ...stored } = subject
  await setDoc(schoolDoc(_currentUid, `subject-${subject.id}`), sanitizeForFirestore({
    ...stored,
    kind: 'subject' as const,
  }))
}

export async function updateSchoolSubject(
  id: string,
  patch: Partial<Omit<SchoolSubject, 'icon'>>,
): Promise<void> {
  if (!_currentUid) return
  const subject = _subjects.find((s) => s.id === id)
  if (!subject) return
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { icon, ...base } = subject
  const updated: StoredSubject = { kind: 'subject', ...base, ...patch }
  await setDoc(schoolDoc(_currentUid, `subject-${id}`), sanitizeForFirestore(updated))
}

export async function deleteSchoolSubject(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(schoolDoc(_currentUid, `subject-${id}`))
}

// ── Lesson CRUD ──────────────────────────────────────────────────────────────

export async function addSchoolLesson(lesson: SchoolLesson): Promise<void> {
  if (!_currentUid) return
  await setDoc(schoolDoc(_currentUid, `lesson-${lesson.id}`), sanitizeForFirestore({
    ...lesson,
    kind: 'lesson' as const,
  }))
}

export async function updateSchoolLesson(
  id: string,
  patch: Partial<SchoolLesson>,
): Promise<void> {
  if (!_currentUid) return
  const lesson = _lessons.find((l) => l.id === id)
  if (!lesson) return
  const updated: StoredLesson = { kind: 'lesson', ...lesson, ...patch }
  await setDoc(schoolDoc(_currentUid, `lesson-${id}`), sanitizeForFirestore(updated))
}

export async function deleteSchoolLesson(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(schoolDoc(_currentUid, `lesson-${id}`))
}

// ── React hooks ──────────────────────────────────────────────────────────────

export function useSchoolTasks(): SchoolTask[] {
  const [state, setState] = useState<SchoolTask[]>(_tasks)
  useEffect(() => {
    setState(_tasks)
    const l: TaskListener = (items) => setState(items)
    _taskListeners.add(l)
    return () => { _taskListeners.delete(l) }
  }, [])
  return state
}

export function useSchoolExams(): SchoolExam[] {
  const [state, setState] = useState<SchoolExam[]>(_exams)
  useEffect(() => {
    setState(_exams)
    const l: ExamListener = (items) => setState(items)
    _examListeners.add(l)
    return () => { _examListeners.delete(l) }
  }, [])
  return state
}

export function useSchoolSubjects(): SchoolSubject[] {
  const [state, setState] = useState<SchoolSubject[]>(_subjects)
  useEffect(() => {
    setState(_subjects)
    const l: SubjectListener = (items) => setState(items)
    _subjectListeners.add(l)
    return () => { _subjectListeners.delete(l) }
  }, [])
  return state
}

export function useSchoolLessons(): SchoolLesson[] {
  const [state, setState] = useState<SchoolLesson[]>(_lessons)
  useEffect(() => {
    setState(_lessons)
    const l: LessonListener = (items) => setState(items)
    _lessonListeners.add(l)
    return () => { _lessonListeners.delete(l) }
  }, [])
  return state
}

// ── Stable color palette for subjects derived from timetable lessons ──────────
const LESSON_SUBJECT_COLORS = [
  { dot: '#6F5AE8', bg: '#EDE9FB' },
  { dot: '#16A34A', bg: '#F0FDF4' },
  { dot: '#CA8A04', bg: '#FEFCE8' },
  { dot: '#DC2626', bg: '#FFF1F2' },
  { dot: '#2563EB', bg: '#EFF6FF' },
]

/**
 * Merges two subject sources, by case-insensitive name:
 *   1. Real, explicitly-created `kind='subject'` Firestore documents
 *      (`subjects`) — these ALWAYS appear, even when zero lessons reference
 *      them yet (e.g. a subject just created via "Add subject", or one
 *      whose lessons haven't been added yet). This is what makes a
 *      freshly-created subject visible and selectable immediately (BUG-03).
 *   2. Subjects that only exist implicitly as a `lesson.subject` string
 *      with no matching stored document — synthesized so legacy/lesson-only
 *      subjects (pre-dating the dedicated subject store) keep working.
 *
 * Stored real subjects always take precedence over a lesson-derived entry of
 * the same (case-insensitively compared) name, so there is never a duplicate
 * "ghost" entry for a subject that has both a stored document and lessons.
 *
 * Extracted as a plain function (rather than inlined in the hook below) so
 * it is directly unit-testable without a React rendering harness.
 */
export function mergeStoredAndLessonSubjects(
  lessons: SchoolLesson[],
  subjects: SchoolSubject[],
): SchoolSubject[] {
  const seen = new Map<string, SchoolSubject>()
  let colorIdx = 0

  // Pass 1: synthesize lesson-only subjects so legacy timetables that
  // predate real subject documents keep showing their subjects.
  for (const lesson of lessons) {
    if (!lesson.subject) continue
    const key = lesson.subject.toLowerCase().trim()
    if (seen.has(key)) continue

    // Prefer an explicit subject record matched by id, then by name
    const matched = lesson.subjectId
      ? (subjects.find(s => s.id === lesson.subjectId) ?? subjects.find(s => s.name.toLowerCase().trim() === key))
      : subjects.find(s => s.name.toLowerCase().trim() === key)

    if (matched) {
      seen.set(key, matched)
    } else {
      // Stable synthetic id derived from normalised name — consistent across re-renders
      const stableId = `lsub-${key.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`
      const color = LESSON_SUBJECT_COLORS[colorIdx % LESSON_SUBJECT_COLORS.length]
      colorIdx++
      seen.set(key, { id: stableId, name: lesson.subject, color: color.dot, bg: color.bg, icon: null })
    }
  }

  // Pass 2: every real stored subject always wins and always appears,
  // including ones with zero referencing lessons.
  for (const subject of subjects) {
    const key = subject.name.toLowerCase().trim()
    seen.set(key, subject)
  }

  return [...seen.values()]
}

/**
 * Single source of truth for School subject selectors and the overview
 * count. See mergeStoredAndLessonSubjects for the merge semantics.
 */
export function useSchoolSubjectsFromLessons(): SchoolSubject[] {
  const [lessons,  setLessons]  = useState<SchoolLesson[]>(_lessons)
  const [subjects, setSubjects] = useState<SchoolSubject[]>(_subjects)

  useEffect(() => {
    setLessons([..._lessons])
    setSubjects([..._subjects])
    const ll: LessonListener  = (items) => setLessons(items)
    const ls: SubjectListener = (items) => setSubjects(items)
    _lessonListeners.add(ll)
    _subjectListeners.add(ls)
    return () => {
      _lessonListeners.delete(ll)
      _subjectListeners.delete(ls)
    }
  }, [])

  return useMemo(
    () => mergeStoredAndLessonSubjects(lessons, subjects),
    [lessons, subjects],
  )
}

export function useSchoolLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading)
  useEffect(() => {
    setState(_loading)
    const l: LoadingListener = (v) => setState(v)
    _loadingListeners.add(l)
    return () => { _loadingListeners.delete(l) }
  }, [])
  return state
}

// ── Synchronous getters (used by entityResolver) ──────────────────────────────

export function getAllSchoolTasks() { return _tasks }
export function getAllSchoolExams() { return _exams }
export function getAllSchoolSubjects() { return _subjects }
