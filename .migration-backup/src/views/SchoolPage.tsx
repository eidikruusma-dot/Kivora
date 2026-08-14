import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import AllExamsModal, { type ExamItem } from '@/components/school/AllExamsModal'
import ScheduleTab, { type ScheduleMode, type ScheduleLesson } from '@/components/school/ScheduleTab'
import {
  BookOpen,
  CheckCircle,
  Calendar,
  Clock,
  Star,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Sparkles,
  Filter,
  ArrowUpDown,
  HardDrive,
  Link2,
  FlaskConical,
  MessageSquare,
  Globe,
  Pencil,
  Trash2,
  Check,
  X,
  Plus,
  User as UserIcon,
  MapPin,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type TabId = 'tunniplaan' | 'uesanded' | 'kontrolltood' | 'eksamid' | 'ained' | 'ulevaade'

interface TaskPart {
  id: string
  label: string
  done: boolean
}

interface Task {
  id: number
  subject: string
  subjectColor: string
  subjectBg: string
  subjectIcon: React.ReactNode
  title: string
  type: string
  deadlineLabel: string
  deadline: string
  progress: number
  moodleUrl: string
  prevProgress?: number
  parts?: TaskPart[]
}

type TaskStatus = 'tegemata' | 'pooleli' | 'tehtud'

function computePartsProgress(parts: TaskPart[]): number {
  if (!parts || parts.length === 0) return -1
  const done = parts.filter((p) => p.done).length
  return Math.round((done / parts.length) * 100)
}

function statusFromProgress(p: number): TaskStatus {
  if (p >= 100) return 'tehtud'
  if (p > 0) return 'pooleli'
  return 'tegemata'
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  tegemata: 'Tegemata',
  pooleli: 'Pooleli',
  tehtud: 'Tehtud',
}

const STATUS_STYLES: Record<TaskStatus, { bg: string; color: string }> = {
  tegemata: { bg: '#F1F5F9', color: '#64748B' },
  pooleli: { bg: '#FEF9C3', color: '#854D0E' },
  tehtud: { bg: '#DCFCE7', color: '#15803D' },
}

const MONTHS_EST: Record<string, number> = {
  jaanuar: 0, veebruar: 1, märts: 2, aprill: 3, mai: 4, juuni: 5,
  juuli: 6, august: 7, september: 8, oktoober: 9, november: 10, detsember: 11,
}

function parseDeadline(s: string): number {
  const m = s.match(/(\d+)\.\s+(\w+)\s+(\d+)/)
  if (!m) return 0
  return new Date(parseInt(m[3]), MONTHS_EST[m[2].toLowerCase()] ?? 0, parseInt(m[1])).getTime()
}

function deadlineToLabel(deadline: string): string {
  const m = deadline.match(/(\d+\.\s+\w+)/)
  return m ? `Tähtaeg: ${m[1]}` : `Tähtaeg: ${deadline}`
}

function computeDaysLeft(dateStr: string): number {
  const ts = parseDeadline(dateStr)
  if (!ts) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((ts - today.getTime()) / (1000 * 60 * 60 * 24))
}

interface Subject {
  id: string
  name: string
  teacher?: string
  room?: string
  color: string
  bg: string
  icon: React.ReactNode
}

interface Exam {
  id: number
  subject: string
  title: string
  date: string
  daysLeft: number
  type: 'kontrolltöö' | 'eksam'
  status: 'ootel' | 'tehtud'
  iconBg: string
  iconColor: string
  notes?: string
  moodleUrl?: string
  time?: string
  location?: string
}



// ── Mock data ──────────────────────────────────────────────────────────────

const TASKS: Task[] = [
  {
    id: 1,
    subject: 'Matemaatika',
    subjectColor: '#6F5AE8',
    subjectBg: '#EDE9FB',
    subjectIcon: <BookOpen size={16} strokeWidth={1.8} />,
    title: 'Võrrandid lk 45–48',
    type: 'Kodutöö',
    deadlineLabel: 'Tähtaeg: 28. juuli',
    deadline: '28. juuli 2026',
    progress: 60,
    moodleUrl: '#',
    parts: [
      { id: 'p1-1', label: 'Loe peatükk läbi', done: true },
      { id: 'p1-2', label: 'Lahenda ülesanded 1–5', done: true },
      { id: 'p1-3', label: 'Kontrolli vastuseid', done: false },
      { id: 'p1-4', label: 'Esita Moodles', done: false },
    ],
  },
  {
    id: 2,
    subject: 'Keemia',
    subjectColor: '#16A34A',
    subjectBg: '#DCFCE7',
    subjectIcon: <FlaskConical size={16} strokeWidth={1.8} />,
    title: 'Laboriaruanne: Happed ja alused',
    type: 'Laboriaruanne',
    deadlineLabel: 'Tähtaeg: 30. juuli',
    deadline: '30. juuli 2026',
    progress: 30,
    moodleUrl: '#',
  },
  {
    id: 3,
    subject: 'Eesti keel',
    subjectColor: '#CA8A04',
    subjectBg: '#FEF9C3',
    subjectIcon: <MessageSquare size={16} strokeWidth={1.8} />,
    title: 'Arutlus: tehnoloogia mõju',
    type: 'Kirjalik töö',
    deadlineLabel: 'Tähtaeg: 1. august',
    deadline: '1. august 2026',
    progress: 0,
    moodleUrl: '#',
  },
  {
    id: 4,
    subject: 'Ajalugu',
    subjectColor: '#DC2626',
    subjectBg: '#FEE2E2',
    subjectIcon: <Globe size={16} strokeWidth={1.8} />,
    title: 'Eesti Vabariik 1918–1940 kokkuvõte',
    type: 'Kodutöö',
    deadlineLabel: 'Tähtaeg: 5. august',
    deadline: '5. august 2026',
    progress: 15,
    moodleUrl: '#',
  },
]

const INITIAL_SUBJECTS: Subject[] = [
  { id: 'sub-1', name: 'Matemaatika', teacher: 'M. Tamm', room: 'Ruum 201', color: '#6F5AE8', bg: '#EDE9FB', icon: <BookOpen size={16} strokeWidth={1.8} /> },
  { id: 'sub-2', name: 'Keemia',      teacher: 'A. Mets', room: 'Labor 2',  color: '#16A34A', bg: '#DCFCE7', icon: <FlaskConical size={16} strokeWidth={1.8} /> },
  { id: 'sub-3', name: 'Eesti keel',  teacher: 'K. Kask', room: 'Ruum 203', color: '#CA8A04', bg: '#FEF9C3', icon: <MessageSquare size={16} strokeWidth={1.8} /> },
  { id: 'sub-4', name: 'Ajalugu',     teacher: 'R. Vain', room: 'Ruum 204', color: '#DC2626', bg: '#FEE2E2', icon: <Globe size={16} strokeWidth={1.8} /> },
  { id: 'sub-5', name: 'Füüsika',     teacher: 'P. Oja',  room: 'Ruum 105', color: '#2563EB', bg: '#EFF6FF', icon: <HardDrive size={16} strokeWidth={1.8} /> },
]

const INITIAL_EXAMS: Exam[] = [
  { id: 1, subject: 'Matemaatika', title: 'Matemaatika kontrolltöö', date: '4. august 2026',  daysLeft: 8,  type: 'kontrolltöö', status: 'ootel', iconBg: '#FEF9C3', iconColor: '#CA8A04' },
  { id: 2, subject: 'Keemia',      title: 'Keemia kontrolltöö',      date: '11. august 2026', daysLeft: 15, type: 'kontrolltöö', status: 'ootel', iconBg: '#DCFCE7', iconColor: '#16A34A' },
  { id: 3, subject: 'Ajalugu',     title: 'Ajalugu eksam',            date: '22. august 2026', daysLeft: 26, type: 'eksam',       status: 'ootel', iconBg: '#FEE2E2', iconColor: '#DC2626' },
]

const STUDY_HOURS: { day: string; hours: number; label: string }[] = [
  { day: 'E', hours: 3.0,  label: '3h' },
  { day: 'T', hours: 2.5,  label: '2h 30m' },
  { day: 'K', hours: 4.0,  label: '4h' },
  { day: 'N', hours: 3.0,  label: '3h' },
  { day: 'R', hours: 2.0,  label: '2h' },
  { day: 'L', hours: 2.0,  label: '2h' },
  { day: 'P', hours: 2.0,  label: '2h' },
]

const MAX_HOURS = 4

// ── Progress ring ──────────────────────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 18
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#E9E9F0" strokeWidth="3.5" />
      <circle
        cx="22" cy="22" r={r}
        fill="none"
        stroke={pct === 0 ? '#E9E9F0' : color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
      />
    </svg>
  )
}

// ── Tabs ───────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'tunniplaan', label: 'Tunniplaan' },
  { id: 'uesanded',   label: 'Ülesanded'  },
  { id: 'kontrolltood', label: 'Kontrolltööd' },
  { id: 'eksamid',    label: 'Eksamid'    },
  { id: 'ained',      label: 'Ained'      },
  { id: 'ulevaade',   label: 'Ülevaade'   },
]

// ── Main component ─────────────────────────────────────────────────────────

export default function SchoolPage() {
  const [activeTab, setActiveTab] = useState<TabId>('uesanded')
  const [tasks, setTasks] = useState<Task[]>(TASKS)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null
  const [editingTask, setEditingTask] = useState<Task | null>(null)
  const [addingTask, setAddingTask] = useState(false)
  const [exams, setExams] = useState<Exam[]>(INITIAL_EXAMS)
  const [showAllExams, setShowAllExams] = useState(false)
  const [addingExam, setAddingExam] = useState(false)
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [addingEksam, setAddingEksam] = useState(false)
  const [selectedEksam, setSelectedEksam] = useState<Exam | null>(null)
  const [editingEksam, setEditingEksam] = useState<Exam | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>(INITIAL_SUBJECTS)
  const [addingSubject, setAddingSubject] = useState(false)
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [scheduleMode, setScheduleModeState] = useState<ScheduleMode>(() => {
    try {
      const saved = localStorage.getItem('kivora_schedule_mode')
      if (saved === 'traditional' || saved === 'elearning' || saved === 'none') return saved
    } catch {}
    return 'traditional'
  })
  const setScheduleMode = (mode: ScheduleMode) => {
    setScheduleModeState(mode)
    try { localStorage.setItem('kivora_schedule_mode', mode) } catch {}
  }
  const [scheduleLessons, setScheduleLessons] = useState<ScheduleLesson[]>([
    { id: 's1', subject: 'Matemaatika', day: 'Esmaspäev', startTime: '08:00', endTime: '08:45', room: 'Ruum 201', teacher: 'M. Tamm', dotColor: '#6F5AE8', cardBg: '#EDE9FB' },
    { id: 's2', subject: 'Eesti keel',  day: 'Esmaspäev', startTime: '09:00', endTime: '09:45', room: 'Ruum 203', teacher: 'K. Kask', dotColor: '#16A34A', cardBg: '#F0FDF4' },
    { id: 's3', subject: 'Füüsika',     day: 'Esmaspäev', startTime: '10:00', endTime: '10:45', room: 'Ruum 105', teacher: 'P. Oja',  dotColor: '#CA8A04', cardBg: '#FEFCE8' },
    { id: 's4', subject: 'Keemia',      day: 'Esmaspäev', startTime: '11:00', endTime: '11:45', room: 'Labor 2',  teacher: 'A. Mets', dotColor: '#DC2626', cardBg: '#FFF1F2' },
    { id: 's5', subject: 'Ajalugu',     day: 'Esmaspäev', startTime: '12:00', endTime: '12:45', room: 'Ruum 204', teacher: 'R. Vain', dotColor: '#2563EB', cardBg: '#EFF6FF' },
  ])

  const pendingCount = tasks.filter((t) => statusFromProgress(t.progress) !== 'tehtud').length
  const avgProgress = tasks.length > 0
    ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
    : 0

  const upcomingExamsCount = exams.filter(
    (e) => e.type === 'kontrolltöö' && e.status !== 'tehtud' && e.daysLeft >= 0 && e.daysLeft <= 30
  ).length

  const updateTask = (id: number, patch: Partial<Task>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const deleteTask = (id: number) =>
    setTasks((prev) => prev.filter((t) => t.id !== id))
  const markTaskDone = (id: number) =>
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t
      const parts = t.parts?.map((p) => ({ ...p, done: true }))
      return { ...t, prevProgress: t.progress, progress: 100, parts }
    }))
  const markTaskUndone = (id: number) =>
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t
      const parts = t.parts?.map((p) => ({ ...p, done: false }))
      const progress = t.prevProgress ?? (parts && parts.length > 0 ? 0 : 0)
      return { ...t, progress, prevProgress: undefined, parts }
    }))
  const togglePart = (taskId: number, partId: string) =>
    setTasks((prev) => prev.map((t) => {
      if (t.id !== taskId || !t.parts) return t
      const parts = t.parts.map((p) => (p.id === partId ? { ...p, done: !p.done } : p))
      const pct = computePartsProgress(parts)
      const progress = pct < 0 ? t.progress : pct
      return { ...t, parts, progress }
    }))
  const addTask = (task: Task) =>
    setTasks((prev) => [...prev, task])

  useEffect(() => {
    setExams((prev) => prev.map((e) => ({ ...e, daysLeft: computeDaysLeft(e.date) })))
  }, [])

  const updateExam = (id: number, patch: Partial<ExamItem>) =>
    setExams((prev) => prev.map((e) => {
      if (e.id !== id) return e
      const updated = { ...e, ...patch }
      if (patch.date !== undefined) updated.daysLeft = computeDaysLeft(patch.date)
      return updated
    }))
  const deleteExam = (id: number) =>
    setExams((prev) => prev.filter((e) => e.id !== id))
  const addExam = (exam: Exam) =>
    setExams((prev) => [...prev, exam])

  const addLesson = (lesson: ScheduleLesson) =>
    setScheduleLessons((prev) => [...prev, lesson])
  const updateLesson = (id: string, patch: Partial<ScheduleLesson>) =>
    setScheduleLessons((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const deleteLesson = (id: string) =>
    setScheduleLessons((prev) => prev.filter((l) => l.id !== id))

  const addSubject = (subject: Subject) =>
    setSubjects((prev) => [...prev, subject])

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-[1400px] mx-auto w-full">

      {/* ── Left/main column ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">

        {/* Overview cards */}
        <section>
          <h2 className="text-base font-semibold text-[#1A1F36] mb-4">Ülevaade</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard
              icon={<BookOpen size={18} strokeWidth={1.8} />}
              iconBg="#EDE9FB" iconColor="#6F5AE8"
              value="7" label="Ainet" sub="Sel õppeperioodil"
            />
            <StatCard
              icon={<CheckCircle size={18} strokeWidth={1.8} />}
              iconBg="#DCFCE7" iconColor="#16A34A"
              value={String(pendingCount)} label="Ülesannet" sub="Tuleb täita"
            />
            <StatCard
              icon={<Calendar size={18} strokeWidth={1.8} />}
              iconBg="#FEF9C3" iconColor="#CA8A04"
              value={String(upcomingExamsCount)} label="Kontrolltööd" sub="Järgmise 30 päeva jooksul"
            />
            <StatCard
              icon={<Clock size={18} strokeWidth={1.8} />}
              iconBg="#EFF6FF" iconColor="#2563EB"
              value="18h 30m" label="Õppetöö aeg" sub="Sel nädalal"
            />
            <StatCard
              icon={<Star size={18} strokeWidth={1.8} />}
              iconBg="#FFF1F2" iconColor="#DC2626"
              value={`${avgProgress}%`} label="Edenemine" sub="Keskmine"
            />
          </div>
        </section>

        {/* Tabs + content */}
        <div className="bg-white rounded-2xl border border-[#ECECF2]">

          {/* Tab bar */}
          <div className="flex border-b border-[#ECECF2] px-5 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative whitespace-nowrap px-3 py-4 text-sm font-medium transition-colors mr-2 ${
                  activeTab === tab.id
                    ? 'text-[#6F5AE8]'
                    : 'text-[#94A3B8] hover:text-[#1A1F36]'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6F5AE8] rounded-t-full" />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-5">
            {activeTab === 'uesanded' && (
              <TasksTab
                tasks={tasks}
                onTaskClick={(task) => setSelectedTaskId(task.id)}
                onAdd={() => setAddingTask(true)}
                onEdit={(task) => setEditingTask(task)}
                onMarkDone={markTaskDone}
                onMarkUndone={markTaskUndone}
                onDelete={deleteTask}
              />
            )}
            {activeTab === 'tunniplaan' && (
              <ScheduleTab
                mode={scheduleMode}
                lessons={scheduleLessons}
                onModeChange={setScheduleMode}
                onAdd={addLesson}
                onUpdate={updateLesson}
                onDelete={deleteLesson}
              />
            )}
            {activeTab === 'kontrolltood' && (
              <ExamsTab
                exams={exams.filter((e) => e.type === 'kontrolltöö')}
                onAdd={() => setAddingExam(true)}
                onExamClick={(exam) => setSelectedExam(exam)}
              />
            )}
            {activeTab === 'eksamid' && (
              <EksamidTab
                exams={exams.filter((e) => e.type === 'eksam')}
                onAdd={() => setAddingEksam(true)}
                onExamClick={(exam) => setSelectedEksam(exam)}
                onEdit={(exam) => setEditingEksam(exam)}
                onMarkDone={(id) => updateExam(id, { status: 'tehtud' })}
                onMarkUndone={(id) => updateExam(id, { status: 'ootel' })}
                onDelete={deleteExam}
              />
            )}
            {activeTab === 'ained' && (
              <AinedTab
                subjects={subjects}
                onAdd={() => setAddingSubject(true)}
                onSubjectClick={(s) => setSelectedSubject(s)}
              />
            )}
            {activeTab === 'ulevaade' && (
              <UlevaadeTab
                tasks={tasks}
                exams={exams}
                subjects={subjects}
                scheduleLessons={scheduleLessons}
                scheduleMode={scheduleMode}
                onNavigate={setActiveTab}
              />
            )}
          </div>
        </div>

        {/* Today's timetable */}
        <TodaySchedule lessons={scheduleLessons} mode={scheduleMode} onNavigate={setActiveTab} />
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-4">
        <UpcomingExams exams={exams} onShowAll={() => setShowAllExams(true)} />
        <StudyTimeChart data={STUDY_HOURS} />
        <MaterialsLinks />
        <AIStudyHelper
          subjects={subjects}
          tasks={tasks}
          exams={exams}
          scheduleMode={scheduleMode}
          scheduleLessons={scheduleLessons}
        />
      </aside>

      <AllExamsModal
        open={showAllExams}
        exams={exams}
        onClose={() => setShowAllExams(false)}
        onUpdate={updateExam}
        onDelete={deleteExam}
      />

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTaskId(null)}
          onEdit={(task) => { setEditingTask(task); setSelectedTaskId(null) }}
          onMarkDone={markTaskDone}
          onMarkUndone={markTaskUndone}
          onTogglePart={togglePart}
          onDelete={(id) => { deleteTask(id); setSelectedTaskId(null) }}
        />
      )}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={(id, patch) => { updateTask(id, patch); setEditingTask(null) }}
        />
      )}
      {addingTask && (
        <TaskAddModal
          nextId={Math.max(0, ...tasks.map((t) => t.id)) + 1}
          onClose={() => setAddingTask(false)}
          onSave={(task) => { addTask(task); setAddingTask(false) }}
        />
      )}
      {selectedExam && (
        <ExamDetailModal
          exam={selectedExam}
          onClose={() => setSelectedExam(null)}
          onEdit={(exam) => { setEditingExam(exam); setSelectedExam(null) }}
          onDelete={(id) => { deleteExam(id); setSelectedExam(null) }}
        />
      )}
      {addingExam && (
        <ExamFormModal
          nextId={Math.max(0, ...exams.map((e) => e.id)) + 1}
          onClose={() => setAddingExam(false)}
          onSave={(exam) => { addExam(exam); setAddingExam(false) }}
        />
      )}
      {editingExam && (
        <ExamFormModal
          exam={editingExam}
          nextId={editingExam.id}
          onClose={() => setEditingExam(null)}
          onSave={(exam) => { updateExam(exam.id, exam); setEditingExam(null) }}
        />
      )}
      {selectedEksam && (
        <EksamDetailModal
          exam={selectedEksam}
          onClose={() => setSelectedEksam(null)}
          onEdit={(exam) => { setEditingEksam(exam); setSelectedEksam(null) }}
          onDelete={(id) => { deleteExam(id); setSelectedEksam(null) }}
          onMarkDone={(id) => { updateExam(id, { status: 'tehtud' }); setSelectedEksam(null) }}
          onMarkUndone={(id) => { updateExam(id, { status: 'ootel' }); setSelectedEksam(null) }}
        />
      )}
      {addingEksam && (
        <EksamFormModal
          nextId={Math.max(0, ...exams.map((e) => e.id)) + 1}
          onClose={() => setAddingEksam(false)}
          onSave={(exam) => { addExam(exam); setAddingEksam(false) }}
        />
      )}
      {editingEksam && (
        <EksamFormModal
          exam={editingEksam}
          nextId={editingEksam.id}
          onClose={() => setEditingEksam(null)}
          onSave={(exam) => { updateExam(exam.id, exam); setEditingEksam(null) }}
        />
      )}
      {addingSubject && (
        <SubjectFormModal
          subjects={subjects}
          onClose={() => setAddingSubject(false)}
          onSave={(subject) => { addSubject(subject); setAddingSubject(false) }}
        />
      )}
      {selectedSubject && (
        <SubjectDetailModal
          subject={selectedSubject}
          onClose={() => setSelectedSubject(null)}
        />
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

// ── Ained tab ──────────────────────────────────────────────────────────────

function AinedTab({
  subjects,
  onAdd,
  onSubjectClick,
}: {
  subjects: Subject[]
  onAdd: () => void
  onSubjectClick: (s: Subject) => void
}) {
  const sorted = [...subjects].sort((a, b) => a.name.localeCompare(b.name, 'et'))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Minu ained</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          Lisa õppeaine
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
            <BookOpen size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1F36]">Ained puuduvad</p>
          <p className="text-xs text-[#94A3B8] mt-1">Vajuta "Lisa õppeaine", et lisada uus õppeaine.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#F3F3F8]">
          {sorted.map((subject) => (
            <div key={subject.id} className="flex items-center gap-4 py-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: subject.bg, color: subject.color }}
              >
                {subject.icon}
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onSubjectClick(subject)}
                  className="text-sm font-semibold text-[#1A1F36] truncate text-left hover:text-[#6F5AE8] transition-colors block"
                >
                  {subject.name}
                </button>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {subject.teacher && (
                    <span className="text-xs text-[#94A3B8] flex items-center gap-1">
                      <UserIcon size={10} strokeWidth={2} />
                      {subject.teacher}
                    </span>
                  )}
                  {subject.room && (
                    <span className="text-xs text-[#94A3B8] flex items-center gap-1">
                      <MapPin size={10} strokeWidth={2} />
                      {subject.room}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Subject detail modal (view only) ───────────────────────────────────────

function SubjectDetailModal({
  subject,
  onClose,
}: {
  subject: Subject
  onClose: () => void
}) {
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
          <h2 className="text-base font-semibold text-[#1A1F36]">Aine andmed</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: subject.bg, color: subject.color }}
            >
              {subject.icon}
            </div>
            <p className="text-sm font-semibold text-[#1A1F36]">{subject.name}</p>
          </div>

          {subject.teacher && (
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-1">Õpetaja</p>
              <p className="text-sm text-[#1A1F36]">{subject.teacher}</p>
            </div>
          )}

          {subject.room && (
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-1">Ruum / õppevorm</p>
              <p className="text-sm text-[#1A1F36]">{subject.room}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-[#ECECF2]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            Sulge
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Subject form modal (add only) ──────────────────────────────────────────

const SUBJECT_PALETTE = [
  { color: '#6F5AE8', bg: '#EDE9FB', icon: <BookOpen size={16} strokeWidth={1.8} /> },
  { color: '#16A34A', bg: '#DCFCE7', icon: <FlaskConical size={16} strokeWidth={1.8} /> },
  { color: '#CA8A04', bg: '#FEF9C3', icon: <MessageSquare size={16} strokeWidth={1.8} /> },
  { color: '#DC2626', bg: '#FEE2E2', icon: <Globe size={16} strokeWidth={1.8} /> },
  { color: '#2563EB', bg: '#EFF6FF', icon: <HardDrive size={16} strokeWidth={1.8} /> },
]

function SubjectFormModal({
  subjects,
  onClose,
  onSave,
}: {
  subjects: Subject[]
  onClose: () => void
  onSave: (s: Subject) => void
}) {
  const [name, setName] = useState('')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [colorIdx, setColorIdx] = useState(subjects.length % SUBJECT_PALETTE.length)
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!name.trim()) {
      setError('Sisesta aine nimi.')
      return
    }
    const exists = subjects.some((s) => s.name.toLowerCase() === name.trim().toLowerCase())
    if (exists) {
      setError('Sellise nimega aine on juba olemas.')
      return
    }
    const palette = SUBJECT_PALETTE[colorIdx]
    onSave({
      id: `sub-${Date.now()}`,
      name: name.trim(),
      teacher: teacher.trim() || undefined,
      room: room.trim() || undefined,
      color: palette.color,
      bg: palette.bg,
      icon: palette.icon,
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
          <h2 className="text-base font-semibold text-[#1A1F36]">Lisa õppeaine</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Aine nimi <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError('') }}
              placeholder="nt Matemaatika"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Õpetaja <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="nt M. Tamm"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Ruum / õppevorm <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder="nt Ruum 201 või E-õpe"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-2">Värv</label>
            <div className="flex gap-2">
              {SUBJECT_PALETTE.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setColorIdx(i)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${colorIdx === i ? 'ring-2 ring-offset-2 ring-[#1A1F36]' : ''}`}
                  style={{ background: p.bg, color: p.color }}
                >
                  {p.icon}
                </button>
              ))}
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

function StatCard({
  icon, iconBg, iconColor, value, label, sub,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  value: string
  label: string
  sub: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-4">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
        style={{ background: iconBg, color: iconColor }}
      >
        {icon}
      </div>
      <p className="text-xl font-bold text-[#1A1F36] leading-none">{value}</p>
      <p className="text-xs font-medium text-[#1A1F36] mt-1">{label}</p>
      <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-snug">{sub}</p>
    </div>
  )
}

function TasksTab({
  tasks,
  onTaskClick,
  onAdd,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  tasks: Task[]
  onTaskClick: (task: Task) => void
  onAdd: () => void
  onEdit: (task: Task) => void
  onMarkDone: (id: number) => void
  onMarkUndone: (id: number) => void
  onDelete: (id: number) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [subjectFilter, setSubjectFilter] = useState<string>('')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const subjects = Array.from(new Set(tasks.map((t) => t.subject)))

  const filtered = subjectFilter
    ? tasks.filter((t) => t.subject === subjectFilter)
    : tasks

  const sorted = [...filtered].sort((a, b) => {
    const diff = parseDeadline(a.deadline) - parseDeadline(b.deadline)
    return sortDir === 'asc' ? diff : -diff
  })

  const visible = showAll ? sorted : sorted.slice(0, 4)
  const hasMore = sorted.length > 4

  return (
    <div>
      {/* Filter row */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Tulevad ülesanded</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            <Plus size={14} strokeWidth={2.5} />
            Lisa ülesanne
          </button>
          {/* Subject filter */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8F7FC] rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/30 transition-colors"
            >
              <Filter size={12} strokeWidth={2} className="text-[#94A3B8]" />
              {subjectFilter || 'Kõik ained'}
              <ChevronDown size={12} className={`text-[#94A3B8] transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            {filterOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                  <button
                    onClick={() => { setSubjectFilter(''); setFilterOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      !subjectFilter ? 'bg-[#EDE9FB] text-[#6F5AE8] font-medium' : 'text-[#1A1F36] hover:bg-[#F8F7F4]'
                    }`}
                  >
                    Kõik ained
                  </button>
                  {subjects.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setSubjectFilter(s); setFilterOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        subjectFilter === s ? 'bg-[#EDE9FB] text-[#6F5AE8] font-medium' : 'text-[#1A1F36] hover:bg-[#F8F7F4]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Sort button */}
          <button
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8F7FC] rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/30 transition-colors"
          >
            <ArrowUpDown size={12} strokeWidth={2} className="text-[#94A3B8]" />
            Tähtaeg
            <span className="text-[10px] text-[#94A3B8]">{sortDir === 'asc' ? '↑' : '↓'}</span>
          </button>
        </div>
      </div>

      {/* Task rows */}
      <div className="flex flex-col divide-y divide-[#F3F3F8]">
        {visible.map((task) => (
          <div key={task.id} className="flex items-center gap-4 py-4">
            {/* Subject icon */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: task.subjectBg, color: task.subjectColor }}
            >
              {task.subjectIcon}
            </div>

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <button
                onClick={() => onTaskClick(task)}
                className="text-sm font-semibold text-[#1A1F36] truncate text-left hover:text-[#6F5AE8] transition-colors block w-full"
              >
                {task.title}
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium" style={{ color: task.subjectColor }}>
                  {task.subject}
                </span>
                <span className="text-xs text-[#94A3B8]">{task.type}</span>
              </div>
            </div>

            {/* Deadline */}
            <div className="hidden sm:flex flex-col items-end flex-shrink-0 w-32">
              <span className="text-[11px] font-medium text-[#6F5AE8]">{task.deadlineLabel}</span>
              <span className="text-[11px] text-[#94A3B8]">{task.deadline}</span>
            </div>

            {/* Progress ring */}
            <div className="flex-shrink-0 flex items-center gap-1.5">
              <ProgressRing pct={task.progress} color={task.subjectColor} />
              <span className="text-xs font-semibold text-[#1A1F36] w-8">{task.progress}%</span>
            </div>

            {/* Moodle button */}
            {task.moodleUrl && task.moodleUrl.trim() !== '' && task.moodleUrl !== '#' && (
              <a
                href={task.moodleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/40 hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                Ava Moodle
                <ExternalLink size={11} strokeWidth={2} className="text-[#94A3B8]" />
              </a>
            )}

            {/* Row three-dot menu */}
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === task.id ? null : task.id) }}
                className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
              >
                <MoreHorizontal size={16} />
              </button>
              {openMenuId === task.id && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                  <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onEdit(task) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                    >
                      <Pencil size={14} strokeWidth={2} className="text-[#64748B]" />
                      Muuda
                    </button>
                    {statusFromProgress(task.progress) === 'tehtud' ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onMarkUndone(task.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                        Märgi tegemata
                      </button>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onMarkDone(task.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                        Märgi tehtuks
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setConfirmDeleteId(task.id) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      Kustuta
                    </button>
                  </div>
                </>
              )}
            </div>

            {confirmDeleteId === task.id && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                onClick={() => setConfirmDeleteId(null)}
              >
                <div
                  className="w-full max-w-sm bg-white rounded-2xl shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-5 py-5">
                    <p className="text-sm text-[#1A1F36] mb-1">
                      Kas soovid ülesande „{task.title}“ kindlasti kustutada?
                    </p>
                    <p className="text-xs text-[#94A3B8] mb-5">Seda tegevust ei saa tagasi võtta.</p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                      >
                        Loobu
                      </button>
                      <button
                        onClick={() => { onDelete(task.id); setConfirmDeleteId(null) }}
                        className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                      >
                        Kustuta
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show all toggle */}
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
        >
          {showAll ? 'Näita vähem' : 'Vaata kõiki ülesandeid'}
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={`transition-transform ${showAll ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    </div>
  )
}

// ── Ülevaade tab ───────────────────────────────────────────────────────────

function daysLeftBadge(daysLeft: number) {
  let bg = '#DCFCE7'
  let color = '#15803D'
  if (daysLeft <= 3) { bg = '#FEE2E2'; color = '#B91C1C' }
  else if (daysLeft <= 7) { bg = '#FEF9C3'; color = '#854D0E' }
  return (
    <span
      className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {daysLeft <= 0 ? 'Täna' : `${daysLeft} päeva`}
    </span>
  )
}

function UlevaadeCard({
  title,
  icon,
  iconBg,
  iconColor,
  onOpen,
  openLabel,
  children,
  className = '',
}: {
  title: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  onOpen: () => void
  openLabel: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-2xl border border-[#ECECF2] p-5 flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: iconBg, color: iconColor }}
          >
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-[#1A1F36] truncate">{title}</h3>
        </div>
      </div>
      <div className="flex-1">{children}</div>
      <button
        onClick={onOpen}
        className="w-full mt-4 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
      >
        {openLabel}
        <ChevronRight size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

function UlevaadeTab({
  tasks,
  exams,
  subjects,
  scheduleLessons,
  scheduleMode,
  onNavigate,
}: {
  tasks: Task[]
  exams: Exam[]
  subjects: Subject[]
  scheduleLessons: ScheduleLesson[]
  scheduleMode: ScheduleMode
  onNavigate: (tab: TabId) => void
}) {
  const today = new Date()
  const todayStr = today.toLocaleDateString('et-EE', { weekday: 'long', day: 'numeric', month: 'long' })

  // 1. Tänased ülesanded: lähimad tähtajad + edenemine
  const sortedTasks = [...tasks]
    .filter((t) => statusFromProgress(t.progress) !== 'tehtud')
    .sort((a, b) => parseDeadline(a.deadline) - parseDeadline(b.deadline))
  const todayTasks = sortedTasks.slice(0, 4)
  const completedTasksCount = tasks.filter((t) => statusFromProgress(t.progress) === 'tehtud').length
  const avgTaskProgress = tasks.length > 0
    ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
    : 0

  // 2. Lähenevad kontrolltööd
  const upcomingTests = exams
    .filter((e) => e.type === 'kontrolltöö' && e.status !== 'tehtud' && e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3)

  // 3. Lähenevad eksamid
  const upcomingExams = exams
    .filter((e) => e.type === 'eksam' && e.status !== 'tehtud' && e.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3)

  // 4. Tänane tunniplaan / õppimisplaan (esmaspäev = tänane mock)
  const todayLessons = scheduleLessons.filter((l) => l.day === 'Esmaspäev')

  // 5. Õpitavad ained
  const activeSubjectsCount = subjects.length

  // 6. Õppimise statistika
  const totalStudyHours = STUDY_HOURS.reduce((sum, d) => sum + d.hours, 0)
  const completedTestsCount = exams.filter((e) => e.type === 'kontrolltöö' && e.status === 'tehtud').length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1F36]">Ülevaade</h3>
          <p className="text-xs text-[#94A3B8] mt-0.5 capitalize">{todayStr}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1. Tänased ülesanded */}
        <UlevaadeCard
          title="Tänased ülesanded"
          icon={<CheckCircle size={17} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          onOpen={() => onNavigate('uesanded')}
          openLabel="Ava ülesanded"
        >
          {todayTasks.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">Tähtaegadega ülesandeid pole.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {todayTasks.map((t) => {
                const days = computeDaysLeft(t.deadline)
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.subjectBg, color: t.subjectColor }}
                    >
                      {t.subjectIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#1A1F36] truncate">{t.title}</p>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">{t.deadlineLabel}</p>
                    </div>
                    {daysLeftBadge(days)}
                  </div>
                )
              })}
              <div className="flex items-center gap-2 mt-1 pt-3 border-t border-[#F3F3F8]">
                <ProgressRing pct={avgTaskProgress} color="#16A34A" />
                <div>
                  <p className="text-xs font-semibold text-[#1A1F36]">{avgTaskProgress}%</p>
                  <p className="text-[11px] text-[#94A3B8]">Keskmine edenemine</p>
                </div>
              </div>
            </div>
          )}
        </UlevaadeCard>

        {/* 2. Lähenevad kontrolltööd */}
        <UlevaadeCard
          title="Lähenevad kontrolltööd"
          icon={<Calendar size={17} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          onOpen={() => onNavigate('kontrolltood')}
          openLabel="Ava kontrolltööd"
        >
          {upcomingTests.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">Lähenevaid kontrolltöid pole.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingTests.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: e.iconBg, color: e.iconColor }}
                  >
                    <Calendar size={14} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1A1F36] truncate">{e.title}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">{e.date}</p>
                  </div>
                  {daysLeftBadge(e.daysLeft)}
                </div>
              ))}
            </div>
          )}
        </UlevaadeCard>

        {/* 3. Lähenevad eksamid */}
        <UlevaadeCard
          title="Lähenevad eksamid"
          icon={<Star size={17} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          onOpen={() => onNavigate('eksamid')}
          openLabel="Ava eksamid"
        >
          {upcomingExams.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">Lähenevaid eksameid pole.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingExams.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: e.iconBg, color: e.iconColor }}
                  >
                    <Star size={14} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1A1F36] truncate">{e.title}</p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">{e.date}</p>
                  </div>
                  {daysLeftBadge(e.daysLeft)}
                </div>
              ))}
            </div>
          )}
        </UlevaadeCard>

        {/* 4. Tänane tunniplaan / õppimisplaan */}
        <UlevaadeCard
          title={scheduleMode === 'elearning' ? 'Tänane õppimisplaan' : 'Tänane tunniplaan'}
          icon={<Clock size={17} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          onOpen={() => onNavigate('tunniplaan')}
          openLabel={scheduleMode === 'none' ? 'Seadista tunniplaan' : 'Ava tunniplaan'}
        >
          {scheduleMode === 'none' ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">Tunniplaani ei kasutata.</p>
          ) : todayLessons.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">
              {scheduleMode === 'traditional' ? 'Tänasele päevale pole tunde lisatud.' : 'Tänaseks pole õppimisblokke lisatud.'}
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {todayLessons.slice(0, 4).map((l) => (
                <div key={l.id} className="flex items-center gap-2.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: l.dotColor }}
                  />
                  <span className="text-[11px] text-[#64748B] font-medium w-24 flex-shrink-0">
                    {l.startTime && l.endTime ? `${l.startTime}–${l.endTime}` : ''}
                  </span>
                  <span className="text-xs font-semibold text-[#1A1F36] truncate">{l.subject}</span>
                </div>
              ))}
              {todayLessons.length > 4 && (
                <p className="text-[11px] text-[#94A3B8] mt-1">+{todayLessons.length - 4} veel</p>
              )}
            </div>
          )}
        </UlevaadeCard>

        {/* 5. Õpitavad ained */}
        <UlevaadeCard
          title="Õpitavad ained"
          icon={<BookOpen size={17} strokeWidth={1.8} />}
          iconBg="#EFF6FF"
          iconColor="#2563EB"
          onOpen={() => onNavigate('ained')}
          openLabel="Ava ained"
        >
          <div className="flex items-center gap-3 mb-3">
            <p className="text-2xl font-bold text-[#1A1F36]">{activeSubjectsCount}</p>
            <p className="text-xs text-[#94A3B8]">aktiivset ainet sel õppeperioodil</p>
          </div>
          {subjects.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {subjects.slice(0, 6).map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium"
                  style={{ background: s.bg, color: s.color }}
                >
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </UlevaadeCard>

        {/* 6. Õppimise statistika */}
        <UlevaadeCard
          title="Õppimise statistika"
          icon={<Sparkles size={17} strokeWidth={1.8} />}
          iconBg="#F0FDF4"
          iconColor="#16A34A"
          onOpen={() => onNavigate('uesanded')}
          openLabel="Ava detailid"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#94A3B8]">Õppimise aeg sel nädalal</span>
              <span className="text-xs font-semibold text-[#1A1F36]">
                {Math.floor(totalStudyHours)}h {Math.round((totalStudyHours % 1) * 60)}m
              </span>
            </div>
            <div className="flex items-end justify-between gap-1 h-12">
              {STUDY_HOURS.map((d) => {
                const heightPct = (d.hours / MAX_HOURS) * 100
                return (
                  <div key={d.day} className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-full rounded-t-md bg-[#EDE9FB]" style={{ height: `${heightPct}%` }} />
                    <span className="text-[10px] text-[#94A3B8]">{d.day}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#F3F3F8]">
              <div>
                <p className="text-xs text-[#94A3B8]">Täidetud ülesanded</p>
                <p className="text-sm font-semibold text-[#1A1F36]">{completedTasksCount} / {tasks.length}</p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">Lõpetatud kontrolltööd</p>
                <p className="text-sm font-semibold text-[#1A1F36]">{completedTestsCount}</p>
              </div>
            </div>
          </div>
        </UlevaadeCard>
      </div>
    </div>
  )
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
        <BookOpen size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
      </div>
      <p className="text-sm font-semibold text-[#1A1F36]">{label}</p>
      <p className="text-xs text-[#94A3B8] mt-1">See vaade on tulemas.</p>
    </div>
  )
}

function TodaySchedule({ lessons, mode, onNavigate }: { lessons: ScheduleLesson[]; mode: ScheduleMode; onNavigate: (tab: TabId) => void }) {
  if (mode === 'none') {
    return (
      <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F8F7FC] flex items-center justify-center">
            <Calendar size={17} strokeWidth={1.8} className="text-[#94A3B8]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1F36]">Tänane tunniplaan</p>
            <p className="text-xs text-[#94A3B8]">Tunniplaani ei kasutata</p>
          </div>
        </div>
        <p className="text-xs text-[#94A3B8] text-center py-6">
          Tunniplaani ei kasutata. Ülejäänud Kooli moodul töötab tavaliselt edasi.
        </p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#EDE9FB] flex items-center justify-center">
            <Calendar size={17} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1F36]">Tänane tunniplaan</p>
            <p className="text-xs text-[#94A3B8]">27. juuli 2026, esmaspäev</p>
          </div>
        </div>
      </div>

      {lessons.length === 0 ? (
        <p className="text-xs text-[#94A3B8] text-center py-6">
          {mode === 'traditional' ? 'Tänasele päevale pole tunde lisatud.' : 'Tänaseks pole õppimisblokke lisatud.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          {lessons.map((lesson) => (
            <div
              key={lesson.id}
              className="rounded-xl border border-[#ECECF2] p-3"
              style={{ background: lesson.cardBg }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: lesson.dotColor }}
                />
                <span className="text-[11px] text-[#64748B] font-medium">
                  {lesson.startTime && lesson.endTime ? `${lesson.startTime}–${lesson.endTime}` : lesson.day || lesson.date || '—'}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#1A1F36]">{lesson.subject}</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">{lesson.room || (lesson.teacher ? `Õpetaja: ${lesson.teacher}` : '')}</p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => onNavigate('tunniplaan')}
        className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
      >
        Vaata kogu tunniplaani
        <ChevronRight size={15} strokeWidth={2} />
      </button>
    </div>
  )
}

function UpcomingExams({ exams, onShowAll }: { exams: Exam[]; onShowAll: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Lähenevad kontrolltööd ja eksamid</h3>
      </div>
      <div className="flex flex-col gap-3">
        {exams.map((exam) => (
          <div key={exam.id} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: exam.iconBg, color: exam.iconColor }}
            >
              <Calendar size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36] truncate">{exam.title}</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">{exam.date}</p>
            </div>
            <span
              className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: exam.daysLeft <= 10 ? '#FEF9C3' : exam.daysLeft <= 20 ? '#DCFCE7' : '#FEE2E2',
                color:      exam.daysLeft <= 10 ? '#854D0E' : exam.daysLeft <= 20 ? '#15803D' : '#B91C1C',
              }}
            >
              {exam.daysLeft} päeva
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onShowAll}
        className="w-full mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
      >
        Vaata kõiki
        <ChevronRight size={13} strokeWidth={2} />
      </button>
    </div>
  )
}

function StudyTimeChart({ data }: { data: typeof STUDY_HOURS }) {
  const total = '18h 30m'
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Õppetöö aeg nädalas</h3>
        <span className="text-sm font-bold text-[#1A1F36]">{total}</span>
      </div>
      <div className="flex items-end justify-between gap-1 h-20">
        {data.map((d) => {
          const heightPct = (d.hours / MAX_HOURS) * 100
          return (
            <div key={d.day} className="flex flex-col items-center gap-1.5 flex-1">
              <span className="text-[9px] text-[#94A3B8] font-medium">{d.label}</span>
              <div className="w-full rounded-t-md bg-[#EDE9FB]" style={{ height: `${heightPct}%` }} />
              <span className="text-[10px] text-[#94A3B8]">{d.day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface CustomLink {
  id: string
  name: string
  url: string
}

const LINKS_STORAGE_KEY = 'kivora_material_links'

interface StoredLinks {
  moodle: string
  googleDrive: string
  custom: CustomLink[]
}

function loadStoredLinks(): StoredLinks {
  try {
    const raw = localStorage.getItem(LINKS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as StoredLinks
      return {
        moodle: parsed.moodle ?? '',
        googleDrive: parsed.googleDrive ?? '',
        custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      }
    }
  } catch {}
  return { moodle: '', googleDrive: '', custom: [] }
}

function saveStoredLinks(links: StoredLinks) {
  try { localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links)) } catch {}
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function MaterialsLinks() {
  const [stored, setStored] = useState<StoredLinks>(loadStoredLinks)
  const [editingMoodle, setEditingMoodle] = useState(false)
  const [editingGdrive, setEditingGdrive] = useState(false)
  const [moodleInput, setMoodleInput] = useState('')
  const [gdriveInput, setGdriveInput] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customUrl, setCustomUrl] = useState('')
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')

  const persist = (next: StoredLinks) => {
    setStored(next)
    saveStoredLinks(next)
  }

  // ── Moodle ──
  const startEditMoodle = () => {
    setMoodleInput(stored.moodle)
    setEditingMoodle(true)
  }
  const saveMoodle = () => {
    persist({ ...stored, moodle: normalizeUrl(moodleInput) })
    setEditingMoodle(false)
    setMoodleInput('')
  }

  // ── Google Drive ──
  const startEditGdrive = () => {
    setGdriveInput(stored.googleDrive)
    setEditingGdrive(true)
  }
  const saveGdrive = () => {
    persist({ ...stored, googleDrive: normalizeUrl(gdriveInput) })
    setEditingGdrive(false)
    setGdriveInput('')
  }

  // ── Custom links ──
  const addCustomLink = () => {
    const url = normalizeUrl(customUrl)
    if (!customName.trim() || !url) return
    const newLink: CustomLink = {
      id: `link-${Date.now()}`,
      name: customName.trim(),
      url,
    }
    persist({ ...stored, custom: [...stored.custom, newLink] })
    setCustomName('')
    setCustomUrl('')
    setAddingCustom(false)
  }
  const startEditCustom = (link: CustomLink) => {
    setEditingCustomId(link.id)
    setEditName(link.name)
    setEditUrl(link.url)
  }
  const saveEditCustom = () => {
    const url = normalizeUrl(editUrl)
    if (!editName.trim() || !url) return
    persist({
      ...stored,
      custom: stored.custom.map((l) =>
        l.id === editingCustomId ? { ...l, name: editName.trim(), url } : l
      ),
    })
    setEditingCustomId(null)
    setEditName('')
    setEditUrl('')
  }
  const deleteCustomLink = (id: string) => {
    persist({ ...stored, custom: stored.custom.filter((l) => l.id !== id) })
  }

  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">Materjalid ja lingid</h3>
      <div className="flex flex-col divide-y divide-[#F3F3F8]">
        {/* Moodle */}
        <div className="py-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#FEF9C3', color: '#CA8A04' }}
            >
              <HardDrive size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36]">Moodle keskkond</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">
                {stored.moodle || 'Link puudub'}
              </p>
            </div>
            {stored.moodle ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a
                  href={stored.moodle}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7FC] transition-colors"
                >
                  Ava Moodle
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
                <button
                  onClick={startEditMoodle}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7FC] hover:text-[#1A1F36] transition-colors"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditMoodle}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
              >
                <Plus size={13} strokeWidth={2.5} />
                Lisa Moodle link
              </button>
            )}
          </div>
          {editingMoodle && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="url"
                value={moodleInput}
                onChange={(e) => setMoodleInput(e.target.value)}
                placeholder="https://moodle.kool.ee"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8]/50 transition-colors"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setEditingMoodle(false); setMoodleInput('') }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  Loobu
                </button>
                <button
                  onClick={saveMoodle}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                >
                  <Check size={13} strokeWidth={2.5} />
                  Salvesta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Google Drive */}
        <div className="py-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#DCFCE7', color: '#16A34A' }}
            >
              <HardDrive size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36]">Google Drive</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">
                {stored.googleDrive || 'Link puudub'}
              </p>
            </div>
            {stored.googleDrive ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <a
                  href={stored.googleDrive}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7FC] transition-colors"
                >
                  Ava Google Drive
                  <ExternalLink size={12} strokeWidth={2} />
                </a>
                <button
                  onClick={startEditGdrive}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7FC] hover:text-[#1A1F36] transition-colors"
                >
                  <Pencil size={13} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditGdrive}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
              >
                <Plus size={13} strokeWidth={2.5} />
                Lisa Google Drive link
              </button>
            )}
          </div>
          {editingGdrive && (
            <div className="mt-3 flex flex-col gap-2">
              <input
                type="url"
                value={gdriveInput}
                onChange={(e) => setGdriveInput(e.target.value)}
                placeholder="https://drive.google.com"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8]/50 transition-colors"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setEditingGdrive(false); setGdriveInput('') }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  Loobu
                </button>
                <button
                  onClick={saveGdrive}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                >
                  <Check size={13} strokeWidth={2.5} />
                  Salvesta
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lisa muu link */}
        <div className="py-3">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#EDE9FB', color: '#6F5AE8' }}
            >
              <Link2 size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36]">Lisa muu link</p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">OneDrive, Dropbox vms</p>
            </div>
            <button
              onClick={() => { setAddingCustom(true); setCustomName(''); setCustomUrl('') }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
            >
              <Plus size={13} strokeWidth={2.5} />
              Lisa link
            </button>
          </div>

          {addingCustom && (
            <div className="mb-3 flex flex-col gap-2 p-3 rounded-xl bg-[#F8F7FC]">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nimi (nt OneDrive)"
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8]/50 transition-colors"
              />
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8]/50 transition-colors"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setAddingCustom(false); setCustomName(''); setCustomUrl('') }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  Loobu
                </button>
                <button
                  onClick={addCustomLink}
                  disabled={!customName.trim() || !customUrl.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check size={13} strokeWidth={2.5} />
                  Salvesta
                </button>
              </div>
            </div>
          )}

          {stored.custom.length === 0 && !addingCustom ? (
            <p className="text-[11px] text-[#94A3B8] text-center py-2">Lisatud linke pole.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stored.custom.map((link) => (
                <div key={link.id}>
                  {editingCustomId === link.id ? (
                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-[#F8F7FC]">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nimi"
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8]/50 transition-colors"
                      />
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-xs text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8]/50 transition-colors"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => { setEditingCustomId(null); setEditName(''); setEditUrl('') }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                        >
                          Loobu
                        </button>
                        <button
                          onClick={saveEditCustom}
                          disabled={!editName.trim() || !editUrl.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Check size={13} strokeWidth={2.5} />
                          Salvesta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8F7FC] hover:bg-[#F3F1FB] transition-colors">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: '#EDE9FB', color: '#6F5AE8' }}
                      >
                        <Link2 size={13} strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#1A1F36] truncate">{link.name}</p>
                        <p className="text-[11px] text-[#94A3B8] truncate">{link.url}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6F5AE8] hover:bg-white transition-colors"
                          title="Ava"
                        >
                          <ExternalLink size={13} strokeWidth={2} />
                        </a>
                        <button
                          onClick={() => startEditCustom(link)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-white hover:text-[#1A1F36] transition-colors"
                          title="Muuda"
                        >
                          <Pencil size={13} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => deleteCustomLink(link.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-white hover:text-[#DC2626] transition-colors"
                          title="Kustuta"
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AIStudyHelper({
  subjects,
  tasks,
  exams,
  scheduleMode,
  scheduleLessons,
}: {
  subjects: Subject[]
  tasks: Task[]
  exams: Exam[]
  scheduleMode: ScheduleMode
  scheduleLessons: ScheduleLesson[]
}) {
  const navigate = useNavigate()

  const handleAskAI = () => {
    const activeSubjects = subjects.map((s) => ({ name: s.name, teacher: s.teacher, room: s.room }))
    const schoolTasks = tasks.map((t) => ({
      subject: t.subject,
      title: t.title,
      type: t.type,
      deadline: t.deadline,
      progress: t.progress,
    }))
    const schoolExams = exams.map((e) => ({
      subject: e.subject,
      title: e.title,
      date: e.date,
      type: e.type,
      status: e.status,
      daysLeft: e.daysLeft,
    }))

    let links: { moodle?: string; googleDrive?: string; custom?: { name: string; url: string }[] } | undefined
    try {
      const raw = localStorage.getItem('kivora_material_links')
      if (raw) {
        const parsed = JSON.parse(raw) as { moodle?: string; googleDrive?: string; custom?: { name: string; url: string }[] }
        if (parsed.moodle || parsed.googleDrive || (parsed.custom && parsed.custom.length > 0)) {
          links = {
            moodle: parsed.moodle || undefined,
            googleDrive: parsed.googleDrive || undefined,
            custom: parsed.custom,
          }
        }
      }
    } catch { /* ignore */ }

    const context = {
      subjects: activeSubjects,
      tasks: schoolTasks,
      exams: schoolExams,
      scheduleMode,
      scheduleLessons: scheduleLessons.map((l) => ({
        subject: l.subject,
        day: l.day,
        startTime: l.startTime,
        endTime: l.endTime,
        room: l.room,
        teacher: l.teacher,
      })),
      links,
    }
    try { sessionStorage.setItem('kivora_school_context', JSON.stringify(context)) } catch { /* ignore */ }
    sessionStorage.setItem('kivora_ai_prompt', 'Millise koolitööga peaksin praegu alustama ja miks?')
    navigate('/app/assistant')
  }

  return (
    <div className="bg-gradient-to-br from-[#6F5AE8] to-[#7C6BF0] rounded-2xl p-5 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} strokeWidth={2} className="text-yellow-300" />
        <h3 className="text-sm font-semibold">AI õpiabi</h3>
      </div>
      <p className="text-xs text-white/85 leading-relaxed mb-5">
        Kivora AI aitab sul selgitada õppeteemasid, teha kokkuvõtteid, planeerida õppimist ning valmistuda kontrolltöödeks ja eksamiteks.
      </p>
      <button
        onClick={handleAskAI}
        className="w-full flex items-center justify-between bg-white/15 hover:bg-white/25 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
      >
        Küsi AI abist
        <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </div>
  )
}

// ── Exams tab (kontrolltööd) ────────────────────────────────────────────────

function ExamsTab({
  exams,
  onAdd,
  onExamClick,
}: {
  exams: Exam[]
  onAdd: () => void
  onExamClick: (exam: Exam) => void
}) {
  const sorted = [...exams].sort((a, b) => {
    if (a.status === 'tehtud' && b.status !== 'tehtud') return 1
    if (a.status !== 'tehtud' && b.status === 'tehtud') return -1
    return a.daysLeft - b.daysLeft
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Kontrolltööd</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          Lisa kontrolltöö
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
            <Calendar size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1F36]">Kontrolltöid pole</p>
          <p className="text-xs text-[#94A3B8] mt-1">Vajuta "Lisa kontrolltöö", et lisada uus.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#F3F3F8]">
          {sorted.map((exam) => (
            <div key={exam.id} className="flex items-center gap-4 py-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: exam.iconBg, color: exam.iconColor }}
              >
                <Calendar size={16} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onExamClick(exam)}
                  className="text-sm font-semibold text-[#1A1F36] truncate text-left hover:text-[#6F5AE8] transition-colors block w-full"
                >
                  {exam.title}
                </button>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-[#6F5AE8]">{exam.subject}</span>
                  <span className="text-xs text-[#94A3B8]">·</span>
                  <span className="text-xs text-[#94A3B8]">{exam.date}</span>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end flex-shrink-0">
                <span className="text-[11px] font-medium text-[#1A1F36]">{exam.date}</span>
                <span className="text-[11px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
                  <Clock size={10} strokeWidth={2} />
                  {exam.status === 'tehtud' ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} päeva`}
                </span>
              </div>
              {exam.moodleUrl && exam.moodleUrl.trim() !== '' && (
                <a
                  href={exam.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/40 hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  Ava Moodle
                  <ExternalLink size={11} strokeWidth={2} className="text-[#94A3B8]" />
                </a>
              )}
              <span
                className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: exam.status === 'tehtud' ? '#DCFCE7' : exam.daysLeft <= 10 ? '#FEF9C3' : exam.daysLeft <= 20 ? '#DCFCE7' : '#EDE9FB',
                  color: exam.status === 'tehtud' ? '#15803D' : exam.daysLeft <= 10 ? '#854D0E' : exam.daysLeft <= 20 ? '#15803D' : '#6F5AE8',
                }}
              >
                {exam.status === 'tehtud' ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} p`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Exam detail modal ──────────────────────────────────────────────────────

function ExamDetailModal({
  exam,
  onClose,
  onEdit,
  onDelete,
}: {
  exam: Exam
  onClose: () => void
  onEdit: (exam: Exam) => void
  onDelete: (id: number) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

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
          <h2 className="text-base font-semibold text-[#1A1F36]">Kontrolltöö andmed</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {confirmDelete ? (
          <div className="px-5 py-6">
            <p className="text-sm text-[#1A1F36] mb-1">
              Kas soovid kontrolltöö „{exam.title}“ kindlasti kustutada?
            </p>
            <p className="text-xs text-[#94A3B8] mb-5">Seda tegevust ei saa tagasi võtta.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                Loobu
              </button>
              <button
                onClick={() => onDelete(exam.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
              >
                Kustuta
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: exam.iconBg, color: exam.iconColor }}
                >
                  <Calendar size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">{exam.subject}</p>
                  <p className="text-xs text-[#94A3B8]">Kontrolltöö</p>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: exam.status === 'tehtud' ? '#DCFCE7' : '#FEF9C3',
                    color: exam.status === 'tehtud' ? '#15803D' : '#854D0E',
                  }}
                >
                  {exam.status === 'tehtud' ? 'Tehtud' : 'Ootel'}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-[#64748B] mb-1">Pealkiri</p>
                <p className="text-sm text-[#1A1F36]">{exam.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Kuupäev</p>
                  <p className="text-sm text-[#1A1F36]">{exam.date}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Tähtajani</p>
                  <p className="text-sm text-[#1A1F36]">
                    {exam.status === 'tehtud' ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} päeva`}
                  </p>
                </div>
              </div>

              {exam.notes && exam.notes.trim() !== '' && (
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Märkmed</p>
                  <p className="text-sm text-[#1A1F36] whitespace-pre-wrap">{exam.notes}</p>
                </div>
              )}

              {exam.moodleUrl && exam.moodleUrl.trim() !== '' && (
                <a
                  href={exam.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  Ava Moodle'is
                </a>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-[#ECECF2]">
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                <Trash2 size={14} strokeWidth={2} />
                Kustuta
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  Sulge
                </button>
                <button
                  onClick={() => onEdit(exam)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                >
                  <Pencil size={14} strokeWidth={2} />
                  Muuda
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Exam form modal (add + edit) ─────────────────────────────────────────────

function ExamFormModal({
  exam,
  nextId,
  onClose,
  onSave,
}: {
  exam?: Exam
  nextId: number
  onClose: () => void
  onSave: (exam: Exam) => void
}) {
  const isEdit = !!exam
  const [subject, setSubject] = useState(exam?.subject ?? '')
  const [title, setTitle] = useState(exam?.title ?? '')
  const [date, setDate] = useState(exam?.date ?? '')
  const [notes, setNotes] = useState(exam?.notes ?? '')
  const [moodleUrl, setMoodleUrl] = useState(exam?.moodleUrl ?? '')
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!title.trim()) {
      setError('Sisesta kontrolltöö pealkiri.')
      return
    }
    if (!subject.trim()) {
      setError('Sisesta aine.')
      return
    }
    const palette = SUBJECT_PALETTE[(nextId - 1) % SUBJECT_PALETTE.length]
    onSave({
      id: exam?.id ?? nextId,
      subject: subject.trim(),
      title: title.trim(),
      date: date.trim() || 'Kuupäev määramata',
      daysLeft: computeDaysLeft(date.trim() || 'Kuupäev määramata'),
      type: 'kontrolltöö',
      status: exam?.status ?? 'ootel',
      iconBg: exam?.iconBg ?? palette.bg,
      iconColor: exam?.iconColor ?? palette.color,
      notes: notes.trim() || undefined,
      moodleUrl: moodleUrl.trim() || undefined,
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
            {isEdit ? 'Muuda kontrolltööd' : 'Lisa kontrolltöö'}
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Aine <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setError('') }}
              placeholder="nt Matemaatika"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Pealkiri <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="nt Matemaatika kontrolltöö"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kuupäev</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="nt. 4. august 2026"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Märkmed <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valikulised märkmed"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Moodle link <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
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

// ── Eksamid tab ───────────────────────────────────────────────────────────

function EksamidTab({
  exams,
  onAdd,
  onExamClick,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  exams: Exam[]
  onAdd: () => void
  onExamClick: (exam: Exam) => void
  onEdit: (exam: Exam) => void
  onMarkDone: (id: number) => void
  onMarkUndone: (id: number) => void
  onDelete: (id: number) => void
}) {
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const sorted = [...exams].sort((a, b) => {
    if (a.status === 'tehtud' && b.status !== 'tehtud') return 1
    if (a.status !== 'tehtud' && b.status === 'tehtud') return -1
    return a.daysLeft - b.daysLeft
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Eksamid</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          Lisa eksam
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
            <Calendar size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1F36]">Eksamid puuduvad</p>
          <p className="text-xs text-[#94A3B8] mt-1">Vajuta "Lisa eksam", et lisada uus.</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#F3F3F8]">
          {sorted.map((exam) => (
            <div key={exam.id} className="flex items-center gap-4 py-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: exam.iconBg, color: exam.iconColor }}
              >
                <Calendar size={16} strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <button
                  onClick={() => onExamClick(exam)}
                  className="text-sm font-semibold text-[#1A1F36] truncate text-left hover:text-[#6F5AE8] transition-colors block w-full"
                >
                  {exam.title}
                </button>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-medium text-[#6F5AE8]">{exam.subject}</span>
                  <span className="text-xs text-[#94A3B8]">·</span>
                  <span className="text-xs text-[#94A3B8]">{exam.date}</span>
                  {exam.time && exam.time.trim() !== '' && (
                    <>
                      <span className="text-xs text-[#94A3B8]">·</span>
                      <span className="text-xs text-[#94A3B8]">{exam.time}</span>
                    </>
                  )}
                  {exam.location && exam.location.trim() !== '' && (
                    <>
                      <span className="text-xs text-[#94A3B8]">·</span>
                      <span className="text-xs text-[#94A3B8]">{exam.location}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end flex-shrink-0">
                <span className="text-[11px] font-medium text-[#1A1F36]">{exam.date}</span>
                <span className="text-[11px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
                  <Clock size={10} strokeWidth={2} />
                  {exam.status === 'tehtud' ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} päeva`}
                </span>
              </div>
              {exam.moodleUrl && exam.moodleUrl.trim() !== '' && (
                <a
                  href={exam.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/40 hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  Ava Moodle
                  <ExternalLink size={11} strokeWidth={2} className="text-[#94A3B8]" />
                </a>
              )}
              <span
                className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: exam.status === 'tehtud' ? '#DCFCE7' : exam.daysLeft <= 10 ? '#FEF9C3' : exam.daysLeft <= 20 ? '#DCFCE7' : '#EDE9FB',
                  color: exam.status === 'tehtud' ? '#15803D' : exam.daysLeft <= 10 ? '#854D0E' : exam.daysLeft <= 20 ? '#15803D' : '#6F5AE8',
                }}
              >
                {exam.status === 'tehtud' ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} p`}
              </span>
              <div className="relative flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === exam.id ? null : exam.id) }}
                  className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
                >
                  <MoreHorizontal size={16} />
                </button>
                {openMenuId === exam.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                    <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onEdit(exam) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Pencil size={14} strokeWidth={2} className="text-[#64748B]" />
                        Muuda
                      </button>
                      {exam.status === 'tehtud' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onMarkUndone(exam.id) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                        >
                          <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                          Märgi tegemata
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); onMarkDone(exam.id) }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                        >
                          <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                          Märgi tehtuks
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setConfirmDeleteId(exam.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                        Kustuta
                      </button>
                    </div>
                  </>
                )}
              </div>
              {confirmDeleteId === exam.id && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  <div
                    className="w-full max-w-sm bg-white rounded-2xl shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-5 py-5">
                      <p className="text-sm text-[#1A1F36] mb-1">
                        Kas soovid eksami „{exam.title}“ kindlasti kustutada?
                      </p>
                      <p className="text-xs text-[#94A3B8] mb-5">Seda tegevust ei saa tagasi võtta.</p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                        >
                          Loobu
                        </button>
                        <button
                          onClick={() => { onDelete(exam.id); setConfirmDeleteId(null) }}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                        >
                          Kustuta
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Eksam detail modal ─────────────────────────────────────────────────────

function EksamDetailModal({
  exam,
  onClose,
  onEdit,
  onDelete,
  onMarkDone,
  onMarkUndone,
}: {
  exam: Exam
  onClose: () => void
  onEdit: (exam: Exam) => void
  onDelete: (id: number) => void
  onMarkDone: (id: number) => void
  onMarkUndone: (id: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isDone = exam.status === 'tehtud'

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
          <h2 className="text-base font-semibold text-[#1A1F36]">Eksami andmed</h2>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(exam) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                    >
                      <Pencil size={14} strokeWidth={2} className="text-[#64748B]" />
                      Muuda
                    </button>
                    {isDone ? (
                      <button
                        onClick={() => { setMenuOpen(false); onMarkUndone(exam.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                        Märgi tegemata
                      </button>
                    ) : (
                      <button
                        onClick={() => { setMenuOpen(false); onMarkDone(exam.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                        Märgi tehtuks
                      </button>
                    )}
                    <button
                      onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      Kustuta
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {confirmDelete ? (
          <div className="px-5 py-6">
            <p className="text-sm text-[#1A1F36] mb-1">
              Kas soovid eksami „{exam.title}“ kindlasti kustutada?
            </p>
            <p className="text-xs text-[#94A3B8] mb-5">Seda tegevust ei saa tagasi võtta.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                Loobu
              </button>
              <button
                onClick={() => onDelete(exam.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
              >
                Kustuta
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: exam.iconBg, color: exam.iconColor }}
                >
                  <Calendar size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">{exam.subject}</p>
                  <p className="text-xs text-[#94A3B8]">Eksam</p>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: isDone ? '#DCFCE7' : '#FEF9C3',
                    color: isDone ? '#15803D' : '#854D0E',
                  }}
                >
                  {isDone ? 'Tehtud' : 'Ootel'}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-[#64748B] mb-1">Pealkiri</p>
                <p className="text-sm text-[#1A1F36]">{exam.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Kuupäev</p>
                  <p className="text-sm text-[#1A1F36]">{exam.date}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Tähtajani</p>
                  <p className="text-sm text-[#1A1F36]">
                    {isDone ? 'Tehtud' : exam.daysLeft <= 0 ? 'Täna' : `${exam.daysLeft} päeva`}
                  </p>
                </div>
              </div>

              {(exam.time || exam.location) && (
                <div className="grid grid-cols-2 gap-4">
                  {exam.time && exam.time.trim() !== '' && (
                    <div>
                      <p className="text-xs font-medium text-[#64748B] mb-1">Kellaaeg</p>
                      <p className="text-sm text-[#1A1F36]">{exam.time}</p>
                    </div>
                  )}
                  {exam.location && exam.location.trim() !== '' && (
                    <div>
                      <p className="text-xs font-medium text-[#64748B] mb-1">Asukoht</p>
                      <p className="text-sm text-[#1A1F36]">{exam.location}</p>
                    </div>
                  )}
                </div>
              )}

              {exam.notes && exam.notes.trim() !== '' && (
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Märkmed</p>
                  <p className="text-sm text-[#1A1F36] whitespace-pre-wrap">{exam.notes}</p>
                </div>
              )}

              {exam.moodleUrl && exam.moodleUrl.trim() !== '' && (
                <a
                  href={exam.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  Ava Moodle'is
                </a>
              )}
            </div>

            <div className="flex items-center justify-end px-5 py-4 border-t border-[#ECECF2]">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                Sulge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Eksam form modal (add + edit) ───────────────────────────────────────────

function EksamFormModal({
  exam,
  nextId,
  onClose,
  onSave,
}: {
  exam?: Exam
  nextId: number
  onClose: () => void
  onSave: (exam: Exam) => void
}) {
  const isEdit = !!exam
  const [subject, setSubject] = useState(exam?.subject ?? '')
  const [title, setTitle] = useState(exam?.title ?? '')
  const [date, setDate] = useState(exam?.date ?? '')
  const [time, setTime] = useState(exam?.time ?? '')
  const [location, setLocation] = useState(exam?.location ?? '')
  const [notes, setNotes] = useState(exam?.notes ?? '')
  const [moodleUrl, setMoodleUrl] = useState(exam?.moodleUrl ?? '')
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!title.trim()) {
      setError('Sisesta eksami pealkiri.')
      return
    }
    if (!subject.trim()) {
      setError('Sisesta aine.')
      return
    }
    const palette = SUBJECT_PALETTE[(nextId - 1) % SUBJECT_PALETTE.length]
    onSave({
      id: exam?.id ?? nextId,
      subject: subject.trim(),
      title: title.trim(),
      date: date.trim() || 'Kuupäev määramata',
      daysLeft: computeDaysLeft(date.trim() || 'Kuupäev määramata'),
      type: 'eksam',
      status: exam?.status ?? 'ootel',
      iconBg: exam?.iconBg ?? palette.bg,
      iconColor: exam?.iconColor ?? palette.color,
      time: time.trim() || undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      moodleUrl: moodleUrl.trim() || undefined,
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
            {isEdit ? 'Muuda eksamit' : 'Lisa eksam'}
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Aine või tegevus <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setError('') }}
              placeholder="nt Matemaatika"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Pealkiri <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="nt Matemaatika eksam"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kuupäev</label>
            <input
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              placeholder="nt. 4. august 2026"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Kellaaeg <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder="nt 09:00"
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Asukoht <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="nt Ruum 201"
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Märkmed <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Valikulised märkmed"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Moodle link <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
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

// ── Task parts editor (used in add/edit modals) ────────────────────────────

let _partIdCounter = 0
function makePartId(): string {
  _partIdCounter += 1
  return `part-${Date.now()}-${_partIdCounter}`
}

function TaskPartsEditor({
  parts,
  onChange,
}: {
  parts: TaskPart[]
  onChange: (parts: TaskPart[]) => void
}) {
  const addPart = () =>
    onChange([...parts, { id: makePartId(), label: '', done: false }])
  const removePart = (id: string) =>
    onChange(parts.filter((p) => p.id !== id))
  const updateLabel = (id: string, label: string) =>
    onChange(parts.map((p) => (p.id === id ? { ...p, label } : p)))

  return (
    <div>
      <label className="block text-xs font-medium text-[#64748B] mb-1.5">Ülesande osad <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
      <div className="flex flex-col gap-2">
        {parts.map((part, idx) => (
          <div key={part.id} className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8] w-5 text-right flex-shrink-0">{idx + 1}.</span>
            <input
              type="text"
              value={part.label}
              onChange={(e) => updateLabel(part.id, e.target.value)}
              placeholder="nt. Loe peatükk läbi"
              className="flex-1 px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            <button
              onClick={() => removePart(part.id)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#FEF2F2] hover:text-[#DC2626] transition-colors flex-shrink-0"
            >
              <Trash2 size={14} strokeWidth={2} />
            </button>
          </div>
        ))}
        <button
          onClick={addPart}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#EDE9FB] transition-colors w-fit"
        >
          <Plus size={14} strokeWidth={2.5} />
          Lisa osa
        </button>
      </div>
    </div>
  )
}

// ── Task detail modal ─────────────────────────────────────────────────────

function TaskDetailModal({
  task,
  onClose,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onTogglePart,
  onDelete,
}: {
  task: Task
  onClose: () => void
  onEdit: (task: Task) => void
  onMarkDone: (id: number) => void
  onMarkUndone: (id: number) => void
  onTogglePart: (taskId: number, partId: string) => void
  onDelete: (id: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const status = statusFromProgress(task.progress)
  const isDone = status === 'tehtud'
  const hasParts = task.parts && task.parts.length > 0
  const partsDone = hasParts ? task.parts!.filter((p) => p.done).length : 0
  const partsTotal = hasParts ? task.parts!.length : 0

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
          <h2 className="text-base font-semibold text-[#1A1F36]">Ülesande andmed</h2>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <MoreHorizontal size={18} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                    <button
                      onClick={() => { setMenuOpen(false); onEdit(task) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                    >
                      <Pencil size={14} strokeWidth={2} className="text-[#64748B]" />
                      Muuda
                    </button>
                    {isDone ? (
                      <button
                        onClick={() => { setMenuOpen(false); onMarkUndone(task.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                        Märgi tegemata
                      </button>
                    ) : (
                      <button
                        onClick={() => { setMenuOpen(false); onMarkDone(task.id) }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                        Märgi tehtuks
                      </button>
                    )}
                    <button
                      onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      Kustuta
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {confirmDelete ? (
          <div className="px-5 py-6">
            <p className="text-sm text-[#1A1F36] mb-1">
              Kas soovid ülesande „{task.title}“ kindlasti kustutada?
            </p>
            <p className="text-xs text-[#94A3B8] mb-5">Seda tegevust ei saa tagasi võtta.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                Loobu
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
              >
                Kustuta
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: task.subjectBg, color: task.subjectColor }}
                >
                  {task.subjectIcon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">{task.subject}</p>
                  <p className="text-xs text-[#94A3B8]">{task.type}</p>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: STATUS_STYLES[status].bg, color: STATUS_STYLES[status].color }}
                >
                  {STATUS_LABELS[status]}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-[#64748B] mb-1">Teema</p>
                <p className="text-sm text-[#1A1F36]">{task.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Tähtaeg</p>
                  <p className="text-sm text-[#1A1F36]">{task.deadline}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">Edenemine</p>
                  <p className="text-sm text-[#1A1F36]">{task.progress}%</p>
                </div>
              </div>

              {hasParts && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-[#64748B]">Ülesande osad</p>
                    <span className="text-xs font-medium text-[#1A1F36]">{partsDone}/{partsTotal} osa tehtud</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {task.parts!.map((part) => (
                      <label
                        key={part.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#ECECF2] hover:bg-[#F8F7FC] transition-colors cursor-pointer"
                      >
                        <button
                          onClick={(e) => { e.preventDefault(); onTogglePart(task.id, part.id) }}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            part.done
                              ? 'bg-[#6F5AE8] border-[#6F5AE8] text-white'
                              : 'bg-white border-[#CBD5E1] hover:border-[#6F5AE8]'
                          }`
                          }
                        >
                          {part.done && <Check size={13} strokeWidth={3} />}
                        </button>
                        <span className={`text-sm ${part.done ? 'text-[#94A3B8] line-through' : 'text-[#1A1F36]'}`}>
                          {part.label || `Osa ${task.parts!.indexOf(part) + 1}`}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {task.moodleUrl && task.moodleUrl !== '#' && (
                <a
                  href={task.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  Ava Moodle'is
                </a>
              )}
            </div>

            <div className="flex items-center justify-end px-5 py-4 border-t border-[#ECECF2]">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                Sulge
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Task edit modal ────────────────────────────────────────────────────────

function TaskEditModal({
  task,
  onClose,
  onSave,
}: {
  task: Task
  onClose: () => void
  onSave: (id: number, patch: Partial<Task>) => void
}) {
  const [title, setTitle] = useState(task.title)
  const [subject, setSubject] = useState(task.subject)
  const [type, setType] = useState(task.type)
  const [deadline, setDeadline] = useState(task.deadline)
  const [progress, setProgress] = useState(task.progress)
  const [moodleUrl, setMoodleUrl] = useState(task.moodleUrl)
  const [parts, setParts] = useState<TaskPart[]>(task.parts ?? [])
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!title.trim()) {
      setError('Sisesta ülesande teema.')
      return
    }
    const cleanParts = parts.filter((p) => p.label.trim() !== '')
    const partsProgress = computePartsProgress(cleanParts)
    const finalProgress = cleanParts.length > 0 ? partsProgress : Math.max(0, Math.min(100, progress))
    onSave(task.id, {
      title: title.trim(),
      subject: subject.trim(),
      type: type.trim(),
      deadline: deadline.trim(),
      deadlineLabel: deadlineToLabel(deadline.trim()),
      progress: finalProgress,
      moodleUrl: moodleUrl.trim(),
      parts: cleanParts.length > 0 ? cleanParts : undefined,
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
          <h2 className="text-base font-semibold text-[#1A1F36]">Muuda ülesannet</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Õppeaine</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="nt Matemaatika"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Teema <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="nt Võrrandid lk 45–48"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Ülesande tüüp</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="nt Kodutöö, Essee, Laboriaruanne"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Tähtaeg</label>
            <input
              type="text"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="nt. 28. juuli 2026"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <TaskPartsEditor parts={parts} onChange={setParts} />

          {parts.filter((p) => p.label.trim() !== '').length === 0 && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Edenemine (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Moodle link</label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
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

// ── Task add modal ──────────────────────────────────────────────────────────

function TaskAddModal({
  nextId,
  onClose,
  onSave,
}: {
  nextId: number
  onClose: () => void
  onSave: (task: Task) => void
}) {
  const [subject, setSubject] = useState('')
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [deadline, setDeadline] = useState('')
  const [progress, setProgress] = useState(0)
  const [moodleUrl, setMoodleUrl] = useState('')
  const [parts, setParts] = useState<TaskPart[]>([])
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!title.trim()) {
      setError('Sisesta ülesande teema.')
      return
    }
    const cleanParts = parts.filter((p) => p.label.trim() !== '')
    const partsProgress = computePartsProgress(cleanParts)
    const finalProgress = cleanParts.length > 0 ? partsProgress : Math.max(0, Math.min(100, progress))
    const palette = SUBJECT_PALETTE[(nextId - 1) % SUBJECT_PALETTE.length]
    onSave({
      id: nextId,
      subject: subject.trim() || 'Üldine',
      subjectColor: palette.color,
      subjectBg: palette.bg,
      subjectIcon: palette.icon,
      title: title.trim(),
      type: type.trim() || 'Ülesanne',
      deadline: deadline.trim() || 'Tähtaeg määramata',
      deadlineLabel: deadlineToLabel(deadline.trim() || 'Tähtaeg määramata'),
      progress: finalProgress,
      moodleUrl: moodleUrl.trim(),
      parts: cleanParts.length > 0 ? cleanParts : undefined,
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
          <h2 className="text-base font-semibold text-[#1A1F36]">Lisa ülesanne</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Õppeaine</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="nt Matemaatika"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Teema <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError('') }}
              placeholder="nt Võrrandid lk 45–48"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Ülesande tüüp</label>
            <input
              type="text"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="nt Kodutöö, Essee, Laboriaruanne"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Tähtaeg</label>
            <input
              type="text"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="nt. 28. juuli 2026"
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <TaskPartsEditor parts={parts} onChange={setParts} />

          {parts.filter((p) => p.label.trim() !== '').length === 0 && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">Edenemine (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">Moodle link <span className="text-[#CBD5E1] font-normal">(valikuline)</span></label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
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
