import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t } from "@/lib/translations";
import {
  executeActionsAsync,
  resolveIncomeCategory,
  resolveExpenseCategory,
  findMoneyDuplicate,
  type AIAction,
  type PendingFileRef,
} from "@/lib/aiActions";
import { buildAIContext } from "@/lib/aiContextBuilder";
import { getAllDocuments } from "@/lib/documentsStore";
import { auth } from "@/lib/firebase";
import { dispatch as dispatchNotif } from "@/lib/notificationItemsStore";
import { getLocalNotificationSettings } from "@/lib/notificationsStore";
import MarkdownReply from "@/components/ai/MarkdownReply";
import {
  useChats,
  useChatsLoading,
  saveChat as storeSaveChat,
  deleteChat as storeDeleteChat,
  updateChatMessage as storeUpdateChatMessage,
  deleteChatMessage as storeDeleteChatMessage,
  deleteMessagesFrom as storeDeleteMessagesFrom,
  type Role,
  type ChatMessage,
  type Chat,
  type AttachmentMeta,
} from "@/lib/aiConversationsStore";
import LinkedItemsPanel from "@/components/links/LinkedItemsPanel";
import { removeLinksForEntity } from "@/lib/entityLinksStore";
import PostSaveLinkSuggestionsDialog from "@/components/links/PostSaveLinkSuggestionsDialog";
import AutoLinkToast from "@/components/links/AutoLinkToast";
import {
  runAutomaticLinking,
  type AutoLinkResult,
} from "@/lib/automaticLinking";
import { useTasks } from "@/lib/tasksStore";
import { useGoals } from "@/lib/goalsStore";
import { useCalendarEvents } from "@/lib/calendarStore";
import { useNotes } from "@/lib/quickNotesStore";
import { useHabits } from "@/lib/habitsStore";
import { useTransactions, addTransaction } from "@/lib/moneyStore";
import type { BankTransaction, BankMeta } from "@/types/bank";
import MoneyImportReviewCard from "@/components/MoneyImportReviewCard";
import type { Transaction } from "@/types/money";
import { MONEY_MODULE_ENABLED } from "@/lib/featureFlags";
import {
  Sparkles,
  Send,
  Calendar,
  CheckSquare,
  Target,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  MessageCircle,
  Check,
  LayoutList,
  Lightbulb,
  BarChart2,
  Heart,
  MoreHorizontal,
  ArrowLeft,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  Paperclip,
  FileText,
  X as XIcon,
  Loader2,
  Edit3,
} from "lucide-react";

// Role, ChatMessage, Chat types are imported from @/lib/aiConversationsStore

const CHAT_PALETTE = [
  { iconColor: "#6F5AE8", iconBg: "#EDE9FB" },
  { iconColor: "#16A34A", iconBg: "#DCFCE7" },
  { iconColor: "#CA8A04", iconBg: "#FEF9C3" },
  { iconColor: "#DC2626", iconBg: "#FEE2E2" },
];

function nowTime(lang: string) {
  const locale = lang === "en" ? "en-GB" : "et-EE";
  return new Date().toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Real API call via Supabase Edge Function ─────────────────────────
// Swap this single function if the backend changes. It accepts the full
// conversation history and returns the assistant's reply text.
interface AIResponse {
  reply: string;
  actions: AIAction[];
}

async function fetchAIReply(
  history: { role: "user" | "assistant"; content: string }[],
  lang: AppLang,
): Promise<AIResponse> {
  // Build client-local date string (YYYY-MM-DD) so the server can resolve "today"/"tomorrow" correctly
  const _now = new Date();
  const localDate = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;

  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: history,
      context: buildAIContext(lang),
      lang,
      localDate,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status}).`);
  }
  const data = await res.json();
  if (!data.reply && (!data.actions || data.actions.length === 0))
    throw new Error("AI returned no reply.");
  return { reply: data.reply || "", actions: data.actions || [] };
}

// Chats are now persisted to Firestore via aiConversationsStore

// ── Bank statement types — imported from @/types/bank ───────────────────────
// Definitions live in @/types/bank.ts; keep in sync with aiUpload.ts on server.

// ── ReviewCard — shown when a bank statement needs user confirmation ──────────

interface ReviewCardProps {
  file: {
    id: string;
    name: string;
    transactions?: BankTransaction[];
    bankMeta?: BankMeta;
  };
  lang: string;
  onConfirm: (id: string) => void;
  onCancel: (id: string) => void;
}

function ReviewCard({ file, lang, onConfirm, onCancel }: ReviewCardProps) {
  const txns = file.transactions ?? [];
  const meta = file.bankMeta;
  const et = lang === "et";
  const totalIncome = txns
    .filter((t) => t.direction === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = txns
    .filter((t) => t.direction === "expense")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="rounded-xl border border-[#DDD8F8] bg-[#F8F7FF] p-4 mb-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#1A1F36] truncate">
            {file.name}
          </p>
          <p className="text-xs text-[#6F5AE8] mt-0.5">
            {meta?.bank ? `${meta.bank} · ` : ""}
            {txns.length} {et ? "tehingut" : "transactions"}
            {meta?.period ? ` · ${meta.period.from} – ${meta.period.to}` : ""}
          </p>
          {meta?.accountNumber && (
            <p className="text-[10px] text-[#94A3B8] mt-0.5">
              {meta.accountNumber}
            </p>
          )}
        </div>
        <button
          onClick={() => onCancel(file.id)}
          className="flex-shrink-0 text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Transaction table */}
      {txns.length > 0 && (
        <div className="rounded-lg border border-[#ECECF2] bg-white overflow-hidden mb-3 max-h-52 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F8F7FF] border-b border-[#ECECF2]">
                <th className="text-left px-2.5 py-1.5 text-[#64748B] font-medium">
                  {et ? "Kuupäev" : "Date"}
                </th>
                <th className="text-left px-2.5 py-1.5 text-[#64748B] font-medium">
                  {et ? "Kirjeldus" : "Description"}
                </th>
                <th className="text-right px-2.5 py-1.5 text-[#64748B] font-medium">
                  {et ? "Summa" : "Amount"}
                </th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t, i) => (
                <tr key={i} className="border-t border-[#F2F2F2]">
                  <td className="px-2.5 py-1.5 text-[#64748B] whitespace-nowrap">
                    {t.date}
                  </td>
                  <td className="px-2.5 py-1.5 text-[#1A1F36] max-w-[180px] truncate">
                    {t.description}
                  </td>
                  <td
                    className={`px-2.5 py-1.5 text-right font-medium whitespace-nowrap ${
                      t.direction === "income"
                        ? "text-[#16A34A]"
                        : "text-[#DC2626]"
                    }`}
                  >
                    {t.direction === "income" ? "+" : "−"}
                    {t.amount.toFixed(2)} {t.currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totals row */}
      {(meta?.openingBalance != null ||
        meta?.closingBalance != null ||
        txns.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[#64748B] mb-3">
          {totalIncome > 0 && (
            <span className="text-[#16A34A] font-medium">
              +{totalIncome.toFixed(2)} EUR {et ? "laekumised" : "income"}
            </span>
          )}
          {totalExpense > 0 && (
            <span className="text-[#DC2626] font-medium">
              −{totalExpense.toFixed(2)} EUR {et ? "kulud" : "expenses"}
            </span>
          )}
          {meta?.openingBalance != null && (
            <span>
              {et ? "Algsaldo" : "Opening"}: {meta.openingBalance.toFixed(2)} €
            </span>
          )}
          {meta?.closingBalance != null && (
            <span>
              {et ? "Lõppsaldo" : "Closing"}: {meta.closingBalance.toFixed(2)} €
            </span>
          )}
        </div>
      )}

      {/* Import readiness warning — only when extraction is flagged as unreliable */}
      {meta != null && meta.importAllowed !== true && (
        <p className="text-[11px] text-[#DC2626] font-medium mb-2 leading-snug">
          {et
            ? "Dokumendi lugemine vajab kontrolli. Raha import ei ole lubatud."
            : "Document reading needs review. Money import is not allowed."}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(file.id)}
          className="flex-1 py-2 rounded-lg bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B48D8] transition-colors"
        >
          {et
            ? meta?.importAllowed === true
              ? "Kinnita ja saada AI-le"
              : "Kasuta analüüsimiseks"
            : meta?.importAllowed === true
              ? "Confirm & send to AI"
              : "Use for analysis"}
        </button>
        <button
          onClick={() => onCancel(file.id)}
          className="px-4 py-2 rounded-lg border border-[#DDD8F8] text-sm text-[#6F5AE8] font-medium hover:bg-[#F2EFFD] transition-colors"
        >
          {et ? "Tühista" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

// MoneyImportReviewCard is imported from @/components/MoneyImportReviewCard.
// The legacy AI-chat import path continues to use it unchanged (Phase 1A).

export default function AIAssistantPage() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);

  // Track whether we've dispatched the AI notification this session
  const aiNotifDispatchedRef = useRef(false);

  // ── Real user-data hooks (used to determine recommendation maturity) ──────
  const allTasks = useTasks();
  const allGoals = useGoals();
  const allEvents = useCalendarEvents();
  const allNotes = useNotes();
  const allHabits = useHabits();
  const allTransactions = useTransactions();

  const QUICK_ACTIONS_LANG = [
    {
      label: t("ai.quick.planDay", lang),
      icon: <Calendar size={14} strokeWidth={2} />,
    },
    {
      label: t("ai.quick.prioritize", lang),
      icon: <LayoutList size={14} strokeWidth={2} />,
    },
    {
      label: t("ai.quick.analyzeHabits", lang),
      icon: <TrendingUp size={14} strokeWidth={2} />,
    },
    {
      label: t("ai.quick.motivate", lang),
      icon: <Lightbulb size={14} strokeWidth={2} />,
    },
  ];

  // SUGGESTED_LANG removed — replaced by activity-based personalizedSuggestions below

  const AI_CAPABILITIES_LANG = [
    {
      icon: <Sparkles size={16} strokeWidth={1.8} />,
      iconBg: "#EDE9FB",
      iconColor: "#6F5AE8",
      title: t("ai.cap.smart.title", lang),
      desc: t("ai.cap.smart.desc", lang),
    },
    {
      icon: <CheckSquare size={16} strokeWidth={1.8} />,
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      title: t("ai.cap.plan.title", lang),
      desc: t("ai.cap.plan.desc", lang),
    },
    {
      icon: <BarChart2 size={16} strokeWidth={1.8} />,
      iconBg: "#FEE2E2",
      iconColor: "#DC2626",
      title: t("ai.cap.analysis.title", lang),
      desc: t("ai.cap.analysis.desc", lang),
    },
    {
      icon: <Heart size={16} strokeWidth={1.8} />,
      iconBg: "#FEF9C3",
      iconColor: "#CA8A04",
      title: t("ai.cap.motivation.title", lang),
      desc: t("ai.cap.motivation.desc", lang),
    },
  ];

  const STATS_LANG = [
    {
      key: "chats",
      label: t("ai.stat.chats", lang),
      iconBg: "#EDE9FB",
      iconColor: "#6F5AE8",
      icon: <MessageCircle size={16} strokeWidth={1.8} />,
    },
    {
      key: "tasks",
      label: t("ai.stat.tasks", lang),
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      icon: <CheckSquare size={16} strokeWidth={1.8} />,
    },
    {
      key: "goals",
      label: t("ai.stat.goals", lang),
      iconBg: "#FEF9C3",
      iconColor: "#CA8A04",
      icon: <Target size={16} strokeWidth={1.8} />,
    },
  ];

  const location = useLocation();
  const [input, setInput] = useState("");
  const storeChats = useChats();
  useChatsLoading(); // triggers re-render after initial Firestore load completes
  const [chats, setChats] = useState<Chat[]>([]);
  const aiLoadingRef = useRef(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [postSave, setPostSave] = useState<{ type: "ai"; id: string } | null>(
    null,
  );
  const [autoLink, setAutoLink] = useState<AutoLinkResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auto-grow textarea ref (B) ───────────────────────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Message edit/delete state (C) ────────────────────────────────────────
  const [msgActionId, setMsgActionId] = useState<string | null>(null); // hover action menu open
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [deleteWarning, setDeleteWarning] = useState<{
    id: string;
    kind: "single" | "cascade";
  } | null>(null);

  // ── File attachment state ────────────────────────────────────────────────
  interface AttachedFile {
    id: string;
    name: string;
    content: string;
    mimeType: string;
    uploading?: boolean;
    error?: string;
    transactions?: BankTransaction[];
    bankMeta?: BankMeta;
    needsReview?: boolean; // true while awaiting user confirmation of OCR result
    file?: File; // original File object, kept for AI-triggered Storage upload
  }
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Snapshot of ready files captured before setAttachedFiles clears them;
  // consumed by executeActionsAsync when the AI triggers a save_document action.
  const pendingFilesRef = useRef<PendingFileRef[]>([]);
  // Canonical bank statement data — captured into a ref before attachedFiles is
  // cleared so async callbacks (getCanonicalBankTransactions, setPendingMoneyMeta)
  // can still read it after the state update.  Using a ref avoids the React
  // stale-closure problem: the .then() callback always reads the latest ref value.
  const canonicalBankDataRef = useRef<{
    transactions: BankTransaction[];
    bankMeta: BankMeta | null;
  } | null>(null);
  // Pending bank-statement import — set by preview_bank_import action, cleared
  // on confirm or cancel.  Classification is by direction field only (from OCR).
  const [pendingMoneyImport, setPendingMoneyImport] = useState<
    BankTransaction[] | null
  >(null);
  const [pendingMoneyMeta, setPendingMoneyMeta] = useState<BankMeta | null>(
    null,
  );

  const activeChat = chats.find((c) => c.id === activeId) ?? null;

  // Real-time sync: apply Firestore updates when not processing an AI response
  // (gate prevents clobbering in-flight pending messages)
  useEffect(() => {
    if (!aiLoadingRef.current) setChats(storeChats);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeChats]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeChat?.messages.length, activeId]);

  useEffect(() => {
    const close = () => setMenuOpenId(null);
    if (menuOpenId) window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpenId]);

  // Close message action menu on outside click
  useEffect(() => {
    if (!msgActionId) return;
    const close = () => setMsgActionId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [msgActionId]);

  // Auto-grow textarea (B) — recalculate whenever input changes
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto"; // collapse first
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`; // 168 px ≈ 7 lines
  }, [input]);

  // Deep-link: open specific AI conversation navigated from a linked items panel
  useEffect(() => {
    const openId = (location.state as { openId?: string } | null)?.openId;
    if (!openId) return;
    window.history.replaceState(
      { ...(window.history.state ?? {}), usr: null },
      "",
    );
    setActiveId(openId);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start a chat when arriving from Kool with a pending prompt
  useEffect(() => {
    const prompt = sessionStorage.getItem("kivora_ai_prompt");
    if (prompt) {
      sessionStorage.removeItem("kivora_ai_prompt");
      startNewChat(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── File helpers ────────────────────────────────────────────────────────

  /** User confirmed the bank statement review → clear the review gate. */
  function confirmBankStatementReview(id: string) {
    setAttachedFiles((prev) =>
      prev.map((f) => (f.id !== id ? f : { ...f, needsReview: false })),
    );
  }

  /**
   * Build the hidden attachment context and chip metadata for a set of ready files.
   * The hidden context is sent to the AI but never rendered in the chat UI.
   * Bank statements use structured JSON; other files use extracted plain text.
   */
  function buildAttachmentPayload(files: AttachedFile[]): {
    hiddenContext: string;
    attachments: AttachmentMeta[];
  } {
    const ready = files.filter(
      (f) => (f.content || f.transactions?.length) && !f.uploading && !f.error,
    );
    if (ready.length === 0) return { hiddenContext: "", attachments: [] };

    const attachments: AttachmentMeta[] = ready.map((f) => ({
      name: f.name,
      mimeType: f.mimeType,
    }));

    const contextParts = ready.map((f) => {
      // Bank statement: send ONLY bankMeta — NEVER the full transactions array.
      //
      // Sending the transactions array to the LLM caused two confirmed bugs:
      //   1. JSON was hard-sliced at 15,000 chars → LLM received truncated/invalid
      //      JSON → wrong counts (e.g. 9 income instead of 6) and wrong totals.
      //   2. LLM re-derived direction from raw debit/credit fields, ignoring the
      //      canonical direction field → same transaction appeared in both lists.
      //
      // The full canonical transactions array is stored in canonicalBankDataRef.
      // preview_bank_import reads it directly via getCanonicalBankTransactions()
      // without going through the LLM.  The MoneyImportReviewCard renders from
      // that array — counts and totals are always correct and never LLM-generated.
      if (f.transactions?.length) {
        // bankMeta-only: ~600 chars, never truncated, no transaction rows exposed.
        const payload = JSON.stringify({ bankMeta: f.bankMeta }, null, 2);
        console.log(
          `[canonical context] Sending bankMeta-only to LLM: ${payload.length} chars` +
            ` | incomeCount=${f.bankMeta?.incomeCount ?? "?"} expenseCount=${f.bankMeta?.expenseCount ?? "?"}` +
            ` | calculatedIncomeTotal=${f.bankMeta?.calculatedIncomeTotal ?? "?"} calculatedExpenseTotal=${f.bankMeta?.calculatedExpenseTotal ?? "?"}` +
            ` | importAllowed=${f.bankMeta?.importAllowed ?? "?"} extractionComplete=${f.bankMeta?.extractionComplete ?? "?"}`,
        );
        return `BANK_STATEMENT_CANONICAL_DATA\nattachmentId: ${f.id}\nfilename: ${f.name}\n---\n${payload}`;
      }
      // Other documents: send extracted text + ID so AI can reference it in save_document
      return `Attached document (attachmentId: ${f.id}): ${f.name}\n---\n${f.content.slice(0, 12_000)}`;
    });

    return {
      hiddenContext: contextParts.join("\n\n===\n\n"),
      attachments,
    };
  }

  async function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // allow re-selecting same file
    const id = uid();

    // ── Client-side pre-validation ────────────────────────────────────────
    const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — matches server multer limit
    if (file.size > MAX_BYTES) {
      setAttachedFiles((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          content: "",
          mimeType: file.type,
          uploading: false,
          error:
            lang === "et"
              ? "Fail on liiga suur (max 20 MB)."
              : "File too large (max 20 MB).",
        },
      ]);
      return;
    }
    const ALLOWED_EXTS = [
      ".pdf",
      ".docx",
      ".txt",
      ".csv",
      ".md",
      ".xlsx",
      ".xls",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
    ];
    const ALLOWED_MIME = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    const mimeOk =
      file.type.startsWith("text/") ||
      file.type.startsWith("image/") ||
      ALLOWED_MIME.includes(file.type);
    if (!mimeOk && !ALLOWED_EXTS.includes(ext)) {
      setAttachedFiles((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          content: "",
          mimeType: file.type,
          uploading: false,
          error:
            lang === "et" ? "Toetamata failitüüp." : "Unsupported file type.",
        },
      ]);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    setAttachedFiles((prev) => [
      ...prev,
      {
        id,
        name: file.name,
        content: "",
        mimeType: file.type,
        uploading: true,
        file,
      },
    ]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        let errMsg =
          (body as { error?: string }).error ?? `Upload failed (${res.status})`;
        // Map server-returned code to localized message
        if (errMsg === "PDF_NO_TEXT") {
          errMsg =
            lang === "et"
              ? "PDF ei sisalda loetavat teksti. Proovi tekstipõhist PDF-i."
              : "The PDF does not contain readable text. Try a text-based PDF.";
        }
        throw new Error(errMsg);
      }
      const data = (await res.json()) as {
        content: string;
        transactions?: BankTransaction[];
        bankMeta?: BankMeta;
        usedOCR?: boolean;
      };

      // Guard: never treat an empty extraction as success
      if (!data.content && !data.transactions?.length) {
        throw new Error(
          lang === "et"
            ? "PDF ei sisalda loetavat teksti. Proovi tekstipõhist PDF-i."
            : "The PDF does not contain readable text. Try a text-based PDF.",
        );
      }
      // If the server found structured bank transactions → review step
      // (Fix H: do not gate on usedOCR — readable bank statements also produce transactions)
      if (data.transactions?.length) {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  content: data.content,
                  uploading: false,
                  transactions: data.transactions,
                  bankMeta: data.bankMeta,
                  needsReview: true,
                  // preserve File reference for potential save_document action
                }
              : f,
          ),
        );
      } else {
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, content: data.content, uploading: false } : f,
          ),
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : lang === "et"
            ? "Üleslaadimine ebaõnnestus."
            : "Upload failed.";
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, uploading: false, error: msg } : f,
        ),
      );
    }
  }

  function removeAttachedFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function createChat(
    firstText: string | null,
    firstHiddenContext?: string,
    firstAttachments?: AttachmentMeta[],
  ): Promise<Chat> {
    const palette = CHAT_PALETTE[chats.length % CHAT_PALETTE.length];
    const id = uid();
    const hasFirst = !!(firstText || firstAttachments?.length);
    const title = firstText
      ? firstText.slice(0, 48)
      : firstAttachments?.length
        ? firstAttachments[0].name.slice(0, 48)
        : t("ai.newChat", lang);
    const messages: ChatMessage[] = [];
    if (hasFirst) {
      messages.push({
        id: uid(),
        role: "user",
        content: firstText ?? "",
        time: nowTime(lang),
        attachments: firstAttachments?.length ? firstAttachments : undefined,
        hiddenContext: firstHiddenContext || undefined,
      });
      messages.push({
        id: uid(),
        role: "assistant",
        content: "",
        time: nowTime(lang),
        pending: true,
      });
    }
    const chat: Chat = {
      id,
      title,
      messages,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...palette,
    };
    if (hasFirst) {
      aiLoadingRef.current = true;
      setLoading(true);
      // Inject hiddenContext into history for the AI call
      const history = messages
        .filter((m) => !m.pending)
        .map((m) => ({
          role: m.role,
          content: m.hiddenContext
            ? `${m.content}\n\n${m.hiddenContext}`.trim()
            : m.content,
        }));
      fetchAIReply(history, lang)
        .then(async (res) => {
          const actionCtx = {
            uid: auth.currentUser?.uid ?? "",
            getFile: (fid: string) =>
              pendingFilesRef.current.find((f) => f.id === fid) ?? null,
            getAllDocuments,
            // Supply the server-validated canonical array so preview_bank_import
            // never uses any LLM-generated transaction list.  Read from the ref
            // (not attachedFiles state) to avoid stale-closure issues.
            getCanonicalBankTransactions: () =>
              canonicalBankDataRef.current?.transactions ?? null,
            setPendingMoneyImport: (txns: BankTransaction[]) => {
              setPendingMoneyImport(txns);
              setPendingMoneyMeta(
                canonicalBankDataRef.current?.bankMeta ?? null,
              );
            },
          };
          const results = await executeActionsAsync(res.actions, actionCtx);
          pendingFilesRef.current = [];
          const actionSummary = results
            .map((r) => r.message)
            .filter(Boolean)
            .join(" ");
          const finalReply = [actionSummary, res.reply]
            .filter(Boolean)
            .join("\n\n");
          setChats((prev) =>
            prev.map((c) =>
              c.id === id
                ? {
                    ...c,
                    updatedAt: Date.now(),
                    messages: c.messages.map((m) =>
                      m.id === messages[1].id
                        ? { ...m, content: finalReply, pending: false }
                        : m,
                    ),
                  }
                : c,
            ),
          );
          // Persist resolved conversation to Firestore
          storeSaveChat({
            ...chat,
            updatedAt: Date.now(),
            messages: [
              messages[0],
              { ...messages[1], content: finalReply, pending: false },
            ],
          }).catch(() => {});
        })
        .catch(() => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === id
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === messages[1].id
                        ? {
                            ...m,
                            content: t("ai.chat.error", lang),
                            pending: false,
                            error: true,
                          }
                        : m,
                    ),
                  }
                : c,
            ),
          );
        })
        .finally(() => {
          aiLoadingRef.current = false;
          setLoading(false);
        });
    }
    return chat;
  }

  async function startNewChat(
    prefilled: string | null = null,
    hiddenContext?: string,
    attachments?: AttachmentMeta[],
  ) {
    const chat = await createChat(prefilled, hiddenContext, attachments);
    setChats((prev) => [chat, ...prev]);
    // Persist to Firestore — user message only; pending AI message is local-only
    storeSaveChat({
      ...chat,
      messages: chat.messages.filter((m) => !m.pending),
    }).catch(() => {});
    setActiveId(chat.id);
    setInput("");
    setPostSave({ type: "ai", id: chat.id });
    runAutomaticLinking("ai", chat.id, lang, { title: chat.title }).then(
      (r) => {
        if (r.linkIds.length > 0) setAutoLink(r);
      },
    );
  }

  async function confirmMoneyImport() {
    if (!pendingMoneyImport || pendingMoneyImport.length === 0) return;
    // Fail-closed guard — importAllowed must be explicitly true before any Firestore write.
    // New pipeline: importAllowed=true for verified + unverified; false for review_required.
    // Legacy compat: if old pipeline flags are present and explicitly false, also block.
    const canImport =
      pendingMoneyMeta != null &&
      pendingMoneyMeta.importAllowed === true &&
      pendingMoneyMeta.reconciliationOk !== false &&
      pendingMoneyMeta.extractionComplete !== false &&
      !pendingMoneyImport.some((t) => t.needsReview);
    if (!canImport) return;

    const now = Date.now();
    let incomeAdded = 0,
      expenseAdded = 0,
      skipped = 0,
      failed = 0;
    const failMsgs: string[] = [];

    for (const item of pendingMoneyImport) {
      if (item.needsReview) {
        skipped++;
        continue;
      } // already blocked above, but guard here too
      // Pending/reserved rows must NEVER be written as posted transactions.
      // The server already excludes them from totals, but this client-side
      // guard is a fail-safe in case a pending row reaches the write loop.
      if (item.pending) {
        skipped++;
        continue;
      }
      // direction is authoritative — never reclassify
      const type = item.direction; // "income" | "expense"
      const dup = findMoneyDuplicate(
        item.date,
        item.amount,
        item.description,
        type,
      );
      if (dup) {
        skipped++;
        continue;
      }

      const category =
        type === "income"
          ? resolveIncomeCategory(undefined, item.description)
          : resolveExpenseCategory(undefined, item.description);

      const tx: Transaction = {
        id: `tx-${now}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        amount: item.amount,
        currency: item.currency,
        title: item.description.slice(0, 200),
        category,
        date: item.date,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await addTransaction(tx);
        if (type === "income") incomeAdded++;
        else expenseAdded++;
      } catch (e) {
        failed++;
        if (failMsgs.length < 3) failMsgs.push(item.description);
      }
    }

    setPendingMoneyImport(null);
    setPendingMoneyMeta(null);

    // Inject a result message directly into the active chat without an AI call
    const et = lang === "et";
    const lines: string[] = [
      et ? "Valmis. Lisasin Raha moodulisse:" : "Done. Added to Money module:",
    ];
    if (incomeAdded > 0)
      lines.push(`${incomeAdded} ${et ? "sissetulekut" : "income record(s)"}`);
    if (expenseAdded > 0)
      lines.push(`${expenseAdded} ${et ? "väljaminekut" : "expense(s)"}`);
    if (skipped > 0)
      lines.push(
        `${skipped} ${et ? "vahele jäetud (duplikaat)" : "skipped (duplicate)"}`,
      );
    if (failed > 0)
      lines.push(
        `${failed} ${et ? "ebaõnnestus" : "failed"}${failMsgs.length > 0 ? ": " + failMsgs.join(", ") : ""}`,
      );

    const resultMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: lines.join("\n"),
      time: nowTime(lang),
    };

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeId
          ? { ...c, updatedAt: now, messages: [...c.messages, resultMsg] }
          : c,
      ),
    );
    const chat = chats.find((c) => c.id === activeId);
    if (chat) {
      storeSaveChat({
        ...chat,
        updatedAt: now,
        messages: [...chat.messages, resultMsg],
      }).catch(() => {});
    }
  }

  function openChat(id: string) {
    setActiveId(id);
    setMenuOpenId(null);
  }

  function backToList() {
    setActiveId(null);
  }

  function sendMessage(text: string) {
    const trimmed = text.trim();
    // Collect files that are ready to send (uploaded, not errored, not awaiting review)
    const readyFiles = attachedFiles.filter(
      (f) => (f.content || f.transactions?.length) && !f.uploading && !f.error,
    );
    const { hiddenContext, attachments } = buildAttachmentPayload(readyFiles);
    const hasContent = trimmed || attachments.length > 0;
    if (!hasContent || loading) return;

    // Snapshot File references before clearing state — consumed by executeActionsAsync
    // when the AI triggers a save_document action.
    pendingFilesRef.current = readyFiles.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType || "application/octet-stream",
      file: f.file,
      size: f.file?.size ?? 0,
    }));

    // Snapshot canonical bank data into a ref BEFORE clearing attachedFiles.
    // This ensures getCanonicalBankTransactions() and setPendingMoneyMeta()
    // can still access the transactions and bankMeta from async .then() callbacks,
    // regardless of whether React has committed the setAttachedFiles([]) update.
    const bankFile = readyFiles.find(
      (f) => f.transactions && f.transactions.length > 0,
    );
    canonicalBankDataRef.current = bankFile
      ? {
          transactions: bankFile.transactions!,
          bankMeta: bankFile.bankMeta ?? null,
        }
      : null;

    // Clear successfully uploaded files before sending
    if (readyFiles.length > 0) setAttachedFiles([]);

    if (!activeChat) {
      startNewChat(
        trimmed || null,
        hiddenContext || undefined,
        attachments.length > 0 ? attachments : undefined,
      );
      return;
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      time: nowTime(lang),
      attachments: attachments.length > 0 ? attachments : undefined,
      hiddenContext: hiddenContext || undefined,
    };
    const aiMsgId = uid();
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      time: nowTime(lang),
      pending: true,
    };
    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              messages: [...c.messages, userMsg, aiMsg],
              title:
                c.messages.length === 0
                  ? (trimmed || attachments[0]?.name || "").slice(0, 48)
                  : c.title,
              updatedAt: Date.now(),
            }
          : c,
      ),
    );
    setInput("");

    // Build conversation history for the AI — inject hiddenContext per message,
    // but never render it in the chat UI.
    const fullHistory = [
      ...activeChat.messages.filter((m) => !m.pending && !m.error),
      userMsg,
    ].map((m) => ({
      role: m.role,
      content: m.hiddenContext
        ? `${m.content}\n\n${m.hiddenContext}`.trim()
        : m.content,
    }));
    aiLoadingRef.current = true;
    setLoading(true);
    fetchAIReply(fullHistory, lang)
      .then(async (res) => {
        const actionCtx = {
          uid: auth.currentUser?.uid ?? "",
          getFile: (fid: string) =>
            pendingFilesRef.current.find((f) => f.id === fid) ?? null,
          getAllDocuments,
          getCanonicalBankTransactions: () =>
            canonicalBankDataRef.current?.transactions ?? null,
          setPendingMoneyImport: (txns: BankTransaction[]) => {
            setPendingMoneyImport(txns);
            setPendingMoneyMeta(canonicalBankDataRef.current?.bankMeta ?? null);
          },
        };
        const results = await executeActionsAsync(res.actions, actionCtx);
        pendingFilesRef.current = [];
        const actionSummary = results
          .map((r) => r.message)
          .filter(Boolean)
          .join(" ");
        const finalReply = [actionSummary, res.reply]
          .filter(Boolean)
          .join("\n\n");
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  updatedAt: Date.now(),
                  messages: c.messages.map((m) =>
                    m.id === aiMsgId
                      ? { ...m, content: finalReply, pending: false }
                      : m,
                  ),
                }
              : c,
          ),
        );
        // Persist resolved conversation to Firestore
        storeSaveChat({
          ...activeChat,
          updatedAt: Date.now(),
          title:
            activeChat.messages.length === 0
              ? trimmed.slice(0, 48)
              : activeChat.title,
          messages: [
            ...activeChat.messages.filter((m) => !m.pending && !m.error),
            userMsg,
            {
              id: aiMsgId,
              role: "assistant" as Role,
              content: finalReply,
              time: nowTime(lang),
            },
          ],
        }).catch(() => {});
        // Dispatch AI notification on first response of this session
        if (!aiNotifDispatchedRef.current) {
          const settings = getLocalNotificationSettings();
          if (settings.modules.assistant) {
            dispatchNotif({
              type: "ai-first-response",
              module: "assistant",
              title: t("notif.ai.title", lang),
              description: t("notif.ai.desc", lang),
              timeLabel: t("notif.today", lang),
              read: false,
              icon: "bot",
              accent: "#6F5AE8",
            });
          }
          aiNotifDispatchedRef.current = true;
        }
      })
      .catch(() => {
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChat.id
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === aiMsgId
                      ? {
                          ...m,
                          content: t("ai.chat.error", lang),
                          pending: false,
                          error: true,
                        }
                      : m,
                  ),
                }
              : c,
          ),
        );
        // Preserve user message even if AI response failed
        storeSaveChat({
          ...activeChat,
          updatedAt: Date.now(),
          title:
            activeChat.messages.length === 0
              ? trimmed.slice(0, 48)
              : activeChat.title,
          messages: [
            ...activeChat.messages.filter((m) => !m.pending && !m.error),
            userMsg,
          ],
        }).catch(() => {});
      })
      .finally(() => {
        aiLoadingRef.current = false;
        setLoading(false);
      });
  }

  function handleSend() {
    const hasContent =
      input.trim() ||
      attachedFiles.some(
        (f) =>
          (f.content || f.transactions?.length) &&
          !f.uploading &&
          !f.error &&
          !f.needsReview,
      );
    if (!hasContent || loading) return;
    sendMessage(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading) handleSend();
    }
    // Shift+Enter → native newline insertion (browser default, no override needed)
  }

  // ── Message edit/delete handlers (C) ────────────────────────────────────

  /**
   * Defensive content extractor — if an assistant message was accidentally
   * stored as a raw JSON wrapper `{ "reply": "...", "actions": [...] }`,
   * return only the reply text. Otherwise return as-is.
   */
  function safeContent(content: string): string {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const p = JSON.parse(trimmed);
        if (typeof p?.reply === "string") return p.reply;
      } catch {
        /* not JSON */
      }
    }
    return content;
  }

  function startEditMessage(m: ChatMessage) {
    setEditingMsgId(m.id);
    setEditContent(m.content);
    setMsgActionId(null);
  }

  function cancelEdit() {
    setEditingMsgId(null);
    setEditContent("");
  }

  async function commitEdit() {
    if (!activeChat || !editingMsgId) return;
    const idx = activeChat.messages.findIndex((m) => m.id === editingMsgId);
    if (idx === -1) {
      cancelEdit();
      return;
    }
    // Check if there are later messages that would become stale
    const laterMessages = activeChat.messages
      .slice(idx + 1)
      .filter((m) => !m.pending);
    if (laterMessages.length > 0) {
      // Warn the user — we'll delete from the edited message onward after confirmation
      setDeleteWarning({ id: editingMsgId, kind: "cascade" });
      return;
    }
    // No later messages — safe to update in place
    await storeUpdateChatMessage(activeChat.id, editingMsgId, {
      content: editContent.trim(),
    });
    setChats(
      chats.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              messages: c.messages.map((m) =>
                m.id === editingMsgId
                  ? { ...m, content: editContent.trim() }
                  : m,
              ),
            }
          : c,
      ),
    );
    cancelEdit();
  }

  async function confirmEditWithCascadeDelete() {
    if (!activeChat || !editingMsgId || !deleteWarning) return;
    // Delete from the edited message onward (removes edited msg + all later msgs)
    await storeDeleteMessagesFrom(activeChat.id, editingMsgId);
    // Re-apply the local state optimistically (store already emits updated chat)
    cancelEdit();
    setDeleteWarning(null);
    // The input is now pre-filled with the original message text so the user
    // can resend it — set the composer input to the edited text
    setInput(editContent.trim());
  }

  function requestDelete(m: ChatMessage) {
    setMsgActionId(null);
    if (!activeChat) return;
    const idx = activeChat.messages.findIndex((mm) => mm.id === m.id);
    const laterMessages = activeChat.messages
      .slice(idx + 1)
      .filter((mm) => !mm.pending);
    setDeleteWarning({
      id: m.id,
      kind: laterMessages.length > 0 ? "cascade" : "single",
    });
  }

  async function confirmDelete() {
    if (!activeChat || !deleteWarning) return;
    const { id, kind } = deleteWarning;
    setDeleteWarning(null);
    if (kind === "cascade") {
      await storeDeleteMessagesFrom(activeChat.id, id);
    } else {
      await storeDeleteChatMessage(activeChat.id, id);
    }
  }

  function startRename(id: string, current: string) {
    setRenamingId(id);
    setRenameValue(current);
    setMenuOpenId(null);
  }

  function commitRename() {
    if (!renamingId) return;
    const v = renameValue.trim();
    if (v) {
      setChats((prev) =>
        prev.map((c) =>
          c.id === renamingId ? { ...c, title: v, updatedAt: Date.now() } : c,
        ),
      );
      const chat = chats.find((c) => c.id === renamingId);
      if (chat)
        storeSaveChat({ ...chat, title: v, updatedAt: Date.now() }).catch(
          () => {},
        );
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function togglePin(id: string) {
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)),
    );
    const chat = chats.find((c) => c.id === id);
    if (chat) storeSaveChat({ ...chat, pinned: !chat.pinned }).catch(() => {});
    setMenuOpenId(null);
  }

  function deleteChat(id: string) {
    setChats((prev) => prev.filter((c) => c.id !== id));
    removeLinksForEntity("ai", id);
    storeDeleteChat(id).catch(() => {});
    if (activeId === id) setActiveId(null);
    setMenuOpenId(null);
  }

  function formatChatTime(c: Chat): string {
    const diff = Date.now() - c.updatedAt;
    const locale = lang === "en" ? "en-GB" : "et-EE";
    if (diff < 86400_000)
      return `${t("ai.time.today", lang)}, ${new Date(c.updatedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`;
    if (diff < 2 * 86400_000) return t("ai.time.yesterday", lang);
    return new Date(c.updatedAt).toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const sortedChats = [...chats].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  );

  // ── Recommendation maturity ───────────────────────────────────────────────
  // Activity score is derived from real user data across all modules.
  // It intentionally has NO fixed time component — a power user who creates lots
  // of content on day 1 reaches maturity immediately, while a casual user might
  // take longer (or never reach it if they don't use the app enough).
  const activityScore =
    allTasks.filter((t) => t.completed).length * 3 + // completed tasks = strong engagement
    allTasks.length * 1 + // any task = basic engagement
    allGoals.length * 4 + // goals = deep commitment
    allEvents.length * 1 + // calendar events
    allHabits.length * 3 + // habit tracking = sustained use
    allNotes.length * 1 + // notes = content creation
    chats.length * 2 + // AI conversations
    allTransactions.length * 1; // finance usage

  // Threshold of 10 means a user needs meaningful engagement across at least
  // a couple of modules before proactive recommendations are shown.
  const hasEnoughData = activityScore >= 10;

  // ── Personalized suggestions (only when hasEnoughData is true) ────────────
  const todayISO = new Date().toISOString().split("T")[0];
  const pendingTasks = allTasks.filter((t) => !t.completed);
  const upcomingEventCount = allEvents.filter((e) => e.date >= todayISO).length;
  const avgGoalPct =
    allGoals.length === 0
      ? 0
      : Math.round(
          allGoals.reduce(
            (s, g) => s + (g.progressValue / Math.max(g.progressMax, 1)) * 100,
            0,
          ) / allGoals.length,
        );

  const personalizedSuggestions = [
    // Task prioritization — message reflects real pending count
    {
      icon: <CheckSquare size={20} strokeWidth={1.8} />,
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      title: t("ai.suggested.prioritize.title", lang),
      desc:
        pendingTasks.length > 0
          ? lang === "et"
            ? `Sul on ${pendingTasks.length} lõpetamata ülesannet. Aidake mul need tähtsuse järjekorras seada.`
            : `You have ${pendingTasks.length} pending tasks. Help me sort them by priority.`
          : t("ai.suggested.prioritize.desc", lang),
    },
    // Day planning — message reflects upcoming event count
    {
      icon: <Calendar size={20} strokeWidth={1.8} />,
      iconBg: "#EDE9FB",
      iconColor: "#6F5AE8",
      title: t("ai.suggested.plan.title", lang),
      desc:
        upcomingEventCount > 0
          ? lang === "et"
            ? `Sul on ${upcomingEventCount} eelseisvat sündmust. Planeeri mu päev nende ümber.`
            : `You have ${upcomingEventCount} upcoming events. Help me plan my day around them.`
          : t("ai.suggested.plan.desc", lang),
    },
    // Goal review — message reflects actual average progress
    {
      icon: <Target size={20} strokeWidth={1.8} />,
      iconBg: "#FEE2E2",
      iconColor: "#DC2626",
      title: t("ai.suggested.goals.title", lang),
      desc:
        allGoals.length > 0
          ? lang === "et"
            ? `Sinu eesmärkide keskmine edenemine on ${avgGoalPct}%. Kuidas paremini edasi liikuda?`
            : `Your average goal progress is ${avgGoalPct}%. How can I make better progress?`
          : t("ai.suggested.goals.desc", lang),
    },
    // Habits analysis — message reflects real habit count
    {
      icon: <TrendingUp size={20} strokeWidth={1.8} />,
      iconBg: "#EDE9FB",
      iconColor: "#6F5AE8",
      title: t("ai.suggested.habits.title", lang),
      desc:
        allHabits.length > 0
          ? lang === "et"
            ? `Jälgid ${allHabits.length} harjumust. Analüüsime, kuidas järjekindlam olla.`
            : `You're tracking ${allHabits.length} habits. Let's analyze how to stay more consistent.`
          : t("ai.suggested.habits.desc", lang),
    },
  ];

  return (
    <div className="flex flex-col md:flex-row gap-6 p-3 sm:p-4 lg:p-6 max-w-[1400px] mx-auto w-full">
      {/* ── Main content ──────────────d,�──────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-6">
        {activeChat ? (
          /* ── Active chat view ── */
          <div className="relative flex flex-col bg-white rounded-2xl border border-[#ECECF2] overflow-hidden h-[calc(100dvh-12rem)] lg:h-[calc(100dvh-7rem)] min-h-[480px]">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#ECECF2]">
              <button
                onClick={backToList}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F4F4F8] text-[#64748B] transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={2} />
              </button>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: activeChat.iconBg,
                  color: activeChat.iconColor,
                }}
              >
                <MessageCircle size={15} strokeWidth={1.8} />
              </div>
              <p className="flex-1 text-sm font-semibold text-[#1A1F36] truncate">
                {activeChat.title}
              </p>
              {activeChat.pinned && (
                <Pin size={14} className="text-[#6F5AE8]" />
              )}
              <div className="relative">
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F4F4F8] text-[#64748B] transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpenId(
                      menuOpenId === activeChat.id ? null : activeChat.id,
                    );
                  }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpenId === activeChat.id && (
                  <div
                    className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-[#ECECF2] shadow-lg py-1 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() =>
                        startRename(activeChat.id, activeChat.title)
                      }
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                    >
                      <Pencil size={13} /> {t("ai.menu.rename", lang)}
                    </button>
                    <button
                      onClick={() => togglePin(activeChat.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                    >
                      {activeChat.pinned ? (
                        <PinOff size={13} />
                      ) : (
                        <Pin size={13} />
                      )}
                      {activeChat.pinned
                        ? t("ai.menu.unpin", lang)
                        : t("ai.menu.pin", lang)}
                    </button>
                    <button
                      onClick={() => deleteChat(activeChat.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                    >
                      <Trash2 size={13} /> {t("ai.menu.delete", lang)}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 space-y-4"
            >
              {activeChat.messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center text-sm text-[#94A3B8]">
                  <Sparkles size={28} className="mb-3 text-[#6F5AE8]" />
                  {t("ai.chat.startPrompt", lang)}
                </div>
              )}
              {activeChat.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex group ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  onMouseLeave={() => {
                    if (msgActionId === m.id) setMsgActionId(null);
                  }}
                >
                  {/* Message bubble */}
                  <div
                    className={`relative max-w-[78%] min-w-0 ${m.role === "user" ? "order-2" : ""}`}
                  >
                    {/* Action buttons — visible on hover (desktop) or when menu open */}
                    {!m.pending && (
                      <div
                        className={`absolute ${m.role === "user" ? "right-0 -top-7" : "left-0 -top-7"} flex items-center gap-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity`}
                      >
                        {m.role === "user" && (
                          <button
                            onClick={() => startEditMessage(m)}
                            className="p-1 rounded-md bg-white border border-[#ECECF2] text-[#94A3B8] hover:text-[#6F5AE8] shadow-sm"
                            title={lang === "et" ? "Muuda" : "Edit"}
                          >
                            <Edit3 size={11} strokeWidth={2} />
                          </button>
                        )}
                        <button
                          onClick={() => requestDelete(m)}
                          className="p-1 rounded-md bg-white border border-[#ECECF2] text-[#94A3B8] hover:text-[#DC2626] shadow-sm"
                          title={lang === "et" ? "Kustuta" : "Delete"}
                        >
                          <Trash2 size={11} strokeWidth={2} />
                        </button>
                      </div>
                    )}

                    {/* Inline edit mode */}
                    {editingMsgId === m.id ? (
                      <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#EDE9FB] border border-[#6F5AE8]/30 min-w-[220px]">
                        <textarea
                          className="w-full text-sm text-[#1A1F36] bg-transparent outline-none resize-none leading-relaxed"
                          rows={3}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1 text-xs rounded-lg border border-[#DDD8F8] text-[#6F5AE8] hover:bg-[#F2EFFD]"
                          >
                            {lang === "et" ? "Tühista" : "Cancel"}
                          </button>
                          <button
                            onClick={commitEdit}
                            disabled={!editContent.trim()}
                            className="px-3 py-1 text-xs rounded-lg bg-[#6F5AE8] text-white hover:bg-[#5B48D8] disabled:opacity-40"
                          >
                            {lang === "et" ? "Salvesta" : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words min-w-0 ${
                          m.role === "user"
                            ? "bg-[#6F5AE8] text-white rounded-br-md"
                            : "bg-[#F4F4F8] text-[#1A1F36] rounded-bl-md"
                        }`}
                      >
                        {m.pending ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <span
                              className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce"
                              style={{ animationDelay: "0ms" }}
                            />
                            <span
                              className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce"
                              style={{ animationDelay: "150ms" }}
                            />
                            <span
                              className="w-2 h-2 rounded-full bg-[#94A3B8] animate-bounce"
                              style={{ animationDelay: "300ms" }}
                            />
                          </div>
                        ) : (
                          <>
                            {/* Attachment chips — shown for user messages with files */}
                            {m.role === "user" &&
                              m.attachments &&
                              m.attachments.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                  {m.attachments.map((a, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/20 text-white/90 text-[10px] font-medium max-w-[160px]"
                                    >
                                      <FileText
                                        size={10}
                                        className="flex-shrink-0"
                                      />
                                      <span className="truncate">{a.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            {m.role === "assistant" && !m.error ? (
                              <MarkdownReply content={safeContent(m.content)} />
                            ) : (
                              <span
                                className={`whitespace-pre-wrap ${m.error ? "text-[#DC2626]" : ""}`}
                              >
                                {m.role === "user"
                                  ? m.content
                                  : safeContent(m.content)}
                              </span>
                            )}
                            <span
                              className={`block text-[10px] mt-1 ${m.role === "user" ? "text-white/60" : "text-[#94A3B8]"}`}
                            >
                              {m.time}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Linked items */}
            <LinkedItemsPanel
              type="ai"
              entityId={activeChat.id}
              lang={lang}
              className="border-t border-[#ECECF2] px-5 py-2"
            />

            {/* Review cards + file chips — active chat */}
            {attachedFiles.length > 0 && (
              <div className="bg-white border-t border-[#ECECF2]">
                {/* Bank statement review cards (need user confirmation) */}
                {attachedFiles.some((f) => f.needsReview) && (
                  <div className="px-4 pt-3">
                    {attachedFiles
                      .filter((f) => f.needsReview)
                      .map((f) => (
                        <ReviewCard
                          key={f.id}
                          file={f}
                          lang={lang}
                          onConfirm={confirmBankStatementReview}
                          onCancel={removeAttachedFile}
                        />
                      ))}
                  </div>
                )}
                {/* Normal file chips */}
                {attachedFiles.some((f) => !f.needsReview) && (
                  <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
                    {attachedFiles
                      .filter((f) => !f.needsReview)
                      .map((f) => (
                        <div
                          key={f.id}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                            f.error
                              ? "bg-red-50 text-red-600 border-red-200"
                              : "bg-[#F2EFFD] text-[#6F5AE8] border-[#DDD8F8]"
                          }`}
                        >
                          {f.uploading ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : f.error ? (
                            <XIcon size={11} className="flex-shrink-0" />
                          ) : (
                            <FileText size={11} className="flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <span className="block max-w-[120px] truncate">
                              {f.name}
                            </span>
                            {f.error && (
                              <span className="block max-w-[120px] truncate text-[10px] leading-tight opacity-90">
                                {f.error}
                              </span>
                            )}
                          </div>
                          {!f.uploading && (
                            <button
                              onClick={() => removeAttachedFile(f.id)}
                              className="ml-0.5 flex-shrink-0 hover:text-[#1A1F36] transition-colors"
                            >
                              <XIcon size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
            {/* Money import review card — overlays the chat pane so footer is always reachable.
                Positioned absolute so it is fully outside the flex flow; the chat pane's
                overflow-hidden cannot clip the footer. top/bottom inset keeps the card
                within the pane bounds — no viewport-fixed positioning. */}
            {MONEY_MODULE_ENABLED && pendingMoneyImport && (
              <div
                className="absolute inset-x-0 z-10 px-4 py-2 flex flex-col justify-end pointer-events-none"
                style={{ top: "53px", bottom: "52px" }}
              >
                <div className="pointer-events-auto">
                  <MoneyImportReviewCard
                    transactions={pendingMoneyImport}
                    bankMeta={pendingMoneyMeta ?? undefined}
                    lang={lang}
                    onConfirm={confirmMoneyImport}
                    onCancel={() => {
                      setPendingMoneyImport(null);
                      setPendingMoneyMeta(null);
                    }}
                  />
                </div>
              </div>
            )}
            {/* Input composer (active chat) */}
            <div className="flex items-end gap-2 bg-white border-t border-[#ECECF2] px-4 py-3">
              {/* Hidden file input (active chat branch) */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,.gif"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#6F5AE8] hover:bg-[#F2EFFD] transition-colors mb-0.5"
                title={lang === "et" ? "Lisa fail" : "Attach file"}
              >
                <Paperclip size={15} strokeWidth={2.2} />
              </button>
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("ai.chat.placeholder", lang)}
                className="flex-1 text-sm text-[#1A1F36] placeholder:text-[#94A3B8] bg-transparent outline-none resize-none leading-relaxed overflow-y-auto"
                style={{ maxHeight: "168px", overflowWrap: "anywhere" }}
              />
              <button
                className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors text-white disabled:opacity-40 mb-0.5"
                onClick={handleSend}
                disabled={
                  (!input.trim() &&
                    !attachedFiles.some(
                      (f) =>
                        f.content && !f.uploading && !f.error && !f.needsReview,
                    )) ||
                  attachedFiles.some((f) => f.uploading || f.needsReview) ||
                  loading
                }
              >
                <Send size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Hero card */}
            <div className="ai-hero-card bg-[#F2EFFD] rounded-2xl border border-[#DDD8F8] p-7">
              {/* Icon */}
              <div className="ai-hero-icon w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center mb-5 text-[#6F5AE8]">
                <Sparkles size={20} strokeWidth={2} />
              </div>

              <h1 className="text-2xl font-bold text-[#1A1F36] mb-1">
                {t("ai.heroTitle", lang)}
              </h1>
              <p className="text-sm text-[#64748B] mb-6">
                {t("ai.heroSubtitle", lang)}
              </p>

              {/* Review cards + file chips — hero */}
              {attachedFiles.length > 0 && (
                <div className="mb-3">
                  {/* Bank statement review cards */}
                  {attachedFiles.some((f) => f.needsReview) && (
                    <div className="mb-2">
                      {attachedFiles
                        .filter((f) => f.needsReview)
                        .map((f) => (
                          <ReviewCard
                            key={f.id}
                            file={f}
                            lang={lang}
                            onConfirm={confirmBankStatementReview}
                            onCancel={removeAttachedFile}
                          />
                        ))}
                    </div>
                  )}
                  {/* Normal file chips */}
                  {attachedFiles.some((f) => !f.needsReview) && (
                    <div className="flex flex-wrap gap-2">
                      {attachedFiles
                        .filter((f) => !f.needsReview)
                        .map((f) => (
                          <div
                            key={f.id}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                              f.error
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "bg-white text-[#6F5AE8] border-[#DDD8F8]"
                            }`}
                          >
                            {f.uploading ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : f.error ? (
                              <XIcon size={11} className="flex-shrink-0" />
                            ) : (
                              <FileText size={11} className="flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="block max-w-[120px] truncate">
                                {f.name}
                              </span>
                              {f.error && (
                                <span className="block max-w-[120px] truncate text-[10px] leading-tight opacity-90">
                                  {f.error}
                                </span>
                              )}
                            </div>
                            {!f.uploading && (
                              <button
                                onClick={() => removeAttachedFile(f.id)}
                                className="ml-0.5 flex-shrink-0 hover:text-[#1A1F36] transition-colors"
                              >
                                <XIcon size={10} />
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
              {/* Input composer */}
              <div className="ai-input-container flex items-end gap-2 bg-white rounded-xl border border-[#DDD8F8] px-4 py-3 shadow-sm">
                {/* Hidden file input (hero branch) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,.gif"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-[#94A3B8] hover:text-[#6F5AE8] hover:bg-[#F2EFFD] transition-colors mb-0.5"
                  title={lang === "et" ? "Lisa fail" : "Attach file"}
                >
                  <Paperclip size={15} strokeWidth={2.2} />
                </button>
                {/* Auto-growing textarea — Enter sends, Shift+Enter inserts newline */}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t("ai.input.placeholder2", lang)}
                  className="flex-1 text-sm text-[#1A1F36] placeholder:text-[#94A3B8] bg-transparent outline-none resize-none leading-relaxed overflow-y-auto"
                  style={{ maxHeight: "168px", overflowWrap: "anywhere" }}
                />
                <button
                  className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center bg-[#6F5AE8] hover:bg-[#5B48D8] transition-colors text-white disabled:opacity-40 mb-0.5"
                  onClick={handleSend}
                  disabled={
                    (!input.trim() &&
                      !attachedFiles.some(
                        (f) =>
                          f.content &&
                          !f.uploading &&
                          !f.error &&
                          !f.needsReview,
                      )) ||
                    attachedFiles.some((f) => f.uploading || f.needsReview)
                  }
                >
                  <Send size={15} strokeWidth={2.2} />
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {QUICK_ACTIONS_LANG.map((qa) => (
                  <button
                    key={qa.label}
                    className="ai-quick-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 hover:bg-white border border-[#DDD8F8] text-xs font-medium text-[#1A1F36] transition-colors"
                    onClick={() => startNewChat(qa.label)}
                  >
                    <span className="text-[#6F5AE8]">{qa.icon}</span>
                    {qa.label}
                  </button>
                ))}
                <button
                  className="ai-quick-btn w-8 h-8 flex items-center justify-center rounded-lg bg-white/80 hover:bg-white border border-[#DDD8F8] text-[#94A3B8] hover:text-[#1A1F36] transition-colors"
                  onClick={() => startNewChat(null)}
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>
            </div>

            {/* Soovitused / learning state */}
            <section>
              <h2 className="text-base font-semibold text-[#1A1F36] mb-3">
                {t("ai.suggestions.title", lang)}
              </h2>

              {!hasEnoughData ? (
                /*
                 * Learning state — shown to brand-new users or users who haven't
                 * yet generated enough real activity across Kivora's modules.
                 * Never left blank: always displays this friendly notice instead.
                 */
                <div className="ai-recommended-card bg-white rounded-2xl border border-[#ECECF2] p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0 text-[#6F5AE8]">
                    <Sparkles size={20} strokeWidth={2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1A1F36] mb-1">
                      {lang === "et"
                        ? "AI õpib sinu harjumusi."
                        : "AI is learning how you use Kivora."}
                    </p>
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      {lang === "et"
                        ? "Kasuta mõnda aega Kivorat ja siia ilmuvad isikupärastatud soovitused."
                        : "Personalized recommendations will appear after you have used Kivora for a while."}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8] flex-shrink-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#6F5AE8] animate-pulse" />
                    {lang === "et" ? "Õpin..." : "Learning..."}
                  </div>
                </div>
              ) : (
                /*
                 * Personalized recommendations — shown once the user has enough
                 * real activity. Every card title and description is built from
                 * live store data (task count, goal progress, event count, habit
                 * count) so they are never generic placeholders.
                 */
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {personalizedSuggestions.map((item) => (
                    <button
                      key={item.title}
                      className="ai-recommended-card bg-white rounded-2xl border border-[#ECECF2] p-4 text-left hover:border-[#6F5AE8]/30 hover:shadow-md transition-all group"
                      onClick={() => startNewChat(item.desc)}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                        style={{
                          background: item.iconBg,
                          color: item.iconColor,
                        }}
                      >
                        {item.icon}
                      </div>
                      <p className="text-sm font-semibold text-[#1A1F36] mb-1">
                        {item.title}
                      </p>
                      <p className="text-xs text-[#94A3B8] leading-relaxed">
                        {item.desc}
                      </p>
                      <div className="flex justify-end mt-3">
                        <ChevronRight
                          size={15}
                          className="text-[#94A3B8] group-hover:text-[#6F5AE8] transition-colors"
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* Hiljutised vestlused */}
            <section>
              <h2 className="text-base font-semibold text-[#1A1F36] mb-3">
                {t("ai.history.title", lang)}
              </h2>
              <div className="flex flex-col gap-2">
                {sortedChats.length === 0 && (
                  <div className="bg-white rounded-xl border border-[#ECECF2] px-4 py-6 text-center text-sm text-[#94A3B8]">
                    {t("ai.history.empty", lang)}
                  </div>
                )}
                {sortedChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="relative flex items-center gap-4 bg-white rounded-xl border border-[#ECECF2] px-4 py-3.5 hover:border-[#6F5AE8]/30 hover:shadow-sm transition-all group"
                  >
                    <button
                      className="flex items-center gap-4 flex-1 min-w-0 text-left"
                      onClick={() => openChat(chat.id)}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          background: chat.iconBg,
                          color: chat.iconColor,
                        }}
                      >
                        <MessageCircle size={16} strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A1F36] truncate">
                          {chat.title}
                        </p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          {formatChatTime(chat)}
                        </p>
                      </div>
                      {chat.pinned && (
                        <Pin
                          size={13}
                          className="text-[#6F5AE8] flex-shrink-0"
                        />
                      )}
                      <ChevronRight
                        size={15}
                        className="text-[#94A3B8] flex-shrink-0 group-hover:text-[#6F5AE8] transition-colors"
                      />
                    </button>
                    <div className="relative flex-shrink-0">
                      <button
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F4F4F8] text-[#64748B] transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(
                            menuOpenId === chat.id ? null : chat.id,
                          );
                        }}
                      >
                        <MoreHorizontal size={15} />
                      </button>
                      {menuOpenId === chat.id && (
                        <div
                          className="absolute right-0 bottom-full mb-1 w-44 bg-white rounded-xl border border-[#ECECF2] shadow-lg py-1 z-20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renamingId === chat.id ? (
                            <div className="px-3 py-2 flex items-center gap-2">
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename();
                                }}
                                className="flex-1 text-xs text-[#1A1F36] bg-[#F4F4F8] rounded-md px-2 py-1.5 outline-none"
                              />
                              <button
                                onClick={commitRename}
                                className="w-7 h-7 flex items-center justify-center rounded-md bg-[#6F5AE8] text-white"
                              >
                                <Check size={13} />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => startRename(chat.id, chat.title)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                              >
                                <Pencil size={13} /> {t("ai.menu.rename", lang)}
                              </button>
                              <button
                                onClick={() => togglePin(chat.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1A1F36] hover:bg-[#F4F4F8] transition-colors"
                              >
                                {chat.pinned ? (
                                  <PinOff size={13} />
                                ) : (
                                  <Pin size={13} />
                                )}
                                {chat.pinned
                                  ? t("ai.menu.unpin", lang)
                                  : t("ai.menu.pin", lang)}
                              </button>
                              <button
                                onClick={() => deleteChat(chat.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#FEF2F2] transition-colors"
                              >
                                <Trash2 size={13} /> {t("ai.menu.delete", lang)}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Right sidebar ─────────────────────────────────────────────── */}
      <aside className="w-full md:w-80 flex-shrink-0 flex flex-col gap-4">
        {/* AI võimalused */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {t("ai.capabilities.title", lang)}
          </h3>
          <div className="flex flex-col gap-4">
            {AI_CAPABILITIES_LANG.map((cap) => (
              <div key={cap.title} className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: cap.iconBg, color: cap.iconColor }}
                >
                  {cap.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1A1F36]">
                    {cap.title}
                  </p>
                  <p className="text-[11px] text-[#94A3B8] leading-relaxed mt-0.5">
                    {cap.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sinu statistika */}
        <div className="bg-white rounded-2xl border border-[#ECECF2] p-5">
          <h3 className="text-sm font-semibold text-[#1A1F36] mb-4">
            {t("ai.stats.title", lang)}
          </h3>
          <div className="flex flex-col gap-3">
            {STATS_LANG.map((stat) => {
              const value =
                stat.key === "chats"
                  ? chats.length
                  : stat.key === "tasks"
                    ? chats.reduce(
                        (n, c) =>
                          n +
                          c.messages.filter(
                            (m) =>
                              m.role === "user" &&
                              /ülesann|prioriseeri|task|priorit/i.test(
                                m.content,
                              ),
                          ).length,
                        0,
                      )
                    : chats.reduce(
                        (n, c) =>
                          n +
                          c.messages.filter(
                            (m) =>
                              m.role === "user" &&
                              /eesmärk|eesmärke|goal|goals/i.test(m.content),
                          ).length,
                        0,
                      );
              return (
                <div key={stat.label} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: stat.iconBg, color: stat.iconColor }}
                  >
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-lg font-bold text-[#1A1F36] leading-none">
                      {value}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5">
                      {stat.label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
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

      {/* ── Edit / Delete warning dialog (C) ────────────────────────────── */}
      {deleteWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl border border-[#ECECF2] shadow-xl p-6 w-full max-w-sm">
            {deleteWarning.kind === "cascade" && editingMsgId ? (
              /* Edit with cascade warning */
              <>
                <p className="text-sm font-semibold text-[#1A1F36] mb-2">
                  {lang === "et" ? "Jätka vestlust?" : "Continue conversation?"}
                </p>
                <p className="text-xs text-[#64748B] mb-4 leading-relaxed">
                  {lang === "et"
                    ? "Selle sõnumi muutmine muudab vestluse konteksti. Sellele järgnevad sõnumid eemaldatakse. Kas soovid sellest kohast vestluse uuesti jätkata?"
                    : "Editing this message changes the conversation context. Later messages will be removed. Do you want to continue the conversation from here?"}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setDeleteWarning(null);
                    }}
                    className="flex-1 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#64748B] hover:bg-[#F4F4F8]"
                  >
                    {lang === "et" ? "Tühista" : "Cancel"}
                  </button>
                  <button
                    onClick={confirmEditWithCascadeDelete}
                    className="flex-1 py-2 rounded-lg bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B48D8]"
                  >
                    {lang === "et" ? "Jätka" : "Continue"}
                  </button>
                </div>
              </>
            ) : (
              /* Plain delete warning */
              <>
                <p className="text-sm font-semibold text-[#1A1F36] mb-2">
                  {lang === "et" ? "Kustuta sõnum?" : "Delete message?"}
                </p>
                <p className="text-xs text-[#64748B] mb-4 leading-relaxed">
                  {deleteWarning.kind === "cascade"
                    ? lang === "et"
                      ? "Kui kustutad selle sõnumi, eemaldatakse ka sellele järgnevad vestlussõnumid. Kas jätkata?"
                      : "Deleting this message will also remove the conversation messages that follow it. Continue?"
                    : lang === "et"
                      ? "See sõnum kustutatakse jäädavalt."
                      : "This message will be permanently deleted."}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteWarning(null)}
                    className="flex-1 py-2 rounded-lg border border-[#ECECF2] text-sm text-[#64748B] hover:bg-[#F4F4F8]"
                  >
                    {lang === "et" ? "Tühista" : "Cancel"}
                  </button>
                  <button
                    onClick={confirmDelete}
                    className="flex-1 py-2 rounded-lg bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C]"
                  >
                    {lang === "et" ? "Kustuta" : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
