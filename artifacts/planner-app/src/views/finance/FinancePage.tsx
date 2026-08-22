/**
 * FinancePage.tsx  –  Kivora Money
 *
 * Complete Finance overview, pixel-matched to the approved reference.
 * All text uses the translation system. Live data from Firestore stores.
 * No hardcoded strings, no demo data, no donut charts.
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Receipt,
  Plus,
  Minus,
  Zap,
  Home,
  Shield,
  RefreshCw,
  Car,
  Heart,
  BookOpen,
  Landmark,
  ShoppingCart,
  Music,
  Shirt,
  Circle,
  ChevronDown,
  ArrowRight,
  Info,
  X,
  Check,
  Trash2,
  Pencil,
  Sparkles,
  FileUp,
  Loader2,
} from "lucide-react";
import { t } from "@/lib/translations";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { useIsDark, darkBg, darkText } from "@/lib/themeColors";
import Card from "@/components/ui/AppCard";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTasks, toggleTask } from "@/lib/tasksStore";
import { useCalendarEvents } from "@/lib/calendarStore";
import { getEventsForDate } from "@/lib/calendar/eventLayout";
import { useGoals } from "@/lib/goalsStore";
import {
  useTransactions,
  useBills,
  useMonthlyBudget,
  addTransaction,
  addBill,
  updateTransaction,
  updateBill,
  deleteTransaction,
  deleteBill,
  markBillPaid,
  computeNextDueDate,
} from "@/lib/moneyStore";
import type {
  Transaction,
  Bill,
  TransactionCategory,
  BillCategory,
  RecurringInterval,
} from "@/types/money";
import type { Priority } from "@/types";
import type { BankTransaction, BankMeta } from "@/types/bank";
import MoneyImportReviewCard from "@/components/MoneyImportReviewCard";
import {
  resolveIncomeCategory,
  resolveExpenseCategory,
  findMoneyDuplicate,
} from "@/lib/aiActions";
import { bankTransactionToTransaction } from "@/lib/bankImportMapping";

// ─────────────────────────────────────────────────────────────────────────────
// Date & number helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthISO(offset = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthLabel(lang: AppLang): string {
  return new Date().toLocaleDateString(lang === "et" ? "et-EE" : "en-GB", {
    month: "long",
    year: "numeric",
  });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

function formatEuro(n: number): string {
  return (
    new Intl.NumberFormat("et-EE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + " €"
  );
}

function formatDateLabel(dateStr: string, lang: AppLang): string {
  const today = todayISO();
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  if (dateStr === today) return lang === "et" ? "Täna" : "Today";
  if (dateStr === yesterday) return lang === "et" ? "Eile" : "Yesterday";
  return new Date(dateStr).toLocaleDateString(
    lang === "et" ? "et-EE" : "en-GB",
    {
      day: "numeric",
      month: "short",
    },
  );
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Category styling
// ─────────────────────────────────────────────────────────────────────────────

const TX_BG: Partial<Record<TransactionCategory, string>> = {
  income: "#DCFCE7",
  utilities: "#FEF9C3",
  clothing: "#CCFBF1",
  other: "#F1F5F9",
  salary: "#DCFCE7",
  benefits: "#D1FAE5",
  "side-income": "#DCFCE7",
  refund: "#E0F2FE",
  gift: "#FCE7F3",
  sale: "#FEF3C7",
  "other-income": "#F1F5F9",
  food: "#FEF3C7",
  transport: "#DBEAFE",
  housing: "#EDE9FB",
  "children-family": "#FDF4FF",
  health: "#FEE2E2",
  education: "#E0E7FF",
  shopping: "#CCFBF1",
  entertainment: "#FCE7F3",
  subscriptions: "#F0FDF4",
  debt: "#FEF9C3",
  "insurance-tx": "#DBEAFE",
  pets: "#FEF3C7",
  travel: "#E0E7FF",
  "other-expense": "#F1F5F9",
  savings: "#D1FAE5",
};

function txBg(cat: TransactionCategory, isDark = false): string {
  const bg = TX_BG[cat] ?? "#F1F5F9";
  return isDark ? darkBg(bg) : bg;
}

const TX_COLOR: Partial<Record<TransactionCategory, string>> = {
  income: "#16A34A",
  utilities: "#CA8A04",
  clothing: "#0D9488",
  other: "#64748B",
  salary: "#16A34A",
  benefits: "#059669",
  "side-income": "#16A34A",
  refund: "#0284C7",
  gift: "#DB2777",
  sale: "#D97706",
  "other-income": "#64748B",
  food: "#D97706",
  transport: "#2563EB",
  housing: "#7C3AED",
  "children-family": "#9333EA",
  health: "#DC2626",
  education: "#4F46E5",
  shopping: "#0D9488",
  entertainment: "#DB2777",
  subscriptions: "#16A34A",
  debt: "#CA8A04",
  "insurance-tx": "#2563EB",
  pets: "#D97706",
  travel: "#4F46E5",
  "other-expense": "#64748B",
  savings: "#059669",
};

function txColor(cat: TransactionCategory, isDark = false): string {
  const c = TX_COLOR[cat] ?? "#64748B";
  return isDark ? darkText(c) : c;
}

function TxIcon({ cat, size = 15 }: { cat: TransactionCategory; size?: number }) {
  switch (cat) {
    case "income":
    case "salary":
    case "side-income":
    case "other-income":
      return <TrendingUp size={size} />;
    case "utilities":
      return <Zap size={size} />;
    case "clothing":
      return <Shirt size={size} />;
    case "benefits":
      return <Shield size={size} />;
    case "refund":
    case "subscriptions":
      return <RefreshCw size={size} />;
    case "gift":
    case "children-family":
    case "health":
    case "pets":
      return <Heart size={size} />;
    case "sale":
    case "food":
    case "shopping":
      return <ShoppingCart size={size} />;
    case "transport":
    case "travel":
      return <Car size={size} />;
    case "housing":
      return <Home size={size} />;
    case "education":
      return <BookOpen size={size} />;
    case "entertainment":
      return <Music size={size} />;
    case "debt":
      return <Landmark size={size} />;
    case "insurance-tx":
      return <Shield size={size} />;
    case "savings":
      return <PiggyBank size={size} />;
    default:
      return <Circle size={size} />;
  }
}

const BILL_BG: Partial<Record<BillCategory, string>> = {
  utilities: "#FEF9C3",
  housing: "#EDE9FB",
  insurance: "#DBEAFE",
  subscription: "#F0FDF4",
  transport: "#DBEAFE",
  health: "#FEE2E2",
  education: "#E0E7FF",
  loan: "#FEF3C7",
  other: "#F1F5F9",
  electricity: "#FEF9C3",
  water: "#E0F2FE",
  heating: "#FEF3C7",
  rent: "#EDE9FB",
  "home-loan": "#FEF3C7",
  waste: "#F0FDF4",
  "home-insurance": "#DBEAFE",
  mobile: "#F0FDF4",
  internet: "#E0F2FE",
  tv: "#FCE7F3",
  "internet-tv": "#E0F2FE",
  "car-lease": "#DBEAFE",
  "car-insurance": "#DBEAFE",
  parking: "#FEF3C7",
  "public-transport": "#E0E7FF",
  streaming: "#FCE7F3",
  "music-sub": "#FCE7F3",
  "cloud-storage": "#E0F2FE",
  "software-sub": "#E0E7FF",
  "other-sub": "#F1F5F9",
  kindergarten: "#FDF4FF",
  "school-bill": "#E0E7FF",
  hobby: "#FDF4FF",
  childcare: "#FDF4FF",
  "loan-payment": "#FEF3C7",
  "credit-card": "#FEE2E2",
  tax: "#FEF9C3",
  "other-bill": "#F1F5F9",
};

function billBg(cat: BillCategory, isDark = false): string {
  const bg = BILL_BG[cat] ?? "#F1F5F9";
  return isDark ? darkBg(bg) : bg;
}

const BILL_COLOR: Partial<Record<BillCategory, string>> = {
  utilities: "#CA8A04",
  housing: "#7C3AED",
  insurance: "#2563EB",
  subscription: "#16A34A",
  transport: "#2563EB",
  health: "#DC2626",
  education: "#4F46E5",
  loan: "#D97706",
  other: "#64748B",
  electricity: "#CA8A04",
  water: "#0284C7",
  heating: "#D97706",
  rent: "#7C3AED",
  "home-loan": "#D97706",
  waste: "#16A34A",
  "home-insurance": "#2563EB",
  mobile: "#16A34A",
  internet: "#0284C7",
  tv: "#DB2777",
  "internet-tv": "#0284C7",
  "car-lease": "#2563EB",
  "car-insurance": "#2563EB",
  parking: "#D97706",
  "public-transport": "#4F46E5",
  streaming: "#DB2777",
  "music-sub": "#DB2777",
  "cloud-storage": "#0284C7",
  "software-sub": "#4F46E5",
  "other-sub": "#64748B",
  kindergarten: "#9333EA",
  "school-bill": "#4F46E5",
  hobby: "#9333EA",
  childcare: "#9333EA",
  "loan-payment": "#D97706",
  "credit-card": "#DC2626",
  tax: "#CA8A04",
  "other-bill": "#64748B",
};

function billColor(cat: BillCategory, isDark = false): string {
  const c = BILL_COLOR[cat] ?? "#64748B";
  return isDark ? darkText(c) : c;
}

function BillIcon({ cat, size = 14 }: { cat: BillCategory; size?: number }) {
  switch (cat) {
    case "utilities":
    case "electricity":
    case "water":
    case "heating":
    case "mobile":
    case "internet":
    case "internet-tv":
      return <Zap size={size} />;
    case "housing":
    case "rent":
    case "home-loan":
      return <Home size={size} />;
    case "insurance":
    case "home-insurance":
      return <Shield size={size} />;
    case "subscription":
    case "waste":
      return <RefreshCw size={size} />;
    case "transport":
    case "car-lease":
    case "car-insurance":
    case "parking":
    case "public-transport":
      return <Car size={size} />;
    case "health":
    case "kindergarten":
    case "hobby":
    case "childcare":
      return <Heart size={size} />;
    case "education":
    case "cloud-storage":
    case "software-sub":
    case "school-bill":
      return <BookOpen size={size} />;
    case "loan":
    case "loan-payment":
    case "credit-card":
    case "tax":
      return <Landmark size={size} />;
    case "tv":
    case "streaming":
    case "music-sub":
      return <Music size={size} />;
    default:
      return <Circle size={size} />;
  }
}

function priorityDot(priority: Priority, isDark = false): string {
  if (!isDark) {
    const LIGHT: Record<Priority, string> = {
      high: "#F97316",
      medium: "#FBBF24",
      low: "#CBD5E1",
    };
    return LIGHT[priority];
  }
  if (priority === "high") return "#F97316";
  if (priority === "medium") return "#FBBF24";
  return "#4A607A";
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Transaction Modal
// ─────────────────────────────────────────────────────────────────────────────

interface AddTxProps {
  type: "income" | "expense" | "savings";
  open: boolean;
  onClose: () => void;
  lang: AppLang;
  allGoals: ReturnType<typeof useGoals>;
}

function AddTransactionModal({
  type,
  open,
  onClose,
  lang,
  allGoals,
}: AddTxProps) {
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TransactionCategory>(
    type === "income" ? "salary" : type === "savings" ? "savings" : "food",
  );
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [linkedGoalId, setLinkedGoalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; title?: string }>({});

  useEffect(() => {
    if (open) {
      setAmount("");
      setTitle("");
      setCategory(
        type === "income" ? "salary" : type === "savings" ? "savings" : "food",
      );
      setDate(todayISO());
      setNote("");
      setLinkedGoalId("");
      setErrors({});
    }
  }, [open, type]);

  const savingsGoals = allGoals.filter((g) => g.icon === "money");
  const incomeCats: TransactionCategory[] = [
    "salary",
    "benefits",
    "side-income",
    "refund",
    "gift",
    "sale",
    "other-income",
  ];
  const expenseCats: TransactionCategory[] = [
    "food",
    "housing",
    "transport",
    "children-family",
    "health",
    "education",
    "shopping",
    "entertainment",
    "subscriptions",
    "debt",
    "insurance-tx",
    "pets",
    "travel",
    "other-expense",
  ];
  const cats: TransactionCategory[] =
    type === "income"
      ? incomeCats
      : type === "savings"
        ? ["savings"]
        : expenseCats;

  const modalTitle =
    type === "income"
      ? t("finance.modal.addIncome", lang)
      : type === "expense"
        ? t("finance.modal.addExpense", lang)
        : t("finance.modal.addSavings", lang);

  const isDark = useIsDark();
  const accentColor = isDark
    ? type === "income"
      ? "#5EF294"
      : type === "expense"
        ? "#FF8585"
        : "#95A0FF"
    : type === "income"
      ? "#16A34A"
      : type === "expense"
        ? "#DC2626"
        : "#6F5AE8";

  async function handleSave() {
    const errs: typeof errors = {};
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amt) || amt <= 0)
      errs.amount = t("finance.modal.amountRequired", lang);
    if (!title.trim()) errs.title = t("finance.modal.titleRequired", lang);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await addTransaction({
        id: generateId("tx"),
        type:
          type === "savings"
            ? "savings"
            : type === "income"
              ? "income"
              : "expense",
        amount: amt,
        currency: "EUR",
        title: title.trim(),
        category,
        date,
        note: note.trim() || undefined,
        linkedGoalId:
          type === "savings" && linkedGoalId ? linkedGoalId : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const inp =
    "w-full rounded-xl border border-[#E8ECF0] px-3 py-2.5 text-sm text-[#1A1F36] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6F5AE8]/30 focus:border-[#6F5AE8] bg-white transition-colors";
  const lbl = "block text-xs font-semibold text-[#475569] mb-1.5";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden">
        <div className="h-1 w-full" style={{ backgroundColor: accentColor }} />
        <div className="p-6">
          <DialogHeader className="mb-5">
            <DialogTitle className="text-[15px] font-bold text-[#1A1F36]">
              {modalTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={lbl}>
                {t("finance.modal.titleLabel", lang)}
              </label>
              <input
                type="text"
                placeholder={
                  lang === "et"
                    ? "nt Palk, Selver..."
                    : "e.g. Salary, Grocery..."
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inp}
              />
              {errors.title && (
                <p className="text-xs text-red-500 mt-1">{errors.title}</p>
              )}
            </div>
            <div>
              <label className={lbl}>{t("finance.modal.amount", lang)}</label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inp + " pr-7"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#94A3B8]">
                  €
                </span>
              </div>
              {errors.amount && (
                <p className="text-xs text-red-500 mt-1">{errors.amount}</p>
              )}
            </div>
            {cats.length > 1 && (
              <div>
                <label className={lbl}>
                  {t("finance.modal.category", lang)}
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as TransactionCategory)
                  }
                  className={inp}
                >
                  {cats.map((c) => (
                    <option key={c} value={c}>
                      {t(("finance.cat." + c) as Parameters<typeof t>[0], lang)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={lbl}>{t("finance.modal.date", lang)}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>{t("finance.modal.note", lang)}</label>
              <input
                type="text"
                placeholder={
                  lang === "et" ? "Valikuline märkus..." : "Optional note..."
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inp}
              />
            </div>
            {type === "savings" && savingsGoals.length > 0 && (
              <div>
                <label className={lbl}>{t("finance.modal.goal", lang)}</label>
                <select
                  value={linkedGoalId}
                  onChange={(e) => setLinkedGoalId(e.target.value)}
                  className={inp}
                >
                  <option value="">{t("finance.modal.noGoal", lang)}</option>
                  {savingsGoals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2.5 mt-6">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FB] transition-colors"
            >
              {t("finance.modal.cancel", lang)}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ backgroundColor: accentColor }}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {saving
                ? t("finance.modal.saving", lang)
                : t("finance.modal.save", lang)}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Add Bill Modal
// ─────────────────────────────────────────────────────────────────────────────

function AddBillModal({
  open,
  onClose,
  lang,
}: {
  open: boolean;
  onClose: () => void;
  lang: AppLang;
}) {
  const isDark = useIsDark();
  const [billTitle, setBillTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<BillCategory>("electricity");
  const [dueDay, setDueDay] = useState("1");
  const [isRecurring, setIsRecurring] = useState(true);
  const [recInterval, setRecInterval] = useState<RecurringInterval>("monthly");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; title?: string }>({});

  useEffect(() => {
    if (open) {
      setBillTitle("");
      setAmount("");
      setCategory("electricity");
      setDueDay("1");
      setIsRecurring(true);
      setRecInterval("monthly");
      setNote("");
      setErrors({});
    }
  }, [open]);

  const billCats: BillCategory[] = [
    "electricity",
    "water",
    "heating",
    "rent",
    "home-loan",
    "waste",
    "home-insurance",
    "mobile",
    "internet-tv",
    "car-lease",
    "car-insurance",
    "parking",
    "public-transport",
    "streaming",
    "music-sub",
    "cloud-storage",
    "software-sub",
    "other-sub",
    "kindergarten",
    "school-bill",
    "hobby",
    "childcare",
    "loan-payment",
    "credit-card",
    "tax",
    "other-bill",
  ];

  async function handleSave() {
    const errs: typeof errors = {};
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amt) || amt <= 0)
      errs.amount = t("finance.modal.amountRequired", lang);
    if (!billTitle.trim()) errs.title = t("finance.modal.titleRequired", lang);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const day = Math.min(Math.max(parseInt(dueDay, 10) || 1, 1), 31);
      await addBill({
        id: generateId("bill"),
        title: billTitle.trim(),
        amount: amt,
        currency: "EUR",
        category,
        dueDay: day,
        nextDueDate: computeNextDueDate(day),
        status: "upcoming",
        isRecurring,
        recurringInterval: isRecurring ? recInterval : undefined,
        note: note.trim() || undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const inp =
    "w-full rounded-xl border border-[#E8ECF0] px-3 py-2.5 text-sm text-[#1A1F36] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6F5AE8]/30 focus:border-[#6F5AE8] bg-white transition-colors";
  const lbl = "block text-xs font-semibold text-[#475569] mb-1.5";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl p-0 flex flex-col overflow-hidden">
        <div
          className="h-1 w-full flex-shrink-0"
          style={{ backgroundColor: isDark ? "#FF872A" : "#F97316" }}
        />
        <div className="flex-1 overflow-y-auto px-6 pt-6 pb-2">
          <DialogHeader className="mb-5">
            <DialogTitle className="text-[15px] font-bold text-[#1A1F36]">
              {t("finance.modal.addBill", lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={lbl}>
                {t("finance.modal.titleLabel", lang)}
              </label>
              <input
                type="text"
                placeholder={
                  lang === "et"
                    ? "nt Elektriarve, Internet..."
                    : "e.g. Electricity, Internet..."
                }
                value={billTitle}
                onChange={(e) => setBillTitle(e.target.value)}
                className={inp}
              />
              {errors.title && (
                <p className="text-xs text-red-500 mt-1">{errors.title}</p>
              )}
            </div>
            <div>
              <label className={lbl}>{t("finance.modal.amount", lang)}</label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={inp + " pr-7"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-[#94A3B8]">
                  €
                </span>
              </div>
              {errors.amount && (
                <p className="text-xs text-red-500 mt-1">{errors.amount}</p>
              )}
            </div>
            <div>
              <label className={lbl}>{t("finance.modal.category", lang)}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as BillCategory)}
                className={inp}
              >
                {billCats.map((c) => (
                  <option key={c} value={c}>
                    {t(
                      ("finance.billcat." + c) as Parameters<typeof t>[0],
                      lang,
                    )}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>{t("finance.modal.dueDay", lang)}</label>
              <input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>{t("finance.modal.note", lang)}</label>
              <input
                type="text"
                placeholder={
                  lang === "et" ? "Valikuline märkus..." : "Optional note..."
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#6F5AE8]"
                />
                <span className="text-sm text-[#475569]">
                  {t("finance.modal.recurring", lang)}
                </span>
              </label>
            </div>
            {isRecurring && (
              <div>
                <label className={lbl}>
                  {t("finance.modal.recurringInterval", lang)}
                </label>
                <select
                  value={recInterval}
                  onChange={(e) =>
                    setRecInterval(e.target.value as RecurringInterval)
                  }
                  className={inp}
                >
                  <option value="monthly">
                    {t("finance.modal.monthly", lang)}
                  </option>
                  <option value="quarterly">
                    {t("finance.modal.quarterly", lang)}
                  </option>
                  <option value="yearly">
                    {t("finance.modal.yearly", lang)}
                  </option>
                </select>
              </div>
            )}
          </div>
        </div>
        <div className="px-6 pb-5 pt-3 flex-shrink-0 border-t border-[#F1F5F9]">
          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FB] transition-colors"
            >
              {t("finance.modal.cancel", lang)}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-[#F97316] py-2.5 text-sm font-semibold text-white hover:bg-[#EA6C09] disabled:opacity-60 transition-colors"
            >
              {saving
                ? t("finance.modal.saving", lang)
                : t("finance.modal.save", lang)}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// All Transactions Modal (with Bulk Clear)
// ─────────────────────────────────────────────────────────────────────────────

function AllTransactionsModal({
  transactions,
  initialFilter,
  lang,
  onClose,
  onSelect,
  onDeleteAll,
}: {
  transactions: Transaction[];
  initialFilter: "all" | "income" | "expense" | "savings";
  lang: AppLang;
  onClose: () => void;
  onSelect: (tx: Transaction) => void;
  onDeleteAll: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<
    "all" | "income" | "expense" | "savings"
  >(initialFilter);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);

  const isDark = useIsDark();

  const sorted = useMemo(
    () =>
      [...transactions]
        .filter((tx) => filter === "all" || tx.type === filter)
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
        ),
    [transactions, filter],
  );

  const filterTabs: {
    key: "all" | "income" | "expense" | "savings";
    label: [string, string];
  }[] = [
    { key: "all", label: ["Kõik", "All"] },
    { key: "income", label: ["Tulud", "Income"] },
    { key: "expense", label: ["Kulud", "Expenses"] },
    { key: "savings", label: ["Säästud", "Savings"] },
  ];

  async function handleClear() {
    setClearing(true);
    await onDeleteAll();
    setClearing(false);
    setConfirmClearAll(false);
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg rounded-2xl p-0 overflow-hidden flex flex-col bg-white border-0 shadow-xl"
        style={{ maxHeight: "80vh" }}
      >
        <div className="h-1 w-full bg-[#6F5AE8] flex-shrink-0" />
        <div className="px-6 pt-5 pb-2 flex items-center justify-between flex-shrink-0">
          <DialogTitle className="text-[15px] font-bold text-[#1A1F36]">
            {lang === "et" ? "Kõik tehingud" : "All Transactions"}
          </DialogTitle>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#64748B] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 pb-3 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex gap-1.5 flex-wrap">
            {filterTabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1 rounded-full text-[12px] font-semibold transition-colors ${
                  filter === key
                    ? "bg-[#6F5AE8] text-white"
                    : "bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]"
                }`}
              >
                {lang === "et" ? label[0] : label[1]}
              </button>
            ))}
          </div>

          {transactions.length > 0 && !confirmClearAll && (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="text-[11px] font-semibold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={12} />
              {lang === "et" ? "Tühjenda kõik" : "Clear all"}
            </button>
          )}
        </div>

        {confirmClearAll && (
          <div className="mx-6 mb-3 p-3 bg-red-50 rounded-xl border border-red-100 flex items-center justify-between gap-3">
            <p className="text-xs text-red-600 font-medium">
              {lang === "et"
                ? "Kas kustutada kõik tehingud?"
                : "Delete all transactions?"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClearAll(false)}
                className="px-2.5 py-1 text-xs font-semibold bg-white border border-[#E8ECF0] text-[#64748B] rounded-lg"
              >
                {lang === "et" ? "Ei" : "No"}
              </button>
              <button
                onClick={handleClear}
                disabled={clearing}
                className="px-2.5 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {clearing ? "..." : lang === "et" ? "Jah, kustuta" : "Yes, delete"}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-5 min-h-0">
          {sorted.length === 0 ? (
            <p className="text-[13px] text-[#94A3B8] py-8 text-center">
              {lang === "et" ? "Tehinguid ei ole." : "No transactions."}
            </p>
          ) : (
            <ul className="space-y-1">
              {sorted.map((tx) => (
                <li
                  key={tx.id}
                  onClick={() => onSelect(tx)}
                  className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-[#F8F9FB] cursor-pointer transition-colors"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: txBg(tx.category, isDark),
                      color: txColor(tx.category, isDark),
                    }}
                  >
                    <TxIcon cat={tx.category} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A1F36] truncate">
                      {tx.title}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] truncate">
                      {t(
                        ("finance.cat." + tx.category) as Parameters<
                          typeof t
                        >[0],
                        lang,
                      )}
                      {" · "}
                      {formatDateLabel(tx.date, lang)}
                    </p>
                  </div>
                  <p
                    className="text-[13px] font-bold flex-shrink-0 tabular-nums"
                    style={{
                      color:
                        tx.type === "income"
                          ? "#16A34A"
                          : tx.type === "savings"
                            ? "#6F5AE8"
                            : "#DC2626",
                    }}
                  >
                    {tx.type === "income"
                      ? "+"
                      : tx.type === "savings"
                        ? "~"
                        : "−"}
                    {formatEuro(tx.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Detail Modal
// ─────────────────────────────────────────────────────────────────────────────

function TransactionDetailModal({
  tx,
  lang,
  onClose,
  onDelete,
  allGoals,
}: {
  tx: Transaction;
  lang: AppLang;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  allGoals: ReturnType<typeof useGoals>;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState(String(tx.amount));
  const [title, setTitle] = useState(tx.title);
  const [category, setCategory] = useState<TransactionCategory>(tx.category);
  const [date, setDate] = useState(tx.date);
  const [note, setNote] = useState(tx.note ?? "");
  const [linkedGoalId, setLinkedGoalId] = useState(tx.linkedGoalId ?? "");
  const [errors, setErrors] = useState<{ amount?: string; title?: string }>({});

  const isDark = useIsDark();
  const typeColor = isDark
    ? tx.type === "income"
      ? "#4ADE80"
      : tx.type === "savings"
        ? "#818CF8"
        : "#F87171"
    : tx.type === "income"
      ? "#16A34A"
      : tx.type === "savings"
        ? "#6F5AE8"
        : "#DC2626";
  const typeLabel =
    lang === "et"
      ? tx.type === "income"
        ? "Tulu"
        : tx.type === "savings"
          ? "Sääst"
          : "Kulu"
      : tx.type === "income"
        ? "Income"
        : tx.type === "savings"
          ? "Savings"
          : "Expense";

  const savingsGoals = allGoals.filter((g) => g.icon === "money");
  const linkedGoal = allGoals.find((g) => g.id === tx.linkedGoalId);
  const incomeCats2: TransactionCategory[] = [
    "salary",
    "benefits",
    "side-income",
    "refund",
    "gift",
    "sale",
    "other-income",
  ];
  const expenseCats: TransactionCategory[] = [
    "food",
    "housing",
    "transport",
    "children-family",
    "health",
    "education",
    "shopping",
    "entertainment",
    "subscriptions",
    "debt",
    "insurance-tx",
    "pets",
    "travel",
    "other-expense",
  ];
  const cats: TransactionCategory[] =
    tx.type === "income"
      ? incomeCats2
      : tx.type === "savings"
        ? ["savings"]
        : expenseCats;

  function enterEdit() {
    setAmount(String(tx.amount));
    setTitle(tx.title);
    setCategory(tx.category);
    setDate(tx.date);
    setNote(tx.note ?? "");
    setLinkedGoalId(tx.linkedGoalId ?? "");
    setErrors({});
    setMode("edit");
  }

  async function handleSave() {
    const errs: { amount?: string; title?: string } = {};
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amt) || amt <= 0)
      errs.amount = t("finance.modal.amountRequired", lang);
    if (!title.trim()) errs.title = t("finance.modal.titleRequired", lang);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      await updateTransaction(tx.id, {
        amount: amt,
        title: title.trim(),
        category,
        date,
        note: note.trim() || undefined,
        linkedGoalId:
          tx.type === "savings" && linkedGoalId ? linkedGoalId : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(tx.id);
  }

  const inp =
    "w-full rounded-xl border border-[#E8ECF0] px-3 py-2.5 text-sm text-[#1A1F36] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6F5AE8]/30 focus:border-[#6F5AE8] bg-white transition-colors";
  const lbl = "block text-xs font-semibold text-[#475569] mb-1.5";

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl p-0 overflow-hidden bg-white border-0 shadow-xl">
        <div
          className="h-1 w-full flex-shrink-0"
          style={{ backgroundColor: typeColor }}
        />
        <div className="p-6 bg-white">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-wider mb-1"
                style={{ color: typeColor }}
              >
                {typeLabel}
              </p>
              <p className="text-[24px] font-bold text-[#1A1F36] tabular-nums leading-none">
                {tx.type === "income" ? "+" : tx.type === "savings" ? "~" : "−"}
                {formatEuro(tx.amount)}
              </p>
              <p className="text-[14px] text-[#64748B] mt-0.5">{tx.title}</p>
            </div>
            <button
              onClick={onClose}
              className="text-[#94A3B8] hover:text-[#64748B] transition-colors mt-1"
            >
              <X size={16} />
            </button>
          </div>

          {mode === "view" ? (
            <>
              <div className="space-y-2.5 mb-5">
                <div className="flex justify-between gap-4">
                  <p className="text-[12px] text-[#94A3B8]">
                    {lang === "et" ? "Kategooria" : "Category"}
                  </p>
                  <p className="text-[12px] font-semibold text-[#1A1F36]">
                    {t(
                      ("finance.cat." + tx.category) as Parameters<typeof t>[0],
                      lang,
                    )}
                  </p>
                </div>
                <div className="flex justify-between gap-4">
                  <p className="text-[12px] text-[#94A3B8]">
                    {lang === "et" ? "Kuupäev" : "Date"}
                  </p>
                  <p className="text-[12px] font-semibold text-[#1A1F36]">
                    {new Date(tx.date).toLocaleDateString(
                      lang === "et" ? "et-EE" : "en-GB",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>
                {linkedGoal && (
                  <div className="flex justify-between gap-4">
                    <p className="text-[12px] text-[#94A3B8]">
                      {lang === "et" ? "Eesmärk" : "Goal"}
                    </p>
                    <p className="text-[12px] font-semibold text-[#1A1F36]">
                      {linkedGoal.title}
                    </p>
                  </div>
                )}
                {tx.note && (
                  <div className="flex justify-between gap-4">
                    <p className="text-[12px] text-[#94A3B8] flex-shrink-0">
                      {lang === "et" ? "Märkus" : "Note"}
                    </p>
                    <p className="text-[12px] font-semibold text-[#1A1F36] text-right">
                      {tx.note}
                    </p>
                  </div>
                )}
              </div>

              {confirmDel ? (
                <div className="space-y-2">
                  <p className="text-[13px] text-[#DC2626] font-semibold text-center">
                    {lang === "et"
                      ? "Kustutan tehingu. Oled kindel?"
                      : "Delete this transaction. Are you sure?"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDel(false)}
                      className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FB] transition-colors"
                    >
                      {lang === "et" ? "Tühista" : "Cancel"}
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                    >
                      {deleting ? "..." : lang === "et" ? "Kustuta" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={enterEdit}
                    className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#1A1F36] hover:bg-[#F8F9FB] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Pencil size={13} />
                    {lang === "et" ? "Muuda" : "Edit"}
                  </button>
                  <button
                    onClick={() => setConfirmDel(true)}
                    className="flex-1 rounded-xl border border-red-100 bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Trash2 size={13} />
                    {lang === "et" ? "Kustuta" : "Delete"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="space-y-3.5 mb-5">
                <div>
                  <label className={lbl}>
                    {t("finance.modal.titleLabel", lang)}
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className={inp}
                  />
                  {errors.title && (
                    <p className="text-xs text-red-500 mt-1">{errors.title}</p>
                  )}
                </div>
                <div>
                  <label className={lbl}>{t("finance.modal.amount", lang)}</label>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={inp + " pr-7"}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                      €
                    </span>
                  </div>
                  {errors.amount && (
                    <p className="text-xs text-red-500 mt-1">{errors.amount}</p>
                  )}
                </div>
                {cats.length > 1 && (
                  <div>
                    <label className={lbl}>
                      {t("finance.modal.category", lang)}
                    </label>
                    <select
                      value={category}
                      onChange={(e) =>
                        setCategory(e.target.value as TransactionCategory)
                      }
                      className={inp}
                    >
                      {cats.map((c) => (
                        <option key={c} value={c}>
                          {t(
                            ("finance.cat." + c) as Parameters<typeof t>[0],
                            lang,
                          )}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className={lbl}>{t("finance.modal.date", lang)}</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={inp}
                  />
                </div>
                <div>
                  <label className={lbl}>{t("finance.modal.note", lang)}</label>
                  <input
                    type="text"
                    placeholder={
                      lang === "et"
                        ? "Valikuline märkus..."
                        : "Optional note..."
                    }
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className={inp}
                  />
                </div>
                {tx.type === "savings" && savingsGoals.length > 0 && (
                  <div>
                    <label className={lbl}>
                      {t("finance.modal.goal", lang)}
                    </label>
                    <select
                      value={linkedGoalId}
                      onChange={(e) => setLinkedGoalId(e.target.value)}
                      className={inp}
                    >
                      <option value="">
                        {t("finance.modal.noGoal", lang)}
                      </option>
                      {savingsGoals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setMode("view");
                    setErrors({});
                  }}
                  className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FB] transition-colors"
                >
                  {t("finance.modal.cancel", lang)}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ backgroundColor: typeColor }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                >
                  {saving
                    ? t("finance.modal.saving", lang)
                    : t("finance.modal.save", lang)}
                </button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// All Bills Modal
// ─────────────────────────────────────────────────────────────────────────────

function AllBillsModal({
  bills,
  lang,
  onClose,
  onSelect,
}: {
  bills: Bill[];
  lang: AppLang;
  onClose: () => void;
  onSelect: (bill: Bill) => void;
}) {
  const isDark = useIsDark();

  const sorted = useMemo(
    () => [...bills].sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
    [bills],
  );

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent
        className="max-w-lg rounded-2xl p-0 overflow-hidden flex flex-col bg-white border-0 shadow-xl"
        style={{ maxHeight: "80vh" }}
      >
        <div
          className="h-1 w-full flex-shrink-0"
          style={{ backgroundColor: isDark ? "#FF872A" : "#F97316" }}
        />
        <div className="px-6 pt-5 pb-4 flex items-center justify-between flex-shrink-0">
          <DialogTitle className="text-[15px] font-bold text-[#1A1F36]">
            {lang === "et" ? "Kõik arved" : "All Bills"}
          </DialogTitle>
          <button
            onClick={onClose}
            className="text-[#94A3B8] hover:text-[#64748B] transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 pb-5 min-h-0">
          {sorted.length === 0 ? (
            <p className="text-[13px] text-[#94A3B8] py-8 text-center">
              {lang === "et" ? "Arveid ei ole." : "No bills."}
            </p>
          ) : (
            <ul className="space-y-1">
              {sorted.map((bill) => {
                const days = daysUntil(bill.nextDueDate);
                const isOverdue = bill.status === "overdue" || days < 0;
                const badgeColor = isOverdue
                  ? isDark
                    ? "#F87171"
                    : "#DC2626"
                  : days <= 3
                    ? isDark
                      ? "#FB923C"
                      : "#EA580C"
                    : days <= 7
                      ? isDark
                        ? "#FCD34D"
                        : "#D97706"
                      : days <= 14
                        ? isDark
                          ? "#86EFAC"
                          : "#65A30D"
                        : isDark
                          ? "#8B9EB5"
                          : "#64748B";
                const badgeBg = isOverdue
                  ? isDark
                    ? "#200A0A"
                    : "#FEF2F2"
                  : days <= 3
                    ? isDark
                      ? "#1F1007"
                      : "#FFF7ED"
                    : days <= 7
                      ? isDark
                        ? "#1F1507"
                        : "#FEFCE8"
                      : days <= 14
                        ? isDark
                          ? "#0A1F14"
                          : "#F0FDF4"
                        : isDark
                          ? "#1A2332"
                          : "#F8F9FB";
                const daysLabel = isOverdue
                  ? t("finance.bills.overdue", lang)
                  : days === 0
                    ? t("finance.bills.dueToday", lang)
                    : days === 1
                      ? t("finance.bills.dueTomorrow", lang)
                      : `${days} ${t("finance.bills.days", lang)}`;
                return (
                  <li
                    key={bill.id}
                    onClick={() => onSelect(bill)}
                    className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-[#F8F9FB] cursor-pointer transition-colors"
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: billBg(bill.category, isDark),
                        color: billColor(bill.category, isDark),
                      }}
                    >
                      <BillIcon cat={bill.category} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#1A1F36] truncate">
                        {bill.title}
                      </p>
                      <p className="text-[11px] text-[#94A3B8]">
                        {new Date(bill.nextDueDate).toLocaleDateString(
                          lang === "et" ? "et-EE" : "en-GB",
                          {
                            day: "numeric",
                            month: "long",
                          },
                        )}
                        {bill.isRecurring &&
                          ` · ${lang === "et" ? "Korduv" : "Recurring"}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <p className="text-[13px] font-bold text-[#1A1F36] tabular-nums">
                        {formatEuro(bill.amount)}
                      </p>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                        style={{ color: badgeColor, backgroundColor: badgeBg }}
                      >
                        {daysLabel}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bill Detail Modal
// ─────────────────────────────────────────────────────────────────────────────

function BillDetailModal({
  bill,
  lang,
  onClose,
  onDelete,
  onMarkPaid,
}: {
  bill: Bill;
  lang: AppLang;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onMarkPaid: (id: string) => Promise<void>;
}) {
  const navigate = useNavigate();
  const allCalEvents = useCalendarEvents();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [billTitle, setBillTitle] = useState(bill.title);
  const [amount, setAmount] = useState(String(bill.amount));
  const [category, setCategory] = useState<BillCategory>(bill.category);
  const [dueDay, setDueDay] = useState(String(bill.dueDay));
  const [isRecurring, setIsRecurring] = useState(bill.isRecurring);
  const [recInterval, setRecInterval] = useState<RecurringInterval>(
    bill.recurringInterval ?? "monthly",
  );
  const [note, setNote] = useState(bill.note ?? "");
  const [errors, setErrors] = useState<{ amount?: string; title?: string }>({});

  const linkedCalEvent = bill.calendarEventId
    ? (allCalEvents.find((e) => e.id === bill.calendarEventId) ?? null)
    : null;

  const isDark = useIsDark();
  const days = daysUntil(bill.nextDueDate);
  const isOverdue = bill.status === "overdue" || days < 0;
  const badgeColor = isOverdue
    ? isDark
      ? "#F87171"
      : "#DC2626"
    : days <= 3
      ? isDark
        ? "#FB923C"
        : "#EA580C"
      : days <= 7
        ? isDark
          ? "#FCD34D"
          : "#D97706"
        : isDark
          ? "#8B9EB5"
          : "#64748B";
  const badgeBg = isOverdue
    ? isDark
      ? "#200A0A"
      : "#FEF2F2"
    : days <= 3
      ? isDark
        ? "#1F1007"
        : "#FFF7ED"
      : days <= 7
        ? isDark
          ? "#1F1507"
          : "#FEFCE8"
        : isDark
          ? "#1A2332"
          : "#F8F9FB";
  const daysLabel = isOverdue
    ? t("finance.bills.overdue", lang)
    : days === 0
      ? t("finance.bills.dueToday", lang)
      : days === 1
        ? t("finance.bills.dueTomorrow", lang)
        : `${days} ${t("finance.bills.days", lang)}`;

  const billCats: BillCategory[] = [
    "electricity",
    "water",
    "heating",
    "rent",
    "home-loan",
    "waste",
    "home-insurance",
    "mobile",
    "internet-tv",
    "car-lease",
    "car-insurance",
    "parking",
    "public-transport",
    "streaming",
    "music-sub",
    "cloud-storage",
    "software-sub",
    "other-sub",
    "kindergarten",
    "school-bill",
    "hobby",
    "childcare",
    "loan-payment",
    "credit-card",
    "tax",
    "other-bill",
  ];

  function enterEdit() {
    setBillTitle(bill.title);
    setAmount(String(bill.amount));
    setCategory(bill.category);
    setDueDay(String(bill.dueDay));
    setIsRecurring(bill.isRecurring);
    setRecInterval(bill.recurringInterval ?? "monthly");
    setNote(bill.note ?? "");
    setErrors({});
    setMode("edit");
  }

  async function handleSave() {
    const errs: { amount?: string; title?: string } = {};
    const amt = parseFloat(amount.replace(",", "."));
    if (!amount || isNaN(amt) || amt <= 0)
      errs.amount = t("finance.modal.amountRequired", lang);
    if (!billTitle.trim()) errs.title = t("finance.modal.titleRequired", lang);
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const day = Math.min(Math.max(parseInt(dueDay, 10) || 1, 1), 31);
      await updateBill(bill.id, {
        title: billTitle.trim(),
        amount: amt,
        category,
        dueDay: day,
        nextDueDate: computeNextDueDate(day),
        isRecurring,
        recurringInterval: isRecurring ? recInterval : undefined,
        note: note.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete(bill.id);
  }
  async function handleMarkPaid() {
    setPaying(true);
    await onMarkPaid(bill.id);
  }

  const inp =
    "w-full rounded-xl border border-[#E8ECF0] px-3 py-2.5 text-sm text-[#1A1F36] placeholder-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#6F5AE8]/30 focus:border-[#6F5AE8] bg-white transition-colors";
  const lbl = "block text-xs font-semibold text-[#475569] mb-1.5";

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-sm rounded-2xl p-0 flex flex-col overflow-hidden bg-white border-0 shadow-xl">
        <div
          className="h-1 w-full flex-shrink-0"
          style={{ backgroundColor: isDark ? "#FF872A" : "#F97316" }}
        />
        <div className="px-6 pt-6 pb-3 flex-shrink-0 bg-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: billBg(bill.category, isDark),
                  color: billColor(bill.category, isDark),
                }}
              >
                <BillIcon cat={bill.category} size={17} />
              </div>
              <div>
                <p className="text-[15px] font-bold text-[#1A1F36]">
                  {bill.title}
                </p>
                <p className="text-[22px] font-bold tabular-nums leading-tight text-[#1A1F36]">
                  {formatEuro(bill.amount)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-[#94A3B8] hover:text-[#64748B] transition-colors mt-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2 bg-white">
          {mode === "view" ? (
            <>
              <span
                className="inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-full mb-4"
                style={{ color: badgeColor, backgroundColor: badgeBg }}
              >
                {daysLabel}
              </span>
              <div className="space-y-2.5 mb-2">
                <div className="flex justify-between gap-4">
                  <p className="text-[12px] text-[#94A3B8]">
                    {lang === "et" ? "Kategooria" : "Category"}
                  </p>
                  <p className="text-[12px] font-semibold text-[#1A1F36]">
                    {t(
                      ("finance.billcat." + bill.category) as Parameters<
                        typeof t
                      >[0],
                      lang,
                    )}
                  </p>
                </div>
                <div className="flex justify-between gap-4">
                  <p className="text-[12px] text-[#94A3B8]">
                    {lang === "et" ? "Maksetähtaeg" : "Due date"}
                  </p>
                  <p className="text-[12px] font-semibold text-[#1A1F36]">
                    {new Date(bill.nextDueDate).toLocaleDateString(
                      lang === "et" ? "et-EE" : "en-GB",
                      {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      },
                    )}
                  </p>
                </div>
                <div className="flex justify-between gap-4">
                  <p className="text-[12px] text-[#94A3B8]">
                    {lang === "et" ? "Staatus" : "Status"}
                  </p>
                  <p className="text-[12px] font-semibold text-[#1A1F36]">
                    {bill.status === "paid"
                      ? lang === "et"
                        ? "Makstud"
                        : "Paid"
                      : bill.status === "overdue"
                        ? lang === "et"
                          ? "Tähtaeg möödas"
                          : "Overdue"
                        : lang === "et"
                          ? "Ootel"
                          : "Upcoming"}
                  </p>
                </div>
                {bill.isRecurring && bill.recurringInterval && (
                  <div className="flex justify-between gap-4">
                    <p className="text-[12px] text-[#94A3B8]">
                      {lang === "et" ? "Korduvus" : "Recurrence"}
                    </p>
                    <p className="text-[12px] font-semibold text-[#1A1F36]">
                      {bill.recurringInterval === "monthly"
                        ? lang === "et"
                          ? "Igakuine"
                          : "Monthly"
                        : bill.recurringInterval === "quarterly"
                          ? lang === "et"
                            ? "Kord kvartalis"
                            : "Quarterly"
                          : lang === "et"
                            ? "Igaaastane"
                            : "Yearly"}
                    </p>
                  </div>
                )}
                {bill.note && (
                  <div className="flex justify-between gap-4">
                    <p className="text-[12px] text-[#94A3B8] flex-shrink-0">
                      {lang === "et" ? "Märkus" : "Note"}
                    </p>
                    <p className="text-[12px] font-semibold text-[#1A1F36] text-right">
                      {bill.note}
                    </p>
                  </div>
                )}
                <div className="flex justify-between items-center gap-4">
                  <p className="text-[12px] text-[#94A3B8] flex-shrink-0">
                    {lang === "et" ? "Kalender" : "Calendar"}
                  </p>
                  {linkedCalEvent ? (
                    <button
                      onClick={() => {
                        onClose();
                        navigate("/app/calendar");
                      }}
                      className="text-[12px] font-semibold text-[#6F5AE8] hover:underline flex items-center gap-1"
                    >
                      {lang === "et"
                        ? "Vaata kalendris →"
                        : "Open in Calendar →"}
                    </button>
                  ) : (
                    <p className="text-[12px] font-semibold text-[#94A3B8]">
                      —
                    </p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-3.5 pt-1">
              <div>
                <label className={lbl}>
                  {t("finance.modal.titleLabel", lang)}
                </label>
                <input
                  type="text"
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  className={inp}
                />
                {errors.title && (
                  <p className="text-xs text-red-500 mt-1">{errors.title}</p>
                )}
              </div>
              <div>
                <label className={lbl}>{t("finance.modal.amount", lang)}</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className={inp + " pr-7"}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[#94A3B8]">
                    €
                  </span>
                </div>
                {errors.amount && (
                  <p className="text-xs text-red-500 mt-1">{errors.amount}</p>
                )}
              </div>
              <div>
                <label className={lbl}>
                  {t("finance.modal.category", lang)}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as BillCategory)}
                  className={inp}
                >
                  {billCats.map((c) => (
                    <option key={c} value={c}>
                      {t(
                        ("finance.billcat." + c) as Parameters<typeof t>[0],
                        lang,
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>{t("finance.modal.dueDay", lang)}</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={dueDay}
                  onChange={(e) => setDueDay(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>{t("finance.modal.note", lang)}</label>
                <input
                  type="text"
                  placeholder={
                    lang === "et" ? "Valikuline märkus..." : "Optional note..."
                  }
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inp}
                />
              </div>
              <div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#6F5AE8]"
                  />
                  <span className="text-sm text-[#475569]">
                    {t("finance.modal.recurring", lang)}
                  </span>
                </label>
              </div>
              {isRecurring && (
                <div>
                  <label className={lbl}>
                    {t("finance.modal.recurringInterval", lang)}
                  </label>
                  <select
                    value={recInterval}
                    onChange={(e) =>
                      setRecInterval(e.target.value as RecurringInterval)
                    }
                    className={inp}
                  >
                    <option value="monthly">
                      {t("finance.modal.monthly", lang)}
                    </option>
                    <option value="quarterly">
                      {t("finance.modal.quarterly", lang)}
                    </option>
                    <option value="yearly">
                      {t("finance.modal.yearly", lang)}
                    </option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 pb-5 pt-3 flex-shrink-0 border-t border-[#F1F5F9] bg-white">
          {mode === "view" ? (
            confirmDel ? (
              <div className="space-y-2">
                <p className="text-[13px] text-[#DC2626] font-semibold text-center">
                  {lang === "et"
                    ? "Kustutan arve. Oled kindel?"
                    : "Delete this bill. Are you sure?"}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDel(false)}
                    className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FB] transition-colors"
                  >
                    {lang === "et" ? "Tühista" : "Cancel"}
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                  >
                    {deleting ? "..." : lang === "et" ? "Kustuta" : "Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={enterEdit}
                    className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#1A1F36] hover:bg-[#F8F9FB] transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Pencil size={13} />
                    {lang === "et" ? "Muuda" : "Edit"}
                  </button>
                  {bill.status !== "paid" && (
                    <button
                      onClick={handleMarkPaid}
                      disabled={paying}
                      className="flex-1 rounded-xl bg-[#6F5AE8] py-2.5 text-sm font-semibold text-white hover:bg-[#5D4AD0] disabled:opacity-60 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Check size={13} />
                      {paying
                        ? lang === "et"
                          ? "Märgin..."
                          : "Marking..."
                        : lang === "et"
                          ? "Makstud"
                          : "Mark paid"}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDel(true)}
                  className="w-full rounded-xl border border-red-100 bg-red-50 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={13} />
                  {lang === "et" ? "Kustuta arve" : "Delete bill"}
                </button>
              </div>
            )
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMode("view");
                  setErrors({});
                }}
                className="flex-1 rounded-xl border border-[#E8ECF0] py-2.5 text-sm font-semibold text-[#64748B] hover:bg-[#F8F9FB] transition-colors"
              >
                {t("finance.modal.cancel", lang)}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-[#F97316] py-2.5 text-sm font-semibold text-white hover:bg-[#EA6C09] disabled:opacity-60 transition-colors"
              >
                {saving
                  ? t("finance.modal.saving", lang)
                  : t("finance.modal.save", lang)}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main BankImportModal
// ─────────────────────────────────────────────────────────────────────────────

type BankImportPhase =
  | "idle"
  | "uploading"
  | "reviewing"
  | "importing"
  | "done"
  | "error";

interface BankImportModalState {
  phase: BankImportPhase;
  transactions: BankTransaction[] | null;
  bankMeta: BankMeta | null;
  errorMessage: string | null;
  resultSummary: string | null;
  isRevalidating: boolean;
  revalidateError: string | null;
}

const INITIAL_BANK_IMPORT: BankImportModalState = {
  phase: "idle",
  transactions: null,
  bankMeta: null,
  errorMessage: null,
  resultSummary: null,
  isRevalidating: false,
  revalidateError: null,
};

function BankImportModal({
  lang,
  onClose,
}: {
  lang: AppLang;
  onClose: () => void;
}) {
  const et = lang === "et";
  const [state, setState] = useState<BankImportModalState>(INITIAL_BANK_IMPORT);

  async function handleFile(file: File) {
    const nameLower = file.name.toLowerCase();
    const isCsv =
      nameLower.endsWith(".csv") ||
      file.type === "text/csv" ||
      file.type === "text/plain";
    const isXlsx =
      nameLower.endsWith(".xlsx") ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const isXls =
      nameLower.endsWith(".xls") ||
      file.type === "application/vnd.ms-excel";
    const isPdf =
      nameLower.endsWith(".pdf") || file.type === "application/pdf";

    if (!isCsv && !isXlsx && !isXls && !isPdf) {
      setState((s) => ({
        ...s,
        phase: "error",
        errorMessage: et
          ? "Palun vali CSV-, Excel- või PDF-fail (.csv, .xlsx, .xls, .pdf)."
          : "Please select a CSV, Excel, or PDF file (.csv, .xlsx, .xls, .pdf).",
      }));
      return;
    }

    if (!Number.isFinite(file.size) || file.size <= 0) {
      setState((s) => ({
        ...s,
        phase: "error",
        errorMessage: et
          ? "Valitud fail on tühi (0 baiti). Vali fail uuesti."
          : "The selected file is empty (0 bytes). Please select the file again.",
      }));
      return;
    }

    setState((s) => ({ ...s, phase: "uploading", errorMessage: null }));
    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const res = await fetch("/api/ai/bank-import", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          body.error ??
            (et ? "Faili töötlemine ebaõnnestus." : "Failed to process file."),
        );
      }
      const data = (await res.json()) as {
        transactions: BankTransaction[];
        bankMeta: BankMeta;
      };
      if (!data.transactions?.length) {
        throw new Error(
          et
            ? "Tehinguid ei leitud."
            : "No transactions found in this statement.",
        );
      }
      setState((s) => ({
        ...s,
        phase: "reviewing",
        transactions: data.transactions,
        bankMeta: data.bankMeta,
      }));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : et
            ? "Viga faili lugemisel."
            : "Error reading file.";
      setState((s) => ({ ...s, phase: "error", errorMessage: msg }));
    }
  }

  async function editTransactionDirection(
    id: string,
    newDirection: "income" | "expense",
  ) {
    const { transactions, bankMeta } = state;
    if (!transactions || !bankMeta || state.isRevalidating) return;

    const edited = transactions.map((t) =>
      t.id === id
        ? {
            ...t,
            direction: newDirection,
            debit: newDirection === "expense" ? t.amount : null,
            credit: newDirection === "income" ? t.amount : null,
          }
        : t,
    );

    setState((s) => ({
      ...s,
      transactions: edited,
      isRevalidating: true,
      revalidateError: null,
    }));

    try {
      const res = await fetch("/api/ai/bank-import/revalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: edited, bankMeta }),
      });
      if (!res.ok) {
        throw new Error(
          et
            ? "Tehingu ümberhindamine ebaõnnestus."
            : "Failed to re-check the transaction.",
        );
      }
      const data = (await res.json()) as {
        transactions: BankTransaction[];
        bankMeta: BankMeta;
      };
      setState((s) => ({
        ...s,
        transactions: data.transactions,
        bankMeta: data.bankMeta,
        isRevalidating: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        transactions,
        isRevalidating: false,
        revalidateError:
          err instanceof Error
            ? err.message
            : et
              ? "Tehingu ümberhindamine ebaõnnestus."
              : "Failed to re-check the transaction.",
      }));
    }
  }

  async function runImport() {
    const { transactions, bankMeta } = state;
    if (!transactions || !bankMeta) return;

    setState((s) => ({ ...s, phase: "importing" }));

    const now = Date.now();
    let incomeAdded = 0,
      expenseAdded = 0,
      updatedCount = 0,
      failed = 0;

    for (const item of transactions) {
      if (item.pending) continue;

      const type = item.direction;
      const dup = findMoneyDuplicate(
        item.date,
        item.amount,
        item.description,
        type,
      );

      const category =
        type === "income"
          ? resolveIncomeCategory(undefined, item.description)
          : resolveExpenseCategory(undefined, item.description);

      if (dup) {
        // Uuendame olemasoleva tehingu
        try {
          await updateTransaction(dup.id, {
            balance: item.balance ?? dup.balance,
            category: dup.category || category,
            updatedAt: now,
          });
          updatedCount++;
        } catch {
          failed++;
        }
        continue;
      }

      const tx: Transaction = bankTransactionToTransaction(item, {
        id: `tx-${now}-${Math.random().toString(36).slice(2, 8)}`,
        category,
        createdAt: now,
      });

      try {
        await addTransaction(tx);
        if (type === "income") incomeAdded++;
        else expenseAdded++;
      } catch {
        failed++;
      }
    }

    const parts: string[] = [];
    if (incomeAdded > 0)
      parts.push(`${incomeAdded} ${et ? "sissetulekut" : "income record(s)"}`);
    if (expenseAdded > 0)
      parts.push(`${expenseAdded} ${et ? "väljaminekut" : "expense(s)"}`);
    if (updatedCount > 0)
      parts.push(`${updatedCount} ${et ? "uuendatud/kattuvat" : "updated"}`);
    if (failed > 0) parts.push(`${failed} ${et ? "ebaõnnestus" : "failed"}`);

    setState((s) => ({
      ...s,
      phase: "done",
      resultSummary:
        parts.join(" · ") ||
        (et ? "Tehingud salvestatud." : "Transactions saved."),
    }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }}
      >
        {state.phase === "idle" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#1A1F36]">
                {et ? "Impordi pangatehingud" : "Import bank transactions"}
              </h2>
              <button
                onClick={onClose}
                className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <label className="flex flex-col items-center justify-center gap-3 w-full h-36 border-2 border-dashed border-[#ECECF2] rounded-xl cursor-pointer hover:border-[#6F5AE8] hover:bg-[#F8F7FF] transition-colors">
              <FileUp size={26} className="text-[#94A3B8]" />
              <span className="text-[12px] text-[#64748B] text-center px-4 leading-snug">
                {et
                  ? "Laadi panga väljavõte CSV-, Excel- või PDF-failina"
                  : "Upload your bank statement as CSV, Excel, or PDF"}
              </span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
            <p className="text-[10px] text-[#94A3B8] text-center mt-3">
              {et
                ? "CSV/Excel – täpseima tulemusega · PDF – automaatanalüüs · Import nõuab kinnitust"
                : "CSV/Excel – most accurate · PDF – auto-analysis · Confirmation required"}
            </p>
          </div>
        )}

        {state.phase === "uploading" && (
          <div className="p-8 flex flex-col items-center gap-4">
            <Loader2 size={30} className="text-[#6F5AE8] animate-spin" />
            <div className="text-center">
              <p className="text-[13px] font-semibold text-[#1A1F36] mb-1">
                {et ? "Töötlen väljavõtet…" : "Processing statement…"}
              </p>
              <p className="text-[11px] text-[#64748B]">
                {et
                  ? "Analüüsin tehinguid…"
                  : "Reading transactions from your file…"}
              </p>
            </div>
          </div>
        )}

        {state.phase === "reviewing" && state.transactions && (
          <MoneyImportReviewCard
            transactions={state.transactions}
            bankMeta={state.bankMeta ?? undefined}
            lang={lang}
            onConfirm={runImport}
            onCancel={onClose}
            onEditTransaction={editTransactionDirection}
            isRevalidating={state.isRevalidating}
            revalidateError={state.revalidateError}
          />
        )}

        {state.phase === "importing" && (
          <div className="p-8 flex flex-col items-center gap-4">
            <Loader2 size={30} className="text-[#16A34A] animate-spin" />
            <p className="text-[13px] font-semibold text-[#1A1F36]">
              {et ? "Salvestan tehinguid…" : "Saving transactions…"}
            </p>
          </div>
        )}

        {state.phase === "done" && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#DCFCE7] flex items-center justify-center">
              <Check size={22} className="text-[#16A34A]" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-[#1A1F36] mb-1">
                {et ? "Import õnnestus" : "Import complete"}
              </p>
              <p className="text-[11px] text-[#64748B]">
                {state.resultSummary}
              </p>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-[#16A34A] text-white text-sm font-medium hover:bg-[#15803D] transition-colors"
            >
              {et ? "Sulge" : "Close"}
            </button>
          </div>
        )}

        {state.phase === "error" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-[#1A1F36]">
                {et ? "Impordi pangatehingud" : "Import bank transactions"}
              </h2>
              <button
                onClick={onClose}
                className="text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="rounded-xl bg-[#FEF2F2] border border-[#FECACA] p-4 mb-4">
              <p className="text-[12px] text-[#DC2626] leading-relaxed">
                {state.errorMessage}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setState(INITIAL_BANK_IMPORT)}
                className="flex-1 py-2 rounded-lg bg-[#1A1F36] text-white text-sm font-medium hover:bg-[#2D3748] transition-colors"
              >
                {et ? "Proovi uuesti" : "Try again"}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#64748B] font-medium hover:bg-[#F8F9FB] transition-colors"
              >
                {et ? "Sulge" : "Close"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FinancePage() {
  const navigate = useNavigate();

  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);

  const isDark = useIsDark();

  const transactions = useTransactions();
  const bills = useBills();
  const allGoals = useGoals();
  const allTasks = useTasks();
  const allEvents = useCalendarEvents();

  const [addModal, setAddModal] = useState<
    "income" | "expense" | "savings" | "bill" | "bank-import" | null
  >(null);
  const [txFilter, setTxFilter] = useState<
    "all" | "income" | "expense" | "savings" | null
  >(null);
  const [txDetail, setTxDetail] = useState<Transaction | null>(null);
  const [billsOpen, setBillsOpen] = useState(false);
  const [billDetail, setBillDetail] = useState<Bill | null>(null);

  async function handleDeleteTx(id: string) {
    await deleteTransaction(id);
    setTxDetail(null);
  }

  async function handleDeleteAllTransactions() {
    for (const tx of transactions) {
      await deleteTransaction(tx.id);
    }
  }

  async function handleDeleteBill(id: string) {
    await deleteBill(id);
    setBillDetail(null);
    setBillsOpen(false);
  }
  async function handleMarkBillPaid(id: string) {
    await markBillPaid(id);
    setBillDetail(null);
  }

  const TODAY = useMemo(todayISO, []);
  const CUR_MONTH = useMemo(() => monthISO(0), []);
  const PREV_MONTH = useMemo(() => monthISO(-1), []);

  const monthTx = useMemo(
    () => transactions.filter((t) => t.date.startsWith(CUR_MONTH)),
    [transactions, CUR_MONTH],
  );
  const prevMonthTx = useMemo(
    () => transactions.filter((t) => t.date.startsWith(PREV_MONTH)),
    [transactions, PREV_MONTH],
  );

  const income = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + t.amount, 0),
    [monthTx],
  );
  const expenses = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0),
    [monthTx],
  );
  const savingsM = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === "savings")
        .reduce((s, t) => s + t.amount, 0),
    [monthTx],
  );
  const savingsAll = useMemo(
    () =>
      transactions
        .filter((t) => t.type === "savings")
        .reduce((s, t) => s + t.amount, 0),
    [transactions],
  );

  const prevIncome = useMemo(
    () =>
      prevMonthTx
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + t.amount, 0),
    [prevMonthTx],
  );
  const prevExpenses = useMemo(
    () =>
      prevMonthTx
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0),
    [prevMonthTx],
  );

  const billsThisMonth = useMemo(
    () => bills.filter((b) => b.nextDueDate.startsWith(CUR_MONTH)),
    [bills, CUR_MONTH],
  );
  const billsThisMonthTotal = useMemo(
    () => billsThisMonth.reduce((s, b) => s + b.amount, 0),
    [billsThisMonth],
  );
  const otherExpenses = useMemo(
    () =>
      monthTx
        .filter((t) => t.type === "expense" && !t.linkedBillId)
        .reduce((s, t) => s + t.amount, 0),
    [monthTx],
  );
  // Literal result of the four terms shown in the Kuuplaan formula row below
  // (income − bills − planned expenses − savings). Must stay the value shown
  // at that row's "=" — using availableMoney there instead (a different,
  // balance-based figure also shown on the dashboard summary card) made the
  // displayed "=" mathematically false: the shown result didn't match the
  // shown operands.
  const planAvailable = income - billsThisMonthTotal - otherExpenses - savingsM;
  const planUsedTotal = billsThisMonthTotal + otherExpenses + savingsM;
  const planUsedPct =
    income > 0 ? Math.min((planUsedTotal / income) * 100, 100) : 0;

  const currentAccountBalance = useMemo(() => {
    const posted = transactions.filter(
      (t) => !t.pending && t.balance != null && typeof t.balance === "number",
    );
    if (posted.length === 0) return null;
    const sorted = [...posted].sort((a, b) => {
      const d = b.date.localeCompare(a.date);
      if (d !== 0) return d;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
    return sorted[0].balance as number;
  }, [transactions]);

  const budget = useMonthlyBudget(CUR_MONTH);
  const monthlyPlannedSavings = budget?.plannedSavings ?? 0;
  const plannedSavingsNotYetTransferred = Math.max(0, monthlyPlannedSavings - savingsM);

  const availableMoney: number | null =
    currentAccountBalance !== null
      ? currentAccountBalance - billsThisMonthTotal - plannedSavingsNotYetTransferred
      : null;

  const todayTasks = useMemo(
    () => allTasks.filter((t) => !t.date || t.date === TODAY).slice(0, 6),
    [allTasks, TODAY],
  );

  const todayEvents = useMemo(
    () => getEventsForDate(allEvents, new Date()).slice(0, 5),
    [allEvents],
  );

  const moneyGoals = useMemo(
    () => allGoals.filter((g) => g.icon === "money"),
    [allGoals],
  );

  const goalSavingsMap = useMemo(() => {
    const map: Record<string, number> = {};
    transactions.forEach((tx) => {
      if (tx.type === "savings" && tx.linkedGoalId) {
        map[tx.linkedGoalId] = (map[tx.linkedGoalId] ?? 0) + tx.amount;
      }
    });
    return map;
  }, [transactions]);

  const upcomingBills = useMemo(
    () =>
      [...bills]
        .filter((b) => b.status !== "paid")
        .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
        .slice(0, 4),
    [bills],
  );

  const recentTx = useMemo(
    () =>
      [...transactions]
        .sort(
          (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
        )
        .slice(0, 5),
    [transactions],
  );

  const CALENDARS = [
    { id: "mine", color: "#6F5AE8" },
    { id: "school", color: "#3B82F6" },
    { id: "work", color: "#F59E0B" },
    { id: "family", color: "#10B981" },
    { id: "training", color: "#EC4899" },
  ];
  function calColor(calId?: string): string {
    return CALENDARS.find((c) => c.id === calId)?.color ?? "#6F5AE8";
  }

  function DeltaBadge({
    current,
    prev,
    invert = false,
  }: {
    current: number;
    prev: number;
    invert?: boolean;
  }) {
    if (prev === 0)
      return (
        <span className="text-[11px] text-[#94A3B8] mt-1.5 block">&nbsp;</span>
      );
    const delta = current - prev;
    const positive = invert ? delta < 0 : delta >= 0;
    const arrow = positive ? "↗" : "↘";
    const color = positive ? "#16A34A" : "#DC2626";
    return (
      <p
        className="text-[11px] mt-1.5 flex items-center gap-0.5"
        style={{ color }}
      >
        <span>{arrow}</span>
        <span>
          {formatEuro(Math.abs(delta))} {t("finance.summary.vsLastMonth", lang)}
        </span>
      </p>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-[#F8F9FB]">
      <div className="px-4 md:px-7 pt-4 md:pt-6 pb-10 max-w-[1440px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[21px] font-bold text-[#1A1F36] flex items-center gap-2.5">
              <Wallet size={19} className="text-[#6F5AE8]" />
              {t("finance.title", lang)}
            </h1>
            <p className="text-[13px] text-[#94A3B8] mt-0.5">
              {t("finance.subtitle", lang)}
            </p>
          </div>
          {/* Dropdown add button */}
          <div className="relative group/add">
            <button className="flex items-center gap-1.5 rounded-xl bg-[#6F5AE8] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#5D4AD0] transition-colors shadow-sm">
              <Plus size={14} />
              {lang === "et" ? "+ Kiirtoiming" : "+ Quick add"}
              <ChevronDown size={13} className="ml-0.5 opacity-75" />
            </button>
            <div className="pointer-events-none group-hover/add:pointer-events-auto opacity-0 group-hover/add:opacity-100 absolute right-0 top-full mt-1 z-30 flex flex-col bg-white rounded-xl shadow-lg border border-[#EBEBEB] py-1 min-w-[172px] transition-opacity duration-150">
              {(
                [
                  ["income", "#DCFCE7", "#16A34A"],
                  ["expense", "#FEE2E2", "#DC2626"],
                  ["bill", "#FEF3C7", "#D97706"],
                  ["savings", "#EDE9FB", "#6F5AE8"],
                ] as const
              ).map(([type, bg, color]) => {
                const iBg = isDark ? darkBg(bg) : bg;
                const iColor = isDark ? darkText(color) : color;
                return (
                  <button
                    key={type}
                    onClick={() => setAddModal(type)}
                    className="flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-[#1A1F36] hover:bg-[#F8F9FB] transition-colors"
                  >
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: iBg }}
                    >
                      {type === "income" ? (
                        <TrendingUp size={13} style={{ color: iColor }} />
                      ) : type === "expense" ? (
                        <Minus size={13} style={{ color: iColor }} />
                      ) : type === "bill" ? (
                        <Receipt size={13} style={{ color: iColor }} />
                      ) : (
                        <PiggyBank size={13} style={{ color: iColor }} />
                      )}
                    </span>
                    {t(
                      ("finance.actions.add" +
                        type.charAt(0).toUpperCase() +
                        type.slice(1)) as Parameters<typeof t>[0],
                      lang,
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-3.5">
          <Card className="p-5">
            <div className="flex items-start justify-between mb-2.5">
              <p className="text-[12px] font-semibold text-[#64748B] leading-tight">
                {t("finance.summary.balance", lang)}
              </p>
              <div className="w-9 h-9 rounded-xl bg-[#DBEAFE] flex items-center justify-center flex-shrink-0 ml-2">
                <Wallet size={16} className="text-[#2563EB]" />
              </div>
            </div>
            <p className="text-[24px] font-bold text-[#1A1F36] leading-none tabular-nums">
              {currentAccountBalance !== null
                ? formatEuro(currentAccountBalance)
                : "—"}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-1.5">
              {currentAccountBalance !== null
                ? t("finance.summary.balanceSub", lang)
                : t("finance.summary.balanceUnavailable", lang)}
            </p>
            <button
              onClick={() => setTxFilter("all")}
              className="mt-3 text-[11px] font-semibold text-[#6F5AE8] hover:underline text-left"
            >
              {t("finance.summary.viewBalance", lang)}
            </button>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between mb-2.5">
              <p className="text-[12px] font-semibold text-[#64748B] leading-tight">
                {t("finance.summary.income", lang)}
              </p>
              <div className="w-9 h-9 rounded-xl bg-[#DCFCE7] flex items-center justify-center flex-shrink-0 ml-2">
                <TrendingUp size={16} className="text-[#16A34A]" />
              </div>
            </div>
            <p className="text-[24px] font-bold text-[#1A1F36] leading-none tabular-nums">
              {formatEuro(income)}
            </p>
            <DeltaBadge current={income} prev={prevIncome} />
            <button
              onClick={() => setTxFilter("income")}
              className="mt-3 text-[11px] font-semibold text-[#6F5AE8] hover:underline text-left"
            >
              {t("finance.summary.viewTransactions", lang)}
            </button>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between mb-2.5">
              <p className="text-[12px] font-semibold text-[#64748B] leading-tight">
                {t("finance.summary.expenses", lang)}
              </p>
              <div className="w-9 h-9 rounded-xl bg-[#FEE2E2] flex items-center justify-center flex-shrink-0 ml-2">
                <TrendingDown size={16} className="text-[#DC2626]" />
              </div>
            </div>
            <p className="text-[24px] font-bold text-[#1A1F36] leading-none tabular-nums">
              {formatEuro(expenses)}
            </p>
            <DeltaBadge current={expenses} prev={prevExpenses} invert />
            <button
              onClick={() => setTxFilter("expense")}
              className="mt-3 text-[11px] font-semibold text-[#6F5AE8] hover:underline text-left"
            >
              {t("finance.summary.viewTransactions", lang)}
            </button>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between mb-2.5">
              <p className="text-[12px] font-semibold text-[#64748B] leading-tight">
                {t("finance.summary.savings", lang)}
              </p>
              <div className="w-9 h-9 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0 ml-2">
                <PiggyBank size={16} className="text-[#6F5AE8]" />
              </div>
            </div>
            <p className="text-[24px] font-bold text-[#1A1F36] leading-none tabular-nums">
              {formatEuro(savingsAll)}
            </p>
            <p className="text-[11px] text-[#94A3B8] mt-1.5">
              {moneyGoals.filter((g) => g.status === "active").length > 0
                ? `${moneyGoals.filter((g) => g.status === "active").length} ${t("finance.summary.savingsSub", lang)}`
                : "\u00a0"}
            </p>
            <button
              onClick={() => navigate("/app/goals")}
              className="mt-3 text-[11px] font-semibold text-[#6F5AE8] hover:underline text-left"
            >
              {t("finance.summary.viewGoals", lang)}
            </button>
          </Card>
        </div>

        {/* Middle row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-3.5">
          {/* Today's tasks */}
          <Card className="flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
              <h2 className="text-[13px] font-bold text-[#1A1F36]">
                {t("finance.tasks.title", lang)}
              </h2>
              <button
                onClick={() => navigate("/app/tasks")}
                className="text-[11px] text-[#6F5AE8] font-semibold flex items-center gap-0.5 hover:underline"
              >
                {t("dash.viewAll", lang)} <ArrowRight size={11} />
              </button>
            </div>
            <div className="flex-1 px-5 py-3 space-y-0.5 overflow-y-auto scrollbar-thin min-h-0">
              {todayTasks.length === 0 ? (
                <p className="text-[12px] text-[#94A3B8] py-4 text-center">
                  {t("finance.tasks.empty", lang)}
                </p>
              ) : (
                todayTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 py-1.5 rounded-lg px-1 -mx-1 hover:bg-[#F8F7F4] transition-colors cursor-default"
                  >
                    <button
                      onClick={() => toggleTask(task.id)}
                      className={`flex-shrink-0 w-[15px] h-[15px] rounded border flex items-center justify-center transition-colors ${
                        task.completed
                          ? "bg-[#6F5AE8] border-[#6F5AE8]"
                          : "border-[#D1D5DB] bg-white hover:border-[#6F5AE8]"
                      }`}
                    >
                      {task.completed && (
                        <svg
                          width="9"
                          height="7"
                          viewBox="0 0 10 8"
                          fill="none"
                        >
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className={`flex-1 text-[13px] truncate ${task.completed ? "text-[#94A3B8] line-through" : "text-[#1A1F36]"}`}
                    >
                      {task.title}
                    </span>
                    {!task.completed && task.priority && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor: priorityDot(
                            task.priority as Priority,
                            isDark,
                          ),
                        }}
                      />
                    )}
                    {task.time && (
                      <span className="text-[11px] text-[#94A3B8] flex-shrink-0">
                        {task.time}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Today's calendar */}
          <Card className="flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
              <h2 className="text-[13px] font-bold text-[#1A1F36]">
                {t("finance.calendar.title", lang)}
              </h2>
              <button
                onClick={() => navigate("/app/calendar")}
                className="text-[11px] text-[#6F5AE8] font-semibold flex items-center gap-0.5 hover:underline"
              >
                {lang === "et" ? "Ava kalender" : "Open calendar"}{" "}
                <ArrowRight size={11} />
              </button>
            </div>
            <div className="flex-1 px-5 py-3 space-y-0.5 overflow-y-auto scrollbar-thin min-h-0">
              {todayEvents.length === 0 ? (
                <p className="text-[12px] text-[#94A3B8] py-4 text-center">
                  {t("finance.calendar.empty", lang)}
                </p>
              ) : (
                todayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 py-2 rounded-lg px-1 -mx-1 hover:bg-[#F8F7F4] transition-colors cursor-default"
                  >
                    <div
                      className="w-0.5 h-8 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor:
                          event.color ?? calColor(event.calendarId),
                      }}
                    />
                    <div className="w-11 flex-shrink-0">
                      <span className="text-[13px] font-bold text-[#1A1F36]">
                        {event.allDay
                          ? lang === "et"
                            ? "kogu päev"
                            : "all-day"
                          : event.startTime}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#1A1F36] truncate">
                        {event.title}
                      </p>
                      {event.calendarId && (
                        <p className="text-[11px] text-[#94A3B8] truncate">
                          {event.calendarId}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Right column: actions + AI */}
          <div className="flex flex-col gap-3.5">
            <Card className="p-5">
              <h2 className="text-[13px] font-bold text-[#1A1F36] flex items-center gap-2 mb-4">
                <Zap size={13} className="text-[#6F5AE8]" />
                {t("finance.actions.title", lang)}
              </h2>
              <div className="grid grid-cols-5 sm:grid-cols-5 gap-2">
                {(
                  [
                    {
                      type: "income" as const,
                      icon: <Plus size={17} />,
                      bg: "#DCFCE7",
                      color: "#16A34A",
                      label: t("finance.actions.addIncome", lang),
                    },
                    {
                      type: "expense" as const,
                      icon: <Minus size={17} />,
                      bg: "#FEE2E2",
                      color: "#DC2626",
                      label: t("finance.actions.addExpense", lang),
                    },
                    {
                      type: "bill" as const,
                      icon: <Receipt size={17} />,
                      bg: "#FEF3C7",
                      color: "#D97706",
                      label: t("finance.actions.addBill", lang),
                    },
                    {
                      type: "savings" as const,
                      icon: <PiggyBank size={16} />,
                      bg: "#EDE9FB",
                      color: "#6F5AE8",
                      label: t("finance.actions.addSavings", lang),
                    },
                    {
                      type: "bank-import" as const,
                      icon: <FileUp size={16} />,
                      bg: "#DBEAFE",
                      color: "#2563EB",
                      label: t("finance.actions.importStatement", lang),
                    },
                  ] as const
                ).map(({ type, icon, bg, color, label }) => (
                  <button
                    key={type}
                    onClick={() => setAddModal(type)}
                    className="flex flex-col items-center gap-1.5 py-2 px-1 rounded-xl hover:bg-[#F8F9FB] transition-colors"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ backgroundColor: isDark ? darkBg(bg) : bg }}
                    >
                      <span style={{ color: isDark ? darkText(color) : color }}>
                        {icon}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-[#64748B] text-center leading-tight">
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-5 flex-1 flex flex-col min-h-0 justify-center">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles
                  size={13}
                  strokeWidth={1.8}
                  className="text-[#6F5AE8] flex-shrink-0"
                />
                <h3 className="text-[13px] font-bold text-[#1A1F36]">
                  {lang === "et"
                    ? "AI õpib sinu tööharjumusi"
                    : "AI is learning your workflow"}
                </h3>
              </div>
              <p className="text-[11px] text-[#64748B] leading-relaxed">
                {lang === "et"
                  ? "Kivora AI õpib tundma sinu ülesandeid, harjumusi, eesmärke, kalendrit ja rahakasutust. Kui oled rakendust mõnda aega kasutanud, hakkavad siia ilmuma isikupärastatud soovitused."
                  : "Kivora AI is learning your tasks, habits, goals, calendar and finances. Personalized recommendations will appear automatically after enough real activity has been collected."}
              </p>
            </Card>
          </div>
        </div>

        {/* Monthly plan */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[13px] font-bold text-[#1A1F36]">
                {t("finance.plan.title", lang)} – {currentMonthLabel(lang)}
              </h2>
              <button className="text-[#94A3B8] hover:text-[#64748B] transition-colors">
                <Info size={13} />
              </button>
            </div>
            <button
              onClick={() => setTxFilter("all")}
              className="text-[11px] font-semibold text-[#6F5AE8] hover:underline"
            >
              {t("finance.plan.viewDetails", lang)}
            </button>
          </div>

          {income === 0 && billsThisMonthTotal === 0 ? (
            <p className="text-[13px] text-[#94A3B8]">
              {t("finance.plan.noData", lang)}
            </p>
          ) : (
            <>
              <div className="flex items-end gap-4 flex-wrap mb-4">
                {(
                  [
                    { key: "finance.plan.income", value: income, sign: null },
                    { key: null, value: null, sign: "−" },
                    {
                      key: "finance.plan.bills",
                      value: billsThisMonthTotal,
                      sign: null,
                    },
                    { key: null, value: null, sign: "−" },
                    {
                      key: "finance.plan.expenses",
                      value: otherExpenses,
                      sign: null,
                    },
                    { key: null, value: null, sign: "−" },
                    {
                      key: "finance.plan.savings",
                      value: savingsM,
                      sign: null,
                    },
                    { key: null, value: null, sign: "=" },
                    {
                      key: "finance.plan.available",
                      value: planAvailable,
                      sign: null,
                      highlight: true,
                    },
                  ] as const
                ).map((item, i) => {
                  if (item.sign) {
                    return (
                      <span
                        key={i}
                        className="text-xl font-light text-[#D1D5DB] pb-0.5 select-none"
                      >
                        {item.sign}
                      </span>
                    );
                  }
                  const isHighlight = "highlight" in item && item.highlight;
                  return (
                    <div key={i}>
                      <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-1">
                        {item.key
                          ? t(item.key as Parameters<typeof t>[0], lang)
                          : ""}
                      </p>
                      <p
                        className={`font-bold tabular-nums leading-none ${
                          isHighlight
                            ? "text-[21px] text-[#6F5AE8]"
                            : "text-[15px] text-[#1A1F36]"
                        }`}
                      >
                        {item.value !== null
                          ? formatEuro(Math.abs(item.value ?? 0))
                          : isHighlight
                            ? "—"
                            : ""}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <ProgressBar
                  value={planUsedPct}
                  color="#6F5AE8"
                  className="h-2.5"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-[#64748B]">
                    <span className="font-bold text-[#1A1F36]">
                      {Math.round(planUsedPct)}% {t("finance.plan.used", lang)}
                    </span>
                  </p>
                  {income > 0 && availableMoney !== null && (
                    <p className="text-[12px] text-[#94A3B8]">
                      {lang === "et"
                        ? `Saadaval ${formatEuro(availableMoney)}`
                        : `${formatEuro(availableMoney)} available`}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-[#94A3B8] mt-2.5 leading-relaxed">
                {t("finance.plan.subtitle", lang)}
              </p>
            </>
          )}
        </Card>

        {/* Bottom row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-3.5">
          {/* Recent transactions */}
          <Card className="flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
              <h2 className="text-[13px] font-bold text-[#1A1F36]">
                {t("finance.transactions.title", lang)}
              </h2>
              <button
                onClick={() => setTxFilter("all")}
                className="text-[11px] text-[#6F5AE8] font-semibold flex items-center gap-0.5 hover:underline"
              >
                {t("finance.transactions.viewAll", lang)}{" "}
                <ArrowRight size={11} />
              </button>
            </div>
            <div className="px-5 py-3">
              {recentTx.length === 0 ? (
                <p className="text-[12px] text-[#94A3B8] py-4 text-center">
                  {t("finance.transactions.empty", lang)}
                </p>
              ) : (
                <ul className="space-y-3">
                  {recentTx.map((tx) => (
                    <li
                      key={tx.id}
                      onClick={() => setTxDetail(tx)}
                      className="flex items-center gap-3 cursor-pointer rounded-xl px-2 -mx-2 hover:bg-[#F8F9FB] transition-colors"
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: txBg(tx.category, isDark),
                          color: txColor(tx.category, isDark),
                        }}
                      >
                        <TxIcon cat={tx.category} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#1A1F36] truncate">
                          {tx.title}
                        </p>
                        <p className="text-[11px] text-[#94A3B8] truncate">
                          {t(
                            ("finance.cat." + tx.category) as Parameters<
                              typeof t
                            >[0],
                            lang,
                          )}
                          {" · "}
                          {formatDateLabel(tx.date, lang)}
                        </p>
                      </div>
                      <p
                        className="text-[13px] font-bold flex-shrink-0 tabular-nums"
                        style={{
                          color:
                            tx.type === "income"
                              ? "#16A34A"
                              : tx.type === "savings"
                                ? "#6F5AE8"
                                : "#DC2626",
                        }}
                      >
                        {tx.type === "income"
                          ? "+"
                          : tx.type === "savings"
                            ? "~"
                            : "−"}
                        {formatEuro(tx.amount)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* Savings goals */}
          <Card className="flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
              <h2 className="text-[13px] font-bold text-[#1A1F36]">
                {t("finance.goals.title", lang)}
              </h2>
              <button
                onClick={() => navigate("/app/goals")}
                className="text-[11px] text-[#6F5AE8] font-semibold flex items-center gap-0.5 hover:underline"
              >
                {t("finance.goals.viewAll", lang)} <ArrowRight size={11} />
              </button>
            </div>
            <div className="px-5 py-3">
              {moneyGoals.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[12px] text-[#94A3B8]">
                    {t("finance.goals.empty", lang)}
                  </p>
                  <button
                    onClick={() => navigate("/app/goals")}
                    className="mt-2 text-[11px] font-semibold text-[#6F5AE8] hover:underline"
                  >
                    {lang === "et" ? "Lisa eesmärk →" : "Add goal →"}
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {moneyGoals.slice(0, 2).map((goal) => {
                    const pct =
                      goal.progressMax > 0
                        ? Math.round(
                            (goal.progressValue / goal.progressMax) * 100,
                          )
                        : 0;
                    const accumulated = goalSavingsMap[goal.id] ?? 0;
                    return (
                      <div
                        key={goal.id}
                        onClick={() => navigate("/app/goals")}
                        className="cursor-pointer rounded-xl px-2 -mx-2 hover:bg-[#F8F9FB] transition-colors py-1 -my-1"
                      >
                        <div className="flex items-start gap-3 mb-2">
                          <div
                            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
                            style={{
                              backgroundColor: isDark
                                ? darkBg(goal.iconBg)
                                : goal.iconBg,
                            }}
                          >
                            <PiggyBank
                              size={17}
                              style={{
                                color: isDark
                                  ? darkText(goal.iconColor)
                                  : goal.iconColor,
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[#1A1F36] truncate">
                              {goal.title}
                            </p>
                            <p className="text-[11px] text-[#94A3B8]">
                              {goal.progressValue}/{goal.progressMax}{" "}
                              {lang === "et" ? "sammu" : "steps"}
                            </p>
                          </div>
                          <span
                            className="text-[14px] font-bold flex-shrink-0"
                            style={{ color: goal.barColor || "#6F5AE8" }}
                          >
                            {pct}%
                          </span>
                        </div>
                        <ProgressBar
                          value={pct}
                          color={goal.barColor || "#6F5AE8"}
                          className="h-1.5"
                        />
                        <div className="flex items-center justify-between mt-1.5">
                          {accumulated > 0 ? (
                            <p className="text-[12px] font-bold text-[#1A1F36] tabular-nums">
                              {formatEuro(accumulated)}
                            </p>
                          ) : (
                            <span />
                          )}
                          {goal.deadline && (
                            <p className="text-[11px] text-[#94A3B8]">
                              {t("finance.goals.expectedCompletion", lang)}{" "}
                              {goal.deadlineShort || goal.deadline}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          {/* Upcoming bills */}
          <Card className="flex flex-col">
            <div className="px-5 py-4 flex items-center justify-between border-b border-[#F1F5F9]">
              <h2 className="text-[13px] font-bold text-[#1A1F36]">
                {t("finance.bills.title", lang)}
              </h2>
              <button
                onClick={() => setBillsOpen(true)}
                className="text-[11px] text-[#6F5AE8] font-semibold flex items-center gap-0.5 hover:underline"
              >
                {t("finance.bills.viewAll", lang)} <ArrowRight size={11} />
              </button>
            </div>
            <div className="px-5 py-3">
              {upcomingBills.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[12px] text-[#94A3B8]">
                    {t("finance.bills.empty", lang)}
                  </p>
                  <button
                    onClick={() => setAddModal("bill")}
                    className="mt-2 text-[11px] font-semibold text-[#6F5AE8] hover:underline"
                  >
                    {lang === "et" ? "Lisa arve →" : "Add bill →"}
                  </button>
                </div>
              ) : (
                <ul className="space-y-0">
                  {upcomingBills.map((bill, idx) => {
                    const days = daysUntil(bill.nextDueDate);
                    const isOverdue = bill.status === "overdue" || days < 0;
                    const badgeColor = isOverdue
                      ? "#DC2626"
                      : days <= 3
                        ? "#EA580C"
                        : days <= 7
                          ? "#D97706"
                          : days <= 14
                            ? "#65A30D"
                            : "#64748B";
                    const badgeBg = isOverdue
                      ? "#FEF2F2"
                      : days <= 3
                        ? "#FFF7ED"
                        : days <= 7
                          ? "#FEFCE8"
                          : days <= 14
                            ? "#F0FDF4"
                            : "#F8F9FB";
                    const daysLabel = isOverdue
                      ? t("finance.bills.overdue", lang)
                      : days === 0
                        ? t("finance.bills.dueToday", lang)
                        : days === 1
                          ? t("finance.bills.dueTomorrow", lang)
                          : `${days} ${t("finance.bills.days", lang)}`;

                    return (
                      <li
                        key={bill.id}
                        onClick={() => setBillDetail(bill)}
                        className={`flex items-center gap-3 py-2.5 cursor-pointer rounded-xl px-2 -mx-2 hover:bg-[#F8F9FB] transition-colors ${idx < upcomingBills.length - 1 ? "border-b border-[#F8F9FB]" : ""}`}
                      >
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{
                            backgroundColor: billBg(bill.category, isDark),
                            color: billColor(bill.category, isDark),
                          }}
                        >
                          <BillIcon cat={bill.category} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#1A1F36] truncate">
                            {bill.title}
                          </p>
                          <p className="text-[11px] text-[#94A3B8]">
                            {new Date(bill.nextDueDate).toLocaleDateString(
                              lang === "et" ? "et-EE" : "en-GB",
                              {
                                day: "numeric",
                                month: "long",
                              },
                            )}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p className="text-[13px] font-bold text-[#1A1F36] tabular-nums">
                            {formatEuro(bill.amount)}
                          </p>
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                            style={{
                              color: badgeColor,
                              backgroundColor: badgeBg,
                            }}
                          >
                            {daysLabel}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Modals */}
      {(addModal === "income" ||
        addModal === "expense" ||
        addModal === "savings") && (
        <AddTransactionModal
          type={addModal}
          open
          onClose={() => setAddModal(null)}
          lang={lang}
          allGoals={allGoals}
        />
      )}
      {addModal === "bill" && (
        <AddBillModal open onClose={() => setAddModal(null)} lang={lang} />
      )}

      {addModal === "bank-import" && (
        <BankImportModal lang={lang} onClose={() => setAddModal(null)} />
      )}

      {/* All Transactions Modal */}
      {txFilter !== null && (
        <AllTransactionsModal
          transactions={transactions}
          initialFilter={txFilter}
          lang={lang}
          onClose={() => setTxFilter(null)}
          onDeleteAll={handleDeleteAllTransactions}
          onSelect={(tx) => {
            setTxFilter(null);
            setTxDetail(tx);
          }}
        />
      )}

      {/* Transaction Detail Modal */}
      {txDetail !== null && (
        <TransactionDetailModal
          tx={txDetail}
          lang={lang}
          onClose={() => setTxDetail(null)}
          onDelete={handleDeleteTx}
          allGoals={allGoals}
        />
      )}

      {/* All Bills Modal */}
      {billsOpen && (
        <AllBillsModal
          bills={bills}
          lang={lang}
          onClose={() => setBillsOpen(false)}
          onSelect={(bill) => {
            setBillsOpen(false);
            setBillDetail(bill);
          }}
        />
      )}

      {/* Bill Detail Modal */}
      {billDetail !== null && (
        <BillDetailModal
          bill={billDetail}
          lang={lang}
          onClose={() => setBillDetail(null)}
          onDelete={handleDeleteBill}
          onMarkPaid={handleMarkBillPaid}
        />
      )}
    </div>
  );
}
