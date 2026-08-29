import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useIsDark, darkBg, darkText } from "@/lib/themeColors";
import { useNavigate, useLocation } from "react-router-dom";
import AllExamsModal, {
  type ExamItem,
} from "@/components/school/AllExamsModal";
import ScheduleTab, {
  type ScheduleMode,
  type ScheduleLesson,
  DAYS_ET,
  filterLessonsForToday,
} from "@/components/school/ScheduleTab";
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
  CheckSquare,
  X,
  Plus,
  User as UserIcon,
  MapPin,
} from "lucide-react";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t as tr } from "@/lib/translations";
import { useAuth } from "@/context/AuthContext";
import { subscribeSettings, saveSettings } from "@/lib/settingsStore";
import {
  useSchoolTasks,
  useSchoolExams,
  useSchoolSubjectsFromLessons,
  useSchoolLessons,
  addSchoolTask,
  updateSchoolTask as storeUpdateSchoolTask,
  deleteSchoolTask as storeDeleteSchoolTask,
  markSchoolTaskDone as storeMarkSchoolTaskDone,
  markSchoolTaskUndone as storeMarkSchoolTaskUndone,
  toggleSchoolTaskPart as storeToggleSchoolTaskPart,
  addSchoolExam,
  updateSchoolExam as storeUpdateSchoolExam,
  deleteSchoolExam as storeDeleteSchoolExam,
  addSchoolSubject,
  updateSchoolSubject as storeUpdateSchoolSubject,
  deleteSchoolSubject as storeDeleteSchoolSubject,
  classifySubject,
  addSchoolLesson,
  updateSchoolLesson as storeUpdateSchoolLesson,
  deleteSchoolLesson as storeDeleteSchoolLesson,
} from "@/lib/schoolStore";
import {
  addTask as tasksStoreAddTask,
  updateTask as tasksStoreUpdateTask,
  deleteTask as tasksStoreDeleteTask,
  getAllTasks,
} from "@/lib/tasksStore";
import type { Task as GlobalTask } from "@/types";
import LinkedItemsPanel from "@/components/links/LinkedItemsPanel";
import { encodeSchoolId, decodeSchoolId } from "@/types/entityLinks";
import { removeLinksForEntity } from "@/lib/entityLinksStore";
import PostSaveLinkSuggestionsDialog from "@/components/links/PostSaveLinkSuggestionsDialog";
import AutoLinkToast from "@/components/links/AutoLinkToast";
import { runAutomaticLinking, syncSchoolCalendarEvent, deleteSchoolCalendarEvent, type AutoLinkResult } from "@/lib/automaticLinking";
import { getLocalDateString, getLocalWeekdayIndex, formatDateWithWeekday, formatDateRange, msUntilNextLocalMidnight } from "@/lib/dateUtils";

// ── Types ──────────────────────────────────────────────────────────────────

type TabId =
  | "tunniplaan"
  | "uesanded"
  | "kontrolltood"
  | "eksamid"
  | "ained"
  | "ulevaade";

interface TaskPart {
  id: string;
  label: string;
  done: boolean;
}

interface Task {
  id: number;
  subject: string;
  subjectId?: string;
  subjectColor: string;
  subjectBg: string;
  subjectIcon: React.ReactNode;
  title: string;
  type: string;
  deadlineLabel: string;
  deadline: string;
  progress: number;
  moodleUrl: string;
  prevProgress?: number;
  parts?: TaskPart[];
  linkedTaskId?: string;
}

type TaskStatus = "tegemata" | "pooleli" | "tehtud";

const TASK_TYPE_VALUES = [
  "homework",
  "essay",
  "lab_report",
  "presentation",
  "reading",
  "project",
  "worksheet",
  "research",
  "study_guide",
  "other",
] as const;

type TaskTypeValue = (typeof TASK_TYPE_VALUES)[number];

function getTaskTypeLabel(type: string, lang: AppLang): string {
  const key = `school.taskType.${type}` as Parameters<typeof tr>[0];
  // Only translate known internal values; fall back to the raw string for legacy data
  if ((TASK_TYPE_VALUES as readonly string[]).includes(type)) {
    return tr(key, lang);
  }
  return type;
}

function computePartsProgress(parts: TaskPart[]): number {
  if (!parts || parts.length === 0) return -1;
  const done = parts.filter((p) => p.done).length;
  return Math.round((done / parts.length) * 100);
}

function statusFromProgress(p: number): TaskStatus {
  if (p >= 100) return "tehtud";
  if (p > 0) return "pooleli";
  return "tegemata";
}

function getStatusLabels(lang: AppLang): Record<TaskStatus, string> {
  return {
    tegemata: tr("school.task.status.tegemata", lang),
    pooleli: tr("school.task.status.pooleli", lang),
    tehtud: tr("school.task.status.tehtud", lang),
  };
}

const STATUS_STYLES: Record<TaskStatus, { bg: string; color: string }> = {
  tegemata: { bg: "#F1F5F9", color: "#64748B" },
  pooleli: { bg: "#FEF9C3", color: "#854D0E" },
  tehtud: { bg: "#DCFCE7", color: "#15803D" },
};

const MONTHS_EST: Record<string, number> = {
  jaanuar: 0,
  veebruar: 1,
  märts: 2,
  aprill: 3,
  mai: 4,
  juuni: 5,
  juuli: 6,
  august: 7,
  september: 8,
  oktoober: 9,
  november: 10,
  detsember: 11,
};

function parseDeadline(s: string): number {
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const m = s.match(/(\d+)\.\s+(\w+)\s+(\d+)/);
  if (!m) return 0;
  return new Date(
    parseInt(m[3]),
    MONTHS_EST[m[2].toLowerCase()] ?? 0,
    parseInt(m[1]),
  ).getTime();
}

function isoToDisplay(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("et-EE", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function deadlineToLabel(deadline: string, lang: AppLang): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return tr("school.deadline.prefix", lang) + isoToDisplay(deadline);
  }
  const m = deadline.match(/(\d+\.\s+\w+)/);
  return m
    ? tr("school.deadline.prefix", lang) + m[1]
    : tr("school.deadline.prefix", lang) + deadline;
}

function computeDaysLeft(dateStr: string): number {
  const ts = parseDeadline(dateStr);
  if (!ts) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((ts - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface Subject {
  id: string;
  name: string;
  teacher?: string;
  room?: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
  /** Free-text course assessment info (grading schedule/rules) — School change #12A */
  assessment?: string;
}

interface Exam {
  id: number;
  subject: string;
  subjectId?: string;
  title: string;
  date: string;
  daysLeft: number;
  type: "kontrolltöö" | "eksam";
  status: "ootel" | "tehtud";
  iconBg: string;
  iconColor: string;
  notes?: string;
  moodleUrl?: string;
  time?: string;
  location?: string;
}

// ── Mock data ──────────────────────────────────────────────────────────────

const TASKS: Task[] = [
  {
    id: 1,
    subject: "Mathematics",
    subjectColor: "#6F5AE8",
    subjectBg: "#EDE9FB",
    subjectIcon: <BookOpen size={16} strokeWidth={1.8} />,
    title: "Equations pp. 45-48",
    type: "Homework",
    deadlineLabel: deadlineToLabel("28. july 2026", getLocalLanguage()),
    deadline: "28. juuly 2026",
    progress: 60,
    moodleUrl: "#",
    parts: [
      { id: "p1-1", label: "Loe peatükk läbi", done: true },
      { id: "p1-2", label: "Lahenda ülesanded 1–5", done: true },
      { id: "p1-3", label: "Kontrolli vastuseid", done: false },
      { id: "p1-4", label: "Esita Moodles", done: false },
    ],
  },
  {
    id: 2,
    subject: "Chemistry",
    subjectColor: "#16A34A",
    subjectBg: "#DCFCE7",
    subjectIcon: <FlaskConical size={16} strokeWidth={1.8} />,
    title: "Laboratory report: acids and bases",
    type: "Laboratory report",
    deadlineLabel: deadlineToLabel("30. july 2026", getLocalLanguage()),
    deadline: "30. juul 2026",
    progress: 30,
    moodleUrl: "#",
  },
  {
    id: 3,
    subject: "Estonian language",
    subjectColor: "#CA8A04",
    subjectBg: "#FEF9C3",
    subjectIcon: <MessageSquare size={16} strokeWidth={1.8} />,
    title: "Discussion: the impact of technology",
    type: "Written work",
    deadlineLabel: deadlineToLabel("1. august 2026", getLocalLanguage()),
    deadline: "1. august 2026",
    progress: 0,
    moodleUrl: "#",
  },
  {
    id: 4,
    subject: "History",
    subjectColor: "#DC2626",
    subjectBg: "#FEE2E2",
    subjectIcon: <Globe size={16} strokeWidth={1.8} />,
    title: "Republic of Estonia 1918-1940 summary",
    type: "Homework",
    deadlineLabel: deadlineToLabel("5. august 2026", getLocalLanguage()),
    deadline: "5. august 2026",
    progress: 15,
    moodleUrl: "#",
  },
];

const INITIAL_SUBJECTS: Subject[] = [
  {
    id: "sub-1",
    name: "Matemaatika",
    teacher: "M. Tamm",
    room: "Ruum 201",
    color: "#6F5AE8",
    bg: "#EDE9FB",
    icon: <BookOpen size={16} strokeWidth={1.8} />,
  },
  {
    id: "sub-2",
    name: "Keemia",
    teacher: "A. Mets",
    room: "Labor 2",
    color: "#16A34A",
    bg: "#DCFCE7",
    icon: <FlaskConical size={16} strokeWidth={1.8} />,
  },
  {
    id: "sub-3",
    name: "Eesti keel",
    teacher: "K. Kask",
    room: "Ruum 203",
    color: "#CA8A04",
    bg: "#FEF9C3",
    icon: <MessageSquare size={16} strokeWidth={1.8} />,
  },
  {
    id: "sub-4",
    name: "Ajalugu",
    teacher: "R. Vain",
    room: "Ruum 204",
    color: "#DC2626",
    bg: "#FEE2E2",
    icon: <Globe size={16} strokeWidth={1.8} />,
  },
  {
    id: "sub-5",
    name: "Füüsika",
    teacher: "P. Oja",
    room: "Ruum 105",
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: <HardDrive size={16} strokeWidth={1.8} />,
  },
];

const INITIAL_EXAMS: Exam[] = [
  {
    id: 1,
    subject: "Matemaatika",
    title: "Matemaatika kontrolltöö",
    date: "4. august 2026",
    daysLeft: 8,
    type: "kontrolltöö",
    status: "ootel",
    iconBg: "#FEF9C3",
    iconColor: "#CA8A04",
  },
  {
    id: 2,
    subject: "Keemia",
    title: "Keemia kontrolltöö",
    date: "11. august 2026",
    daysLeft: 15,
    type: "kontrolltöö",
    status: "ootel",
    iconBg: "#DCFCE7",
    iconColor: "#16A34A",
  },
  {
    id: 3,
    subject: "Ajalugu",
    title: "Ajalugu eksam",
    date: "22. august 2026",
    daysLeft: 26,
    type: "eksam",
    status: "ootel",
    iconBg: "#FEE2E2",
    iconColor: "#DC2626",
  },
];

// All hours are 0 — study time is tracked by real user activity, not seeded with demo data.
const STUDY_HOURS: { day: string; hours: number; label: string }[] = [
  { day: "E", hours: 0, label: "0h" },
  { day: "T", hours: 0, label: "0h" },
  { day: "K", hours: 0, label: "0h" },
  { day: "N", hours: 0, label: "0h" },
  { day: "R", hours: 0, label: "0h" },
  { day: "L", hours: 0, label: "0h" },
  { day: "P", hours: 0, label: "0h" },
];

const MAX_HOURS = 4;

// ── Study hours computation from scheduled lessons ─────────────────────────
// Maps the ET weekday names stored in ScheduleLesson.day to the short day
// labels used by the chart, then sums hours from startTime/endTime pairs.
function computeStudyHoursFromLessons(
  lessons: ScheduleLesson[],
): { day: string; hours: number; label: string }[] {
  const DAY_MAP = [
    { et: "Esmaspäev", short: "E" },
    { et: "Teisipäev", short: "T" },
    { et: "Kolmapäev", short: "K" },
    { et: "Neljapäev", short: "N" },
    { et: "Reede",     short: "R" },
    { et: "Laupäev",   short: "L" },
    { et: "Pühapäev",  short: "P" },
  ];
  const acc: Record<string, number> = {};
  DAY_MAP.forEach((d) => { acc[d.short] = 0; });
  for (const l of lessons) {
    if (!l.day || !l.startTime || !l.endTime) continue;
    const dayInfo = DAY_MAP.find((d) => d.et === l.day);
    if (!dayInfo) continue;
    const [sh, sm] = l.startTime.split(":").map(Number);
    const [eh, em] = l.endTime.split(":").map(Number);
    if ([sh, sm, eh, em].some(isNaN)) continue;
    const hrs = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    if (hrs > 0) acc[dayInfo.short] += hrs;
  }
  return DAY_MAP.map((d) => {
    const h = Math.round(acc[d.short] * 10) / 10;
    return { day: d.short, hours: h, label: h > 0 ? `${h}h` : "0h" };
  });
}

// ── Progress ring ──────────────────────────────────────────────────────────

function ProgressRing({ pct, color }: { pct: number; color: string }) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke="#E9E9F0"
        strokeWidth="3.5"
        className="kv-chart-track"
      />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        stroke={pct === 0 ? "#E9E9F0" : color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
      />
    </svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────

// ── Main component ─────────────────────────────────────────────────────────

export default function SchoolPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);

  const TABS: { id: TabId; label: string }[] = [
    { id: "tunniplaan", label: tr("school.tab.tunniplaan", lang) },
    { id: "uesanded", label: tr("school.tab.uesanded", lang) },
    { id: "kontrolltood", label: tr("school.tab.kontrolltood", lang) },
    { id: "eksamid", label: tr("school.tab.eksamid", lang) },
    { id: "ained", label: tr("school.tab.ained", lang) },
    { id: "ulevaade", label: tr("school.tab.ulevaade", lang) },
  ];

  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("uesanded");
  const tasks = useSchoolTasks();
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const exams = useSchoolExams();
  const [showAllExams, setShowAllExams] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [addingEksam, setAddingEksam] = useState(false);
  const [selectedEksam, setSelectedEksam] = useState<Exam | null>(null);
  const [editingEksam, setEditingEksam] = useState<Exam | null>(null);
  const subjects = useSchoolSubjectsFromLessons();
  const [addingSubject, setAddingSubject] = useState(false);
  const [postSave, setPostSave] = useState<{ type: 'school'; id: string } | null>(null);
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [quickAddSubject, setQuickAddSubject] = useState<string>("");
  const [confirmDeleteSubjectId, setConfirmDeleteSubjectId] = useState<string | null>(null);
  const [scheduleMode, setScheduleModeState] = useState<ScheduleMode>(() => {
    try {
      const saved = localStorage.getItem("kivora_schedule_mode");
      if (saved === "traditional" || saved === "elearning" || saved === "none")
        return saved;
    } catch {}
    return "traditional";
  });
  const setScheduleMode = (mode: ScheduleMode) => {
    setScheduleModeState(mode);
    try {
      localStorage.setItem("kivora_schedule_mode", mode);
    } catch {}
  };
  const scheduleLessons = useSchoolLessons();

  // Bumped once at each local midnight so "today" (date label + which
  // lessons count as today) updates live without needing a reload — a
  // single one-shot timer rescheduled after each fire, not polling.
  const [, forceMidnightTick] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timer = setTimeout(() => {
        forceMidnightTick((n) => n + 1);
        scheduleNext();
      }, msUntilNextLocalMidnight());
    };
    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  // Real local calendar "today" — never derived via toISOString() (UTC),
  // so it always matches the user's actual local day. Recomputed on every
  // render (including the midnight tick above), so display and filtering
  // below always agree.
  const todayISO = getLocalDateString();
  const todayWeekdayET = DAYS_ET[getLocalWeekdayIndex()];
  const todayLabel = formatDateWithWeekday(todayISO, lang);
  const todayLessons = filterLessonsForToday(scheduleLessons, todayISO, todayWeekdayET);

  // Compute real study hours from scheduled lessons (startTime/endTime pairs)
  const liveStudyHours = useMemo(
    () => computeStudyHoursFromLessons(scheduleLessons),
    [scheduleLessons],
  );

  // Reset to default tab and close all panels whenever the user navigates to School.
  // scheduleMode is intentionally preserved — it's a persisted configuration.
  useEffect(() => {
    setActiveTab("uesanded");
    setSelectedTaskId(null);
    setEditingTask(null);
    setAddingTask(false);
    setAddingExam(false);
    setSelectedExam(null);
    setEditingExam(null);
    setAddingEksam(false);
    setSelectedEksam(null);
    setEditingEksam(null);
    setAddingSubject(false);
    setSelectedSubject(null);
    setShowAllExams(false);
  }, [location.key]);

  // Deep-link: open specific school item navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId;
    if (!openId) return;
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, "");
    const decoded = decodeSchoolId(openId);
    if (!decoded) return;
    const { kind, rawId } = decoded;
    if (kind === "task") {
      const task = tasks.find((t) => String(t.id) === rawId);
      if (task) {
        setActiveTab("uesanded");
        setSelectedTaskId(task.id);
      }
    } else if (kind === "exam") {
      const exam = exams.find((e) => String(e.id) === rawId);
      if (exam) {
        setActiveTab("kontrolltood");
        setSelectedExam(exam);
      }
    }
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingCount = tasks.filter(
    (t) => statusFromProgress(t.progress) !== "tehtud",
  ).length;
  const avgProgress =
    tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
      : 0;

  const upcomingExamsCount = exams.filter(
    (e) =>
      e.type === "kontrolltöö" &&
      e.status !== "tehtud" &&
      e.daysLeft >= 0 &&
      e.daysLeft <= 30,
  ).length;

  const updateTask  = async (id: number, patch: Partial<Task>) => {
    await storeUpdateSchoolTask(id, patch);
    // Keep an already-auto-created Calendar event (if any) on the task's
    // current deadline — no-ops when the patch doesn't touch the deadline,
    // when there's no such event, or when it's already on that date.
    await syncSchoolCalendarEvent('task', id, patch.deadline);
  };
  const deleteTask  = (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (task?.linkedTaskId) { tasksStoreDeleteTask(task.linkedTaskId); }
    // Resolve and delete the owned auto-created Calendar event (if any)
    // BEFORE removing the links below — the scheduled link is what lets it
    // be found. No-ops cleanly if there is no such event.
    deleteSchoolCalendarEvent('task', id);
    removeLinksForEntity('school', encodeSchoolId('task', id));
    storeDeleteSchoolTask(id);
  };
  const markTaskDone   = (id: number) => storeMarkSchoolTaskDone(id);
  const markTaskUndone = (id: number) => storeMarkSchoolTaskUndone(id);
  const togglePart  = (taskId: number, partId: string) => storeToggleSchoolTaskPart(taskId, partId);
  const addTask     = (task: Task) => addSchoolTask(task);

  const deleteSubject = (id: string) => {
    const linked = scheduleLessons.filter(
      (l) => l.subject === (subjects.find((s) => s.id === id)?.name ?? "")
    );
    if (linked.length > 0) {
      setConfirmDeleteSubjectId(id);
    } else {
      storeDeleteSchoolSubject(id);
      setSelectedSubject(null);
    }
  };
  const confirmDeleteSubject = (id: string) => {
    storeDeleteSchoolSubject(id);
    setConfirmDeleteSubjectId(null);
    setSelectedSubject(null);
  };

  const updateExam = async (id: number, patch: Partial<ExamItem>) => {
    await storeUpdateSchoolExam(id, patch);
    // Same as updateTask above, for exams/tests — no-ops when the patch
    // doesn't touch the date, when there's no auto-created event, or when
    // it's already on that date (e.g. markDone/markUndone's {status} patch).
    await syncSchoolCalendarEvent('exam', id, patch.date);
  };
  const deleteExam = (id: number) => {
    // Same ordering as deleteTask above: resolve + delete the owned
    // auto-created Calendar event before the links that make it findable
    // are removed. No-ops cleanly if there is no such event.
    deleteSchoolCalendarEvent('exam', id);
    removeLinksForEntity('school', encodeSchoolId('exam', id));
    storeDeleteSchoolExam(id);
  };
  const addExam    = (exam: Exam) => addSchoolExam(exam);

  const addLesson    = (lesson: ScheduleLesson) => addSchoolLesson(lesson);
  const updateLesson = (id: string, patch: Partial<ScheduleLesson>) => storeUpdateSchoolLesson(id, patch);
  const deleteLesson = (id: string) => storeDeleteSchoolLesson(id);

  const addSubject = (subject: Subject) => addSchoolSubject(subject);
  const updateSubject = (id: string, patch: Partial<Omit<Subject, "icon">>) =>
    storeUpdateSchoolSubject(id, patch);

  return (
    <div className="school-page flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
      {/* ── Left/main column ──────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {/* Overview cards */}
        <section>
          <h2 className="text-base font-semibold text-[#1A1F36] mb-4">
            {tr("school.tab.ulevaade", lang)}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard
              icon={<BookOpen size={18} strokeWidth={1.8} />}
              iconBg="#EDE9FB"
              iconColor="#6F5AE8"
              value={String(subjects.length)}
              label={tr("school.stat.subjects", lang)}
              sub={tr("school.stat.subjectsSub", lang)}
            />
            <StatCard
              icon={<CheckCircle size={18} strokeWidth={1.8} />}
              iconBg="#DCFCE7"
              iconColor="#16A34A"
              value={String(pendingCount)}
              label={tr("school.stat.tasks", lang)}
              sub={tr("school.stat.tasksSub", lang)}
            />
            <StatCard
              icon={<Calendar size={18} strokeWidth={1.8} />}
              iconBg="#FEF9C3"
              iconColor="#CA8A04"
              value={String(upcomingExamsCount)}
              label={tr("school.stat.exams", lang)}
              sub={tr("school.stat.examsSub", lang)}
            />
            <StatCard
              icon={<Clock size={18} strokeWidth={1.8} />}
              iconBg="#EFF6FF"
              iconColor="#2563EB"
              value={(() => {
                const total = liveStudyHours.reduce((s, d) => s + d.hours, 0);
                if (total === 0) return '0h';
                const h = Math.floor(total);
                const m = Math.round((total % 1) * 60);
                return m > 0 ? `${h}h ${m}m` : `${h}h`;
              })()}
              label={tr("school.stat.studyTime", lang)}
              sub={tr("school.stat.studyTimeSub", lang)}
            />
            <StatCard
              icon={<Star size={18} strokeWidth={1.8} />}
              iconBg="#FFF1F2"
              iconColor="#DC2626"
              value={`${avgProgress}%`}
              label={tr("school.stat.progress", lang)}
              sub={tr("school.stat.progressSub", lang)}
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
                    ? "text-[#6F5AE8]"
                    : "text-[#94A3B8] hover:text-[#1A1F36]"
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
            {activeTab === "uesanded" && (
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
            {activeTab === "tunniplaan" && (
              <ScheduleTab
                mode={scheduleMode}
                lessons={scheduleLessons}
                onModeChange={setScheduleMode}
                onAdd={addLesson}
                onUpdate={updateLesson}
                onDelete={deleteLesson}
                onQuickAddAssignment={(subjectName) => {
                  setQuickAddSubject(subjectName);
                  setAddingTask(true);
                  setActiveTab("uesanded");
                }}
              />
            )}
            {activeTab === "kontrolltood" && (
              <ExamsTab
                exams={exams.filter((e) => e.type === "kontrolltöö")}
                onAdd={() => setAddingExam(true)}
                onExamClick={(exam) => setSelectedExam(exam)}
                onEdit={(exam) => setEditingExam(exam)}
                onDelete={(id) => deleteExam(id)}
              />
            )}
            {activeTab === "eksamid" && (
              <EksamidTab
                exams={exams.filter((e) => e.type === "eksam")}
                onAdd={() => setAddingEksam(true)}
                onExamClick={(exam) => setSelectedEksam(exam)}
                onEdit={(exam) => setEditingEksam(exam)}
                onMarkDone={(id) => updateExam(id, { status: "tehtud" })}
                onMarkUndone={(id) => updateExam(id, { status: "ootel" })}
                onDelete={deleteExam}
              />
            )}
            {activeTab === "ained" && (
              <AinedTab
                subjects={subjects}
                onAdd={() => setAddingSubject(true)}
                onSubjectClick={(s) => setSelectedSubject(s)}
              />
            )}
            {activeTab === "ulevaade" && (
              <UlevaadeTab
                tasks={tasks}
                exams={exams}
                subjects={subjects}
                scheduleLessons={scheduleLessons}
                scheduleMode={scheduleMode}
                studyHours={liveStudyHours}
                onNavigate={setActiveTab}
              />
            )}
          </div>
        </div>

        {/* Today's timetable */}
        <TodaySchedule
          lessons={todayLessons}
          todayLabel={todayLabel}
          mode={scheduleMode}
          onNavigate={setActiveTab}
        />
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
        <UpcomingExams exams={exams} onShowAll={() => setShowAllExams(true)} />
        <StudyTimeChart data={liveStudyHours} />
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
          onEdit={(task) => {
            setEditingTask(task);
            setSelectedTaskId(null);
          }}
          onMarkDone={markTaskDone}
          onMarkUndone={markTaskUndone}
          onTogglePart={togglePart}
          onDelete={(id) => {
            deleteTask(id);
            setSelectedTaskId(null);
          }}
        />
      )}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={(id, patch) => {
            updateTask(id, patch);
            setEditingTask(null);
          }}
        />
      )}
      {addingTask && (
        <TaskAddModal
          nextId={Math.max(0, ...tasks.map((t) => t.id)) + 1}
          prefillSubject={quickAddSubject || undefined}
          onClose={() => { setAddingTask(false); setQuickAddSubject(""); }}
          onSave={(task) => {
            addTask(task);
            setAddingTask(false);
            setQuickAddSubject("");
            const schoolTaskId = encodeSchoolId('task', task.id);
            setPostSave({ type: 'school', id: schoolTaskId });
            runAutomaticLinking('school', schoolTaskId, lang, {
              title: task.title,
              date: task.deadline,
              category: task.subject,
            }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) });
          }}
        />
      )}
      {selectedExam && (
        <ExamDetailModal
          exam={selectedExam}
          onClose={() => setSelectedExam(null)}
          onEdit={(exam) => {
            setEditingExam(exam);
            setSelectedExam(null);
          }}
          onDelete={(id) => {
            deleteExam(id);
            setSelectedExam(null);
          }}
          onMarkDone={(id) => {
            updateExam(id, { status: "tehtud" });
            setSelectedExam(null);
          }}
          onMarkUndone={(id) => {
            updateExam(id, { status: "ootel" });
            setSelectedExam(null);
          }}
        />
      )}
      {addingExam && (
        <ExamFormModal
          nextId={Math.max(0, ...exams.map((e) => e.id)) + 1}
          onClose={() => setAddingExam(false)}
          onSave={(exam) => {
            addExam(exam);
            setAddingExam(false);
            const schoolExamId = encodeSchoolId('exam', exam.id);
            setPostSave({ type: 'school', id: schoolExamId });
            runAutomaticLinking('school', schoolExamId, lang, {
              title: exam.title,
              date: exam.date,
              category: exam.subject,
            }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) });
          }}
        />
      )}
      {editingExam && (
        <ExamFormModal
          exam={editingExam}
          nextId={editingExam.id}
          onClose={() => setEditingExam(null)}
          onSave={(exam) => {
            updateExam(exam.id, exam);
            setEditingExam(null);
          }}
        />
      )}
      {selectedEksam && (
        <EksamDetailModal
          exam={selectedEksam}
          onClose={() => setSelectedEksam(null)}
          onEdit={(exam) => {
            setEditingEksam(exam);
            setSelectedEksam(null);
          }}
          onDelete={(id) => {
            deleteExam(id);
            setSelectedEksam(null);
          }}
          onMarkDone={(id) => {
            updateExam(id, { status: "tehtud" });
            setSelectedEksam(null);
          }}
          onMarkUndone={(id) => {
            updateExam(id, { status: "ootel" });
            setSelectedEksam(null);
          }}
        />
      )}
      {addingEksam && (
        <EksamFormModal
          nextId={Math.max(0, ...exams.map((e) => e.id)) + 1}
          onClose={() => setAddingEksam(false)}
          onSave={(exam) => {
            addExam(exam);
            setAddingEksam(false);
            const schoolEksamId = encodeSchoolId('exam', exam.id);
            setPostSave({ type: 'school', id: schoolEksamId });
            runAutomaticLinking('school', schoolEksamId, lang, {
              title: exam.title,
              date: exam.date,
              category: exam.subject,
            }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) });
          }}
        />
      )}
      {editingEksam && (
        <EksamFormModal
          exam={editingEksam}
          nextId={editingEksam.id}
          onClose={() => setEditingEksam(null)}
          onSave={(exam) => {
            updateExam(exam.id, exam);
            setEditingEksam(null);
          }}
        />
      )}
      {addingSubject && (
        <SubjectFormModal
          subjects={subjects}
          onClose={() => setAddingSubject(false)}
          onSave={async (subject) => {
            // Awaited: the modal only closes/reports success once this
            // resolves. A rejection propagates back to the modal, which
            // keeps itself open and shows the error — see SubjectFormModal.
            await addSubject(subject);
            setAddingSubject(false);
            setSelectedSubject(subject);
            toast.success(lang === 'et' ? 'Aine loodud' : 'Subject created');
          }}
        />
      )}
      {confirmDeleteSubjectId && (() => {
        const subjectToDelete = subjects.find((s) => s.id === confirmDeleteSubjectId);
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4">
              <p className="text-sm font-semibold text-[#1A1F36]">
                {lang === 'et' ? 'Kustuta aine?' : 'Delete subject?'}
              </p>
              <p className="text-sm text-[#64748B]">
                {lang === 'et'
                  ? `Aine „${subjectToDelete?.name}" on seotud tunniplaaniga. Kas kustutad aine?`
                  : `Subject "${subjectToDelete?.name}" is used in your timetable. Delete anyway?`}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteSubjectId(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {lang === 'et' ? 'Tühista' : 'Cancel'}
                </button>
                <button
                  onClick={() => confirmDeleteSubject(confirmDeleteSubjectId)}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  {lang === 'et' ? 'Kustuta' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {selectedSubject && (
        <SubjectDetailModal
          subject={selectedSubject}
          onClose={() => setSelectedSubject(null)}
          onDelete={deleteSubject}
          onEdit={(s) => {
            setEditingSubject(s);
            setSelectedSubject(null);
          }}
          onSaveAssessment={(id, assessment) => updateSubject(id, { assessment })}
        />
      )}
      {editingSubject && (
        <SubjectFormModal
          subject={editingSubject}
          subjects={subjects}
          onClose={() => setEditingSubject(null)}
          onSave={async (subject) => {
            // Same await-then-close contract as the add flow above: a
            // rejection propagates back to the modal, which keeps itself
            // open and shows the error, rather than reporting false
            // success.
            await updateSubject(subject.id, {
              name: subject.name,
              teacher: subject.teacher,
              room: subject.room,
              color: subject.color,
              bg: subject.bg,
              assessment: subject.assessment,
            });
            setEditingSubject(null);
          }}
        />
      )}
      {postSave && (
        <PostSaveLinkSuggestionsDialog
          type={postSave.type}
          entityId={postSave.id}
          lang={lang}
          onClose={() => setPostSave(null)}
        />
      )}
      {autoLink && (
        <AutoLinkToast
          linkIds={autoLink.linkIds}
          calendarEventId={autoLink.calendarEventId}
          lang={lang}
          onClose={() => setAutoLink(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

// ── Ained tab ──────────────────────────────────────────────────────────────

function AinedTab({
  subjects,
  onAdd,
  onSubjectClick,
}: {
  subjects: Subject[];
  onAdd: () => void;
  onSubjectClick: (s: Subject) => void;
}) {
  const lang = getLocalLanguage();
  const sorted = [...subjects].sort((a, b) =>
    a.name.localeCompare(b.name, "et"),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">
          {tr("school.modal.mySubjects", lang)}
        </h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          {tr("school.action.addSubject", lang)}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
            <BookOpen size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1F36]">
            {tr("school.empty.subjectsTitle", lang)}
          </p>
          <p className="text-xs text-[#94A3B8] mt-1">
            {tr("school.empty.subjects", lang)}
          </p>
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
  );
}

// ── Subject detail modal (view, inline assessment edit, and an Edit action
//    that opens the full SubjectFormModal — School change #12A/#12B) ──────

function SubjectDetailModal({
  subject,
  onClose,
  onDelete,
  onEdit,
  onSaveAssessment,
}: {
  subject: Subject;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onEdit?: (subject: Subject) => void;
  onSaveAssessment?: (id: string, assessment: string | undefined) => void;
}) {
  const lang = getLocalLanguage();
  // Tracked as local state (rather than read straight from the `subject`
  // prop) so Save reflects immediately: `subject` is a snapshot handed in
  // once when the modal opened and — same as every other School detail
  // modal in this file — is never kept in sync with the live store while
  // open.
  const [assessment, setAssessment] = useState(subject.assessment);
  const [editingAssessment, setEditingAssessment] = useState(false);
  const [assessmentDraft, setAssessmentDraft] = useState("");

  const startEditingAssessment = () => {
    setAssessmentDraft(assessment ?? "");
    setEditingAssessment(true);
  };
  const saveAssessment = () => {
    const next = assessmentDraft.trim() || undefined;
    onSaveAssessment?.(subject.id, next);
    setAssessment(next);
    setEditingAssessment(false);
  };
  const cancelAssessmentEdit = () => {
    setEditingAssessment(false);
  };

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
            {tr("school.modal.subjectData", lang)}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 flex-1 overflow-y-auto">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: subject.bg, color: subject.color }}
            >
              {subject.icon}
            </div>
            <p className="text-sm font-semibold text-[#1A1F36]">
              {subject.name}
            </p>
          </div>

          {subject.teacher && (
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-1">
                {tr("school.field.teacher", lang)}
              </p>
              <p className="text-sm text-[#1A1F36]">{subject.teacher}</p>
            </div>
          )}

          {subject.room && (
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-1">
                {tr("school.field.room", lang)}
              </p>
              <p className="text-sm text-[#1A1F36]">{subject.room}</p>
            </div>
          )}

          {/* Hindamine / Assessment — School change #12A: a free-text field
              on the existing Subject document, not a new entity/collection. */}
          <div>
            <p className="text-xs font-medium text-[#64748B] mb-1">
              {tr("school.field.assessment", lang)}
            </p>
            {editingAssessment ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={assessmentDraft}
                  onChange={(e) => setAssessmentDraft(e.target.value)}
                  placeholder={tr("school.field.assessmentPh", lang)}
                  rows={5}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-y"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={cancelAssessmentEdit}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                  >
                    {tr("school.action.cancel", lang)}
                  </button>
                  <button
                    onClick={saveAssessment}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                  >
                    {tr("school.action.save", lang)}
                  </button>
                </div>
              </div>
            ) : assessment ? (
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-[#1A1F36] whitespace-pre-wrap flex-1">
                  {assessment}
                </p>
                <button
                  onClick={startEditingAssessment}
                  className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors flex-shrink-0"
                >
                  <Pencil size={14} strokeWidth={2} />
                </button>
              </div>
            ) : (
              <button
                onClick={startEditingAssessment}
                className="text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
              >
                + {tr("school.action.addAssessment", lang)}
              </button>
            )}
          </div>
        </div>

        <LinkedItemsPanel
          type="school"
          entityId={encodeSchoolId("subject", String(subject.id))}
          lang={lang}
          className="px-5 pb-2"
        />

        <div className="flex items-center justify-between px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          {onDelete && (
            <button
              onClick={() => onDelete(subject.id)}
              className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              {lang === 'et' ? 'Kustuta' : 'Delete'}
            </button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
            >
              {tr("school.action.close", lang)}
            </button>
            {onEdit && (
              <button
                onClick={() => onEdit(subject)}
                className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
              >
                <Pencil size={14} strokeWidth={2} />
                {tr("school.action.edit", lang)}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Subject form modal (add, or edit an existing subject — School change #12B) ──

const SUBJECT_PALETTE = [
  {
    color: "#6F5AE8",
    bg: "#EDE9FB",
    icon: <BookOpen size={16} strokeWidth={1.8} />,
  },
  {
    color: "#16A34A",
    bg: "#DCFCE7",
    icon: <FlaskConical size={16} strokeWidth={1.8} />,
  },
  {
    color: "#CA8A04",
    bg: "#FEF9C3",
    icon: <MessageSquare size={16} strokeWidth={1.8} />,
  },
  {
    color: "#DC2626",
    bg: "#FEE2E2",
    icon: <Globe size={16} strokeWidth={1.8} />,
  },
  {
    color: "#2563EB",
    bg: "#EFF6FF",
    icon: <HardDrive size={16} strokeWidth={1.8} />,
  },
];

function SubjectFormModal({
  subject,
  subjects,
  onClose,
  onSave,
}: {
  /** When provided, the form edits this existing subject instead of
   * creating a new one — School change #12B. */
  subject?: Subject;
  subjects: Subject[];
  onClose: () => void;
  onSave: (s: Subject) => Promise<void>;
}) {
  const isEdit = !!subject;
  const lang = getLocalLanguage();
  const [name, setName] = useState(subject?.name ?? "");
  const [teacher, setTeacher] = useState(subject?.teacher ?? "");
  const [room, setRoom] = useState(subject?.room ?? "");
  // Auto-suggested from the name via classifySubject (schoolStore.tsx) until
  // the user manually picks a swatch — see colorManuallySet below. When
  // editing, pre-fill from the subject's existing color instead and treat
  // it as already "manually set" so retyping the name never silently
  // changes an established subject's swatch.
  const [colorIdx, setColorIdx] = useState(() => {
    if (!subject) return classifySubject("").colorIndex;
    const idx = SUBJECT_PALETTE.findIndex((p) => p.color === subject.color);
    return idx >= 0 ? idx : 0;
  });
  const [colorManuallySet, setColorManuallySet] = useState(isEdit);
  // Hindamine / Assessment — School change #12B: exposed only in the edit
  // path (an existing subject's assessment field), never in the add form,
  // so subject creation stays exactly as it was.
  const [assessment, setAssessment] = useState(subject?.assessment ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      setError(tr("school.field.subjectName", lang) + " on kohustuslik.");
      return;
    }
    const exists = subjects.some(
      (s) => s.id !== subject?.id && s.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (exists) {
      setError("Sellise nimega aine on juba olemas.");
      return;
    }
    const palette = SUBJECT_PALETTE[colorIdx];
    setError("");
    setSaving(true);
    try {
      await onSave({
        id: subject?.id ?? `sub-${Date.now()}`,
        name: name.trim(),
        teacher: teacher.trim() || undefined,
        room: room.trim() || undefined,
        color: palette.color,
        bg: palette.bg,
        icon: palette.icon,
        ...(isEdit ? { assessment: assessment.trim() || undefined } : {}),
      });
      // On success the parent closes this modal (onSave resolving unmounts
      // it), so there is nothing further to do here.
    } catch {
      // Keep the form open and usable — never claim success on a failed write.
      setError(
        lang === "et"
          ? "Aine salvestamine ebaõnnestus. Proovi uuesti."
          : "Failed to save the subject. Please try again.",
      );
      setSaving(false);
    }
  };

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
            {isEdit ? tr("school.modal.editSubject", lang) : tr("school.action.addSubject", lang)}
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
              {tr("school.field.subjectName", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
                setError("");
                // Keep suggesting a color while the user hasn't manually
                // picked one — once they do, typing must not silently
                // replace their choice.
                if (!colorManuallySet) {
                  setColorIdx(classifySubject(value).colorIndex);
                }
              }}
              placeholder={tr("school.subject.placeholder", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.teacher", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder={tr("school.teacher.placeholder", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.room", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              placeholder={tr("school.room.placeholder", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-2">
              {tr("school.field.color", lang)}
            </label>
            <div className="flex gap-2">
              {SUBJECT_PALETTE.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setColorIdx(i);
                    setColorManuallySet(true);
                  }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${colorIdx === i ? "ring-2 ring-offset-2 ring-[#1A1F36]" : ""}`}
                  style={{ background: p.bg, color: p.color }}
                >
                  {p.icon}
                </button>
              ))}
            </div>
          </div>

          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {tr("school.field.assessment", lang)}{" "}
                <span className="text-[#CBD5E1] font-normal">
                  {tr("school.field.optional", lang)}
                </span>
              </label>
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder={tr("school.field.assessmentPh", lang)}
                rows={5}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-y"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors disabled:opacity-50"
          >
            {tr("school.action.cancel", lang)}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? (lang === "et" ? "Salvestamine…" : "Saving…")
              : tr("school.action.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  iconBg,
  iconColor,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
  sub: string;
}) {
  const isDark = useIsDark();
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-4">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
        style={{ background: isDark ? darkBg(iconBg) : iconBg, color: isDark ? darkText(iconColor) : iconColor }}
      >
        {icon}
      </div>
      <p className="text-xl font-bold text-[#1A1F36] leading-none">{value}</p>
      <p className="text-xs font-medium text-[#1A1F36] mt-1">{label}</p>
      <p className="school-stat-sub text-[11px] text-[#94A3B8] mt-0.5 leading-snug">{sub}</p>
    </div>
  );
}

interface SubjectTaskGroup {
  subject: string;
  color: string;
  bg: string;
  tasks: Task[];
}

// Groups `list` by its existing `subject` field, ordering subjects
// alphabetically (stable regardless of any deadline-sort toggle) and
// preserving each task's existing relative order within its group. A group
// is only ever built from a subject actually present in `list`, so an empty
// subject group can never be produced. Reused for both TasksTab's active
// groups (School change #6) and its History groups (School change #7), so
// the two use identical subject-grouping and color-accent logic.
function groupTasksBySubjectAlpha(list: Task[]): SubjectTaskGroup[] {
  const subjectsAlpha = Array.from(new Set(list.map((t) => t.subject))).sort(
    (a, b) => a.localeCompare(b, "et"),
  );
  return subjectsAlpha.map((subject) => {
    const groupTasks = list.filter((t) => t.subject === subject);
    const [first] = groupTasks;
    return {
      subject,
      color: first.subjectColor,
      bg: first.subjectBg,
      tasks: groupTasks,
    };
  });
}

function sortTasksByDeadline(list: Task[], dir: "asc" | "desc"): Task[] {
  return [...list].sort((a, b) => {
    const diff = parseDeadline(a.deadline) - parseDeadline(b.deadline);
    return dir === "asc" ? diff : -diff;
  });
}

// A single task row — the exact same markup/behavior TasksTab always
// rendered inline, pulled out to a standalone component only so it can be
// rendered from both the active subject groups and the History section
// (School change #7) without duplicating this markup. Menu-open and
// delete-confirm state stay lifted in TasksTab and are shared across both
// sections; that's safe because a given task id is never active and
// completed at the same time.
function TaskRow({
  task,
  lang,
  openMenuId,
  setOpenMenuId,
  confirmDeleteId,
  setConfirmDeleteId,
  onTaskClick,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  task: Task;
  lang: AppLang;
  openMenuId: number | null;
  setOpenMenuId: (id: number | null) => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
  onTaskClick: (task: Task) => void;
  onEdit: (task: Task) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-4">
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
          <span
            className="text-xs font-medium"
            style={{ color: task.subjectColor }}
          >
            {task.subject}
          </span>
          <span className="text-xs text-[#94A3B8]">
            {getTaskTypeLabel(task.type, lang)}
          </span>
        </div>
      </div>

      {/* Deadline */}
      <div className="hidden sm:flex flex-col items-end flex-shrink-0 w-32">
        <span className="text-[11px] font-medium text-[#6F5AE8]">
          {task.deadlineLabel}
        </span>
        <span className="text-[11px] text-[#94A3B8]">{task.deadline}</span>
      </div>

      {/* Progress ring */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <ProgressRing pct={task.progress} color={task.subjectColor} />
        <span className="text-xs font-semibold text-[#1A1F36] w-8">
          {task.progress}%
        </span>
      </div>

      {/* Moodle button */}
      {task.moodleUrl &&
        task.moodleUrl.trim() !== "" &&
        task.moodleUrl !== "#" && (
          <a
            href={task.moodleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/40 hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {tr("school.action.openMoodle", lang)}
            <ExternalLink size={11} strokeWidth={2} className="text-[#94A3B8]" />
          </a>
        )}

      {/* Row three-dot menu */}
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(openMenuId === task.id ? null : task.id);
          }}
          className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {openMenuId === task.id && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpenMenuId(null)}
            />
            <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  onEdit(task);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
              >
                <Pencil size={14} strokeWidth={2} className="text-[#64748B]" />
                {tr("school.action.edit", lang)}
              </button>
              {statusFromProgress(task.progress) === "tehtud" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onMarkUndone(task.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                >
                  <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                  {tr("school.action.markUndone", lang)}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onMarkDone(task.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                >
                  <Check size={14} strokeWidth={2} className="text-[#64748B]" />
                  {tr("school.action.markDone", lang)}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  setConfirmDeleteId(task.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                <Trash2 size={14} strokeWidth={2} />
                {tr("school.action.delete", lang)}
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
              <p className="text-xs text-[#94A3B8] mb-5">
                {tr("school.confirm.irreversible", lang)}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {tr("school.action.discard", lang)}
                </button>
                <button
                  onClick={() => {
                    onDelete(task.id);
                    setConfirmDeleteId(null);
                  }}
                  className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                >
                  {tr("school.action.delete", lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubjectTaskGroups({
  groups,
  lang,
  openMenuId,
  setOpenMenuId,
  confirmDeleteId,
  setConfirmDeleteId,
  onTaskClick,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  groups: SubjectTaskGroup[];
  lang: AppLang;
  openMenuId: number | null;
  setOpenMenuId: (id: number | null) => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
  onTaskClick: (task: Task) => void;
  onEdit: (task: Task) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.subject}>
          {/* Subject block heading */}
          <div
            className="flex items-center gap-2 mb-1.5 pb-1.5 border-b-2"
            style={{ borderColor: group.color }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: group.color }}
            />
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: group.color }}
            >
              {group.subject}
            </h4>
          </div>
          <div className="flex flex-col divide-y divide-[#F3F3F8]">
            {group.tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                lang={lang}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                onTaskClick={onTaskClick}
                onEdit={onEdit}
                onMarkDone={onMarkDone}
                onMarkUndone={onMarkUndone}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
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
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAdd: () => void;
  onEdit: (task: Task) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const lang = getLocalLanguage();
  const [showAll, setShowAll] = useState(false);
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterOpen, setFilterOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Active vs History split (School change #7) — derived purely from the
  // existing completion signal (progress >= 100, the same mapping
  // statusFromProgress already uses), never a new field or persisted flag.
  // `tasks` still holds every School task exactly as stored; this is a
  // display-only split of that same array.
  const activeTasks = tasks.filter((t) => t.progress < 100);
  const completedTasks = tasks.filter((t) => t.progress >= 100);

  const subjects = Array.from(new Set(tasks.map((t) => t.subject)));

  const filtered = subjectFilter
    ? activeTasks.filter((t) => t.subject === subjectFilter)
    : activeTasks;

  const sorted = sortTasksByDeadline(filtered, sortDir);

  const visible = showAll ? sorted : sorted.slice(0, 4);
  const hasMore = sorted.length > 4;

  // Group the currently visible ACTIVE tasks by subject (School change #6)
  // — the filter/sort/show-more behavior above is unchanged; this only
  // decides how that same `visible` list is arranged into sections.
  const groupedVisible = groupTasksBySubjectAlpha(visible);

  // History: every completed task, grouped by subject the same way (School
  // change #7). Deliberately not wired to the active-only subject
  // filter/show-more controls above, per "keep History simple". Reopening a
  // task (its progress drops below 100) removes it from `completedTasks`
  // and puts it back in `activeTasks` on the very next render — there is no
  // separate archive state to reconcile.
  const historyGroups = groupTasksBySubjectAlpha(
    sortTasksByDeadline(completedTasks, sortDir),
  );

  return (
    <div>
      {/* Filter row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">
          {tr("school.section.upcoming", lang)}
        </h3>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            <Plus size={14} strokeWidth={2.5} />
            {tr("school.action.addTask", lang)}
          </button>
          {/* Subject filter */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8F7FC] rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/30 transition-colors"
            >
              <Filter size={12} strokeWidth={2} className="text-[#94A3B8]" />
              {subjectFilter || tr("school.filter.allSubjects", lang)}
              <ChevronDown
                size={12}
                className={`text-[#94A3B8] transition-transform ${filterOpen ? "rotate-180" : ""}`}
              />
            </button>
            {filterOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setFilterOpen(false)}
                />
                <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                  <button
                    onClick={() => {
                      setSubjectFilter("");
                      setFilterOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                      !subjectFilter
                        ? "bg-[#EDE9FB] text-[#6F5AE8] font-medium"
                        : "text-[#1A1F36] hover:bg-[#F8F7F4]"
                    }`}
                  >
                    {tr("school.filter.allSubjects", lang)}
                  </button>
                  {subjects.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setSubjectFilter(s);
                        setFilterOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        subjectFilter === s
                          ? "bg-[#EDE9FB] text-[#6F5AE8] font-medium"
                          : "text-[#1A1F36] hover:bg-[#F8F7F4]"
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
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F8F7FC] rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/30 transition-colors"
          >
            <ArrowUpDown size={12} strokeWidth={2} className="text-[#94A3B8]" />
            {tr("school.sort.deadline", lang)}
            <span className="text-[10px] text-[#94A3B8]">
              {sortDir === "asc" ? "↑" : "↓"}
            </span>
          </button>
        </div>
      </div>

      {/* Task rows, grouped by subject (School change #6) */}
      <SubjectTaskGroups
        groups={groupedVisible}
        lang={lang}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        confirmDeleteId={confirmDeleteId}
        setConfirmDeleteId={setConfirmDeleteId}
        onTaskClick={onTaskClick}
        onEdit={onEdit}
        onMarkDone={onMarkDone}
        onMarkUndone={onMarkUndone}
        onDelete={onDelete}
      />

      {/* Show all toggle */}
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
        >
          {showAll
            ? tr("school.action.viewLess", lang)
            : tr("school.action.viewAll", lang)}
          <ChevronDown
            size={15}
            strokeWidth={2}
            className={`transition-transform ${showAll ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {/* History — completed School tasks, grouped by subject (School change #7).
          Derived only from progress >= 100; reopening a task removes it from
          here and puts it back above on the very next render. */}
      {historyGroups.length > 0 && (
        <div className="mt-8 pt-6 border-t border-[#ECECF2]">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {tr("school.section.history", lang)}
          </h3>
          <SubjectTaskGroups
            groups={historyGroups}
            lang={lang}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
            onTaskClick={onTaskClick}
            onEdit={onEdit}
            onMarkDone={onMarkDone}
            onMarkUndone={onMarkUndone}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}

// ── Ülevaade tab ───────────────────────────────────────────────────────────

function daysLeftBadge(daysLeft: number, lang: AppLang) {
  let bg = "#DCFCE7";
  let color = "#15803D";
  if (daysLeft <= 3) {
    bg = "#FEE2E2";
    color = "#B91C1C";
  } else if (daysLeft <= 7) {
    bg = "#FEF9C3";
    color = "#854D0E";
  }
  return (
    <span
      className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {daysLeft <= 0
        ? tr("school.task.today", lang)
        : tr("school.task.daysLeft", lang).replace("{n}", String(daysLeft))}
    </span>
  );
}

function UlevaadeCard({
  title,
  icon,
  iconBg,
  iconColor,
  onOpen,
  openLabel,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  onOpen: () => void;
  openLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  return (
    <div
      className={`bg-white rounded-2xl border border-[#ECECF2] p-5 flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: isDark ? darkBg(iconBg) : iconBg, color: isDark ? darkText(iconColor) : iconColor }}
          >
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-[#1A1F36] truncate">
            {title}
          </h3>
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
  );
}

function UlevaadeTab({
  tasks,
  exams,
  subjects,
  scheduleLessons,
  scheduleMode,
  studyHours,
  onNavigate,
}: {
  tasks: Task[];
  exams: Exam[];
  subjects: Subject[];
  scheduleLessons: ScheduleLesson[];
  scheduleMode: ScheduleMode;
  studyHours: { day: string; hours: number; label: string }[];
  onNavigate: (tab: TabId) => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const today = new Date();
  const todayStr = today.toLocaleDateString("et-EE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // 1. Tänased ülesanded: lähimad tähtajad + edenemine
  const sortedTasks = [...tasks]
    .filter((t) => statusFromProgress(t.progress) !== "tehtud")
    .sort((a, b) => parseDeadline(a.deadline) - parseDeadline(b.deadline));
  const todayTasks = sortedTasks.slice(0, 4);
  const completedTasksCount = tasks.filter(
    (t) => statusFromProgress(t.progress) === "tehtud",
  ).length;
  const avgTaskProgress =
    tasks.length > 0
      ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length)
      : 0;

  // 2. Lähenevad kontrolltööd
  const upcomingTests = exams
    .filter(
      (e) =>
        e.type === "kontrolltöö" && e.status !== "tehtud" && e.daysLeft >= 0,
    )
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  // 3. Lähenevad eksamid
  const upcomingExams = exams
    .filter(
      (e) => e.type === "eksam" && e.status !== "tehtud" && e.daysLeft >= 0,
    )
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  // 4. Tänane tunniplaan — match canonical ET day string against real weekday
  const SCHED_DAYS_ET = [
    "Esmaspäev",
    "Teisipäev",
    "Kolmapäev",
    "Neljapäev",
    "Reede",
    "Laupäev",
    "Pühapäev",
  ];
  const todayDayStr = SCHED_DAYS_ET[(new Date().getDay() + 6) % 7]; // 0=Mon..6=Sun
  const todayLessons = scheduleLessons.filter((l) => l.day === todayDayStr);

  // 5. Õpitavad ained
  const activeSubjectsCount = subjects.length;

  // 6. Õppimise statistika (real hours from scheduled lessons via prop)
  const totalStudyHours = studyHours.reduce((sum, d) => sum + d.hours, 0);
  const completedTestsCount = exams.filter(
    (e) => e.type === "kontrolltöö" && e.status === "tehtud",
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1F36]">
            {tr("school.uv.title", lang)}
          </h3>
          <p className="text-xs text-[#94A3B8] mt-0.5 capitalize">{todayStr}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* 1. Tänased ülesanded */}
        <UlevaadeCard
          title={tr("school.uv.todayTasks", lang)}
          icon={<CheckCircle size={17} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          onOpen={() => onNavigate("uesanded")}
          openLabel={tr("school.uv.openTasks", lang)}
        >
          {todayTasks.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">
              {tr("school.empty.tasksWidget", lang)}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {todayTasks.map((t) => {
                const days = computeDaysLeft(t.deadline);
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: t.subjectBg, color: t.subjectColor }}
                    >
                      {t.subjectIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-[#1A1F36] truncate">
                        {t.title}
                      </p>
                      <p className="text-[11px] text-[#94A3B8] mt-0.5">
                        {t.deadlineLabel}
                      </p>
                    </div>
                    {daysLeftBadge(days, lang)}
                  </div>
                );
              })}
              <div className="flex items-center gap-2 mt-1 pt-3 border-t border-[#F3F3F8]">
                <ProgressRing pct={avgTaskProgress} color="#16A34A" />
                <div>
                  <p className="text-xs font-semibold text-[#1A1F36]">
                    {avgTaskProgress}%
                  </p>
                  <p className="text-[11px] text-[#94A3B8]">
                    {tr("school.uv.avgProgress", lang)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </UlevaadeCard>

        {/* 2. Lähenevad kontrolltööd */}
        <UlevaadeCard
          title={tr("school.uv.upcomingTests", lang)}
          icon={<Calendar size={17} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          onOpen={() => onNavigate("kontrolltood")}
          openLabel={tr("school.uv.openTests", lang)}
        >
          {upcomingTests.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">
              {tr("school.empty.testsWidget", lang)}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingTests.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isDark ? darkBg(e.iconBg) : e.iconBg, color: isDark ? darkText(e.iconColor) : e.iconColor }}
                  >
                    <Calendar size={14} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1A1F36] truncate">
                      {e.title}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      {e.date}
                    </p>
                  </div>
                  {daysLeftBadge(e.daysLeft, lang)}
                </div>
              ))}
            </div>
          )}
        </UlevaadeCard>

        {/* 3. Lähenevad eksamid */}
        <UlevaadeCard
          title={tr("school.uv.upcomingExams", lang)}
          icon={<Star size={17} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          onOpen={() => onNavigate("eksamid")}
          openLabel={tr("school.uv.openExams", lang)}
        >
          {upcomingExams.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">
              {tr("school.empty.examsWidget", lang)}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingExams.map((e) => (
                <div key={e.id} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isDark ? darkBg(e.iconBg) : e.iconBg, color: isDark ? darkText(e.iconColor) : e.iconColor }}
                  >
                    <Star size={14} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1A1F36] truncate">
                      {e.title}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      {e.date}
                    </p>
                  </div>
                  {daysLeftBadge(e.daysLeft, lang)}
                </div>
              ))}
            </div>
          )}
        </UlevaadeCard>

        {/* 4. Tänane tunniplaan / õppimisplaan */}
        <UlevaadeCard
          title={
            scheduleMode === "elearning"
              ? tr("school.schedule.titleElearning", lang)
              : tr("school.schedule.titleTraditional", lang)
          }
          icon={<Clock size={17} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          onOpen={() => onNavigate("tunniplaan")}
          openLabel={
            scheduleMode === "none"
              ? tr("school.schedule.openLabelNone", lang)
              : tr("school.schedule.openLabel", lang)
          }
        >
          {scheduleMode === "none" ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">
              {tr("school.empty.scheduleWidget", lang)}
            </p>
          ) : todayLessons.length === 0 ? (
            <p className="text-xs text-[#94A3B8] text-center py-6">
              {scheduleMode === "traditional"
                ? tr("school.schedule.noTodayTraditional", lang)
                : tr("school.schedule.noTodayElearning", lang)}
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
                    {l.startTime && l.endTime
                      ? `${l.startTime}–${l.endTime}`
                      : ""}
                  </span>
                  <span className="text-xs font-semibold text-[#1A1F36] truncate">
                    {l.subject}
                  </span>
                </div>
              ))}
              {todayLessons.length > 4 && (
                <p className="text-[11px] text-[#94A3B8] mt-1">
                  +{todayLessons.length - 4} veel
                </p>
              )}
            </div>
          )}
        </UlevaadeCard>

        {/* 5. Õpitavad ained */}
        <UlevaadeCard
          title={tr("school.uv.subjects", lang)}
          icon={<BookOpen size={17} strokeWidth={1.8} />}
          iconBg="#EFF6FF"
          iconColor="#2563EB"
          onOpen={() => onNavigate("ained")}
          openLabel={tr("school.uv.openSubjects", lang)}
        >
          <div className="flex items-center gap-3 mb-3">
            <p className="text-2xl font-bold text-[#1A1F36]">
              {activeSubjectsCount}
            </p>
            <p className="text-xs text-[#94A3B8]">
              {tr("school.uv.subjectsSub", lang)}
            </p>
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
          title={tr("school.uv.stats", lang)}
          icon={<Sparkles size={17} strokeWidth={1.8} />}
          iconBg="#F0FDF4"
          iconColor="#16A34A"
          onOpen={() => onNavigate("uesanded")}
          openLabel={tr("school.uv.openStats", lang)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#94A3B8]">
                {tr("school.uv.statsTime", lang)}
              </span>
              <span className="text-xs font-semibold text-[#1A1F36]">
                {Math.floor(totalStudyHours)}h{" "}
                {Math.round((totalStudyHours % 1) * 60)}m
              </span>
            </div>
            <div className="flex items-end justify-between gap-1 h-12">
              {studyHours.map((d) => {
                const heightPct = (d.hours / MAX_HOURS) * 100;
                return (
                  <div
                    key={d.day}
                    className="flex flex-col items-center gap-1 flex-1"
                  >
                    <div
                      className="w-full rounded-t-md bg-[#EDE9FB]"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[10px] text-[#94A3B8]">{d.day}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#F3F3F8]">
              <div>
                <p className="text-xs text-[#94A3B8]">
                  {tr("school.stat.tasksDone", lang)}
                </p>
                <p className="text-sm font-semibold text-[#1A1F36]">
                  {completedTasksCount} / {tasks.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#94A3B8]">
                  {tr("school.stat.testsDone", lang)}
                </p>
                <p className="text-sm font-semibold text-[#1A1F36]">
                  {completedTestsCount}
                </p>
              </div>
            </div>
          </div>
        </UlevaadeCard>
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  const lang = getLocalLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
        <BookOpen size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
      </div>
      <p className="text-sm font-semibold text-[#1A1F36]">{label}</p>
      <p className="text-xs text-[#94A3B8] mt-1">
        {tr("school.placeholder.coming", lang)}
      </p>
    </div>
  );
}

function TodaySchedule({
  lessons,
  todayLabel,
  mode,
  onNavigate,
}: {
  lessons: ScheduleLesson[];
  /** Real local calendar date + weekday, e.g. "26. august 2026, kolmapäev" —
   *  computed once by the caller (SchoolPage) via getLocalDateString +
   *  formatDateWithWeekday, the same source used to filter `lessons`. */
  todayLabel: string;
  mode: ScheduleMode;
  onNavigate: (tab: TabId) => void;
}) {
  const lang = getLocalLanguage();
  if (mode === "none") {
    return (
      <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-[#F8F7FC] flex items-center justify-center">
            <Calendar size={17} strokeWidth={1.8} className="text-[#94A3B8]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1F36]">
              {tr("school.schedule.titleTraditional", lang)}
            </p>
            <p className="text-xs text-[#94A3B8]">
              {tr("school.schedule.none", lang)}
            </p>
          </div>
        </div>
        <p className="school-today-empty text-xs text-[#94A3B8] text-center py-6">
          {tr("school.schedule.noneSub", lang)}
        </p>
      </div>
    );
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
            <p className="text-sm font-semibold text-[#1A1F36]">
              {tr("school.schedule.titleTraditional", lang)}
            </p>
            <p className="text-xs text-[#94A3B8]">{todayLabel}</p>
          </div>
        </div>
      </div>

      {lessons.length === 0 ? (
        <p className="school-today-empty text-xs text-[#94A3B8] text-center py-6">
          {mode === "traditional"
            ? tr("school.schedule.noTodayTraditional", lang)
            : tr("school.schedule.noTodayElearning", lang)}
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
                  {lesson.startTime && lesson.endTime
                    ? `${lesson.startTime}–${lesson.endTime}`
                    : lesson.startDate && lesson.endDate
                      ? formatDateRange(lesson.startDate, lesson.endDate, lang)
                      : lesson.day || lesson.date || "—"}
                </span>
              </div>
              <p className="text-sm font-semibold text-[#1A1F36]">
                {lesson.subject}
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                {lesson.room ||
                  (lesson.teacher
                    ? tr("school.teacher.prefix", lang) + lesson.teacher
                    : "")}
              </p>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => onNavigate("tunniplaan")}
        className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
      >
        {tr("school.uv.viewSchedule", lang)}
        <ChevronRight size={15} strokeWidth={2} />
      </button>
    </div>
  );
}

function UpcomingExams({
  exams,
  onShowAll,
}: {
  exams: Exam[];
  onShowAll: () => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">
          {tr("school.schedule.upcoming", lang)}
        </h3>
      </div>
      <div className="flex flex-col gap-3">
        {exams.map((exam) => (
          <div key={exam.id} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: isDark ? darkBg(exam.iconBg) : exam.iconBg, color: isDark ? darkText(exam.iconColor) : exam.iconColor }}
            >
              <Calendar size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36] truncate">
                {exam.title}
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">{formatDateDisplay(exam.date)}</p>
            </div>
            <span
              className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background:
                  exam.daysLeft <= 10
                    ? "#FEF9C3"
                    : exam.daysLeft <= 20
                      ? "#DCFCE7"
                      : "#FEE2E2",
                color:
                  exam.daysLeft <= 10
                    ? "#854D0E"
                    : exam.daysLeft <= 20
                      ? "#15803D"
                      : "#B91C1C",
              }}
            >
              {exam.daysLeft} {tr("school.days", lang)}
            </span>
          </div>
        ))}
      </div>
      <button
        onClick={onShowAll}
        className="w-full mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
      >
        {tr("school.uv.viewAll", lang)}
        <ChevronRight size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

function StudyTimeChart({ data }: { data: typeof STUDY_HOURS }) {
  const lang = getLocalLanguage();
  const totalHours = data.reduce((s, d) => s + d.hours, 0);
  const total = totalHours === 0 ? '0h' : (() => {
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours % 1) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  })();
  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">
          {tr("school.studytime.title", lang)}
        </h3>
        <span className="text-sm font-bold text-[#1A1F36]">{total}</span>
      </div>
      <div className="flex items-end justify-between gap-1 h-20">
        {data.map((d) => {
          const heightPct = (d.hours / MAX_HOURS) * 100;
          return (
            <div
              key={d.day}
              className="flex flex-col items-center gap-1.5 flex-1"
            >
              <span className="text-[9px] text-[#94A3B8] font-medium">
                {d.label}
              </span>
              <div
                className="w-full rounded-t-md bg-[#EDE9FB]"
                style={{ height: `${heightPct}%` }}
              />
              <span className="text-[10px] text-[#94A3B8]">{d.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface CustomLink {
  id: string;
  name: string;
  url: string;
}

interface StoredLinks {
  googleDrive: string;
  custom: CustomLink[];
}

const STORED_LINKS_DEFAULTS: StoredLinks = { googleDrive: "", custom: [] };

// Module-level cache so the AI context generator can read links without async Firestore calls
let _cachedLinks: StoredLinks = STORED_LINKS_DEFAULTS;

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function MaterialsLinks() {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [stored, setStored] = useState<StoredLinks>(STORED_LINKS_DEFAULTS);

  useEffect(() => {
    if (!uid) return;
    const unsub = subscribeSettings<StoredLinks>(
      uid,
      "schoolLinks",
      STORED_LINKS_DEFAULTS,
      (s) => { setStored(s); _cachedLinks = s; },
    );
    return unsub;
  }, [uid]);
  const [editingGdrive, setEditingGdrive] = useState(false);
  const [gdriveInput, setGdriveInput] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

  const persist = (next: StoredLinks) => {
    setStored(next);
    _cachedLinks = next;
    if (uid) saveSettings(uid, "schoolLinks", next).catch(() => {});
  };

  // ── Google Drive ──
  const startEditGdrive = () => {
    setGdriveInput(stored.googleDrive);
    setEditingGdrive(true);
  };
  const saveGdrive = () => {
    persist({ ...stored, googleDrive: normalizeUrl(gdriveInput) });
    setEditingGdrive(false);
    setGdriveInput("");
  };

  // ── Custom links ──
  const addCustomLink = () => {
    const url = normalizeUrl(customUrl);
    if (!customName.trim() || !url) return;
    const newLink: CustomLink = {
      id: `link-${Date.now()}`,
      name: customName.trim(),
      url,
    };
    persist({ ...stored, custom: [...stored.custom, newLink] });
    setCustomName("");
    setCustomUrl("");
    setAddingCustom(false);
  };
  const startEditCustom = (link: CustomLink) => {
    setEditingCustomId(link.id);
    setEditName(link.name);
    setEditUrl(link.url);
  };
  const saveEditCustom = () => {
    const url = normalizeUrl(editUrl);
    if (!editName.trim() || !url) return;
    persist({
      ...stored,
      custom: stored.custom.map((l) =>
        l.id === editingCustomId ? { ...l, name: editName.trim(), url } : l,
      ),
    });
    setEditingCustomId(null);
    setEditName("");
    setEditUrl("");
  };
  const deleteCustomLink = (id: string) => {
    persist({ ...stored, custom: stored.custom.filter((l) => l.id !== id) });
  };

  return (
    <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
      <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
        {tr("school.widget.stats", lang)}
      </h3>
      <div className="flex flex-col divide-y divide-[#F3F3F8]">
        {/* Google Drive */}
        <div className="py-3">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: isDark ? "#0D2418" : "#DCFCE7", color: isDark ? "#4ADE80" : "#16A34A" }}
            >
              <HardDrive size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36]">
                Google Drive
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5 truncate">
                {stored.googleDrive || tr("school.empty.schedule", lang)}
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
                {tr("school.action.addSubject", lang)}
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
                  onClick={() => {
                    setEditingGdrive(false);
                    setGdriveInput("");
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {tr("school.action.discard", lang)}
                </button>
                <button
                  onClick={saveGdrive}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                >
                  <Check size={13} strokeWidth={2.5} />
                  {tr("school.action.save", lang)}
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
              style={{ background: isDark ? "#1E1B2E" : "#EDE9FB", color: isDark ? "#A78BFA" : "#6F5AE8" }}
            >
              <Link2 size={15} strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-[#1A1F36]">
                {tr("School link custom", lang)}
              </p>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                OneDrive, Dropbox vms
              </p>
            </div>
            <button
              onClick={() => {
                setAddingCustom(true);
                setCustomName("");
                setCustomUrl("");
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#6F5AE8] hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
            >
              <Plus size={13} strokeWidth={2.5} />
              {tr("school.action.addTask", lang)}
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
                  onClick={() => {
                    setAddingCustom(false);
                    setCustomName("");
                    setCustomUrl("");
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {tr("school.action.discard", lang)}
                </button>
                <button
                  onClick={addCustomLink}
                  disabled={!customName.trim() || !customUrl.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Check size={13} strokeWidth={2.5} />
                  {tr("school.action.save", lang)}
                </button>
              </div>
            </div>
          )}

          {stored.custom.length === 0 && !addingCustom ? (
            <p className="text-[11px] text-[#94A3B8] text-center py-2">
              {tr("School link none", lang)}
            </p>
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
                          onClick={() => {
                            setEditingCustomId(null);
                            setEditName("");
                            setEditUrl("");
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                        >
                          {tr("school.action.discard", lang)}
                        </button>
                        <button
                          onClick={saveEditCustom}
                          disabled={!editName.trim() || !editUrl.trim()}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Check size={13} strokeWidth={2.5} />
                          {tr("school.action.save", lang)}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#F8F7FC] hover:bg-[#F3F1FB] transition-colors">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: isDark ? "#1E1B2E" : "#EDE9FB", color: isDark ? "#A78BFA" : "#6F5AE8" }}
                      >
                        <Link2 size={13} strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[#1A1F36] truncate">
                          {link.name}
                        </p>
                        <p className="text-[11px] text-[#94A3B8] truncate">
                          {link.url}
                        </p>
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
                          title={tr("school.action.edit", lang)}
                        >
                          <Pencil size={13} strokeWidth={2} />
                        </button>
                        <button
                          onClick={() => deleteCustomLink(link.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-white hover:text-[#DC2626] transition-colors"
                          title={tr("school.action.delete", lang)}
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
  );
}

function AIStudyHelper({
  subjects,
  tasks,
  exams,
  scheduleMode,
  scheduleLessons,
}: {
  subjects: Subject[];
  tasks: Task[];
  exams: Exam[];
  scheduleMode: ScheduleMode;
  scheduleLessons: ScheduleLesson[];
}) {
  const lang = getLocalLanguage();
  const navigate = useNavigate();

  const handleAskAI = () => {
    const activeSubjects = subjects.map((s) => ({
      name: s.name,
      teacher: s.teacher,
      room: s.room,
    }));
    const schoolTasks = tasks.map((t) => ({
      subject: t.subject,
      title: t.title,
      type: t.type,
      deadline: t.deadline,
      progress: t.progress,
    }));
    const schoolExams = exams.map((e) => ({
      subject: e.subject,
      title: e.title,
      date: e.date,
      type: e.type,
      status: e.status,
      daysLeft: e.daysLeft,
    }));

    let links:
      | {
          moodle?: string;
          googleDrive?: string;
          custom?: { name: string; url: string }[];
        }
      | undefined;
    if (
      _cachedLinks.googleDrive ||
      (_cachedLinks.custom && _cachedLinks.custom.length > 0)
    ) {
      links = {
        googleDrive: _cachedLinks.googleDrive || undefined,
        custom: _cachedLinks.custom,
      };
    }

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
    };
    try {
      sessionStorage.setItem("kivora_school_context", JSON.stringify(context));
    } catch {
      /* ignore */
    }
    sessionStorage.setItem("kivora_ai_prompt", tr("school.ai.prompt", lang));
    navigate("/app/assistant");
  };

  return (
    <div className="school-ai-card bg-gradient-to-br from-[#6F5AE8] to-[#7C6BF0] rounded-2xl p-5 text-white">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} strokeWidth={2} className="text-yellow-300" />
        <h3 className="text-sm font-semibold">{tr("school.ai.title", lang)}</h3>
      </div>
      <p className="text-xs text-white/85 leading-relaxed mb-5">
        {tr("school.ai.desc", lang)}
      </p>
      <button
        onClick={handleAskAI}
        className="w-full flex items-center justify-between bg-white/15 hover:bg-white/25 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
      >
        {tr("school.ai.btn", lang)}
        <ChevronRight size={15} strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ── Exams tab (kontrolltööd) ────────────────────────────────────────────────

interface SubjectExamGroup {
  subject: string;
  color: string;
  bg: string;
  exams: Exam[];
}

// Same alphabetical-subject-grouping approach as School Tasks History
// (SchoolPage.tsx's groupTasksBySubjectAlpha, School change #7), adapted for
// Exam's own subjectless-field naming (iconColor/iconBg instead of
// subjectColor/subjectBg) — kept as its own small function rather than
// reusing that one, so School Tasks History stays untouched. A group is
// only ever built from a subject actually present in `list`, so an empty
// subject group can never be produced.
function groupExamsBySubjectAlpha(list: Exam[]): SubjectExamGroup[] {
  const subjectsAlpha = Array.from(new Set(list.map((e) => e.subject))).sort(
    (a, b) => a.localeCompare(b, "et"),
  );
  return subjectsAlpha.map((subject) => {
    const groupExams = list.filter((e) => e.subject === subject);
    const [first] = groupExams;
    return {
      subject,
      color: first.iconColor,
      bg: first.iconBg,
      exams: groupExams,
    };
  });
}

// A single exam row — the exact same markup ExamsTab always rendered
// inline, pulled out to a standalone component only so it can be rendered
// from both the active list and the History section (School change #9)
// without duplicating this markup.
function ExamRow({
  exam,
  lang,
  isDark,
  onExamClick,
}: {
  exam: Exam;
  lang: AppLang;
  isDark: boolean;
  onExamClick: (exam: Exam) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: isDark ? darkBg(exam.iconBg) : exam.iconBg, color: isDark ? darkText(exam.iconColor) : exam.iconColor }}
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
          <span className="text-xs font-medium text-[#6F5AE8]">
            {exam.subject}
          </span>
          <span className="text-xs text-[#94A3B8]">·</span>
          <span className="text-xs text-[#94A3B8]">{formatDateDisplay(exam.date)}</span>
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end flex-shrink-0">
        <span className="text-[11px] font-medium text-[#1A1F36]">
          {formatDateDisplay(exam.date)}
        </span>
        <span className="text-[11px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
          <Clock size={10} strokeWidth={2} />
          {exam.status === "tehtud"
            ? tr("school.detail.doneLabel", lang)
            : exam.daysLeft <= 0
              ? tr("school.task.today", lang)
              : tr("school.task.daysLeft", lang).replace(
                  "{n}",
                  String(exam.daysLeft),
                )}
        </span>
      </div>
      {exam.moodleUrl && exam.moodleUrl.trim() !== "" && (
        <a
          href={exam.moodleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/40 hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {tr("school.action.openMoodle", lang)}
          <ExternalLink size={11} strokeWidth={2} className="text-[#94A3B8]" />
        </a>
      )}
      <span
        className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{
          background:
            exam.status === "tehtud"
              ? "#DCFCE7"
              : exam.daysLeft <= 10
                ? "#FEF9C3"
                : exam.daysLeft <= 20
                  ? "#DCFCE7"
                  : "#EDE9FB",
          color:
            exam.status === "tehtud"
              ? "#15803D"
              : exam.daysLeft <= 10
                ? "#854D0E"
                : exam.daysLeft <= 20
                  ? "#15803D"
                  : "#6F5AE8",
        }}
      >
        {exam.status === "tehtud"
          ? tr("school.detail.doneLabel", lang)
          : exam.daysLeft <= 0
            ? tr("school.task.today", lang)
            : tr("school.task.daysShort", lang).replace(
                "{n}",
                String(exam.daysLeft),
              )}
      </span>
    </div>
  );
}

function SubjectExamGroups({
  groups,
  lang,
  isDark,
  onExamClick,
}: {
  groups: SubjectExamGroup[];
  lang: AppLang;
  isDark: boolean;
  onExamClick: (exam: Exam) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.subject}>
          <div
            className="flex items-center gap-2 mb-1.5 pb-1.5 border-b-2"
            style={{ borderColor: group.color }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: group.color }}
            />
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: group.color }}
            >
              {group.subject}
            </h4>
          </div>
          <div className="flex flex-col divide-y divide-[#F3F3F8]">
            {group.exams.map((exam) => (
              <ExamRow
                key={exam.id}
                exam={exam}
                lang={lang}
                isDark={isDark}
                onExamClick={onExamClick}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExamsTab({
  exams,
  onAdd,
  onExamClick,
  onEdit,
  onDelete,
}: {
  exams: Exam[];
  onAdd: () => void;
  onExamClick: (exam: Exam) => void;
  onEdit: (exam: Exam) => void;
  onDelete: (id: number) => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Active vs History split (School change #9) — derived purely from the
  // existing `status` field, never a new field/collection/migration. A
  // completed test is only ever in `completedExams`, an active one only
  // ever in `activeExams`, so it can never appear in both.
  const activeExams = exams.filter((e) => e.status === "ootel");
  const completedExams = exams.filter((e) => e.status === "tehtud");

  const sorted = [...activeExams].sort((a, b) => {
    if (a.status === "tehtud" && b.status !== "tehtud") return 1;
    if (a.status !== "tehtud" && b.status === "tehtud") return -1;
    return a.daysLeft - b.daysLeft;
  });

  // History: every completed test, grouped by subject (School change #9).
  // Reopening a test (Märgi tegemata in ExamDetailModal, School change #8)
  // sets its status back to "ootel", which moves it out of
  // `completedExams`/History and back into `activeExams` on the very next
  // render — there is no separate archive state to reconcile.
  const historyGroups = groupExamsBySubjectAlpha(
    [...completedExams].sort((a, b) => a.daysLeft - b.daysLeft),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">
          {tr("school.tab.kontrolltood", lang)}
        </h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          {tr("school.action.addTest", lang)}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
            <Calendar size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1F36]">
            {tr("school.empty.tests", lang)}
          </p>
          <p className="text-xs text-[#94A3B8] mt-1">
            {tr("school.empty.testsSub", lang)}
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#F3F3F8]">
          {sorted.map((exam) => (
            <ExamRow
              key={exam.id}
              exam={exam}
              lang={lang}
              isDark={isDark}
              onExamClick={onExamClick}
            />
          ))}
        </div>
      )}

      {/* History — completed Kontrolltööd, grouped by subject (School
          change #9). Derived only from status === "tehtud"; marking one
          incomplete again removes it from here and puts it back above on
          the very next render. */}
      {historyGroups.length > 0 && (
        <div className="mt-8 pt-6 border-t border-[#ECECF2]">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {tr("school.section.history", lang)}
          </h3>
          <SubjectExamGroups
            groups={historyGroups}
            lang={lang}
            isDark={isDark}
            onExamClick={onExamClick}
          />
        </div>
      )}
    </div>
  );
}

// ── Date helpers ──────────────────────────────────────────────────────────

/** Convert legacy "D. Month YYYY" dates to ISO YYYY-MM-DD for <input type="date"> */
function toISODate(s: string): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const MONTH_MAP: Record<string, number> = {
    // Estonian
    jaanuar: 0, veebruar: 1, märts: 2, aprill: 3, mai: 4, juuni: 5,
    juuli: 6, august: 7, september: 8, oktoober: 9, november: 10, detsember: 11,
    // English (shared names already covered above; add distinct ones)
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6,
    october: 9, december: 11,
  };
  const m = s.match(/(\d+)\.\s+(\w+)\s+(\d+)/);
  if (!m) return '';
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (month === undefined) return '';
  const d = new Date(parseInt(m[3]), month, parseInt(m[1]));
  if (isNaN(d.getTime())) return '';
  // Use local getters — toISOString() converts to UTC and shifts the date
  // backward in UTC+ timezones (e.g. Estonia UTC+2/+3).
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Format a date string (ISO or legacy) for display */
function formatDateDisplay(s: string): string {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s + 'T00:00:00').toLocaleDateString(
      getLocalLanguage() === 'et' ? 'et-EE' : 'en-GB',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );
  }
  return s;
}

// ── Exam detail modal ──────────────────────────────────────────────────────

function ExamDetailModal({
  exam,
  onClose,
  onEdit,
  onDelete,
  onMarkDone,
  onMarkUndone,
}: {
  exam: Exam;
  onClose: () => void;
  onEdit: (exam: Exam) => void;
  onDelete: (id: number) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const [confirmDelete, setConfirmDelete] = useState(false);

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
            {tr("school.detail.dataTitle", lang)}
          </h2>
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
            <p className="text-xs text-[#94A3B8] mb-5">
              {tr("school.confirm.irreversible", lang)}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                {tr("school.action.discard", lang)}
              </button>
              <button
                onClick={() => onDelete(exam.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
              >
                {tr("school.action.delete", lang)}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isDark ? darkBg(exam.iconBg) : exam.iconBg, color: isDark ? darkText(exam.iconColor) : exam.iconColor }}
                >
                  <Calendar size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">
                    {exam.subject}
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    {tr("school.detail.testLabel", lang)}
                  </p>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background:
                      exam.status === "tehtud" ? "#DCFCE7" : "#FEF9C3",
                    color: exam.status === "tehtud" ? "#15803D" : "#854D0E",
                  }}
                >
                  {exam.status === "tehtud"
                    ? tr("school.detail.doneLabel", lang)
                    : tr("school.detail.pendingLabel", lang)}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-[#64748B] mb-1">
                  {tr("school.detail.titleLabel", lang)}
                </p>
                <p className="text-sm text-[#1A1F36]">{exam.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.detail.dateLabel", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36]">{formatDateDisplay(exam.date)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.detail.untilLabel", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36]">
                    {exam.status === "tehtud"
                      ? tr("school.detail.doneLabel", lang)
                      : exam.daysLeft <= 0
                        ? tr("school.task.today", lang)
                        : tr("school.task.daysLeft", lang).replace(
                            "{n}",
                            String(exam.daysLeft),
                          )}
                  </p>
                </div>
              </div>

              {exam.notes && exam.notes.trim() !== "" && (
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.detail.notesLabel", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36] whitespace-pre-wrap">
                    {exam.notes}
                  </p>
                </div>
              )}

              {exam.moodleUrl && exam.moodleUrl.trim() !== "" && (
                <a
                  href={exam.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  {tr("school.action.openMoodle", lang)}
                </a>
              )}
              <LinkedItemsPanel
                type="school"
                entityId={encodeSchoolId("exam", exam.id)}
                lang={lang}
              />
            </div>

            <div className="flex items-center justify-between px-5 py-4 border-t border-[#ECECF2]">
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                <Trash2 size={14} strokeWidth={2} />
                {tr("school.action.delete", lang)}
              </button>
              <div className="flex items-center gap-2">
                {exam.status === "tehtud" ? (
                  <button
                    onClick={() => onMarkUndone(exam.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-[#1A1F36] border border-[#ECECF2] hover:bg-[#F8F7F4] transition-colors"
                  >
                    <Check size={14} strokeWidth={2} />
                    {tr("school.action.markUndone", lang)}
                  </button>
                ) : (
                  <button
                    onClick={() => onMarkDone(exam.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-[#1A1F36] border border-[#ECECF2] hover:bg-[#F8F7F4] transition-colors"
                  >
                    <Check size={14} strokeWidth={2} />
                    {tr("school.action.markDone", lang)}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {tr("school.action.close", lang)}
                </button>
                <button
                  onClick={() => onEdit(exam)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
                >
                  <Pencil size={14} strokeWidth={2} />
                  {tr("school.action.edit", lang)}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Exam form modal (add + edit) ─────────────────────────────────────────────

function ExamFormModal({
  exam,
  nextId,
  onClose,
  onSave,
}: {
  exam?: Exam;
  nextId: number;
  onClose: () => void;
  onSave: (exam: Exam) => void;
}) {
  const lang = getLocalLanguage();
  const subjects = useSchoolSubjectsFromLessons();
  const isEdit = !!exam;
  const [subject, setSubject] = useState(exam?.subject ?? "");
  const [title, setTitle] = useState(exam?.title ?? "");
  const [date, setDate] = useState(toISODate(exam?.date ?? ""));
  const [notes, setNotes] = useState(exam?.notes ?? "");
  const [moodleUrl, setMoodleUrl] = useState(exam?.moodleUrl ?? "");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!title.trim()) {
      setError(tr("school.field.testNameLabel", lang) + " on kohustuslik.");
      return;
    }
    if (!subject.trim()) {
      setError(tr("school.field.testSubjectLabel", lang) + " on kohustuslik.");
      return;
    }
    const palette = SUBJECT_PALETTE[(nextId - 1) % SUBJECT_PALETTE.length];
    const matchedSubject = subjects.find((s) => s.name === subject.trim());
    onSave({
      id: exam?.id ?? nextId,
      subject: subject.trim(),
      subjectId: matchedSubject?.id,
      title: title.trim(),
      date: date.trim(),
      daysLeft: computeDaysLeft(date.trim() || ""),
      type: "kontrolltöö",
      status: exam?.status ?? "ootel",
      iconBg: exam?.iconBg ?? (matchedSubject?.bg ?? palette.bg),
      iconColor: exam?.iconColor ?? (matchedSubject?.color ?? palette.color),
      notes: notes.trim() || undefined,
      moodleUrl: moodleUrl.trim() || undefined,
    });
  };

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
            {isEdit
              ? tr("school.modal.editTest", lang)
              : tr("school.modal.addTest", lang)}
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
              {tr("school.field.testSubjectLabel", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <select
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setError(""); }}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
            >
              <option value="">{lang === 'et' ? '— vali aine —' : '— select subject —'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.testNameLabel", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              placeholder={tr("school.field.examNamePh", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examDateLabel", lang)}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examNotes", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr("school.form.notesPlaceholder", lang)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examMoodle", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            {tr("school.action.cancel", lang)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            {tr("school.action.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Eksamid tab ───────────────────────────────────────────────────────────

// A single Eksam row — the exact same markup EksamidTab always rendered
// inline, pulled out to a standalone component only so it can be rendered
// from both the active list and the History section (School change #11)
// without duplicating this markup. Menu-open and delete-confirm state stay
// lifted in EksamidTab and are shared across both sections — safe, since a
// given exam id is never active and completed at the same time.
function EksamRow({
  exam,
  lang,
  isDark,
  openMenuId,
  setOpenMenuId,
  confirmDeleteId,
  setConfirmDeleteId,
  onExamClick,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  exam: Exam;
  lang: AppLang;
  isDark: boolean;
  openMenuId: number | null;
  setOpenMenuId: (id: number | null) => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
  onExamClick: (exam: Exam) => void;
  onEdit: (exam: Exam) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex items-center gap-4 py-4">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: isDark ? darkBg(exam.iconBg) : exam.iconBg, color: isDark ? darkText(exam.iconColor) : exam.iconColor }}
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
          <span className="text-xs font-medium text-[#6F5AE8]">
            {exam.subject}
          </span>
          <span className="text-xs text-[#94A3B8]">·</span>
          <span className="text-xs text-[#94A3B8]">{formatDateDisplay(exam.date)}</span>
          {exam.time && exam.time.trim() !== "" && (
            <>
              <span className="text-xs text-[#94A3B8]">·</span>
              <span className="text-xs text-[#94A3B8]">
                {exam.time}
              </span>
            </>
          )}
          {exam.location && exam.location.trim() !== "" && (
            <>
              <span className="text-xs text-[#94A3B8]">·</span>
              <span className="text-xs text-[#94A3B8]">
                {exam.location}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="hidden sm:flex flex-col items-end flex-shrink-0">
        <span className="text-[11px] font-medium text-[#1A1F36]">
          {formatDateDisplay(exam.date)}
        </span>
        <span className="text-[11px] text-[#94A3B8] flex items-center gap-1 mt-0.5">
          <Clock size={10} strokeWidth={2} />
          {exam.status === "tehtud"
            ? tr("school.detail.doneLabel", lang)
            : exam.daysLeft <= 0
              ? tr("school.task.today", lang)
              : tr("school.task.daysLeft", lang).replace(
                  "{n}",
                  String(exam.daysLeft),
                )}
        </span>
      </div>
      {exam.moodleUrl && exam.moodleUrl.trim() !== "" && (
        <a
          href={exam.moodleUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#ECECF2] text-xs font-medium text-[#1A1F36] hover:border-[#6F5AE8]/40 hover:bg-[#F8F7FC] transition-colors flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {tr("school.action.openMoodle", lang)}
          <ExternalLink size={11} strokeWidth={2} className="text-[#94A3B8]" />
        </a>
      )}
      <span
        className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
        style={{
          background:
            exam.status === "tehtud"
              ? "#DCFCE7"
              : exam.daysLeft <= 10
                ? "#FEF9C3"
                : exam.daysLeft <= 20
                  ? "#DCFCE7"
                  : "#EDE9FB",
          color:
            exam.status === "tehtud"
              ? "#15803D"
              : exam.daysLeft <= 10
                ? "#854D0E"
                : exam.daysLeft <= 20
                  ? "#15803D"
                  : "#6F5AE8",
        }}
      >
        {exam.status === "tehtud"
          ? tr("school.detail.doneLabel", lang)
          : exam.daysLeft <= 0
            ? tr("school.task.today", lang)
            : tr("school.task.daysShort", lang).replace(
                "{n}",
                String(exam.daysLeft),
              )}
      </span>
      <div className="relative flex-shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(openMenuId === exam.id ? null : exam.id);
          }}
          className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {openMenuId === exam.id && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setOpenMenuId(null)}
            />
            <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  onEdit(exam);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
              >
                <Pencil
                  size={14}
                  strokeWidth={2}
                  className="text-[#64748B]"
                />
                {tr("school.action.edit", lang)}
              </button>
              {exam.status === "tehtud" ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onMarkUndone(exam.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                >
                  <Check
                    size={14}
                    strokeWidth={2}
                    className="text-[#64748B]"
                  />
                  {tr("school.action.markUndone", lang)}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId(null);
                    onMarkDone(exam.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                >
                  <Check
                    size={14}
                    strokeWidth={2}
                    className="text-[#64748B]"
                  />
                  {tr("school.action.markDone", lang)}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenuId(null);
                  setConfirmDeleteId(exam.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
              >
                <Trash2 size={14} strokeWidth={2} />
                {tr("school.action.delete", lang)}
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
              <p className="text-xs text-[#94A3B8] mb-5">
                {tr("school.confirm.irreversible", lang)}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
                >
                  {tr("school.action.discard", lang)}
                </button>
                <button
                  onClick={() => {
                    onDelete(exam.id);
                    setConfirmDeleteId(null);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
                >
                  {tr("school.action.delete", lang)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Renders a list of subject groups (SubjectExamGroup, the same shape/color
// approach groupExamsBySubjectAlpha already produces for Kontrolltööd
// History, School change #9) using EksamRow's own richer row (with its
// menu/delete-confirm state) rather than the simpler ExamRow — so Eksamid's
// existing row-level actions are preserved in both its active list and its
// History section (School change #11).
function SubjectEksamGroups({
  groups,
  lang,
  isDark,
  openMenuId,
  setOpenMenuId,
  confirmDeleteId,
  setConfirmDeleteId,
  onExamClick,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  groups: SubjectExamGroup[];
  lang: AppLang;
  isDark: boolean;
  openMenuId: number | null;
  setOpenMenuId: (id: number | null) => void;
  confirmDeleteId: number | null;
  setConfirmDeleteId: (id: number | null) => void;
  onExamClick: (exam: Exam) => void;
  onEdit: (exam: Exam) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.subject}>
          <div
            className="flex items-center gap-2 mb-1.5 pb-1.5 border-b-2"
            style={{ borderColor: group.color }}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: group.color }}
            />
            <h4
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: group.color }}
            >
              {group.subject}
            </h4>
          </div>
          <div className="flex flex-col divide-y divide-[#F3F3F8]">
            {group.exams.map((exam) => (
              <EksamRow
                key={exam.id}
                exam={exam}
                lang={lang}
                isDark={isDark}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                confirmDeleteId={confirmDeleteId}
                setConfirmDeleteId={setConfirmDeleteId}
                onExamClick={onExamClick}
                onEdit={onEdit}
                onMarkDone={onMarkDone}
                onMarkUndone={onMarkUndone}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EksamidTab({
  exams,
  onAdd,
  onExamClick,
  onEdit,
  onMarkDone,
  onMarkUndone,
  onDelete,
}: {
  exams: Exam[];
  onAdd: () => void;
  onExamClick: (exam: Exam) => void;
  onEdit: (exam: Exam) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Active vs History split (School change #11) — derived purely from the
  // existing `status` field, never a new field/collection/migration. A
  // completed exam is only ever in `completedExams`, an active one only
  // ever in `activeExams`, so it can never appear in both.
  const activeExams = exams.filter((e) => e.status === "ootel");
  const completedExams = exams.filter((e) => e.status === "tehtud");

  const sorted = [...activeExams].sort((a, b) => {
    if (a.status === "tehtud" && b.status !== "tehtud") return 1;
    if (a.status !== "tehtud" && b.status === "tehtud") return -1;
    return a.daysLeft - b.daysLeft;
  });

  // History: every completed exam, grouped by subject the same way
  // Kontrolltööd History already does (groupExamsBySubjectAlpha, School
  // change #9 — reused as-is, not duplicated). Marking one incomplete again
  // (Märgi tegemata, already working per change #10) sets its status back
  // to "ootel", which moves it out of `completedExams`/History and back
  // into `activeExams` on the very next render — no separate archive state
  // to reconcile.
  const historyGroups = groupExamsBySubjectAlpha(
    [...completedExams].sort((a, b) => a.daysLeft - b.daysLeft),
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1A1F36]">Eksamid</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
        >
          <Plus size={14} strokeWidth={2.5} />
          {tr("school.action.addExam", lang)}
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EDE9FB] flex items-center justify-center mb-3">
            <Calendar size={22} strokeWidth={1.8} className="text-[#6F5AE8]" />
          </div>
          <p className="text-sm font-semibold text-[#1A1F36]">
            {tr("school.empty.examModal", lang)}
          </p>
          <p className="text-xs text-[#94A3B8] mt-1">
            Vajuta "Lisa eksam", et lisada uus.
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#F3F3F8]">
          {sorted.map((exam) => (
            <EksamRow
              key={exam.id}
              exam={exam}
              lang={lang}
              isDark={isDark}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              confirmDeleteId={confirmDeleteId}
              setConfirmDeleteId={setConfirmDeleteId}
              onExamClick={onExamClick}
              onEdit={onEdit}
              onMarkDone={onMarkDone}
              onMarkUndone={onMarkUndone}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* History — completed Eksamid, grouped by subject (School change
          #11). Derived only from status === "tehtud"; marking one
          incomplete again removes it from here and puts it back above on
          the very next render. */}
      {historyGroups.length > 0 && (
        <div className="mt-8 pt-6 border-t border-[#ECECF2]">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {tr("school.section.history", lang)}
          </h3>
          <SubjectEksamGroups
            groups={historyGroups}
            lang={lang}
            isDark={isDark}
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            confirmDeleteId={confirmDeleteId}
            setConfirmDeleteId={setConfirmDeleteId}
            onExamClick={onExamClick}
            onEdit={onEdit}
            onMarkDone={onMarkDone}
            onMarkUndone={onMarkUndone}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
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
  exam: Exam;
  onClose: () => void;
  onEdit: (exam: Exam) => void;
  onDelete: (id: number) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isDone = exam.status === "tehtud";

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
            Eksami andmed
          </h2>
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
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(exam);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                    >
                      <Pencil
                        size={14}
                        strokeWidth={2}
                        className="text-[#64748B]"
                      />
                      {tr("school.action.edit", lang)}
                    </button>
                    {isDone ? (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onMarkUndone(exam.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check
                          size={14}
                          strokeWidth={2}
                          className="text-[#64748B]"
                        />
                        {tr("school.action.markUndone", lang)}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onMarkDone(exam.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check
                          size={14}
                          strokeWidth={2}
                          className="text-[#64748B]"
                        />
                        {tr("school.action.markDone", lang)}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      {tr("school.action.delete", lang)}
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
            <p className="text-xs text-[#94A3B8] mb-5">
              {tr("school.confirm.irreversible", lang)}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                {tr("school.action.discard", lang)}
              </button>
              <button
                onClick={() => onDelete(exam.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
              >
                {tr("school.action.delete", lang)}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isDark ? darkBg(exam.iconBg) : exam.iconBg, color: isDark ? darkText(exam.iconColor) : exam.iconColor }}
                >
                  <Calendar size={18} strokeWidth={1.8} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">
                    {exam.subject}
                  </p>
                  <p className="text-xs text-[#94A3B8]">Eksam</p>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: isDone ? "#DCFCE7" : "#FEF9C3",
                    color: isDone ? "#15803D" : "#854D0E",
                  }}
                >
                  {isDone
                    ? tr("school.detail.doneLabel", lang)
                    : tr("school.detail.pendingLabel", lang)}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-[#64748B] mb-1">
                  {tr("school.detail.titleLabel", lang)}
                </p>
                <p className="text-sm text-[#1A1F36]">{exam.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.detail.dateLabel", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36]">{formatDateDisplay(exam.date)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.detail.untilLabel", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36]">
                    {isDone
                      ? tr("school.detail.doneLabel", lang)
                      : exam.daysLeft <= 0
                        ? tr("school.task.today", lang)
                        : tr("school.task.daysLeft", lang).replace(
                            "{n}",
                            String(exam.daysLeft),
                          )}
                  </p>
                </div>
              </div>

              {(exam.time || exam.location) && (
                <div className="grid grid-cols-2 gap-4">
                  {exam.time && exam.time.trim() !== "" && (
                    <div>
                      <p className="text-xs font-medium text-[#64748B] mb-1">
                        {tr("school.field.examTime", lang)}
                      </p>

                      <p className="text-sm text-[#1A1F36]">{exam.time}</p>
                    </div>
                  )}
                  {exam.location && exam.location.trim() !== "" && (
                    <div>
                      <p className="text-xs font-medium text-[#64748B] mb-1">
                        {tr("school.field.examLocation", lang)}
                      </p>
                      <p className="text-sm text-[#1A1F36]">{exam.location}</p>
                    </div>
                  )}
                </div>
              )}

              {exam.notes && exam.notes.trim() !== "" && (
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.detail.notesLabel", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36] whitespace-pre-wrap">
                    {exam.notes}
                  </p>
                </div>
              )}

              {exam.moodleUrl && exam.moodleUrl.trim() !== "" && (
                <a
                  href={exam.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  {tr("school.action.openMoodle", lang)}
                </a>
              )}
            </div>

            <LinkedItemsPanel
              type="school"
              entityId={encodeSchoolId("exam", exam.id)}
              lang={lang}
              className="px-5 pb-2"
            />

            <div className="flex items-center justify-end px-5 py-4 border-t border-[#ECECF2]">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                {tr("school.action.close", lang)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Eksam form modal (add + edit) ───────────────────────────────────────────

function EksamFormModal({
  exam,
  nextId,
  onClose,
  onSave,
}: {
  exam?: Exam;
  nextId: number;
  onClose: () => void;
  onSave: (exam: Exam) => void;
}) {
  const lang = getLocalLanguage();
  const subjects = useSchoolSubjectsFromLessons();
  const isEdit = !!exam;
  const [subject, setSubject] = useState(exam?.subject ?? "");
  const [title, setTitle] = useState(exam?.title ?? "");
  const [date, setDate] = useState(toISODate(exam?.date ?? ""));
  const [time, setTime] = useState(exam?.time ?? "");
  const [location, setLocation] = useState(exam?.location ?? "");
  const [notes, setNotes] = useState(exam?.notes ?? "");
  const [moodleUrl, setMoodleUrl] = useState(exam?.moodleUrl ?? "");
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!title.trim()) {
      setError(tr("school.field.examNameLabel", lang) + " on kohustuslik.");
      return;
    }
    if (!subject.trim()) {
      setError("Sisesta aine.");
      return;
    }
    const palette = SUBJECT_PALETTE[(nextId - 1) % SUBJECT_PALETTE.length];
    const matchedSubject = subjects.find((s) => s.name === subject.trim());
    onSave({
      id: exam?.id ?? nextId,
      subject: subject.trim(),
      subjectId: matchedSubject?.id,
      title: title.trim(),
      date: date.trim(),
      daysLeft: computeDaysLeft(date.trim() || ""),
      type: "eksam",
      status: exam?.status ?? "ootel",
      iconBg: exam?.iconBg ?? (matchedSubject?.bg ?? palette.bg),
      iconColor: exam?.iconColor ?? (matchedSubject?.color ?? palette.color),
      time: time.trim() || undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      moodleUrl: moodleUrl.trim() || undefined,
    });
  };

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
            {isEdit
              ? tr("school.modal.editExam", lang)
              : tr("school.modal.addExam", lang)}
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
              {tr("school.field.examSubjectLabel", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <select
              value={subject}
              onChange={(e) => { setSubject(e.target.value); setError(""); }}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
            >
              <option value="">{lang === 'et' ? '— vali aine —' : '— select subject —'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examNameLabel", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              placeholder={tr("school.field.examNamePh", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examDateLabel", lang)}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {tr("school.field.examTime", lang)}{" "}
                <span className="text-[#CBD5E1] font-normal">
                  {tr("school.field.optional", lang)}
                </span>
              </label>
              <input
                type="text"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                placeholder={tr("school.field.examTimePh", lang)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {tr("school.field.examLocation", lang)}{" "}
                <span className="text-[#CBD5E1] font-normal">
                  {tr("school.field.optional", lang)}
                </span>
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={tr("school.field.examLocationPh", lang)}
                className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examNotes", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={tr("school.field.examNotesPh", lang)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examMoodle", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            {tr("school.action.cancel", lang)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            {tr("school.action.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task parts editor (used in add/edit modals) ────────────────────────────

let _partIdCounter = 0;
function makePartId(): string {
  _partIdCounter += 1;
  return `part-${Date.now()}-${_partIdCounter}`;
}

function TaskPartsEditor({
  parts,
  onChange,
}: {
  parts: TaskPart[];
  onChange: (parts: TaskPart[]) => void;
}) {
  const lang = getLocalLanguage();
  const addPart = () =>
    onChange([...parts, { id: makePartId(), label: "", done: false }]);
  const removePart = (id: string) => onChange(parts.filter((p) => p.id !== id));
  const updateLabel = (id: string, label: string) =>
    onChange(parts.map((p) => (p.id === id ? { ...p, label } : p)));

  return (
    <div>
      <label className="block text-xs font-medium text-[#64748B] mb-1.5">
        {tr("school.task.parts.label", lang)}{" "}
        <span className="text-[#CBD5E1] font-normal">
          ({tr("school.task.parts.optional", lang)})
        </span>
      </label>
      <div className="flex flex-col gap-2">
        {parts.map((part, idx) => (
          <div key={part.id} className="flex items-center gap-2">
            <span className="text-xs text-[#94A3B8] w-5 text-right flex-shrink-0">
              {idx + 1}.
            </span>
            <input
              type="text"
              value={part.label}
              onChange={(e) => updateLabel(part.id, e.target.value)}
              placeholder={tr("school.task.parts.phPart", lang)}
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
          {tr("school.task.parts.addPart", lang)}
        </button>
      </div>
    </div>
  );
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
  task: Task;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onMarkDone: (id: number) => void;
  onMarkUndone: (id: number) => void;
  onTogglePart: (taskId: number, partId: string) => void;
  onDelete: (id: number) => void;
}) {
  const lang = getLocalLanguage();
  const isDark = useIsDark();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = statusFromProgress(task.progress);
  const isDone = status === "tehtud";
  const hasParts = task.parts && task.parts.length > 0;
  const partsDone = hasParts ? task.parts!.filter((p) => p.done).length : 0;
  const partsTotal = hasParts ? task.parts!.length : 0;

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
            {tr("school.modal.taskData", lang)}
          </h2>
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
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 w-44 bg-white rounded-lg border border-[#ECECF2] shadow-lg overflow-hidden">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(task);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                    >
                      <Pencil
                        size={14}
                        strokeWidth={2}
                        className="text-[#64748B]"
                      />
                      {tr("school.action.edit", lang)}
                    </button>
                    {isDone ? (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onMarkUndone(task.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check
                          size={14}
                          strokeWidth={2}
                          className="text-[#64748B]"
                        />
                        {tr("school.action.markUndone", lang)}
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onMarkDone(task.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#1A1F36] hover:bg-[#F8F7F4] transition-colors"
                      >
                        <Check
                          size={14}
                          strokeWidth={2}
                          className="text-[#64748B]"
                        />
                        {tr("school.action.markDone", lang)}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        setConfirmDelete(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                      {tr("school.action.delete", lang)}
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
            <p className="text-xs text-[#94A3B8] mb-5">
              {tr("school.confirm.irreversible", lang)}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                {tr("school.action.discard", lang)}
              </button>
              <button
                onClick={() => onDelete(task.id)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-[#DC2626] text-white hover:bg-[#B91C1C] transition-colors"
              >
                {tr("school.action.delete", lang)}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: task.subjectBg,
                    color: task.subjectColor,
                  }}
                >
                  {task.subjectIcon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">
                    {task.subject}
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    {getTaskTypeLabel(task.type, lang)}
                  </p>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    background: isDark
                      ? ({ tegemata: '#1A2332', pooleli: '#1F1507', tehtud: '#0D2418' } as Record<TaskStatus, string>)[status]
                      : STATUS_STYLES[status].bg,
                    color: isDark
                      ? ({ tegemata: '#8B9EB5', pooleli: '#FCD34D', tehtud: '#4ADE80' } as Record<TaskStatus, string>)[status]
                      : STATUS_STYLES[status].color,
                  }}
                >
                  {getStatusLabels(lang)[status]}
                </span>
              </div>

              <div>
                <p className="text-xs font-medium text-[#64748B] mb-1">
                  {tr("school.field.taskTopic", lang)}
                </p>
                <p className="text-sm text-[#1A1F36]">{task.title}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.field.taskDeadline", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36]">{task.deadline}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-1">
                    {tr("school.field.taskProgress", lang)}
                  </p>
                  <p className="text-sm text-[#1A1F36]">{task.progress}%</p>
                </div>
              </div>

              {hasParts && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-[#64748B]">
                      {tr("school.task.parts", lang)}
                    </p>
                    <span className="text-xs font-medium text-[#1A1F36]">
                      {partsDone}/{partsTotal}{" "}
                      {tr("school.task.partsCompleted", lang)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {task.parts!.map((part) => (
                      <label
                        key={part.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-[#ECECF2] hover:bg-[#F8F7FC] transition-colors cursor-pointer"
                      >
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            onTogglePart(task.id, part.id);
                          }}
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            part.done
                              ? "bg-[#6F5AE8] border-[#6F5AE8] text-white"
                              : "bg-white border-[#CBD5E1] hover:border-[#6F5AE8]"
                          }`}
                        >
                          {part.done && <Check size={13} strokeWidth={3} />}
                        </button>
                        <span
                          className={`text-sm ${part.done ? "text-[#94A3B8] line-through" : "text-[#1A1F36]"}`}
                        >
                          {part.label ||
                            tr("school.task.parts.partN", lang).replace(
                              "{n}",
                              String(task.parts!.indexOf(part) + 1),
                            )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {task.moodleUrl && task.moodleUrl !== "#" && (
                <a
                  href={task.moodleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
                >
                  <ExternalLink size={14} strokeWidth={2} />
                  {tr("school.action.openMoodle", lang)}
                </a>
              )}

              {task.linkedTaskId && (() => {
                const linked = getAllTasks().find((t) => t.id === task.linkedTaskId);
                return linked ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#EDE9FB] text-[#6F5AE8] text-sm">
                    <CheckSquare size={14} strokeWidth={2} />
                    <span className="flex-1 truncate">
                      {lang === 'et' ? 'Seotud ülesanne: ' : 'Linked task: '}
                      <span className="font-medium">{linked.title}</span>
                    </span>
                  </div>
                ) : null;
              })()}

              <LinkedItemsPanel
                type="school"
                entityId={encodeSchoolId("task", task.id)}
                lang={lang}
              />
            </div>

            <div className="flex items-center justify-end px-5 py-4 border-t border-[#ECECF2]">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
              >
                {tr("school.action.close", lang)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Task edit modal ────────────────────────────────────────────────────────

function TaskEditModal({
  task,
  onClose,
  onSave,
}: {
  task: Task;
  onClose: () => void;
  onSave: (id: number, patch: Partial<Task>) => void;
}) {
  const lang = getLocalLanguage();
  const subjects = useSchoolSubjectsFromLessons();
  const [title, setTitle] = useState(task.title);
  const [subject, setSubject] = useState(task.subject);
  const [type, setType] = useState<TaskTypeValue>(
    (TASK_TYPE_VALUES as readonly string[]).includes(task.type)
      ? (task.type as TaskTypeValue)
      : "other"
  );
  const [deadline, setDeadline] = useState(toISODate(task.deadline));
  const [progress, setProgress] = useState(task.progress);
  const [moodleUrl, setMoodleUrl] = useState(task.moodleUrl);
  const [parts, setParts] = useState<TaskPart[]>(task.parts ?? []);
  const [addToTasks, setAddToTasks] = useState(!!task.linkedTaskId);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!title.trim()) {
      setError(tr("school.modal.taskData", lang) + " on kohustuslik.");
      return;
    }
    const cleanParts = parts.filter((p) => p.label.trim() !== "");
    const partsProgress = computePartsProgress(cleanParts);
    const finalProgress =
      cleanParts.length > 0
        ? partsProgress
        : Math.max(0, Math.min(100, progress));

    let resolvedLinkedTaskId: string | undefined = task.linkedTaskId;

    if (addToTasks) {
      if (resolvedLinkedTaskId) {
        // Update the existing linked task; read and preserve its current completed state
        const existing = getAllTasks().find((t) => t.id === resolvedLinkedTaskId);
        await tasksStoreUpdateTask({
          id: resolvedLinkedTaskId,
          title: title.trim(),
          description: subject.trim()
            ? `${subject.trim()} — ${getTaskTypeLabel(type, lang)}`
            : undefined,
          date: deadline.trim() || undefined,
          priority: "medium",
          completed: existing?.completed ?? false,
          category: "Kool",
        });
      } else {
        // Create a new linked task with a UUID — never derive from school-task ID
        // to avoid collisions with unrelated tasks
        const newId = crypto.randomUUID();
        try {
          await tasksStoreAddTask({
            id: newId,
            title: title.trim(),
            description: subject.trim()
              ? `${subject.trim()} — ${getTaskTypeLabel(type, lang)}`
              : undefined,
            date: deadline.trim() || undefined,
            priority: "medium",
            completed: false,
            category: "Kool",
          } as GlobalTask);
          resolvedLinkedTaskId = newId;
        } catch {
          // If write fails, do not persist a broken linkedTaskId
          resolvedLinkedTaskId = undefined;
        }
      }
    } else if (task.linkedTaskId) {
      // User toggled off — remove the linked task entry and clear the reference
      tasksStoreDeleteTask(task.linkedTaskId);
      resolvedLinkedTaskId = undefined;
    }

    const matchedSubject = subjects.find((s) => s.name === subject.trim());
    onSave(task.id, {
      title: title.trim(),
      subject: subject.trim(),
      subjectId: matchedSubject?.id,
      type: type,
      deadline: deadline.trim(),
      deadlineLabel: deadlineToLabel(deadline.trim(), lang),
      progress: finalProgress,
      moodleUrl: moodleUrl.trim(),
      parts: cleanParts.length > 0 ? cleanParts : undefined,
      linkedTaskId: resolvedLinkedTaskId,
    });
  };

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
            {tr("school.modal.editTask", lang)}
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
              {tr("school.field.taskSubject", lang)}
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
            >
              <option value="">{lang === 'et' ? '— vali aine —' : '— select subject —'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.taskTopic", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              placeholder={tr("school.field.taskTopicPh", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.taskType", lang)}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskTypeValue)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
            >
              {TASK_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {getTaskTypeLabel(v, lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.taskDeadline", lang)}
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <TaskPartsEditor parts={parts} onChange={setParts} />

          {parts.filter((p) => p.label.trim() !== "").length === 0 && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {tr("school.field.taskProgress", lang)}
              </label>
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examMoodle", lang)}
            </label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToTasks}
              onChange={(e) => setAddToTasks(e.target.checked)}
              className="w-4 h-4 rounded accent-[#6F5AE8]"
            />
            <span className="text-sm text-[#1A1F36]">
              {lang === 'et' ? 'Lisa ka ülesannete moodulisse' : 'Also add to Tasks module'}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            {tr("school.action.cancel", lang)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            {tr("school.action.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task add modal ──────────────────────────────────────────────────────────

function TaskAddModal({
  nextId,
  onClose,
  onSave,
  prefillSubject,
}: {
  nextId: number;
  onClose: () => void;
  onSave: (task: Task) => void;
  prefillSubject?: string;
}) {
  const lang = getLocalLanguage();
  const subjects = useSchoolSubjectsFromLessons();
  const [subject, setSubject] = useState(prefillSubject ?? "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskTypeValue>("homework");
  const [deadline, setDeadline] = useState("");
  const [progress, setProgress] = useState(0);
  const [moodleUrl, setMoodleUrl] = useState("");
  const [parts, setParts] = useState<TaskPart[]>([]);
  const [addToTasks, setAddToTasks] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!title.trim()) {
      setError(tr("school.field.taskTopicPh", lang).replace("nt ", ""));
      return;
    }
    const cleanParts = parts.filter((p) => p.label.trim() !== "");
    const partsProgress = computePartsProgress(cleanParts);
    const finalProgress =
      cleanParts.length > 0
        ? partsProgress
        : Math.max(0, Math.min(100, progress));
    // Pick color from matched subject or fallback palette
    const matchedSubject = subjects.find((s) => s.name === subject.trim());
    const palette = SUBJECT_PALETTE[(nextId - 1) % SUBJECT_PALETTE.length];
    const subjectColor = matchedSubject ? matchedSubject.color : palette.color;
    const subjectBg = matchedSubject ? matchedSubject.bg : palette.bg;
    const subjectIcon = matchedSubject
      ? <span style={{ color: matchedSubject.color }}>{/* icon */}</span>
      : palette.icon;

    let linkedTaskId: string | undefined = undefined;
    if (addToTasks) {
      // Use UUID so the linked task ID never collides with an existing task
      const newId = crypto.randomUUID();
      try {
        await tasksStoreAddTask({
          id: newId,
          title: title.trim(),
          description: subject.trim() ? `${subject.trim()} — ${getTaskTypeLabel(type, lang)}` : undefined,
          date: deadline.trim() || undefined,
          priority: "medium",
          completed: false,
          category: "Kool",
        } as GlobalTask);
        linkedTaskId = newId; // only set after confirmed write
      } catch {
        // If write fails, do not persist a broken linkedTaskId on the school task
      }
    }
    onSave({
      id: nextId,
      subject: subject.trim() || "Üldine",
      subjectId: matchedSubject?.id,
      subjectColor,
      subjectBg,
      subjectIcon,
      title: title.trim(),
      type: type,
      deadline: deadline.trim(),
      deadlineLabel: deadlineToLabel(deadline.trim(), lang),
      progress: finalProgress,
      moodleUrl: moodleUrl.trim(),
      parts: cleanParts.length > 0 ? cleanParts : undefined,
      linkedTaskId,
    });
  };

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
            {tr("school.modal.addTask2", lang)}
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
              {tr("school.field.taskSubject", lang)}
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!!prefillSubject}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white disabled:opacity-70"
            >
              <option value="">{lang === 'et' ? '— vali aine —' : '— select subject —'}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.taskTopic", lang)}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              placeholder={tr("school.field.taskTopicPh", lang)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.taskType", lang)}
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskTypeValue)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] bg-white"
            >
              {TASK_TYPE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {getTaskTypeLabel(v, lang)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.taskDeadline", lang)}
            </label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <TaskPartsEditor parts={parts} onChange={setParts} />

          {parts.filter((p) => p.label.trim() !== "").length === 0 && (
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {tr("school.field.taskProgress", lang)}
              </label>
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
            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
              {tr("school.field.examMoodle", lang)}{" "}
              <span className="text-[#CBD5E1] font-normal">
                {tr("school.field.optional", lang)}
              </span>
            </label>
            <input
              type="text"
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8]"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addToTasks}
              onChange={(e) => setAddToTasks(e.target.checked)}
              className="w-4 h-4 rounded accent-[#6F5AE8]"
            />
            <span className="text-sm text-[#1A1F36]">
              {lang === 'et' ? 'Lisa ka ülesannete moodulisse' : 'Also add to Tasks module'}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#ECECF2] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] transition-colors"
          >
            {tr("school.action.cancel", lang)}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-[#6F5AE8] text-white hover:bg-[#5B48D8] transition-colors"
          >
            {tr("school.action.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
