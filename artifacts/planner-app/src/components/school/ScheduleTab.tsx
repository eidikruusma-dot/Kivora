import { useState } from 'react'
import { Calendar, Clock, Pencil, Trash2, Plus, X, MapPin, User } from 'lucide-react'
import { t } from '@/lib/translations'
import { getLocalLanguage, subscribeToLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { useEffect } from 'react'
import { useSchoolSubjectsFromLessons, addSchoolSubject, classifySubject } from '@/lib/schoolStore'

export type ScheduleMode = 'traditional' | 'elearning' | 'none'

export interface ScheduleLesson {
  id: string
  subject: string
  subjectId?: string
  day?: string
  date?: string
  startTime?: string
  endTime?: string
  room?: string
  teacher?: string
  dotColor: string
  cardBg: string
}

export function getDays(lang: AppLang): string[] {
  if (lang === 'en') return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  return ['Esmaspäev', 'Teisipäev', 'Kolmapäev', 'Neljapäev', 'Reede', 'Laupäev', 'Pühapäev']
}

/** Legacy export for components that still reference the ET constant */
/** Canonical ET day strings — always stored as these values regardless of display language */
export const DAYS_ET = ['Esmaspäev', 'Teisipäev', 'Kolmapäev', 'Neljapäev', 'Reede', 'Laupäev', 'Pühapäev']

/** Legacy export for components that still reference the ET constant */
export const DAYS = DAYS_ET

const SUBJECT_COLORS = [
  { dot: '#6F5AE8', bg: '#EDE9FB' },
  { dot: '#16A34A', bg: '#F0FDF4' },
  { dot: '#CA8A04', bg: '#FEFCE8' },
  { dot: '#DC2626', bg: '#FFF1F2' },
  { dot: '#2563EB', bg: '#EFF6FF' },
]

let colorIdx = 0
function nextColor() {
  const c = SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length]
  colorIdx++
  return c
}

type Props = {
  mode: ScheduleMode
  lessons: ScheduleLesson[]
  onModeChange: (mode: ScheduleMode) => void
  onAdd: (lesson: ScheduleLesson) => void
  onUpdate: (id: string, patch: Partial<ScheduleLesson>) => void
  onDelete: (id: string) => void
  onQuickAddAssignment?: (subjectName: string) => void
}

export default function ScheduleTab({ mode, lessons, onModeChange, onAdd, onUpdate, onDelete, onQuickAddAssignment }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])
  const subjects = useSchoolSubjectsFromLessons()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingLesson, setEditingLesson] = useState<ScheduleLesson | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const openAdd = () => {
    setEditingLesson(null)
    setModalOpen(true)
  }
  const openEdit = (lesson: ScheduleLesson) => {
    setEditingLesson(lesson)
    setModalOpen(true)
  }

  const handleSave = (lesson: ScheduleLesson) => {
    if (editingLesson) {
      onUpdate(editingLesson.id, lesson)
    } else {
      onAdd(lesson)
    }
    setModalOpen(false)
    setEditingLesson(null)
  }

  const handleDelete = (id: string) => {
    onDelete(id)
    setConfirmDeleteId(null)
  }

  const MODES: { id: ScheduleMode; label: string }[] = [
    { id: 'traditional', label: t('sched.mode.traditional', lang) },
    { id: 'elearning',   label: t('sched.mode.elearning',   lang) },
    { id: 'none',        label: t('sched.mode.none',        lang) },
  ]

  return (
    <div>
      {/* Mode selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          {MODES.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onModeChange(opt.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                mode === opt.id
                  ? 'bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]'
                  : 'bg-[#F8F7FC] text-[#64748B] border border-[#ECECF2] hover:border-[#6F5AE8]/30'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content by mode */}
      {mode === 'none' ? (
        // Compact informational panel — no bullet list (Tasks/Tests/Exams/AI
        // already have their own tabs) and no "Enable timetable" button (it
        // contradicted the user's deliberate "No timetable" choice; the mode
        // selector above is the only way to switch modes). The calendar icon
        // is purely decorative (no onClick), matching its informational role.
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F8F7FC] flex items-center justify-center flex-shrink-0">
            <Calendar size={20} strokeWidth={1.8} className="text-[#94A3B8]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#1A1F36]">{t('sched.none.title', lang)}</p>
            <p className="text-xs text-[#94A3B8] mt-0.5">{t('sched.none.sub', lang)}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1A1F36]">
              {mode === 'traditional' ? t('sched.traditional.title', lang) : t('sched.elearning.title', lang)}
            </h3>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
            >
              <Plus size={14} strokeWidth={2.5} />
              {mode === 'traditional' ? t('sched.add.lesson', lang) : t('sched.add.block', lang)}
            </button>
          </div>

          {lessons.length === 0 ? (
            // Compact empty state — no decorative "+" (it had no onClick;
            // the working add control is the header button above, openAdd).
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className="text-sm font-semibold text-[#1A1F36]">
                {mode === 'traditional' ? t('sched.empty.title', lang) : t('sched.empty.titleBlock', lang)}
              </p>
              <p className="text-xs text-[#94A3B8] mt-1">
                {mode === 'traditional'
                  ? t('sched.empty.subLesson', lang)
                  : t('sched.empty.subBlock', lang)}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lessons.map((lesson) => {
                const isConfirming = confirmDeleteId === lesson.id
                // Derive current color from subjects store so renames/recolors reflect instantly
                const matchedSubject = subjects.find((s) => s.name === lesson.subject)
                const dotColor = matchedSubject ? matchedSubject.color : lesson.dotColor
                const cardBg = matchedSubject ? matchedSubject.bg : lesson.cardBg
                return (
                  <div
                    key={lesson.id}
                    className="rounded-xl border border-[#ECECF2] p-3.5"
                    style={{ background: cardBg }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: dotColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#1A1F36] truncate">{lesson.subject}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {lesson.day && (
                            <span className="text-[11px] text-[#64748B] font-medium">{lesson.day}</span>
                          )}
                          {lesson.date && (
                            <span className="text-[11px] text-[#64748B] font-medium">{lesson.date}</span>
                          )}
                          {lesson.startTime && (
                            <span className="text-[11px] text-[#94A3B8] flex items-center gap-0.5">
                              <Clock size={10} strokeWidth={2} />
                              {lesson.startTime}{lesson.endTime ? `–${lesson.endTime}` : ''}
                            </span>
                          )}
                          {lesson.room && (
                            <span className="text-[11px] text-[#94A3B8] flex items-center gap-0.5">
                              <MapPin size={10} strokeWidth={2} />
                              {lesson.room}
                            </span>
                          )}
                          {lesson.teacher && (
                            <span className="text-[11px] text-[#94A3B8] flex items-center gap-0.5">
                              <User size={10} strokeWidth={2} />
                              {lesson.teacher}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {onQuickAddAssignment && (
                          <button
                            onClick={() => onQuickAddAssignment(lesson.subject)}
                            title={lang === 'et' ? 'Lisa kodutöö' : 'Add assignment'}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-white/60 hover:text-[#6F5AE8] transition-colors"
                          >
                            <Plus size={13} strokeWidth={2.5} />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(lesson)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-white/60 hover:text-[#6F5AE8] transition-colors"
                        >
                          <Pencil size={13} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(lesson.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-white/60 hover:text-[#DC2626] transition-colors"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    {isConfirming && (
                      <div className="flex items-center justify-end gap-2 mt-2.5 pt-2.5 border-t border-black/5">
                        <span className="text-xs text-[#64748B] mr-auto">{t('sched.confirm.delete', lang)}</span>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-white/60 transition-colors"
                        >
                          {t('cal.action.cancel', lang)}
                        </button>
                        <button
                          onClick={() => handleDelete(lesson.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                        >
                          {t('cal.action.delete', lang)}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <LessonModal
          mode={mode}
          lesson={editingLesson}
          lang={lang}
          onClose={() => { setModalOpen(false); setEditingLesson(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

// ── Lesson add/edit modal ──────────────────────────────────────────────────

function LessonModal({
  mode,
  lesson,
  lang,
  onClose,
  onSave,
}: {
  mode: ScheduleMode
  lesson: ScheduleLesson | null
  lang: AppLang
  onClose: () => void
  onSave: (lesson: ScheduleLesson) => void
}) {
  const isTraditional = mode === 'traditional'
  const subjects = useSchoolSubjectsFromLessons()

  // Initialise subjectId: prefer stored subjectId, fall back to name-based lookup for legacy data
  const initialSubjectId =
    lesson?.subjectId ??
    subjects.find((s) => s.name === lesson?.subject)?.id ??
    ''
  const [subject, setSubject] = useState(lesson?.subject ?? '')
  const [subjectId, setSubjectId] = useState(initialSubjectId)
  const [day, setDay] = useState(lesson?.day ?? '')
  const [date, setDate] = useState(lesson?.date ?? '')
  const [startTime, setStartTime] = useState(lesson?.startTime ?? '')
  const [endTime, setEndTime] = useState(lesson?.endTime ?? '')
  const [room, setRoom] = useState(lesson?.room ?? '')
  const [teacher, setTeacher] = useState(lesson?.teacher ?? '')
  const [error, setError] = useState('')

  // ── Inline "create new subject" state ──────────────────────────────────────
  const [showCreateNew, setShowCreateNew] = useState(false)
  const [newSubjectName, setNewSubjectName] = useState('')
  // Auto-suggested from the name via classifySubject (schoolStore.tsx) until
  // the user manually picks a swatch — see newSubjectColorManuallySet below.
  const [newSubjectColorIdx, setNewSubjectColorIdx] = useState(classifySubject('').colorIndex)
  const [newSubjectColorManuallySet, setNewSubjectColorManuallySet] = useState(false)
  const [savingSubject, setSavingSubject] = useState(false)

  const DAYS_DISPLAY = getDays(lang)
  const optional = <span className="text-[#CBD5E1] font-normal">({t('sched.field.optional', lang)})</span>

  /** Called when the subject <select> value changes */
  const handleSubjectChange = (value: string) => {
    if (value === '__create_new__') {
      setShowCreateNew(true)
      setSubjectId('')
      setSubject('')
      setError('')
      // Fresh inline-creator state each time it's (re)opened — "starts a
      // new subject" resets the color-auto-suggestion override rule.
      setNewSubjectName('')
      setNewSubjectColorIdx(classifySubject('').colorIndex)
      setNewSubjectColorManuallySet(false)
      return
    }
    const matched = subjects.find((s) => s.id === value)
    if (matched) {
      setSubjectId(matched.id)
      setSubject(matched.name)
    } else {
      setSubjectId('')
      setSubject('')
    }
    setShowCreateNew(false)
    setError('')
  }

  /**
   * Saves a new subject to Firestore and auto-selects it as this
   * learning-block form's subject — without closing this LessonModal and
   * without opening SubjectDetailModal (that belongs to the separate,
   * standalone "Ained" subject-management flow in SchoolPage.tsx).
   */
  const handleCreateSubject = async () => {
    const name = newSubjectName.trim()
    if (!name || savingSubject) return // guards against double submission
    const newId = `sub-${Date.now()}`
    const color = SUBJECT_COLORS[newSubjectColorIdx % SUBJECT_COLORS.length]
    setError('')
    setSavingSubject(true)
    try {
      await addSchoolSubject({ id: newId, name, color: color.dot, bg: color.bg, icon: null })
      setSubjectId(newId)
      setSubject(name)
      setShowCreateNew(false)
      setNewSubjectName('')
      setNewSubjectColorIdx(classifySubject('').colorIndex)
      setNewSubjectColorManuallySet(false)
      setError('')
    } catch {
      // Keep the inline creator open and usable — never claim success on a failed write.
      setError(
        lang === 'et'
          ? 'Aine loomine ebaõnnestus. Proovi uuesti.'
          : 'Failed to create the subject. Please try again.',
      )
    } finally {
      setSavingSubject(false)
    }
  }

  const handleSave = () => {
    if (!subject.trim()) {
      setError(t('sched.field.error.subject', lang))
      return
    }
    // Derive color from matched subject; fall back to existing lesson color or round-robin
    const matched =
      subjects.find((s) => s.id === subjectId) ??
      subjects.find((s) => s.name === subject.trim())
    let dotColor: string
    let cardBg: string
    if (matched) {
      dotColor = matched.color
      cardBg = matched.bg
    } else if (lesson) {
      dotColor = lesson.dotColor
      cardBg = lesson.cardBg
    } else {
      const c = nextColor()
      dotColor = c.dot
      cardBg = c.bg
    }
    onSave({
      id: lesson?.id ?? crypto.randomUUID(),
      subject: subject.trim(),
      subjectId: subjectId || undefined,
      day: day || undefined,
      date: date || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      room: room || undefined,
      teacher: teacher || undefined,
      dotColor,
      cardBg,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECECF2] flex-shrink-0">
          <h2 className="text-base font-semibold text-[#1A1F36]">
            {lesson ? t('sched.modal.editLesson', lang) : isTraditional ? t('sched.modal.addLesson', lang) : t('sched.modal.addBlock', lang)}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {t('sched.field.subject', lang)} <span className="text-red-500">*</span>
            </label>
            {/* Selector: always shown; includes "+ Create new subject" option */}
            <select
              value={showCreateNew ? '__create_new__' : subjectId}
              onChange={(e) => handleSubjectChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
            >
              {/* disabled+hidden: describes the closed field without being a
                  selectable dropdown choice — see BUG-04 (long example option) */}
              <option value="" disabled hidden>{t('sched.field.subjectPh', lang)}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="__create_new__">
                {lang === 'et' ? '+ Lisa uus aine' : '+ Create new subject'}
              </option>
            </select>

            {/* Inline create-subject form — shown when "+ Create new subject" is selected */}
            {showCreateNew && (
              <div className="mt-2 flex flex-col gap-2 p-3 rounded-lg bg-[#F8F7F4] border border-[#ECECF2]">
                <input
                  type="text"
                  value={newSubjectName}
                  onChange={(e) => {
                    const value = e.target.value
                    setNewSubjectName(value)
                    // Keep suggesting a color while the user hasn't manually
                    // picked one — once they do, typing must not silently
                    // replace their choice.
                    if (!newSubjectColorManuallySet) {
                      setNewSubjectColorIdx(classifySubject(value).colorIndex)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void handleCreateSubject() }
                  }}
                  placeholder={lang === 'et' ? 'Aine nimi' : 'Subject name'}
                  autoFocus
                  disabled={savingSubject}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#64748B] mr-1">{lang === 'et' ? 'Värv:' : 'Color:'}</span>
                  {SUBJECT_COLORS.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setNewSubjectColorIdx(i)
                        setNewSubjectColorManuallySet(true)
                      }}
                      disabled={savingSubject}
                      style={{
                        background: c.bg,
                        borderColor: newSubjectColorIdx === i ? c.dot : 'transparent',
                      }}
                      className="w-6 h-6 rounded-full border-2 transition-all disabled:opacity-60"
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCreateSubject()}
                    disabled={!newSubjectName.trim() || savingSubject}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#6F5AE8] text-white text-sm font-medium disabled:opacity-40 hover:bg-[#5B48D8] transition-colors"
                  >
                    {savingSubject
                      ? (lang === 'et' ? 'Loomine…' : 'Creating…')
                      : (lang === 'et' ? 'Loo aine' : 'Create subject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateNew(false)}
                    disabled={savingSubject}
                    className="px-3 py-1.5 rounded-lg border border-[#ECECF2] text-sm text-[#64748B] hover:bg-[#F8F7F4] transition-colors disabled:opacity-40"
                  >
                    {lang === 'et' ? 'Tühista' : 'Cancel'}
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          {isTraditional && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('sched.field.day', lang)}</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
              >
                <option value="">{t('sched.field.dayPh', lang)}</option>
                {DAYS_ET.map((etDay, i) => (
                  <option key={etDay} value={etDay}>{DAYS_DISPLAY[i]}</option>
                ))}
              </select>
            </div>
          )}

          {!isTraditional && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('sched.field.day', lang)} {optional}</label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
                >
                  <option value="">{t('sched.field.dayNone', lang)}</option>
                  {DAYS_ET.map((etDay, i) => (
                    <option key={etDay} value={etDay}>{DAYS_DISPLAY[i]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">{t('sched.field.date', lang)} {optional}</label>
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder={t('sched.field.datePh', lang)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('sched.field.start', lang)} {isTraditional ? '' : optional}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('sched.field.end', lang)} {isTraditional ? '' : optional}
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('sched.field.room', lang)} {isTraditional ? '' : optional}
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder={t('sched.field.roomPh', lang)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t('sched.field.teacher', lang)} {isTraditional ? '' : optional}
              </label>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder={t('sched.field.teacherPh', lang)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            {t('cal.action.cancel', lang)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            {t('cal.event.save', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
