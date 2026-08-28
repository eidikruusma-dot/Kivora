import { useState, useEffect, useMemo } from "react";
import { useIsDark, darkBg, darkText } from "@/lib/themeColors";
import { useLocation } from "react-router-dom";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t } from "@/lib/translations";
import { toast } from "sonner";
import {
  Plus,
  Droplets,
  BookOpen,
  Moon,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Sparkles,
  Apple,
  PersonStanding,
  X,
  Check,
  Pencil,
  Pause,
  Play,
  Trash2,
  Settings2,
  Loader2,
  Repeat2,
  Flame,
  Briefcase,
  ChevronDown,
} from "lucide-react";
import {
  getCurrentWeekDays,
  getCurrentWeekDates,
  toDateKey,
  isDayMarkableForHabit,
  isHabitDoneOnDate,
  computeWeekStats,
  computeHabitStreak,
} from "@/data/habitsData";
import type { Habit, HabitStatus, HabitCategory } from "@/data/habitsData";
import { addWeeks, formatDaySingle } from "@/lib/calendar/dateUtils";
import {
  getAllHabits,
  addHabit,
  updateHabit,
  toggleHabitDay,
  setStatus,
  deleteHabit,
  subscribeHabits,
  useHabitsLoading,
} from "@/lib/habitsStore";
import LinkedItemsPanel from "@/components/links/LinkedItemsPanel";
import { removeLinksForEntity } from "@/lib/entityLinksStore";
import PostSaveLinkSuggestionsDialog from "@/components/links/PostSaveLinkSuggestionsDialog";
import AutoLinkToast from "@/components/links/AutoLinkToast";
import { runAutomaticLinking, type AutoLinkResult } from "@/lib/automaticLinking";

const ICON_MAP: Record<Habit["icon"], React.ReactNode> = {
  droplet: <Droplets size={18} strokeWidth={2} />,
  run: <PersonStanding size={18} strokeWidth={2} />,
  book: <BookOpen size={18} strokeWidth={2} />,
  meditation: <span style={{ fontSize: 17 }}>🧘</span>,
  apple: <Apple size={18} strokeWidth={2} />,
  moon: <Moon size={18} strokeWidth={2} />,
  flame: <Flame size={18} strokeWidth={2} />,
  briefcase: <Briefcase size={18} strokeWidth={2} />,
};

const ICON_OPTIONS: {
  id: Habit["icon"];
  label: string;
  node: React.ReactNode;
}[] = [
  { id: "droplet", label: "Vesi", node: <Droplets size={18} /> },
  { id: "run", label: "Jooks", node: <PersonStanding size={18} /> },
  { id: "book", label: "Lugemine", node: <BookOpen size={18} /> },
  {
    id: "meditation",
    label: "Meditatsioon",
    node: <span style={{ fontSize: 17 }}>🧘</span>,
  },
  { id: "apple", label: "Toit", node: <Apple size={18} /> },
  { id: "moon", label: "Uni", node: <Moon size={18} /> },
  { id: "flame", label: "Harjumus", node: <Flame size={18} /> },
  { id: "briefcase", label: "Töö", node: <Briefcase size={18} /> },
];

const COLOR_OPTIONS = [
  { color: "#6F5AE8", bg: "#EDE9FB" },
  { color: "#16A34A", bg: "#DCFCE7" },
  { color: "#2563EB", bg: "#DBEAFE" },
  { color: "#CA8A04", bg: "#FEF9C3" },
  { color: "#0D9488", bg: "#CCFBF1" },
  { color: "#DC2626", bg: "#FEE2E2" },
  { color: "#F97316", bg: "#FFF0E6" },
  { color: "#64748B", bg: "#F1F5F9" },
];

// Category → sensible default icon + color, reusing the existing COLOR_OPTIONS
// palette entries exactly (no new colors). Applied automatically in create
// mode only — see handleCategoryChange.
const CATEGORY_DEFAULTS: Record<HabitCategory, { icon: Habit["icon"]; iconColor: string; iconBg: string }> = {
  Isiklik: { icon: "flame", iconColor: COLOR_OPTIONS[0].color, iconBg: COLOR_OPTIONS[0].bg },
  Tervis:  { icon: "apple", iconColor: COLOR_OPTIONS[1].color, iconBg: COLOR_OPTIONS[1].bg },
  Töö:     { icon: "briefcase", iconColor: COLOR_OPTIONS[6].color, iconBg: COLOR_OPTIONS[6].bg },
  Kool:    { icon: "book", iconColor: COLOR_OPTIONS[2].color, iconBg: COLOR_OPTIONS[2].bg },
};

function DayDot({ done, color }: { done: boolean | null; color: string }) {
  const isDark = useIsDark();
  if (done === null) {
    return (
      <span className="text-xs text-[#CBD5E1] leading-none select-none">–</span>
    );
  }
  return (
    <div
      className="w-4 h-4 rounded-full"
      style={{ background: done ? color : (isDark ? '#263445' : '#E2E8F0') }}
    />
  );
}

interface HabitForm {
  title: string;
  description: string;
  category: HabitCategory;
  icon: Habit["icon"];
  iconColor: string;
  iconBg: string;
  goalPerDay: number;
  recurrence: "daily" | "weekdays" | "custom";
  customDays: boolean[];
  // Local form UI state only — never persisted to the habit model. Tracks
  // whether the user manually picked an icon/color so a later category
  // change (create mode only) doesn't silently overwrite their choice.
  iconCustomized: boolean;
  colorCustomized: boolean;
}

const EMPTY_FORM: HabitForm = {
  title: "",
  description: "",
  category: "Isiklik",
  icon: CATEGORY_DEFAULTS.Isiklik.icon,
  iconColor: CATEGORY_DEFAULTS.Isiklik.iconColor,
  iconBg: CATEGORY_DEFAULTS.Isiklik.iconBg,
  goalPerDay: 1,
  recurrence: "daily",
  customDays: [true, true, true, true, true, false, false],
  iconCustomized: false,
  colorCustomized: false,
};

export default function HabitsPage() {
  const [habits, setHabits] = useState<Habit[]>(getAllHabits());
  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);
  const isDark = useIsDark();

  // "Now", recomputed on every render — correct on open, after a refresh,
  // and if the tab is left open across midnight. Never a fixed/demo date.
  const today = new Date();

  // Prev/Next week navigation for the header band only — 0 = the real
  // current week. The sidebar's "This week" stat always reflects the real
  // current week regardless of weekOffset (see currentWeekDates below).
  const [weekOffset, setWeekOffset] = useState(0);
  const weekReferenceDate = addWeeks(today, weekOffset);
  const weekDates = getCurrentWeekDates(weekReferenceDate);
  const WEEK_DAYS = getCurrentWeekDays(weekReferenceDate);
  const weekTotals = computeWeekStats(habits, weekDates, today);

  const currentWeekDates = getCurrentWeekDates(today);
  const currentWeekTotals = computeWeekStats(habits, currentWeekDates, today);

  // Single in-flight guard shared by every day-toggle button on the page —
  // prevents a double click from firing a second overlapping Firestore
  // write while the first is still settling.
  const [pendingToggleKey, setPendingToggleKey] = useState<string | null>(null);

  const STATUS_LABEL_LANG: Record<HabitStatus, string> = {
    active: t("habits.status.active", lang),
    paused: t("habits.status.paused", lang),
    completed: t("habits.status.done", lang),
  };

  const CATEGORY_OPTIONS_LANG: { value: HabitCategory; label: string }[] = [
    { value: "Isiklik", label: t("cat.personal", lang) },
    { value: "Tervis", label: t("cat.health", lang) },
    { value: "Töö", label: t("cat.work", lang) },
    { value: "Kool", label: t("cat.school", lang) },
  ];

  const habitsLoading = useHabitsLoading();
  const [saving, setSaving] = useState(false);

  const [filter, setFilter] = useState<
    "all" | "active" | "paused" | "completed"
  >("all");

  // Create/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [postSave, setPostSave] = useState<{ type: 'habit'; id: string } | null>(null);
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null);
  const [form, setForm] = useState<HabitForm>(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  // Icon/color selectors start collapsed behind "Kohanda välimust" /
  // "Customize appearance" in both create and edit — one shared form, no
  // second modal.
  const [appearanceExpanded, setAppearanceExpanded] = useState(false);

  // Manage modal
  const [manageOpen, setManageOpen] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const location = useLocation();

  // Reset to default view whenever the user navigates to Habits
  useEffect(() => {
    setFilter("all");
    setManageOpen(false);
    setDeleteId(null);
    setWeekOffset(0);
  }, [location.key]);

  // Deep-link: highlight specific habit navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId;
    if (!openId) return;
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, "");
    setHighlightId(openId);
    setTimeout(() => {
      document
        .getElementById(`habit-card-${openId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    setTimeout(() => setHighlightId(null), 2500);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: open the create-habit form when navigated here with an
  // explicit signal (e.g. the "Minu päev" dashboard's empty-state CTA).
  // The signal is consumed once and cleared from history state so a
  // refresh, Back navigation, or later normal navigation to this page
  // never reopens the modal on its own.
  useEffect(() => {
    const openCreate = (location.state as { openCreate?: boolean } | null)?.openCreate;
    if (!openCreate) return;
    window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, "");
    openCreateModal();
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return subscribeHabits(() => {
      setHabits(getAllHabits());
    });
  }, []);

  // Close modals on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
        setManageOpen(false);
        setDeleteId(null);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const activeCount = habits.filter((h) => h.status === "active").length;
  const pausedCount = habits.filter((h) => h.status === "paused").length;
  const completedCount = habits.filter((h) => h.status === "completed").length;

  const filtered = habits.filter((h) => {
    if (filter === "active") return h.status === "active";
    if (filter === "paused") return h.status === "paused";
    if (filter === "completed") return h.status === "completed";
    return true;
  });

  const displayed = filtered;

  // Always the REAL current week's totals, regardless of weekOffset — "See
  // nädal" (this week) in the sidebar never changes while browsing other
  // weeks in the header band above.
  const weekDone = currentWeekTotals.reduce((s, d) => s + d.done, 0);
  const weekTotal = currentWeekTotals.reduce((s, d) => s + d.total, 0);
  const pct = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;

  // Streak is derived fresh from each habit's own completions — never a
  // separately-maintained counter that could drift out of sync with what's
  // actually stored.
  const habitStreaks = new Map(habits.map((h) => [h.id, computeHabitStreak(h, today)]));
  const streakOf = (h: Habit) => habitStreaks.get(h.id) ?? 0;

  const longestStreak = habits.reduce<Habit | null>((best, h) => {
    if (!best || streakOf(h) > streakOf(best)) return h;
    return best;
  }, null);

  const suurepärane = habits.filter(
    (h) => h.status === "active" && streakOf(h) >= 10,
  ).length;
  const hea = habits.filter(
    (h) => h.status === "active" && streakOf(h) >= 5 && streakOf(h) < 10,
  ).length;
  const vajab = habits.filter(
    (h) => h.status === "active" && streakOf(h) < 5,
  ).length;

  const circumference = 97.4;
  const suurOff = 0;
  const heaOff = (suurepärane / Math.max(activeCount, 1)) * circumference;
  const vajabOff = heaOff + (hea / Math.max(activeCount, 1)) * circumference;

  // Modal handlers
  const openCreateModal = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setAppearanceExpanded(false);
    setModalOpen(true);
  };

  const openEditModal = (habit: Habit) => {
    setEditingId(habit.id);
    const recurrence: HabitForm["recurrence"] = habit.weekDays.every(
      (d) => d === true,
    )
      ? "daily"
      : habit.weekDays.slice(0, 5).every((d) => d === true) &&
          habit.weekDays.slice(5).every((d) => d !== true)
        ? "weekdays"
        : "custom";
    setForm({
      title: habit.title,
      description: habit.description,
      category: habit.category,
      icon: habit.icon,
      iconColor: habit.iconColor,
      iconBg: habit.iconBg,
      goalPerDay: 1,
      recurrence,
      // Always "customized" in edit mode — not that it matters, since
      // handleCategoryChange never auto-applies defaults while editingId is
      // set; kept true here for consistency with that invariant.
      iconCustomized: true,
      colorCustomized: true,
      customDays: habit.weekDays.map((d) => d === true),
    });
    setFormError("");
    setAppearanceExpanded(false);
    setModalOpen(true);
  };

  // Category selection auto-applies a sensible default icon+color in create
  // mode only, and never overwrites a value the user already picked by hand.
  // In edit mode this never touches icon/color at all — opening or saving an
  // existing habit must never silently replace its appearance.
  const handleCategoryChange = (category: HabitCategory) => {
    if (editingId) {
      setForm({ ...form, category });
      return;
    }
    const defaults = CATEGORY_DEFAULTS[category];
    setForm({
      ...form,
      category,
      icon: form.iconCustomized ? form.icon : defaults.icon,
      iconColor: form.colorCustomized ? form.iconColor : defaults.iconColor,
      iconBg: form.colorCustomized ? form.iconBg : defaults.iconBg,
    });
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setFormError("Harjumuse nimi on kohustuslik.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        updateHabit(editingId, {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          icon: form.icon,
          iconColor: form.iconColor,
          iconBg: form.iconBg,
        });
        toast.success(lang === 'et' ? 'Harjumus uuendatud' : 'Habit updated');
      } else {
        const habit = await addHabit({
          title: form.title,
          description: form.description,
          category: form.category,
          icon: form.icon,
          iconColor: form.iconColor,
          iconBg: form.iconBg,
          recurrence: form.recurrence,
          customDays: form.customDays,
        });
        toast.success(lang === 'et' ? 'Harjumus salvestatud' : 'Habit saved');
        setPostSave({ type: 'habit', id: habit.id });
        runAutomaticLinking('habit', habit.id, lang, {
          title: habit.title,
          description: habit.description,
          category: habit.category,
        }).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) });
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      setFormError("");
      setEditingId(null);
      setAppearanceExpanded(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelForm = () => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setFormError("");
    setEditingId(null);
    setAppearanceExpanded(false);
  };

  // Sole entry point for marking/unmarking a habit done on a real calendar
  // date (identified by its local "YYYY-MM-DD" key). Guarded by
  // pendingToggleKey so a double click can't fire a second overlapping
  // Firestore write, and shows the existing generic error toast — reverting
  // to the store's own (already-rolled-back) state — if the write fails.
  const handleToggleDay = async (habitId: string, dateKey: string) => {
    if (pendingToggleKey) return;
    const key = `${habitId}:${dateKey}`;
    setPendingToggleKey(key);
    try {
      await toggleHabitDay(habitId, dateKey, today);
    } catch {
      toast.error(lang === 'et' ? 'Harjumuse märkimine ebaõnnestus' : 'Failed to update habit');
    } finally {
      setPendingToggleKey(null);
    }
  };

  const handlePause = (id: string) => {
    setStatus(id, "paused");
  };

  const handleResume = (id: string) => {
    setStatus(id, "active");
  };

  const handleDelete = (id: string) => {
    removeLinksForEntity('habit', id);
    deleteHabit(id);
    toast.success(lang === 'et' ? 'Harjumus kustutatud' : 'Habit deleted');
    setDeleteId(null);
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1A1F36]">
              {t("habits.title", lang)}
            </h1>
            <p className="text-sm text-[#64748B] mt-0.5">
              {t("habits.subtitle", lang)
                .replace("{n}", String(habits.length))
                .replace("{active}", String(activeCount))}
            </p>
          </div>
          <button
            className="flex items-center gap-2 px-4 py-2.5 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
            onClick={openCreateModal}
          >
            <Plus size={16} strokeWidth={2.5} />
            {t("habits.add", lang)}
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-[#ECECF2] w-fit">
          {(
            [
              {
                key: "all",
                label: t("habits.filter.all", lang).replace(
                  "{n}",
                  String(habits.length),
                ),
              },
              {
                key: "active",
                label: t("habits.filter.active", lang).replace(
                  "{active}",
                  String(activeCount),
                ),
              },
              {
                key: "paused",
                label: t("habits.filter.paused", lang).replace(
                  "{n}",
                  String(pausedCount),
                ),
              },
              {
                key: "completed",
                label: t("habits.filter.done", lang).replace(
                  "{n}",
                  String(completedCount),
                ),
              },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? "bg-[#EDE9FB] text-[#6F5AE8]"
                  : "text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Week view card */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              aria-label={lang === 'et' ? 'Eelmine nädal' : 'Previous week'}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] transition-colors flex-shrink-0"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex-1 grid grid-cols-7 gap-0.5 sm:gap-1">
              {WEEK_DAYS.map((wd, i) => {
                const date = weekDates[i];
                const dateKey = toDateKey(date);
                const todayKey = toDateKey(today);
                const { done, total } = weekTotals[i];
                const isPast = dateKey < todayKey;
                const isToday = dateKey === todayKey;
                const hasData = total > 0;
                // Any completion on a past/today day = fully completed circle
                const anyDone = done > 0;

                return (
                  <div
                    key={wd.short}
                    className={`flex flex-col items-center gap-1 sm:gap-2 py-2 sm:py-3 px-0.5 sm:px-1 rounded-xl transition-colors ${
                      isToday
                        ? "bg-[#F5F3FF] border border-[#C4B5FD]"
                        : isPast
                          ? "bg-[#FAFAF8]"
                          : ""
                    }`}
                  >
                    <span className="text-[11px] sm:text-xs font-semibold text-[#1A1F36]">
                      {wd.short}
                    </span>
                    <span className="text-[10px] text-[#94A3B8]">
                      {wd.date}
                    </span>

                    {/* Circle indicator */}
                    {hasData && (isPast || isToday) ? (
                      <div className="relative w-7 h-7 sm:w-9 sm:h-9">
                        {anyDone ? (
                          // Fully completed — solid purple circle with checkmark
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-[#6F5AE8] flex items-center justify-center">
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                        ) : (
                          // Nothing done yet — grey empty circle
                          <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full border-2 border-[#E2E8F0]" />
                        )}
                      </div>
                    ) : (
                      <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full border-2 border-dashed border-[#E2E8F0]" />
                    )}

                    {/* Count — only shown for past/today when there is something to count */}
                    {(isPast || isToday) && total > 0 ? (
                      <span className="text-[11px] text-[#64748B] font-medium">
                        {done}/{total}
                      </span>
                    ) : (
                      <span className="text-[11px] text-transparent font-medium select-none">·</span>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              aria-label={lang === 'et' ? 'Järgmine nädal' : 'Next week'}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] transition-colors flex-shrink-0"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Habits list */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] overflow-hidden">
          {displayed.map((habit, idx) => {
            return (
              <div
                key={habit.id}
                id={`habit-card-${habit.id}`}
                className={`flex items-center gap-4 px-5 py-4 hover:bg-[#FAFAF8] transition-all group ${
                  idx !== displayed.length - 1
                    ? "border-b border-[#F0F0F0]"
                    : ""
                } ${highlightId === habit.id ? "ring-2 ring-inset ring-[#6F5AE8] bg-[#F4F2FF]" : ""}`}
              >
                {/* Icon */}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: isDark ? darkBg(habit.iconBg) : habit.iconBg, color: isDark ? darkText(habit.iconColor) : habit.iconColor }}
                >
                  {ICON_MAP[habit.icon]}
                </div>

                {/* Title + description */}
                <div className="min-w-0 flex-1 md:flex-none md:w-44 md:flex-shrink-0">
                  <p className="text-sm font-semibold text-[#1A1F36] truncate">
                    {habit.title}
                  </p>
                  <p className="text-xs text-[#94A3B8] mt-0.5 truncate">
                    {habit.description}
                  </p>
                </div>

                {/* Streak — hidden on mobile, shown from md+ */}
                <div className="hidden md:block flex-shrink-0 w-24 text-center">
                  {habit.status === "paused" ? (
                    <>
                      <p className="text-sm font-bold text-[#94A3B8]">–</p>
                      <p className="text-xs text-[#94A3B8]">
                        {t("habits.streak.paused", lang)}
                      </p>
                    </>
                  ) : streakOf(habit) > 0 ? (
                    <>
                      <p className="text-sm font-bold text-[#1A1F36]">
                        {streakOf(habit)}
                      </p>
                      <p className="text-xs text-[#94A3B8]">
                        {t("habits.streak.days", lang)}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-[#94A3B8]">–</p>
                      <p className="text-xs text-[#94A3B8]">
                        {t("habits.streak.days", lang)}
                      </p>
                    </>
                  )}
                </div>

                {/* Week dots — hidden on mobile, shown from md+ */}
                <div className="hidden md:block flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    {WEEK_DAYS.map((wd) => (
                      <span
                        key={wd.short}
                        className="w-4 text-center text-[10px] text-[#94A3B8] font-medium"
                      >
                        {wd.short}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {weekDates.map((date) => {
                      const dateKey = toDateKey(date);
                      const markable = habit.status === "active" && isDayMarkableForHabit(habit, date, today);
                      const done = isHabitDoneOnDate(habit, date);
                      const pendingKey = `${habit.id}:${dateKey}`;
                      const dayLabel = formatDaySingle(date, lang);
                      return (
                        <div key={dateKey} className="w-4 flex items-center justify-center">
                          <button
                            type="button"
                            disabled={!markable || pendingToggleKey === pendingKey}
                            onClick={() => handleToggleDay(habit.id, dateKey)}
                            aria-pressed={done}
                            aria-label={`${habit.title} — ${dayLabel} — ${
                              done ? t("habits.day.unmark", lang) : t("habits.day.mark", lang)
                            }`}
                            className="w-4 h-4 flex items-center justify-center rounded-full bg-transparent border-0 p-0 disabled:cursor-default enabled:cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6F5AE8]/40"
                          >
                            <DayDot done={markable ? done : null} color={habit.iconColor} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            );
          })}
          {displayed.length === 0 && (
            <div className="py-14 px-6 text-center flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center">
                <Repeat2 size={20} className="text-[#94A3B8]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1A1F36]">
                  {t("habits.empty.title", lang)}
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  {t("habits.empty.body", lang)}
                </p>
              </div>
              <button
                onClick={openCreateModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#6F5AE8] text-white rounded-xl text-sm font-medium hover:bg-[#5B48D8] transition-colors shadow-sm"
              >
                <Plus size={14} />
                {lang === 'et' ? 'Lisa harjumus' : 'Add habit'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
        {/* Ülevaade */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {t("habits.overview.title", lang)}
          </h3>
          <div className="flex items-center gap-4">
            {/* Donut */}
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#F1F0EB"
                  strokeWidth="3.5"
                  className="kv-chart-track"
                />
                {/* Suurepärane */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#4ADE80"
                  strokeWidth="3.5"
                  strokeDasharray={`${(suurepärane / Math.max(activeCount, 1)) * circumference} ${circumference}`}
                  strokeDashoffset={-suurOff}
                  strokeLinecap="round"
                />
                {/* Hea */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="3.5"
                  strokeDasharray={`${(hea / Math.max(activeCount, 1)) * circumference} ${circumference}`}
                  strokeDashoffset={-heaOff}
                  strokeLinecap="round"
                />
                {/* Vajab */}
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  stroke="#FDE68A"
                  strokeWidth="3.5"
                  strokeDasharray={`${(vajab / Math.max(activeCount, 1)) * circumference} ${circumference}`}
                  strokeDashoffset={-vajabOff}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold text-[#1A1F36]">
                  {pct}%
                </span>
                <span className="text-[9px] text-[#94A3B8] -mt-0.5">
                  {t("habits.successRate", lang)}
                </span>
              </div>
            </div>

            {/* Legend + stats */}
            <div className="flex-1 flex flex-col gap-2">
              {[
                {
                  label: t("habits.quality.excellent", lang),
                  sub: "(80%+)",
                  color: "#4ADE80",
                  count: suurepärane,
                },
                {
                  label: t("habits.quality.good", lang),
                  sub: "(50-79%)",
                  color: "#3B82F6",
                  count: hea,
                },
                {
                  label: t("habits.quality.needsWork", lang),
                  sub: "(<50%)",
                  color: "#FDE68A",
                  count: vajab,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: row.color }}
                    />
                    <span className="text-[#64748B]">{row.label}</span>
                    <span className="text-[#94A3B8]">{row.sub}</span>
                  </div>
                  <span className="font-semibold text-[#1A1F36]">
                    {row.count}
                  </span>
                </div>
              ))}
              <div className="pt-1 border-t border-[#F4F4F0]">
                <p className="text-xs font-semibold text-[#1A1F36]">
                  {t("habits.thisWeek", lang)}: {weekDone}/{weekTotal}
                </p>
                <p className="text-[10px] text-[#94A3B8]">
                  {t("habits.allAvg", lang)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pikim seeria */}
        {longestStreak && streakOf(longestStreak) > 0 && (
          <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
            <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
              {t("habits.streak.title", lang)}
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#FEF9C3] flex items-center justify-center flex-shrink-0">
                <Trophy
                  size={22}
                  style={{ color: isDark ? "#FCD34D" : "#CA8A04" }}
                  strokeWidth={1.8}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-[#1A1F36]">
                  {streakOf(longestStreak)} {t("habits.streak.days", lang)}
                </p>
                <p className="text-xs text-[#64748B]">{longestStreak.title}</p>
                <p className="text-xs text-[#94A3B8]">
                  {longestStreak.category}
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-[#94A3B8] flex-shrink-0"
              />
            </div>
          </div>
        )}

        {/* Harjumused breakdown */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {t("habits.breakdown.title", lang)}
          </h3>
          <div className="flex flex-col gap-2">
            {[
              {
                label: t("habits.breakdown.active", lang),
                count: activeCount,
                color: "#4ADE80",
              },
              {
                label: t("habits.breakdown.paused", lang),
                count: pausedCount,
                color: "#FDE68A",
              },
              {
                label: t("habits.breakdown.done", lang),
                count: completedCount,
                color: "#CBD5E1",
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: row.color }}
                  />
                  <span className="text-[#64748B]">{row.label}</span>
                </div>
                <span className="font-semibold text-[#1A1F36]">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setManageOpen(true)}
            className="mt-3 pt-3 border-t border-[#F4F4F0] w-full flex items-center justify-between text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
          >
            {t("habits.manage", lang)}
            <ChevronRight size={14} />
          </button>
        </div>

        {/* AI placeholder — no real AI yet */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} strokeWidth={1.8} className="text-[#6F5AE8] flex-shrink-0" />
            <h3 className="text-sm font-semibold text-[#1A1F36]">
              {lang === 'et' ? 'Personaliseeritud nõuanded tulemas' : 'Personalized insights coming soon'}
            </h3>
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            {lang === 'et'
              ? 'Kivora õpib sinu harjumusi, ülesandeid, eesmärke ja rutiine. Personaliseeritud soovitused ilmuvad automaatselt, kui piisavalt andmeid on kogutud.'
              : 'Kivora is learning about your habits, tasks, goals and routines. Personalized recommendations will appear automatically once enough information has been collected.'}
          </p>
        </div>
      </aside>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15, 23, 42, 0.4)" }}
          onClick={handleCancelForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="habit-modal-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] flex-shrink-0">
              <h2 id="habit-modal-title" className="text-base font-semibold text-[#1A1F36]">
                {editingId
                  ? t("habits.modal.editTitle", lang)
                  : t("habits.modal.addTitle", lang)}
              </h2>
              <button
                onClick={handleCancelForm}
                aria-label="Close"
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form body — the only scrolling region inside the dialog */}
            <div className="px-5 py-4 flex flex-col gap-4 min-h-0 flex-1 overflow-y-auto">
              {/* Name */}
              <div>
                <label htmlFor="habit-modal-input" className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("habits.modal.nameLabel", lang)}{" "}
                  <span className="text-[#E11D48]">*</span>
                </label>
                <input
                  id="habit-modal-input"
                  type="text"
                  value={form.title}
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value });
                    setFormError("");
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSave() }}
                  placeholder={t("habits.modal.namePlaceholder", lang)}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("habits.modal.descLabel", lang)}
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  placeholder={t("habits.modal.descPlaceholder", lang)}
                  className="w-full px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("habits.modal.categoryLabel", lang)}
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS_LANG.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => handleCategoryChange(cat.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.category === cat.value
                          ? "bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]/30"
                          : "bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collapsed by default — reveals the Icon + Color selectors below */}
              <button
                type="button"
                onClick={() => setAppearanceExpanded((v) => !v)}
                aria-expanded={appearanceExpanded}
                className="flex items-center gap-1.5 self-start text-sm font-medium text-[#6F5AE8] hover:text-[#5B48D8] transition-colors"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${appearanceExpanded ? "rotate-180" : ""}`}
                />
                {t("habits.modal.customizeAppearance", lang)}
              </button>

              {appearanceExpanded && (
                <>
                  {/* Icon */}
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                      {t("habits.modal.iconLabel", lang)}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ICON_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => setForm({ ...form, icon: opt.id, iconCustomized: true })}
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                            form.icon === opt.id
                              ? "bg-[#EDE9FB] border border-[#6F5AE8]/30"
                              : "habit-icon-btn bg-white border border-[#ECECF2] hover:bg-[#F8F7F4]"
                          }`}
                          style={
                            form.icon === opt.id
                              ? { color: form.iconColor }
                              : { color: "#64748B" }
                          }
                        >
                          {opt.node}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                      {t("habits.modal.colorLabel", lang)}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((c) => (
                        <button
                          key={c.color}
                          onClick={() =>
                            setForm({ ...form, iconColor: c.color, iconBg: c.bg, colorCustomized: true })
                          }
                          className={`w-8 h-8 rounded-full transition-transform ${
                            form.iconColor === c.color
                              ? "ring-2 ring-offset-2 ring-[#1A1F36] scale-110"
                              : "hover:scale-110"
                          }`}
                          style={{ background: c.color }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Goal per day */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("habits.modal.goalLabel", lang)}
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.goalPerDay}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      goalPerDay: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-24 px-3 py-2 bg-white border border-[#ECECF2] rounded-lg text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:ring-2 focus:ring-[#EDE9FB] transition-colors"
                />
              </div>

              {/* Recurrence */}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("habits.modal.recurrenceLabel", lang)}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { key: "daily", label: t("habits.modal.daily", lang) },
                      {
                        key: "weekdays",
                        label: t("habits.modal.weekdays", lang),
                      },
                      { key: "custom", label: t("habits.modal.custom", lang) },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setForm({ ...form, recurrence: opt.key })}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        form.recurrence === opt.key
                          ? "bg-[#EDE9FB] text-[#6F5AE8] border border-[#6F5AE8]/30"
                          : "bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4] hover:text-[#1A1F36]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {form.recurrence === "custom" && (
                  <div className="flex gap-1.5 mt-2">
                    {WEEK_DAYS.map((wd, i) => (
                      <button
                        key={wd.short}
                        onClick={() => {
                          const next = [...form.customDays];
                          next[i] = !next[i];
                          setForm({ ...form, customDays: next });
                        }}
                        className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                          form.customDays[i]
                            ? "bg-[#6F5AE8] text-white"
                            : "bg-white text-[#64748B] border border-[#ECECF2] hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {wd.short}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-sm text-[#E11D48]">{formError}</p>
              )}

              {editingId && (
                <LinkedItemsPanel
                  type="habit"
                  entityId={editingId}
                  lang={lang}
                />
              )}
            </div>

            {/* Footer — flex-shrink-0, never scrolls, always visible */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#F4F4F0] flex-shrink-0">
              <button
                onClick={handleCancelForm}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors disabled:opacity-50"
              >
                {t("habits.modal.cancel", lang)}
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {t("habits.modal.save", lang)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage modal */}
      {manageOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15, 23, 42, 0.4)" }}
          onClick={() => setManageOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-habits-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F4F4F0] sticky top-0 bg-white">
              <div className="flex items-center gap-2">
                <Settings2 size={16} className="text-[#6F5AE8]" />
                <h2 id="manage-habits-title" className="text-base font-semibold text-[#1A1F36]">
                  {t("habits.manage.title", lang)}
                </h2>
              </div>
              <button
                onClick={() => setManageOpen(false)}
                aria-label="Close"
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#94A3B8] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-2">
              {habits.map((habit) => {
                const todayKey = toDateKey(today);
                const markableToday = habit.status === "active" && isDayMarkableForHabit(habit, today, today);
                const doneToday = isHabitDoneOnDate(habit, today);
                return (
                <div
                  key={habit.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-[#ECECF2] hover:bg-[#FAFAF8] transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: isDark ? darkBg(habit.iconBg) : habit.iconBg, color: isDark ? darkText(habit.iconColor) : habit.iconColor }}
                  >
                    {ICON_MAP[habit.icon]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1F36] truncate">
                      {habit.title}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {STATUS_LABEL_LANG[habit.status]}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleDay(habit.id, todayKey)}
                      disabled={!markableToday || pendingToggleKey === `${habit.id}:${todayKey}`}
                      aria-pressed={doneToday}
                      aria-label={`${habit.title} — ${formatDaySingle(today, lang)} — ${
                        doneToday ? t("habits.day.unmark", lang) : t("habits.day.mark", lang)
                      }`}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-default ${
                        doneToday
                          ? "text-[#16A34A] bg-[#DCFCE7] hover:bg-[#BBF7D0]"
                          : "text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#16A34A]"
                      }`}
                      title={doneToday ? t("habits.menu.cancelToday", lang) : t("habits.menu.markDone", lang)}
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => openEditModal(habit)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#6F5AE8] transition-colors"
                      title="Muuda"
                    >
                      <Pencil size={14} />
                    </button>
                    {habit.status === "paused" ? (
                      <button
                        onClick={() => handleResume(habit.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#16A34A] transition-colors"
                        title={t("habits.menu.resume", lang)}
                      >
                        <Play size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => handlePause(habit.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#CA8A04] transition-colors"
                        title={t("habits.menu.pause", lang)}
                      >
                        <Pause size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteId(habit.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748B] hover:bg-[#FEF2F2] hover:text-[#E11D48] transition-colors"
                      title={t("habits.menu.delete", lang)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                );
              })}
              {habits.length === 0 && (
                <p className="text-sm text-[#94A3B8] py-6 text-center">
                  {t("habits.manage.empty", lang)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15, 23, 42, 0.4)" }}
          onClick={() => setDeleteId(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-habit-title"
            className="kv-modal-enter bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-3">
                <Trash2 size={20} className="text-[#E11D48]" />
              </div>
              <h3 id="delete-habit-title" className="text-base font-semibold text-[#1A1F36] mb-1">
                {t("habits.deleteConfirm.title", lang)}
              </h3>
              <p className="text-sm text-[#64748B]">
                {t("habits.deleteConfirm.body", lang)}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 px-5 py-4 border-t border-[#F4F4F0]">
              <button
                onClick={() => setDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#64748B] hover:bg-[#F8F7F4] hover:text-[#1A1F36] transition-colors"
              >
                {t("habits.deleteConfirm.cancel", lang)}
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-[#E11D48] hover:bg-[#BE123C] transition-colors shadow-sm"
              >
                {t("habits.deleteConfirm.confirm", lang)}
              </button>
            </div>
          </div>
        </div>
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
