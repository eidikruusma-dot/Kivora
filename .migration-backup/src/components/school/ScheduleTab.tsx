import { useState } from 'react'
import { Calendar, Clock, Pencil, Trash2, Plus, X, MapPin, User, CheckCircle2 } from 'lucide-react'

export type ScheduleMode = 'traditional' | 'elearning' | 'none'

export interface ScheduleLesson {
  id: string
  subject: string
  day?: string
  date?: string
  startTime?: string
  endTime?: string
  room?: string
  teacher?: string
  dotColor: string
  cardBg: string
}

export const DAYS = ['Esmaspäev', 'Teisipäev', 'Kolmapäev', 'Neljapäev', 'Reede', 'Laupäev', 'Pühapäev']

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
}

export default function ScheduleTab({ mode, lessons, onModeChange, onAdd, onUpdate, onDelete }: Props) {
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

  return (
    <div>
      {/* Mode selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'traditional', label: 'Tavapärane tunniplaan' },
              { id: 'elearning', label: 'E-õpe / paindlik õpe' },
              { id: 'none', label: 'Tunniplaani ei kasuta' },
            ] as { id: ScheduleMode; label: string }[]
          ).map((opt) => (
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
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#F8F7FC] flex items-center justify-center">
              <Calendar size={20} strokeWidth={1.8} className="text-[#94A3B8]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1A1F36]">Sa ei kasuta tunniplaani</p>
              <p className="text-xs text-[#94A3B8]">Kivorat saab kasutada ka ilma tunniplaanita.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 mb-5">
            {['Ülesandeid', 'Kontrolltöid', 'Eksameid', 'AI Õpiabi'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 size={15} strokeWidth={2} className="text-[#6F5AE8] flex-shrink-0" />
                <span className="text-xs text-[#64748B]">{item}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => onModeChange('traditional')}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            Lülita tunniplaan sisse
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1A1F36]">
              {mode === 'traditional' ? 'Minu tunniplaan' : 'Õppimisplaan'}
            </h3>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
            >
              <Plus size={14} strokeWidth={2.5} />
              {mode === 'traditional' ? 'Lisa tund' : 'Lisa õppimisblokk'}
            </button>
          </div>

          {lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-11 h-11 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
                <Plus size={20} strokeWidth={1.8} className="text-[#6F5AE8]" />
              </div>
              <p className="text-sm font-semibold text-[#1A1F36]">Kirjed puuduvad</p>
              <p className="text-xs text-[#94A3B8] mt-1">
                {mode === 'traditional'
                  ? 'Lisa oma esimene tund nädalapäeva ja kellaaja järgi.'
                  : 'Lisa oma esimene õppimisblokk või iseseisva õppimise aeg.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {lessons.map((lesson) => {
                const isConfirming = confirmDeleteId === lesson.id
                return (
                  <div
                    key={lesson.id}
                    className="rounded-xl border border-[#ECECF2] p-3.5"
                    style={{ background: lesson.cardBg }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: lesson.dotColor }}
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
                        <span className="text-xs text-[#64748B] mr-auto">Kustuta see kirje?</span>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-white/60 transition-colors"
                        >
                          Tühista
                        </button>
                        <button
                          onClick={() => handleDelete(lesson.id)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                        >
                          Kustuta
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
  onClose,
  onSave,
}: {
  mode: ScheduleMode
  lesson: ScheduleLesson | null
  onClose: () => void
  onSave: (lesson: ScheduleLesson) => void
}) {
  const isTraditional = mode === 'traditional'
  const [subject, setSubject] = useState(lesson?.subject ?? '')
  const [day, setDay] = useState(lesson?.day ?? '')
  const [date, setDate] = useState(lesson?.date ?? '')
  const [startTime, setStartTime] = useState(lesson?.startTime ?? '')
  const [endTime, setEndTime] = useState(lesson?.endTime ?? '')
  const [room, setRoom] = useState(lesson?.room ?? '')
  const [teacher, setTeacher] = useState(lesson?.teacher ?? '')
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!subject.trim()) {
      setError('Sisesta aine või tegevuse nimi.')
      return
    }
    const color = lesson
      ? { dot: lesson.dotColor, bg: lesson.cardBg }
      : nextColor()
    onSave({
      id: lesson?.id ?? crypto.randomUUID(),
      subject: subject.trim(),
      day: day || undefined,
      date: date || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      room: room || undefined,
      teacher: teacher || undefined,
      dotColor: color.dot,
      cardBg: color.bg,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#ECECF2]">
          <h2 className="text-base font-semibold text-[#1A1F36]">
            {lesson ? 'Muuda kirjet' : isTraditional ? 'Lisa tund' : 'Lisa õppimisblokk'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {isTraditional ? 'Aine või tegevus' : 'Aine või tegevus'} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setError('') }}
              placeholder="nt Matemaatika, Iseseisev õppimine, Moodle ülesanne või Projektitöö"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          {isTraditional && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Nädalapäev</label>
              <select
                value={day}
                onChange={(e) => setDay(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
              >
                <option value="">Vali päev</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {!isTraditional && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Nädalapäev <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
                >
                  <option value="">Pole määratud</option>
                  {DAYS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kuupäev <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
                <input
                  type="text"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  placeholder="nt. 4. august 2026"
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                Algus {isTraditional ? '' : <span className="text-[#CBD5E1] font-normal">(valikuline)</span>}
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
                Lõpp {isTraditional ? '' : <span className="text-[#CBD5E1] font-normal">(valikuline)</span>}
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
                Ruum {isTraditional ? '' : <span className="text-[#CBD5E1] font-normal">(valikuline)</span>}
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="nt. Ruum 201"
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                Õpetaja {isTraditional ? '' : <span className="text-[#CBD5E1] font-normal">(valikuline)</span>}
              </label>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="nt. M. Tamm"
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            Tühista
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            Salvesta
          </button>
        </div>
      </div>
    </div>
  )
}
