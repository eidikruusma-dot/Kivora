import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CheckSquare,
  CalendarDays,
  RotateCcw,
  FileText,
  Target,
  GraduationCap,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { deleteUser } from "firebase/auth";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t } from "@/lib/translations";
import { useAuth } from "@/context/AuthContext";
import { getAllHabits, deleteHabit } from "@/lib/habitsStore";
import {
  deleteCollection,
  deleteAllUserData,
  reauthenticate,
  ReauthError,
  MFARequiredError,
  sendMFAPhoneCode,
  completeMFAChallenge,
} from "@/lib/accountDeletionService";

// ── Inline bilingual helpers (reauth/error strings not in translations.ts) ──

function msg(lang: AppLang, et: string, en: string): string {
  return lang === "et" ? et : en;
}

// ── Shared sub-components ──────────────────────────────────────────────────

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
  danger,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-2xl overflow-hidden ${
        danger ? "border-2 border-red-200" : "border border-[#EBEBEB]"
      }`}
    >
      <div
        className={`flex items-center gap-3 px-6 py-5 border-b ${
          danger ? "border-red-100" : "border-[#F0F0F0]"
        }`}
      >
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

// ── Data items definition ──────────────────────────────────────────────────

type DataItemKey =
  | "tasks"
  | "calendar"
  | "habits"
  | "notes"
  | "goals"
  | "school";

const DATA_ITEMS: {
  key: DataItemKey;
  icon: React.ReactNode;
  titleKey:
    | "delete.item.tasks"
    | "delete.item.calendar"
    | "delete.item.habits"
    | "delete.item.notes"
    | "delete.item.goals"
    | "delete.item.school";
  descKey:
    | "delete.item.tasks.desc"
    | "delete.item.calendar.desc"
    | "delete.item.habits.desc"
    | "delete.item.notes.desc"
    | "delete.item.goals.desc"
    | "delete.item.school.desc";
}[] = [
  {
    key: "tasks",
    icon: <CheckSquare size={18} strokeWidth={1.8} />,
    titleKey: "delete.item.tasks",
    descKey: "delete.item.tasks.desc",
  },
  {
    key: "calendar",
    icon: <CalendarDays size={18} strokeWidth={1.8} />,
    titleKey: "delete.item.calendar",
    descKey: "delete.item.calendar.desc",
  },
  {
    key: "habits",
    icon: <RotateCcw size={18} strokeWidth={1.8} />,
    titleKey: "delete.item.habits",
    descKey: "delete.item.habits.desc",
  },
  {
    key: "notes",
    icon: <FileText size={18} strokeWidth={1.8} />,
    titleKey: "delete.item.notes",
    descKey: "delete.item.notes.desc",
  },
  {
    key: "goals",
    icon: <Target size={18} strokeWidth={1.8} />,
    titleKey: "delete.item.goals",
    descKey: "delete.item.goals.desc",
  },
  {
    key: "school",
    icon: <GraduationCap size={18} strokeWidth={1.8} />,
    titleKey: "delete.item.school",
    descKey: "delete.item.school.desc",
  },
];

// ── Delete row ─────────────────────────────────────────────────────────────

function DeleteRow({
  item,
  confirming,
  deleting,
  done,
  error,
  onRequest,
  onConfirm,
  onCancel,
  lang,
}: {
  item: (typeof DATA_ITEMS)[number];
  confirming: boolean;
  deleting: boolean;
  done: boolean;
  error: string | null;
  onRequest: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  lang: AppLang;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 border-b border-[#F5F5F5] last:border-0 last:pb-0 first:pt-0">
      <div className="flex items-center gap-4">
        {/* Icon */}
        <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#FEE2E2] text-[#DC2626]">
          {item.icon}
        </span>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1A1F36]">
            {t(item.titleKey, lang)}
          </p>
          <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">
            {t(item.descKey, lang)}
          </p>
        </div>

        {/* Action */}
        {done ? (
          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium flex-shrink-0">
            <CheckCircle2 size={14} />
            {t("delete.item.done", lang)}
          </div>
        ) : !confirming ? (
          <button
            onClick={onRequest}
            className="h-8 px-3 rounded-lg border border-[#FECACA] bg-[#FFF5F5] text-[#DC2626] text-xs font-medium hover:bg-[#FEE2E2] transition-colors flex-shrink-0 flex items-center gap-1.5"
          >
            <Trash2 size={13} strokeWidth={2} />
            {t("delete.item.button", lang)}
          </button>
        ) : null}
      </div>

      {/* Inline confirmation */}
      {confirming && (
        <div className="ml-13 pl-1 flex flex-col gap-2 animate-[fadeIn_0.15s_ease]">
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle
              size={15}
              className="text-red-500 flex-shrink-0 mt-0.5"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">
                {t("delete.confirm.title", lang)}
              </p>
              <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                {t("delete.confirm.body", lang)}
              </p>
            </div>
          </div>

          {/* Per-item error */}
          {error && (
            <p className="text-xs font-medium text-red-600 px-1">{error}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onConfirm}
              disabled={deleting}
              className="h-8 px-4 rounded-lg bg-[#DC2626] text-white text-xs font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {t("delete.confirm.yes", lang)}
            </button>
            <button
              onClick={onCancel}
              disabled={deleting}
              className="h-8 px-4 rounded-lg border border-[#E2E8F0] bg-white text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
            >
              {t("delete.confirm.cancel", lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

const REQUIRED_PHRASE = "DELETE";

export default function AndmeteKustutaminePage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);

  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Per-item state ────────────────────────────────────────────────────────
  const [confirmingItem, setConfirmingItem] = useState<DataItemKey | null>(null);
  const [deletingItem, setDeletingItem] = useState<DataItemKey | null>(null);
  const [doneItems, setDoneItems] = useState<Set<DataItemKey>>(new Set());
  const [itemError, setItemError] = useState<string | null>(null);

  // ── Account deletion state ────────────────────────────────────────────────
  const [typeValue, setTypeValue] = useState("");
  const [accountConfirming, setAccountConfirming] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Reauth fields
  const [reauthPassword, setReauthPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // MFA step — set when reauthenticate() throws MFARequiredError
  const [mfaError, setMfaError] = useState<MFARequiredError | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaVerificationId, setMfaVerificationId] = useState<string | null>(null);
  const [mfaSmsSending, setMfaSmsSending] = useState(false);

  const isGoogleUser =
    user?.providerData.some((p) => p.providerId === "google.com") ?? false;

  // ── Per-item handlers ─────────────────────────────────────────────────────

  function handleRequestItem(key: DataItemKey) {
    setConfirmingItem(key);
    setItemError(null);
  }

  async function handleConfirmItem(key: DataItemKey) {
    if (!user) return;
    setDeletingItem(key);
    setItemError(null);

    try {
      if (key === "tasks") {
        await deleteCollection(user.uid, "tasks");
      } else if (key === "calendar") {
        await deleteCollection(user.uid, "calendarEvents");
      } else if (key === "notes") {
        await deleteCollection(user.uid, "notes");
      } else if (key === "goals") {
        await deleteCollection(user.uid, "goals");
      } else if (key === "school") {
        await deleteCollection(user.uid, "schoolItems");
      } else if (key === "habits") {
        // Habits are in-memory only — clear the store
        getAllHabits().forEach((h) => deleteHabit(h.id));
      }
      setDeletingItem(null);
      setConfirmingItem(null);
      setDoneItems((prev) => new Set(prev).add(key));
    } catch {
      setDeletingItem(null);
      setItemError(
        msg(
          lang,
          "Kustutamine ebaõnnestus. Proovi uuesti.",
          "Deletion failed. Please try again.",
        ),
      );
      // Keep confirming=true so the user can see the error and retry or cancel
    }
  }

  function handleCancelItem() {
    setConfirmingItem(null);
    setItemError(null);
  }

  // ── Account deletion handlers ─────────────────────────────────────────────

  function handleRequestAccount() {
    setAccountConfirming(true);
    setAccountError(null);
  }

  /** Shared deletion sequence — called after reauth OR MFA succeeds */
  async function performDeletion() {
    if (!user) return;

    // Delete all Firestore data
    try {
      await deleteAllUserData(user.uid);
    } catch (err) {
      setAccountDeleting(false);
      const code = (err as { code?: string }).code ?? "";
      if (code === "permission-denied") {
        setAccountError(
          msg(lang, "Ligipääs keelatud. Proovi uuesti.", "Permission denied. Please try again."),
        );
      } else {
        setAccountError(
          msg(
            lang,
            "Andmete kustutamine ebaõnnestus. Konto ei ole kustutatud.",
            "Data deletion failed. Account has not been deleted.",
          ),
        );
      }
      return;
    }

    // Delete Firebase Auth user (only if all Firestore deletes succeeded)
    try {
      await deleteUser(user);
    } catch {
      setAccountDeleting(false);
      setAccountError(
        msg(
          lang,
          "Konto kustutamine ebaõnnestus. Võta ühendust toega.",
          "Account deletion failed. Please contact support.",
        ),
      );
      return;
    }

    // Navigate — onAuthStateChanged tears down all Firestore listeners
    navigate("/");
  }

  async function handleConfirmAccount() {
    if (!user) return;
    setAccountDeleting(true);
    setAccountError(null);

    // 1 ── Reauthenticate (no data touched until this succeeds)
    try {
      await reauthenticate(user, reauthPassword || undefined);
    } catch (err) {
      setAccountDeleting(false);
      if (err instanceof MFARequiredError) {
        // First factor accepted — switch to MFA step
        setMfaError(err);
        return;
      }
      if (err instanceof ReauthError) {
        switch (err.reauthCode) {
          case "wrong-password":
            setAccountError(
              msg(lang, "Vale parool. Palun proovi uuesti.", "Incorrect password. Please try again."),
            );
            break;
          case "popup-closed":
            setAccountError(
              msg(lang, "Google'i sisselogimine katkestati.", "Google sign-in was cancelled."),
            );
            break;
          case "requires-recent-login":
            setAccountError(
              msg(lang, "Palun logi kõigepealt uuesti sisse.", "Please sign in again first."),
            );
            break;
          case "network-error":
            setAccountError(
              msg(lang, "Võrguviga. Kontrolli internetiühendust.", "Network error. Check your connection."),
            );
            break;
          default:
            setAccountError(
              msg(lang, "Autentimine ebaõnnestus.", "Authentication failed."),
            );
        }
      } else {
        setAccountError(
          msg(lang, "Autentimine ebaõnnestus.", "Authentication failed."),
        );
      }
      return;
    }

    // Reauth succeeded without MFA
    await performDeletion();
  }

  /** Send SMS for phone-based MFA */
  async function handleSendMFAPhone() {
    if (!mfaError) return;
    setMfaSmsSending(true);
    setAccountError(null);
    try {
      const vid = await sendMFAPhoneCode(mfaError.resolver, 0, "reauth-recaptcha");
      setMfaVerificationId(vid);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setAccountError(
        code === "auth/too-many-requests"
          ? msg(lang, "Liiga palju katseid. Proovi hiljem uuesti.", "Too many requests. Try again later.")
          : msg(lang, "SMS-i saatmine ebaõnnestus. Proovi uuesti.", "Failed to send SMS. Please try again."),
      );
    } finally {
      setMfaSmsSending(false);
    }
  }

  /** Submit the MFA one-time code */
  async function handleMFASubmit() {
    if (!mfaError || !user) return;
    setAccountDeleting(true);
    setAccountError(null);

    const hint = mfaError.hints[0];
    try {
      await completeMFAChallenge(
        mfaError.resolver,
        hint,
        mfaCode.trim(),
        mfaVerificationId ?? undefined,
      );
    } catch (err) {
      setAccountDeleting(false);
      const code = (err as { code?: string }).code ?? "";
      if (
        code === "auth/invalid-verification-code" ||
        code === "auth/code-expired" ||
        code === "auth/invalid-multi-factor-session"
      ) {
        setAccountError(
          msg(lang, "Vigane või aegunud kood. Proovi uuesti.", "Invalid or expired code. Please try again."),
        );
      } else if (code === "auth/too-many-requests") {
        setAccountError(
          msg(lang, "Liiga palju katseid. Proovi hiljem uuesti.", "Too many attempts. Please try again later."),
        );
      } else {
        setAccountError(
          msg(lang, "Autentimine ebaõnnestus.", "Authentication failed."),
        );
      }
      return;
    }

    // MFA verified — proceed with deletion
    await performDeletion();
  }

  /** Cancel MFA step and return to the password input */
  function handleMFACancel() {
    setMfaError(null);
    setMfaCode("");
    setMfaVerificationId(null);
    setMfaSmsSending(false);
    setAccountError(null);
    // accountConfirming stays true — user stays in the confirmation step
  }

  function handleCancelAccount() {
    setAccountConfirming(false);
    setTypeValue("");
    setReauthPassword("");
    setShowPassword(false);
    setAccountError(null);
    setMfaError(null);
    setMfaCode("");
    setMfaVerificationId(null);
    setMfaSmsSending(false);
  }

  const accountInputValid = typeValue.trim().toUpperCase() === REQUIRED_PHRASE;

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
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t("delete.title", lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t("delete.subtitle", lang)}
          </p>
        </div>

        {/* ── 1. Delete individual data ── */}
        <SectionCard
          icon={<Trash2 size={20} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={t("delete.data.title", lang)}
          description={t("delete.data.desc", lang)}
        >
          <div className="-my-1">
            {DATA_ITEMS.map((item) => (
              <DeleteRow
                key={item.key}
                item={item}
                confirming={confirmingItem === item.key}
                deleting={deletingItem === item.key}
                done={doneItems.has(item.key)}
                error={confirmingItem === item.key ? itemError : null}
                onRequest={() => handleRequestItem(item.key)}
                onConfirm={() => { handleConfirmItem(item.key) }}
                onCancel={handleCancelItem}
                lang={lang}
              />
            ))}
          </div>
        </SectionCard>

        {/* ── 2. Delete account ── */}
        <SectionCard
          icon={<AlertCircle size={20} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={t("delete.account.title", lang)}
          description={t("delete.account.desc", lang)}
          danger
        >
          <div className="space-y-4">
            {/* Warning banner */}
            <div className="delete-warn-panel flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200">
              <AlertTriangle
                size={16}
                className="text-red-500 flex-shrink-0 mt-0.5"
              />
              <p className="text-sm text-red-700 leading-relaxed">
                {t("delete.account.warning", lang)}
              </p>
            </div>

            {/* Type confirmation input */}
            <div>
              <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                {t("delete.account.type.label", lang)}
              </label>
              <input
                type="text"
                value={typeValue}
                onChange={(e) => setTypeValue(e.target.value)}
                placeholder={t("delete.account.type.placeholder", lang)}
                className={`w-full sm:w-72 h-10 rounded-xl border px-4 text-sm font-mono transition-colors focus:outline-none ${
                  typeValue && accountInputValid
                    ? "border-red-400 bg-red-50 text-red-700 focus:border-red-500"
                    : "border-[#E2E8F0] bg-[#FAFAFA] text-[#1A1F36] focus:border-[#FDA4AF]"
                }`}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {/* Delete account button */}
            {!accountConfirming ? (
              <button
                onClick={handleRequestAccount}
                disabled={!accountInputValid}
                className="h-10 px-5 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Trash2 size={15} strokeWidth={2} />
                {t("delete.account.button", lang)}
              </button>
            ) : (
              /* Final confirmation step — password/Google reauth OR MFA challenge */
              <div className="flex flex-col gap-3">
                {/* Warning banner — always shown */}
                <div className="delete-warn-panel flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border-2 border-red-300">
                  <AlertTriangle
                    size={15}
                    className="text-red-500 flex-shrink-0 mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-bold text-red-700">
                      {t("delete.account.confirm.title", lang)}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                      {t("delete.account.confirm.body", lang)}
                    </p>
                  </div>
                </div>

                {mfaError ? (
                  /* ── MFA step ── */
                  (() => {
                    const hint = mfaError.hints[0];
                    const isTotp = hint?.factorId === "totp";
                    const isPhone = hint?.factorId === "phone";
                    const maskedPhone =
                      isPhone && hint
                        ? ((hint as { phoneNumber?: string }).phoneNumber ?? "")
                        : "";
                    return (
                      <div className="flex flex-col gap-3">
                        {/* Factor label */}
                        <div className="flex items-center gap-2 px-1">
                          <span className="inline-flex items-center h-5 px-2 rounded-full bg-violet-100 text-violet-700 text-[10px] font-semibold uppercase tracking-wide">
                            {isTotp
                              ? msg(lang, "Autentimisrakendus", "Authenticator app")
                              : isPhone
                                ? msg(lang, "Telefoninumber", "Phone number")
                                : hint?.factorId ?? "MFA"}
                          </span>
                          <span className="text-xs text-[#64748B]">
                            {isTotp
                              ? msg(
                                  lang,
                                  "Sisesta 6-kohaline kood oma autentimisrakendusest.",
                                  "Enter the 6-digit code from your authenticator app.",
                                )
                              : isPhone && !mfaVerificationId
                                ? msg(
                                    lang,
                                    `Saada kinnituskood numbrile ${maskedPhone}`,
                                    `Send a verification code to ${maskedPhone}`,
                                  )
                                : msg(
                                    lang,
                                    "Sisesta SMS-iga saadetud kood.",
                                    "Enter the code sent to your phone.",
                                  )}
                          </span>
                        </div>

                        {/* Phone: send SMS button (shown before code is sent) */}
                        {isPhone && !mfaVerificationId && (
                          <button
                            onClick={handleSendMFAPhone}
                            disabled={mfaSmsSending || accountDeleting}
                            className="w-fit h-9 px-4 rounded-xl border border-violet-300 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {mfaSmsSending && (
                              <Loader2 size={13} className="animate-spin" />
                            )}
                            {msg(lang, "Saada kood", "Send code")}
                          </button>
                        )}

                        {/* Code input (TOTP always, phone only after SMS sent) */}
                        {(isTotp || (isPhone && mfaVerificationId)) && (
                          <div>
                            <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                              {msg(lang, "Kinnituskood", "Verification code")}
                            </label>
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={8}
                              value={mfaCode}
                              onChange={(e) => {
                                setMfaCode(e.target.value.replace(/\D/g, ""));
                                setAccountError(null);
                              }}
                              placeholder="000000"
                              className="w-40 h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm font-mono text-[#1A1F36] tracking-widest focus:outline-none focus:border-violet-400 transition-colors"
                              disabled={accountDeleting}
                              autoComplete="one-time-code"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  /* ── Password / Google reauth step ── */
                  isGoogleUser ? (
                    <p className="text-xs text-[#64748B] leading-relaxed px-1">
                      {msg(
                        lang,
                        "Kinnitamiseks avaneb Google'i sisselogimisaken.",
                        "A Google sign-in popup will open to confirm your identity.",
                      )}
                    </p>
                  ) : (
                    <div>
                      <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                        {msg(lang, "Praegune parool", "Current password")}
                      </label>
                      <div className="relative w-full sm:w-72">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={reauthPassword}
                          onChange={(e) => {
                            setReauthPassword(e.target.value);
                            setAccountError(null);
                          }}
                          placeholder={msg(lang, "Sisesta parool", "Enter password")}
                          className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 pr-10 text-sm text-[#1A1F36] focus:outline-none focus:border-[#FDA4AF] transition-colors"
                          autoComplete="current-password"
                          disabled={accountDeleting}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B] transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff size={15} strokeWidth={1.8} />
                          ) : (
                            <Eye size={15} strokeWidth={1.8} />
                          )}
                        </button>
                      </div>
                    </div>
                  )
                )}

                {/* Error display */}
                {accountError && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                    <p className="text-xs font-medium text-red-700">{accountError}</p>
                  </div>
                )}

                {/* Action buttons — MFA step vs password/Google step */}
                {mfaError ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleMFASubmit}
                      disabled={
                        accountDeleting ||
                        (mfaError.hints[0]?.factorId === "phone" &&
                          !mfaVerificationId) ||
                        !mfaCode.trim()
                      }
                      className="h-9 px-5 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {accountDeleting && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      {msg(lang, "Kinnita", "Verify")}
                    </button>
                    <button
                      onClick={handleMFACancel}
                      disabled={accountDeleting}
                      className="h-9 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                    >
                      {msg(lang, "Tagasi", "Back")}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleConfirmAccount}
                      disabled={
                        accountDeleting ||
                        (!isGoogleUser && !reauthPassword.trim())
                      }
                      className="h-9 px-5 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {accountDeleting && (
                        <Loader2 size={14} className="animate-spin" />
                      )}
                      {t("delete.account.confirm.yes", lang)}
                    </button>
                    <button
                      onClick={handleCancelAccount}
                      disabled={accountDeleting}
                      className="h-9 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
                    >
                      {t("delete.account.confirm.cancel", lang)}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Hidden reCAPTCHA container — required for invisible reCAPTCHA on phone MFA */}
      <div id="reauth-recaptcha" />
    </div>
  );
}
