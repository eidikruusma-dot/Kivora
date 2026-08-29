import { useState, useEffect } from "react";
import {
  ArrowLeft,
  MessageSquarePlus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lightbulb,
  Bug,
  Heart,
  MoreHorizontal,
} from "lucide-react";
import { addDoc, collection, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t } from "@/lib/translations";

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-[#F0F0F0]">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg, color: iconColor }}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[#1A1F36]">{title}</h2>
          <p className="text-xs text-[#94A3B8] mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

// ── Feedback types ─────────────────────────────────────────────────────────────

type FeedbackType = "suggestion" | "problem" | "compliment" | "other";

const FEEDBACK_TYPES: {
  value: FeedbackType;
  key:
    | "feedback.type.suggestion"
    | "feedback.type.problem"
    | "feedback.type.compliment"
    | "feedback.type.other";
  icon: React.ReactNode;
  activeColor: string;
  activeBg: string;
}[] = [
  {
    value: "suggestion",
    key: "feedback.type.suggestion",
    icon: <Lightbulb size={15} strokeWidth={1.8} />,
    activeColor: "#CA8A04",
    activeBg: "#FEF9C3",
  },
  {
    value: "problem",
    key: "feedback.type.problem",
    icon: <Bug size={15} strokeWidth={1.8} />,
    activeColor: "#DC2626",
    activeBg: "#FEE2E2",
  },
  {
    value: "compliment",
    key: "feedback.type.compliment",
    icon: <Heart size={15} strokeWidth={1.8} />,
    activeColor: "#16A34A",
    activeBg: "#DCFCE7",
  },
  {
    value: "other",
    key: "feedback.type.other",
    icon: <MoreHorizontal size={15} strokeWidth={1.8} />,
    activeColor: "#6F5AE8",
    activeBg: "#EDE9FB",
  },
];

const MAX_CHARS = 2000;

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

export default function TagasisidePage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);

  const [feedbackType, setFeedbackType] = useState<FeedbackType>("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [mayContact, setMayContact] = useState(false);

  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveOnly, setSaveOnly] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const trimmedMessage = message.trim();
  const isValid = trimmedMessage.length > 0;
  const showError = touched && !isValid;

  const inputClass =
    "w-full rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] placeholder:text-[#C4C9D4] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors";

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid) return;

    setSubmitting(true);
    setSaveOnly(false);
    setSaveFailed(false);

    // 1. Persist to Firestore before attempting email delivery
    let docRef: Awaited<ReturnType<typeof addDoc>> | null = null;
    try {
      docRef = await addDoc(collection(db, "feedbackSubmissions"), {
        type: feedbackType,
        subject: subject.trim() || null,
        message: trimmedMessage,
        senderEmail: email.trim() || null,
        mayContact,
        source: "feedback_page",
        uid: auth.currentUser?.uid ?? null,
        senderName: auth.currentUser?.displayName ?? null,
        createdAt: serverTimestamp(),
        emailDeliveryStatus: "pending",
      });
    } catch {
      setSubmitting(false);
      setSaveFailed(true);
      return;
    }

    // 2. Attempt email delivery via API
    let emailOk = false;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          subject: subject.trim(),
          message: trimmedMessage,
          email: email.trim(),
          mayContact,
          uid: auth.currentUser?.uid ?? "",
        }),
      });
      const json = await res.json().catch(() => ({ ok: false }));
      emailOk = res.ok && json.ok === true;
    } catch {
      emailOk = false;
    }

    // 3. Update delivery status in Firestore
    try {
      await updateDoc(docRef, {
        emailDeliveryStatus: emailOk ? "sent" : "failed",
      });
    } catch {
      // Best-effort
    }

    setSubmitting(false);

    if (emailOk) {
      // Reset form
      setFeedbackType("suggestion");
      setSubject("");
      setMessage("");
      setEmail("");
      setMayContact(false);
      setTouched(false);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 5000);
    } else {
      setSaveOnly(true);
    }
  };

  const handleDismissSuccess = () => setSubmitted(false);
  const handleDismissSaveOnly = () => setSaveOnly(false);
  const handleDismissSaveFailed = () => setSaveFailed(false);

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t("settings.back", lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t("feedback.title", lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t("feedback.subtitle", lang)}
          </p>
        </div>

        {/* Success banner */}
        {submitted && (
          <div
            role="alert"
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border bg-green-50 text-green-700 border-green-200"
          >
            <CheckCircle2 size={16} className="flex-shrink-0" />
            <span className="flex-1">{t("feedback.success", lang)}</span>
            <button
              onClick={handleDismissSuccess}
              className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Partial-success banner (saved but email unconfirmed) */}
        {saveOnly && (
          <div
            role="alert"
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border bg-amber-50 text-amber-700 border-amber-200"
          >
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="flex-1">{t("feedback.saved", lang)}</span>
            <button
              onClick={handleDismissSaveOnly}
              className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Error banner (Firestore submission itself failed) */}
        {saveFailed && (
          <div
            role="alert"
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm border bg-red-50 text-red-700 border-red-200"
          >
            <AlertCircle size={16} className="flex-shrink-0" />
            <span className="flex-1">{t("feedback.error", lang)}</span>
            <button
              onClick={handleDismissSaveFailed}
              className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
              aria-label="dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Feedback form */}
        <SectionCard
          icon={<MessageSquarePlus size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t("feedback.form.title", lang)}
          description={t("feedback.form.desc", lang)}
        >
          <div className="space-y-5">
            {/* Type selector */}
            <div>
              <p className="text-xs font-medium text-[#64748B] mb-2">
                {t("feedback.type.label", lang)}
              </p>
              <div className="flex flex-wrap gap-2">
                {FEEDBACK_TYPES.map((ft) => {
                  const active = feedbackType === ft.value;
                  return (
                    <button
                      key={ft.value}
                      onClick={() => setFeedbackType(ft.value)}
                      className="flex items-center gap-1.5 h-8 px-3.5 rounded-full text-sm font-medium border transition-colors"
                      style={
                        active
                          ? {
                              background: ft.activeBg,
                              color: ft.activeColor,
                              borderColor: ft.activeColor + "55",
                            }
                          : {
                              background: "#F8FAFC",
                              color: "#64748B",
                              borderColor: "#E2E8F0",
                            }
                      }
                    >
                      {ft.icon}
                      {t(ft.key, lang)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t("feedback.subject.label", lang)}
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t("feedback.subject.placeholder", lang)}
                className={`${inputClass} h-10`}
                maxLength={120}
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t("feedback.message.label", lang)}
                <span className="text-[#DC2626] ml-0.5">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_CHARS) {
                    setMessage(e.target.value);
                    if (touched) setTouched(false);
                  }
                }}
                onBlur={() => setTouched(true)}
                placeholder={t("feedback.message.placeholder", lang)}
                rows={5}
                className={`${inputClass} py-3 resize-none ${
                  showError ? "border-[#DC2626] bg-red-50" : ""
                }`}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-[#DC2626]">
                  {showError ? t("feedback.validation.required", lang) : ""}
                </span>
                <span
                  className={`text-xs tabular-nums ${
                    message.length >= MAX_CHARS
                      ? "text-[#DC2626]"
                      : "text-[#94A3B8]"
                  }`}
                >
                  {message.length} / {MAX_CHARS}{" "}
                  {t("feedback.message.chars", lang)}
                </span>
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t("feedback.email.label", lang)}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("feedback.email.placeholder", lang)}
                className={`${inputClass} h-10`}
                autoComplete="email"
              />
            </div>

            {/* Contact consent */}
            <label className="flex items-start gap-3 cursor-pointer select-none group">
              <div className="relative flex-shrink-0 mt-0.5">
                <input
                  type="checkbox"
                  checked={mayContact}
                  onChange={(e) => setMayContact(e.target.checked)}
                  className="sr-only"
                />
                <div
                  className={`w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center transition-colors ${
                    mayContact
                      ? "bg-[#6F5AE8] border-[#6F5AE8]"
                      : "bg-white border-[#CBD5E1] group-hover:border-[#6F5AE8]"
                  }`}
                >
                  {mayContact && (
                    <svg
                      width="10"
                      height="8"
                      viewBox="0 0 10 8"
                      fill="none"
                      className="text-white"
                    >
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </div>
              <span className="text-sm text-[#475569]">
                {t("feedback.contact.label", lang)}
              </span>
            </label>
          </div>
        </SectionCard>

        {/* Submit bar */}
        <div className="flex items-center justify-end pb-2">
          <button
            onClick={handleSubmit}
            disabled={submitting || !isValid}
            className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            {submitting
              ? t("feedback.submitting", lang)
              : t("feedback.submit", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
