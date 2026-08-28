import { t as tr } from "@/lib/translations";
import { getAllTasks } from "@/lib/tasksStore";
import { getAllGoals } from "@/lib/goalsStore";
import { getAllHabits } from "@/lib/habitsStore";
import { getAllNotes } from "@/lib/quickNotesStore";
import { getAllEvents } from "@/lib/calendarStore";
import { getAllTransactions, getAllBills, getMonthSummary } from "@/lib/moneyStore";
import { getAllSchoolTasks, getAllSchoolExams, getAllSchoolSubjects } from "@/lib/schoolStore";
import { getAll as getAllNotifications } from "@/lib/notificationItemsStore";
import { getModuleSettings } from "@/lib/modulesStore";
import { getAllPlans, computePlanProgress, type Plan } from "@/lib/plansStore";
import type { MockCalendarEvent } from "@/lib/calendar/eventLayout";
import type { Task } from "@/types";
import type { Goal } from "@/data/goalsData";
import type { Habit } from "@/data/habitsData";
import { isHabitDoneOnDate, computeHabitStreak } from "@/data/habitsData";
import type { Note } from "@/data/notesData";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateEE(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("et-EE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildTasksSection(tasks: Task[]): string {
  if (tasks.length === 0)
    return "### Ülesanded\nPraegu ei ole selles moodulis ühtegi kirjet.";
  const today = todayISO();
  const pending = tasks.filter((t) => !t.completed);
  if (pending.length === 0) return "### Ülesanded\nKõik ülesanded on tehtud.";
  const overdue = pending.filter((t) => t.date && t.date < today);
  const todayTasks = pending.filter((t) => t.date === today);
  const upcoming = pending.filter((t) => !t.date || t.date > today);
  const lines: string[] = [];
  if (overdue.length > 0) {
    lines.push(`Tähtaja ületanud (${overdue.length}):`);
    overdue.forEach((t) => {
      const parts = [t.title];
      if (t.priority) parts.push(`(prioriteet: ${t.priority})`);
      if (t.date) parts.push(`[tähtaeg oli: ${t.date}]`);
      if (t.category) parts.push(`(kategooria: ${t.category})`);
      lines.push(`  - ${parts.join(" ")}`);
    });
  }
  if (todayTasks.length > 0) {
    lines.push(`Tänased (${todayTasks.length}):`);
    todayTasks.forEach((t) => {
      const parts = [t.title];
      if (t.priority) parts.push(`(prioriteet: ${t.priority})`);
      if (t.category) parts.push(`(kategooria: ${t.category})`);
      lines.push(`  - ${parts.join(" ")}`);
    });
  }
  if (upcoming.length > 0) {
    lines.push(`Tulevased (${upcoming.length}):`);
    upcoming.forEach((t) => {
      const parts = [t.title];
      if (t.priority) parts.push(`(prioriteet: ${t.priority})`);
      if (t.date) parts.push(`[kuupäev: ${t.date}]`);
      if (t.category) parts.push(`(kategooria: ${t.category})`);
      lines.push(`  - ${parts.join(" ")}`);
    });
  }
  return `### Ülesanded (tegemata ${pending.length}/${tasks.length})\n${lines.join("\n")}`;
}

function buildGoalsSection(goals: Goal[]): string {
  if (goals.length === 0)
    return "### Eesmärgid\nPraegu ei ole selles moodulis ühtegi kirjet.";
  const lines = goals.map((g) => {
    const pct =
      g.progressMax > 0
        ? Math.round((g.progressValue / g.progressMax) * 100)
        : 0;
    const steps =
      g.steps.length > 0
        ? `${g.steps.filter((s) => s.done).length}/${g.steps.length} sammu tehtud`
        : "";
    return `- ${g.title} — staatus: ${g.status}, edenemine: ${pct}%${steps ? `, ${steps}` : ""}${g.deadline ? `, tähtaeg: ${g.deadline}` : ""}`;
  });
  return `### Eesmärgid (${goals.length})\n${lines.join("\n")}`;
}

function buildPlansSection(plans: Plan[]): string {
  if (plans.length === 0)
    return "### Plaanid\nPraegu ei ole selles moodulis ühtegi kirjet.";
  const lines = plans.map((p) => {
    const { done, total, percent } = computePlanProgress(p);
    const range = p.startDate && p.endDate
      ? `, vahemik: ${p.startDate}–${p.endDate}`
      : p.startDate
        ? `, algus: ${p.startDate}`
        : "";
    return `- ${p.title} (${p.type}) — edenemine: ${done}/${total} (${percent}%)${range}`;
  });
  return `### Plaanid (${plans.length})\n${lines.join("\n")}`;
}

function buildHabitsSection(habits: Habit[]): string {
  if (habits.length === 0)
    return "### Harjumused\nPraegu ei ole selles moodulis ühtegi kirjet.";
  const today = new Date();
  const lines = habits.map((h) => {
    const doneToday = isHabitDoneOnDate(h, today);
    const streak = computeHabitStreak(h, today);
    return `- ${h.title} — staatus: ${h.status}, seeria: ${streak} päeva${doneToday ? ", täna tehtud" : ""}${h.description ? `, ${h.description}` : ""}`;
  });
  return `### Harjumused (${habits.length})\n${lines.join("\n")}`;
}

function buildNotesSection(notes: Note[]): string {
  if (notes.length === 0)
    return "### Märkmed\nPraegu ei ole selles moodulis ühtegi kirjet.";
  const lines = notes.map((n) => {
    const content = n.preview ? ` — "${n.preview}"` : "";
    return `- ${n.title} (kaust: ${n.folder})${content}`;
  });
  return `### Märkmed (${notes.length})\n${lines.join("\n")}`;
}

function buildCalendarSection(events: MockCalendarEvent[]): string {
  if (events.length === 0)
    return "### Kalender\nPraegu ei ole selles moodulis ühtegi kirjet.";
  const today = todayISO();
  const tomorrow = tomorrowISO();
  const todayEvents = events.filter((e) => e.date === today);
  const tomorrowEvents = events.filter((e) => e.date === tomorrow);
  const lines: string[] = [];
  if (todayEvents.length > 0) {
    lines.push(`Täna (${formatDateEE(today)}):`);
    todayEvents.forEach((e) =>
      lines.push(
        `  - ${e.title} ${e.startTime}–${e.endTime || ""}${e.location ? `, asukoht: ${e.location}` : ""}`,
      ),
    );
  }
  if (tomorrowEvents.length > 0) {
    lines.push(`Homme (${formatDateEE(tomorrow)}):`);
    tomorrowEvents.forEach((e) =>
      lines.push(
        `  - ${e.title} ${e.startTime}–${e.endTime || ""}${e.location ? `, asukoht: ${e.location}` : ""}`,
      ),
    );
  }
  if (lines.length === 0) {
    lines.push("Täna ja homme pole kalendris sündmusi.");
    const upcoming = events
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 5);
    if (upcoming.length > 0) {
      lines.push("Järgmised sündmused:");
      upcoming.forEach((e) =>
        lines.push(
          `  - ${e.title} ${e.startTime}–${e.endTime || ""} [${e.date}]`,
        ),
      );
    }
  }
  return `### Kalender\n${lines.join("\n")}`;
}

// Lookup maps: map raw stored values → TranslationKey
const TASK_TYPE_KEYS: Record<string, Parameters<typeof tr>[0]> = {
  homework:     "school.taskType.homework",
  essay:        "school.taskType.essay",
  lab_report:   "school.taskType.lab_report",
  presentation: "school.taskType.presentation",
  reading:      "school.taskType.reading",
  project:      "school.taskType.project",
  worksheet:    "school.taskType.worksheet",
  research:     "school.taskType.research",
  other:        "school.taskType.other",
};

const TASK_PROGRESS_KEYS: Record<string, Parameters<typeof tr>[0]> = {
  tehtud:    "school.task.status.tehtud",
  pooleli:   "school.task.status.pooleli",
  tegemata:  "school.task.status.tegemata",
};

const EXAM_TYPE_KEYS: Record<string, Parameters<typeof tr>[0]> = {
  "kontrolltöö": "school.examType.test",
  "eksam":        "school.examType.exam",
};

const EXAM_STATUS_KEYS: Record<string, Parameters<typeof tr>[0]> = {
  ootel:   "school.examStatus.ootel",
  tehtud:  "school.examStatus.tehtud",
};

function localizeTaskType(type: string, lang: "et" | "en"): string {
  const key = TASK_TYPE_KEYS[type];
  return key ? tr(key, lang) : type;
}

function buildSchoolFromStore(lang: "et" | "en"): string {
  const isEn = lang === "en";
  const tasks = getAllSchoolTasks();
  const exams = getAllSchoolExams();
  const subjects = getAllSchoolSubjects();

  if (tasks.length === 0 && exams.length === 0 && subjects.length === 0) {
    return isEn
      ? "### School\nNo entries in this module yet."
      : "### Kool\nPraegu ei ole selles moodulis ühtegi kirjet.";
  }

  const lines: string[] = [];

  if (subjects.length > 0) {
    lines.push(isEn
      ? `Active subjects (${subjects.length}):`
      : `Aktiivsed õppeained (${subjects.length}):`);
    subjects.forEach((s) => {
      const parts = [s.name];
      if (s.teacher) parts.push(isEn ? `teacher: ${s.teacher}` : `õpetaja: ${s.teacher}`);
      if (s.room)    parts.push(isEn ? `room: ${s.room}` : `ruum: ${s.room}`);
      lines.push(`  - ${parts.join(", ")}`);
    });
  }

  if (tasks.length > 0) {
    lines.push(isEn
      ? `School assignments (${tasks.length}):`
      : `Kooliülesanded (${tasks.length}):`);
    tasks.forEach((task) => {
      const progressKey = task.progress >= 100 ? "tehtud" : task.progress > 0 ? "pooleli" : "tegemata";
      const statusLabel = tr(TASK_PROGRESS_KEYS[progressKey], lang);
      const typeLabel   = localizeTaskType(task.type, lang);
      const deadlineWord = isEn ? "deadline" : "tähtaeg";
      const progressWord = isEn ? "progress" : "edenemine";
      const statusWord   = isEn ? "status" : "staatus";
      lines.push(
        `  - ${task.subject}: ${task.title} (${typeLabel}) — ${deadlineWord}: ${task.deadlineLabel}, ${progressWord}: ${task.progress}%, ${statusWord}: ${statusLabel}`,
      );
    });
  }

  if (exams.length > 0) {
    lines.push(isEn
      ? `Tests and exams (${exams.length}):`
      : `Kontrolltööd ja eksamid (${exams.length}):`);
    exams.forEach((exam) => {
      const examTypeLabel   = EXAM_TYPE_KEYS[exam.type]   ? tr(EXAM_TYPE_KEYS[exam.type]!,   lang) : exam.type;
      const examStatusLabel = EXAM_STATUS_KEYS[exam.status] ? tr(EXAM_STATUS_KEYS[exam.status]!, lang) : exam.status;
      const days = exam.status === "tehtud"
        ? examStatusLabel
        : exam.daysLeft <= 0
          ? (isEn ? "today" : "täna")
          : isEn
            ? `in ${exam.daysLeft} days`
            : `${exam.daysLeft} päeva pärast`;
      const typeWord   = isEn ? "type" : "tüüp";
      const statusWord = isEn ? "status" : "staatus";
      lines.push(
        `  - ${exam.subject}: ${exam.title} — ${exam.date}, ${typeWord}: ${examTypeLabel}, ${statusWord}: ${examStatusLabel}, ${days}`,
      );
    });
  }

  return `### ${isEn ? "School" : "Kool"}\n${lines.join("\n")}`;
}

function buildNotificationsSection(): string {
  const all = getAllNotifications();
  if (all.length === 0)
    return "### Teavitused\nPraegu pole teavitusi.";

  const unread = all.filter((n) => !n.read);
  const lines: string[] = [];
  lines.push(`Teavitusi kokku: ${all.length}, lugemata: ${unread.length}`);

  if (unread.length > 0) {
    lines.push(`Lugemata teavitused (${Math.min(unread.length, 10)}):`);
    unread.slice(0, 10).forEach((n) => {
      lines.push(`  - [${n.module}] ${n.title}: ${n.description} (${n.timeLabel})`);
    });
  } else {
    lines.push("Viimased teavitused (kõik loetud):");
    all.slice(0, 5).forEach((n) => {
      lines.push(`  - [${n.module}] ${n.title}: ${n.description} (${n.timeLabel})`);
    });
  }

  return `### Teavitused\n${lines.join("\n")}`;
}

function buildFinanceSection(): string {
  const today = todayISO();
  const curMonth = today.slice(0, 7);
  const allTx   = getAllTransactions();
  const allBills = getAllBills();

  if (allTx.length === 0 && allBills.length === 0) {
    return "### Finantside\nPraegu pole finantsandmeid sisestatud.";
  }

  const summary = getMonthSummary(curMonth);
  const lines: string[] = [];

  // ── Monthly totals ────────────────────────────────────────────────────────
  lines.push(`Jooksev kuu: ${curMonth}`);
  lines.push(`- Tulud kokku: ${summary.totalIncome.toFixed(2)} €`);
  lines.push(`- Kulud kokku: ${summary.totalExpenses.toFixed(2)} €`);
  lines.push(`- Säästud kokku: ${summary.totalSavings.toFixed(2)} €`);
  lines.push(
    summary.currentAccountBalance !== null
      ? `- Kontojääk (viimasest väljavõttest): ${summary.currentAccountBalance.toFixed(2)} €`
      : `- Kontojääk: pole imporditud (pangaväljavõte puudub)`,
  );
  lines.push(`- Kuu rahavoog (tulud − kulud): ${summary.monthlyNetCashFlow.toFixed(2)} €`);
  lines.push(
    summary.availableMoney !== null
      ? `- Saadaval kasutada (jääk − eelseisvad arved): ${summary.availableMoney.toFixed(2)} €`
      : `- Saadaval kasutada: pole arvutatav (kontojääk puudub)`,
  );
  lines.push(`- Tulevaste arvete summa: ${summary.upcomingBillsTotal.toFixed(2)} €`);

  // ── Income this month by category ────────────────────────────────────────
  const thisMon = allTx.filter(tx => tx.date.startsWith(curMonth));
  const incomeList = thisMon.filter(tx => tx.type === "income");
  if (incomeList.length > 0) {
    lines.push(`\nTulud sel kuul (${incomeList.length} tehingut):`);
    const byCat: Record<string, number> = {};
    incomeList.forEach(tx => { byCat[tx.category] = (byCat[tx.category] ?? 0) + tx.amount; });
    Object.entries(byCat).forEach(([cat, amt]) =>
      lines.push(`  - ${cat}: ${amt.toFixed(2)} €`));
  }

  // ── Expenses this month by category ──────────────────────────────────────
  const expenseList = thisMon.filter(tx => tx.type === "expense");
  if (expenseList.length > 0) {
    lines.push(`\nKulud sel kuul (${expenseList.length} tehingut, suurimad kõigepealt):`);
    const byCat: Record<string, number> = {};
    expenseList.forEach(tx => { byCat[tx.category] = (byCat[tx.category] ?? 0) + tx.amount; });
    Object.entries(byCat)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => lines.push(`  - ${cat}: ${amt.toFixed(2)} €`));
  }

  // ── Savings this month ────────────────────────────────────────────────────
  const savingsList = thisMon.filter(tx => tx.type === "savings");
  if (savingsList.length > 0) {
    lines.push(`\nSäästmised sel kuul (${savingsList.length} tehingut):`);
    savingsList.forEach(tx =>
      lines.push(`  - ${tx.title}: ${tx.amount.toFixed(2)} €${tx.linkedGoalId ? ` (seotud eesmärgiga: ${tx.linkedGoalId})` : ""}`));
  }

  // ── All-time savings total ────────────────────────────────────────────────
  const totalSavingsAll = allTx.filter(tx => tx.type === "savings").reduce((s, tx) => s + tx.amount, 0);
  if (totalSavingsAll > 0) {
    lines.push(`\nKogu säästud (kõik ajad): ${totalSavingsAll.toFixed(2)} €`);
  }

  // ── Bills ─────────────────────────────────────────────────────────────────
  const overdue  = allBills.filter(b => b.status === "overdue").sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const upcoming = allBills.filter(b => b.status === "upcoming").sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  const paid     = allBills.filter(b => b.status === "paid");

  if (overdue.length > 0) {
    lines.push(`\nTähtaja ületanud arved (${overdue.length}):`);
    overdue.forEach(b =>
      lines.push(`  - ${b.title} — ${b.amount.toFixed(2)} € (tähtaeg: ${b.nextDueDate}, kategooria: ${b.category})`));
  }
  if (upcoming.length > 0) {
    lines.push(`\nTulevased maksmata arved (${upcoming.length}):`);
    upcoming.forEach(b =>
      lines.push(`  - ${b.title} — ${b.amount.toFixed(2)} € (tähtaeg: ${b.nextDueDate}, kategooria: ${b.category}${b.isRecurring ? ", korduv" : ""})`));
  }
  if (paid.length > 0) {
    lines.push(`\nMakstud arved sel perioodil: ${paid.length}`);
  }

  return `### Finantside\n${lines.join("\n")}`;
}

/**
 * Opt-in, sanitized diagnostic: logs id+title only for tasks/plans/goals —
 * never note/description/finance content — immediately before this exact
 * context is sent to the model. Off by default; enable in any browser
 * (including production) with:
 *   localStorage.setItem('kivora:debugAIContext', '1')
 * and disable again with .removeItem(...). Exists to answer, from the real
 * runtime, "what does buildAIContext() actually see right now" without
 * guessing from store/unit tests — see aiRequestPayloadIntegration.test.ts
 * for the equivalent proof against the actual request payload.
 */
function logAIContextDebugSummary(tasks: Task[], plans: Plan[], goals: Goal[]): void {
  try {
    if (typeof window === "undefined" || window.localStorage?.getItem("kivora:debugAIContext") !== "1") return;
    // eslint-disable-next-line no-console
    console.debug("[AI_CONTEXT_DEBUG]", {
      tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
      plans: plans.map((p) => ({ id: p.id, title: p.title })),
      goals: goals.map((g) => ({ id: g.id, title: g.title })),
    });
  } catch {
    // localStorage can throw (private browsing, disabled storage) — never
    // let a diagnostic break the actual context build.
  }
}

export function buildAIContext(lang: "et" | "en"): string {
  const modules = getModuleSettings();
  const sections: string[] = [];

  const liveTasks = getAllTasks();
  const livePlans = getAllPlans();
  const liveGoals = getAllGoals();
  logAIContextDebugSummary(liveTasks, livePlans, liveGoals);

  // Core modules — only include if enabled
  if (modules.calendar)  sections.push(buildCalendarSection(getAllEvents()));
  if (modules.tasks)     sections.push(buildTasksSection(liveTasks));
  if (modules.notes)     sections.push(buildNotesSection(getAllNotes()));
  if (modules.habits)    sections.push(buildHabitsSection(getAllHabits()));
  if (modules.goals)     sections.push(buildGoalsSection(liveGoals));
  if (modules.plans)     sections.push(buildPlansSection(livePlans));
  if (modules.finance)   sections.push(buildFinanceSection());
  if (modules.school)    sections.push(buildSchoolFromStore(lang));

  // Notifications are always present (not a toggleable module)
  sections.push(buildNotificationsSection());

  // Module-awareness note so the AI knows what is off
  const disabled = (["calendar","tasks","notes","habits","goals","plans","finance","school"] as const)
    .filter(m => !modules[m]);
  if (disabled.length > 0) {
    const disabledNote = lang === "en"
      ? `Note: the following modules are currently disabled by the user and must not be recommended or mentioned proactively: ${disabled.join(", ")}. The user's stored data for these modules is preserved but not shown here.`
      : `Märkus: järgmised moodulid on kasutaja poolt praegu keelatud ja neid ei tohi proaktiivselt soovitada ega mainida: ${disabled.join(", ")}. Nende moodulite andmed on salvestatud, kuid ei ole siin näidatud.`;
    sections.push(disabledNote);
  }

  const preamble = lang === "en"
    ? "This is an overview of the Kivora user's current data. Answer the user's questions based on this data only. Do not use general knowledge about the user's personal data. If a module has no entries, say so honestly — never invent data."
    : "See on Kivora kasutaja praegune andmete ülevaade. Vasta kasutaja küsimustele AINULT nende andmete põhjal. Ära kasuta oma üldisi teadmisi kasutaja isiklike andmete kohta. Kui moodulis pole kirjeid, ütle seda ausalt — ära kunagi mõtle andmeid välja.";

  return `${preamble}\n\n${sections.join("\n\n")}`;
}
