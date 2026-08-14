import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  Smartphone,
  MessageSquare,
} from "lucide-react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendEmailVerification,
  multiFactor,
  TotpMultiFactorGenerator,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from "firebase/auth";
import type { TotpSecret, PhoneMultiFactorInfo } from "firebase/auth";
import QRCode from "qrcode";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t } from "@/lib/translations";
import { dispatch as dispatchNotif } from "@/lib/notificationItemsStore";

interface Props {
  onBack: () => void;
}

type MsgState = { type: "success" | "error"; text: string } | null;
type ReauthPurpose =
  | "enroll-totp"
  | "unenroll-totp"
  | "enroll-sms"
  | "unenroll-sms"
  | null;
type TwoFaView = "idle" | "enrolling-totp" | "enrolling-sms";

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

function MessageBanner({
  msg,
  onDismiss,
}: {
  msg: MsgState;
  onDismiss: () => void;
}) {
  if (!msg) return null;
  return (
    <div
      role="alert"
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm mb-5 ${
        msg.type === "success"
          ? "bg-green-50 text-green-700 border border-green-200"
          : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {msg.type === "success" ? (
        <CheckCircle2 size={16} />
      ) : (
        <AlertCircle size={16} />
      )}
      <span className="flex-1">{msg.text}</span>
      <button
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100 w-6 h-6 flex items-center justify-center"
      >
        ×
      </button>
    </div>
  );
}

export default function TurvalisusPage({ onBack }: Props) {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);
  const { user, reloadUser } = useAuth();

  const isPasswordProvider =
    user?.providerData?.some((p) => p.providerId === "password") ?? false;

  // ── Change password ────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<MsgState>(null);

  const handleChangePassword = async () => {
    if (newPw === currentPw) {
      setPwMsg({ type: "error", text: t("sec.pw.error.samePassword", lang) });
      return;
    }
    if (newPw.length < 6) {
      setPwMsg({ type: "error", text: t("sec.pw.error.min", lang) });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "error", text: t("sec.pw.error.mismatch", lang) });
      return;
    }
    if (!user || !user.email) return;
    setPwSaving(true);
    setPwMsg(null);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPw);
      setPwMsg({ type: "success", text: t("sec.pw.success", lang) });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      dispatchNotif({
        type: "security-pw-changed",
        module: "security",
        title: t("notif.security.title", lang),
        description: t("notif.security.pwChanged", lang),
        timeLabel: t("notif.today", lang),
        read: false,
        icon: "shield",
        accent: "#6F5AE8",
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setPwMsg({ type: "error", text: t("sec.pw.error.wrong", lang) });
      } else if (code === "auth/too-many-requests") {
        setPwMsg({ type: "error", text: t("sec.pw.error.tooMany", lang) });
      } else {
        setPwMsg({ type: "error", text: t("sec.pw.error.failed", lang) });
      }
    } finally {
      setPwSaving(false);
    }
  };

  // ── Two-factor auth — shared ───────────────────────────────────────────
  const [twoFaView, setTwoFaView] = useState<TwoFaView>("idle");
  const [twoFaLoading, setTwoFaLoading] = useState(false);
  const [twoFaMsg, setTwoFaMsg] = useState<MsgState>(null);
  const [reauthNeeded, setReauthNeeded] = useState<ReauthPurpose>(null);
  const [reauthPw, setReauthPw] = useState("");
  const [showReauthPw, setShowReauthPw] = useState(false);

  // ── Two-factor auth — TOTP specific ───────────────────────────────────
  const [totpSecret, setTotpSecret] = useState<TotpSecret | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showRemoveTotpConfirm, setShowRemoveTotpConfirm] = useState(false);

  // ── Two-factor auth — SMS specific ────────────────────────────────────
  const [smsPhone, setSmsPhone] = useState("");
  const [smsVerificationId, setSmsVerificationId] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsCodeSent, setSmsCodeSent] = useState(false);
  const [showRemoveSmsConfirm, setShowRemoveSmsConfirm] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  // Incrementing this key causes React to unmount the old container div and
  // mount a brand-new DOM element. Google's reCAPTCHA registry is keyed by
  // DOM element reference — only a physically new element resets it cleanly.
  // innerHTML='' does NOT work: it removes the injected iframe nodes but leaves
  // the element in Google's internal widget map, so the next render() still
  // throws "reCAPTCHA has already been rendered in this element".
  const [recaptchaKey, setRecaptchaKey] = useState(0);

  // ── Two-factor auth — computed ─────────────────────────────────────────
  // auth.currentUser is used directly (always the live Firebase User, not the spread copy)
  // user from context is kept as dependency to trigger re-renders after reloadUser()
  const totpFactor =
    user && auth.currentUser
      ? (multiFactor(auth.currentUser).enrolledFactors.find(
          (f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID,
        ) ?? null)
      : null;
  const smsFactor =
    user && auth.currentUser
      ? (multiFactor(auth.currentUser).enrolledFactors.find(
          (f) => f.factorId === PhoneMultiFactorGenerator.FACTOR_ID,
        ) ?? null)
      : null;
  const isTotpEnabled = Boolean(totpFactor);
  const isSmsEnabled = Boolean(smsFactor);
  const enrolledSmsPhone = smsFactor
    ? (smsFactor as PhoneMultiFactorInfo).phoneNumber
    : null;

  // Clean up RecaptchaVerifier on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // ── TOTP: start enrollment ─────────────────────────────────────────────
  const startTotpEnrollment = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    if (!firebaseUser.emailVerified) {
      setTwoFaMsg({
        type: "error",
        text: t("sec.2fa.err.emailNotVerified", lang),
      });
      return;
    }
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      const session = await multiFactor(firebaseUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(session);
      const uri = secret.generateQrCodeUrl(firebaseUser.email!, "Kivora");
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 180,
        margin: 2,
        color: { dark: "#1A1F36", light: "#FFFFFF" },
      });
      setTotpSecret(secret);
      setQrDataUrl(dataUrl);
      setTotpCode("");
      setTwoFaView("enrolling-totp");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/requires-recent-login") {
        setReauthNeeded("enroll-totp");
      } else if (
        code === "auth/operation-not-allowed" ||
        code === "auth/unsupported-multifactor-enrollment"
      ) {
        setTwoFaMsg({
          type: "error",
          text: t("sec.2fa.err.unsupported", lang),
        });
      } else if (code === "auth/network-request-failed") {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.err.network", lang) });
      } else {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.err.failed", lang) });
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── TOTP: verify and enroll ────────────────────────────────────────────
  const verifyTotpEnrollment = async () => {
    const firebaseUser = auth.currentUser;
    if (!totpSecret || !firebaseUser) return;
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(
        totpSecret,
        totpCode.trim(),
      );
      await multiFactor(firebaseUser).enroll(assertion, "Authenticator app");
      setTwoFaView("idle");
      setTotpSecret(null);
      setQrDataUrl("");
      setTotpCode("");
      setTwoFaMsg({ type: "success", text: t("sec.2fa.enroll.success", lang) });
      await reloadUser();
      dispatchNotif({
        type: "security-mfa-added",
        module: "security",
        title: t("notif.security.title", lang),
        description: t("notif.security.mfaAdded", lang),
        timeLabel: t("notif.today", lang),
        read: false,
        icon: "shield",
        accent: "#6F5AE8",
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (
        code === "auth/invalid-verification-code" ||
        code === "auth/code-expired" ||
        code === "auth/totp-challenge-timeout"
      ) {
        setTwoFaMsg({
          type: "error",
          text: t("sec.2fa.err.invalidCode", lang),
        });
      } else {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.err.failed", lang) });
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── TOTP: unenroll ─────────────────────────────────────────────────────
  const removeTotpMfa = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !totpFactor) return;
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      await multiFactor(firebaseUser).unenroll(totpFactor);
      setShowRemoveTotpConfirm(false);
      setTwoFaMsg({ type: "success", text: t("sec.2fa.remove.success", lang) });
      await reloadUser();
      dispatchNotif({
        type: "security-mfa-removed",
        module: "security",
        title: t("notif.security.title", lang),
        description: t("notif.security.mfaRemoved", lang),
        timeLabel: t("notif.today", lang),
        read: false,
        icon: "shield",
        accent: "#EF4444",
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/requires-recent-login") {
        setShowRemoveTotpConfirm(false);
        setReauthNeeded("unenroll-totp");
      } else {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.err.failed", lang) });
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── SMS: send enrollment code ──────────────────────────────────────────
  const startSmsEnrollment = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    if (!firebaseUser.emailVerified) {
      setTwoFaMsg({
        type: "error",
        text: t("sec.2fa.err.emailNotVerified", lang),
      });
      return;
    }
    const phone = smsPhone.trim().replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setTwoFaMsg({
        type: "error",
        text: t("sec.2fa.sms.err.invalidPhone", lang),
      });
      return;
    }
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      // Get the MFA session first — may throw requires-recent-login before we
      // touch the verifier, which keeps verifier lifecycle clean.
      const session = await multiFactor(firebaseUser).getSession();

      if (import.meta.env.DEV) {
        console.log(
          "[SMS MFA] recaptcha container:",
          document.getElementById("sms-enroll-recaptcha"),
        );
      }

      const container = recaptchaContainerRef.current;
      if (!container) {
        throw new Error("reCAPTCHA container not mounted");
      }

      // Reuse the verifier if it is already constructed and rendered.
      // RecaptchaVerifier.clear() with size:'invisible' marks the instance
      // destroyed but — crucially — does NOT remove child nodes from the
      // container (the removeChild loop is inside `if (!this.isInvisible)`).
      // Creating a second verifier on the same element without first emptying
      // it triggers "reCAPTCHA has already been rendered in this element".
      // We avoid that by only constructing when we have no live verifier, and
      // by purging the container's children ourselves before constructing.
      // Create and render the verifier exactly once per container lifetime.
      // On requires-recent-login the verifier is preserved (see catch below),
      // so this block is skipped on the retry and the same rendered instance
      // is passed to verifyPhoneNumber — no second render, no "already rendered".
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(auth, container, {
          size: "invisible",
        });
        await recaptchaVerifierRef.current.render();
      }

      const phoneProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneProvider.verifyPhoneNumber(
        { phoneNumber: phone, session },
        recaptchaVerifierRef.current,
      );
      setSmsVerificationId(verificationId);
      setSmsCode("");
      setSmsCodeSent(true);
    } catch (err: unknown) {
      if (import.meta.env.DEV) {
        const e = err as { code?: string; message?: string; stack?: string };
        console.error("[SMS enroll] Firebase error:", e.code, e.message);
        console.error("[SMS enroll] stack:", e.stack);
      }
      const code = (err as { code?: string }).code;
      if (code === "auth/requires-recent-login") {
        // Preserve the verifier — it is already rendered in the container.
        // handleTwoFaReauth will call startSmsEnrollment() again; the
        // if (!recaptchaVerifierRef.current) guard above will be false,
        // so render() is never called a second time on the same element.
        setReauthNeeded("enroll-sms");
      } else {
        // For every other failure: destroy the verifier and bump recaptchaKey.
        // Bumping the key causes React to unmount the old container div and
        // mount a fresh DOM element — the only reliable way to clear Google's
        // internal widget registry (innerHTML='' removes DOM nodes but leaves
        // the element registered in grecaptcha's closure-based widget map).
        if (recaptchaVerifierRef.current) {
          try {
            recaptchaVerifierRef.current.clear();
          } catch {
            /* ignore */
          }
          recaptchaVerifierRef.current = null;
        }
        setRecaptchaKey((k) => k + 1);
        if (code === "auth/too-many-requests") {
          setTwoFaMsg({
            type: "error",
            text: t("sec.2fa.sms.err.tooMany", lang),
          });
        } else if (code === "auth/invalid-phone-number") {
          setTwoFaMsg({
            type: "error",
            text: t("sec.2fa.sms.err.invalidPhone", lang),
          });
        } else if (code === "auth/network-request-failed") {
          setTwoFaMsg({ type: "error", text: t("sec.2fa.err.network", lang) });
        } else {
          setTwoFaMsg({
            type: "error",
            text: t("sec.2fa.sms.err.failed", lang),
          });
        }
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── SMS: verify code and complete enrollment ───────────────────────────
  const verifySmsEnrollment = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !smsVerificationId) return;
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      const credential = PhoneAuthProvider.credential(
        smsVerificationId,
        smsCode.trim(),
      );
      const assertion = PhoneMultiFactorGenerator.assertion(credential);
      await multiFactor(firebaseUser).enroll(assertion, "Phone number");
      setTwoFaView("idle");
      setSmsPhone("");
      setSmsVerificationId("");
      setSmsCode("");
      setSmsCodeSent(false);
      setTwoFaMsg({ type: "success", text: t("sec.2fa.sms.success", lang) });
      await reloadUser();
      dispatchNotif({
        type: "security-mfa-added",
        module: "security",
        title: t("notif.security.title", lang),
        description: t("notif.security.mfaAdded", lang),
        timeLabel: t("notif.today", lang),
        read: false,
        icon: "shield",
        accent: "#6F5AE8",
      });
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          /* ignore */
        }
        recaptchaVerifierRef.current = null;
      }
      // Replace the container so the next enrollment starts with a fresh element.
      setRecaptchaKey((k) => k + 1);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (
        code === "auth/invalid-verification-code" ||
        code === "auth/code-expired"
      ) {
        setTwoFaMsg({
          type: "error",
          text: t("sec.2fa.sms.err.invalidCode", lang),
        });
      } else {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.sms.err.failed", lang) });
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── SMS: unenroll ──────────────────────────────────────────────────────
  const removeSmsMfa = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser || !smsFactor) return;
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      await multiFactor(firebaseUser).unenroll(smsFactor);
      setShowRemoveSmsConfirm(false);
      setTwoFaMsg({
        type: "success",
        text: t("sec.2fa.sms.remove.success", lang),
      });
      await reloadUser();
      dispatchNotif({
        type: "security-mfa-removed",
        module: "security",
        title: t("notif.security.title", lang),
        description: t("notif.security.mfaRemoved", lang),
        timeLabel: t("notif.today", lang),
        read: false,
        icon: "shield",
        accent: "#EF4444",
      });
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/requires-recent-login") {
        setShowRemoveSmsConfirm(false);
        setReauthNeeded("unenroll-sms");
      } else {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.sms.err.failed", lang) });
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── SMS: cancel enrollment ─────────────────────────────────────────────
  const cancelSmsEnrollment = () => {
    setTwoFaView("idle");
    setSmsPhone("");
    setSmsVerificationId("");
    setSmsCode("");
    setSmsCodeSent(false);
    setTwoFaMsg(null);
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        /* ignore */
      }
      recaptchaVerifierRef.current = null;
    }
    // Replace the container so the next enrollment gets a fresh DOM element.
    setRecaptchaKey((k) => k + 1);
  };

  // ── Shared: reauthenticate then retry ─────────────────────────────────
  const handleTwoFaReauth = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser?.email) return;
    setTwoFaLoading(true);
    setTwoFaMsg(null);
    try {
      const cred = EmailAuthProvider.credential(firebaseUser.email, reauthPw);
      await reauthenticateWithCredential(firebaseUser, cred);
      const pending = reauthNeeded;
      setReauthNeeded(null);
      setReauthPw("");
      if (pending === "enroll-totp") await startTotpEnrollment();
      else if (pending === "unenroll-totp") await removeTotpMfa();
      else if (pending === "enroll-sms") {
        setTimeout(() => {
          void startSmsEnrollment();
        }, 0);
      } else if (pending === "unenroll-sms") await removeSmsMfa();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setTwoFaMsg({ type: "error", text: t("sec.pw.error.wrong", lang) });
      } else {
        setTwoFaMsg({ type: "error", text: t("sec.2fa.err.failed", lang) });
      }
    } finally {
      setTwoFaLoading(false);
    }
  };

  // ── Email verification ─────────────────────────────────────────────────
  const [verifSending, setVerifSending] = useState(false);
  const [verifMsg, setVerifMsg] = useState<MsgState>(null);

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setVerifSending(true);
    setVerifMsg(null);
    try {
      await sendEmailVerification(auth.currentUser);
      await reloadUser();
      setVerifMsg({ type: "success", text: t("sec.email.success", lang) });
    } catch {
      setVerifMsg({ type: "error", text: t("sec.email.error", lang) });
    } finally {
      setVerifSending(false);
    }
  };

  // ── Sign out ───────────────────────────────────────────────────────────
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
    } finally {
      setSigningOut(false);
      setSignOutConfirm(false);
    }
  };

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="security-back-btn flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t("settings.back", lang)}
      </button>

      <div className="security-section-container max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">
            {t("sec.title", lang)}
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            {t("sec.subtitle", lang)}
          </p>
        </div>

        {/* ── Change password ── */}
        {isPasswordProvider ? (
          <SectionCard
            icon={<Lock size={20} strokeWidth={1.8} />}
            iconBg="#EDE9FB"
            iconColor="#6F5AE8"
            title={t("sec.pw.title", lang)}
            description={t("sec.pw.desc", lang)}
          >
            <MessageBanner msg={pwMsg} onDismiss={() => setPwMsg(null)} />
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("sec.pw.current", lang)}
                </label>
                <div className="relative">
                  <input
                    type={showCurrent ? "text" : "password"}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    className="w-full h-12 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 pr-10 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                    placeholder={t("sec.pw.placeholder.current", lang)}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("sec.pw.new", lang)}
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    className="w-full h-12 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 pr-10 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                    placeholder={t("sec.pw.placeholder.new", lang)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  >
                    {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("sec.pw.confirm", lang)}
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  className="w-full h-12 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                  placeholder={t("sec.pw.placeholder.confirm", lang)}
                  autoComplete="new-password"
                />
              </div>
              <div className="pt-1">
                <button
                  onClick={handleChangePassword}
                  disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                  className="security-pw-submit h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {pwSaving && <Loader2 size={15} className="animate-spin" />}
                  {t("sec.pw.save", lang)}
                </button>
              </div>
            </div>
          </SectionCard>
        ) : (
          <SectionCard
            icon={<Lock size={20} strokeWidth={1.8} />}
            iconBg="#EDE9FB"
            iconColor="#6F5AE8"
            title={t("sec.pw.title", lang)}
            description={t("sec.pw.notAvailable", lang)}
          >
            <p className="text-sm text-[#64748B]">{t("sec.pw.social", lang)}</p>
          </SectionCard>
        )}

        {/* ── Two-factor authentication ── */}
        <SectionCard
          icon={<ShieldCheck size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t("sec.2fa.title", lang)}
          description={t("sec.2fa.desc", lang)}
        >
          <MessageBanner msg={twoFaMsg} onDismiss={() => setTwoFaMsg(null)} />

          {/* ── Reauthentication prompt (shared) ── */}
          {reauthNeeded && (
            <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
              <p className="text-sm text-amber-800">
                {t("sec.2fa.err.recentLogin", lang)}
              </p>
              <div className="relative">
                <input
                  type={showReauthPw ? "text" : "password"}
                  value={reauthPw}
                  onChange={(e) => setReauthPw(e.target.value)}
                  placeholder={t("sec.2fa.reauth.label", lang)}
                  className="w-full h-10 rounded-xl border border-amber-200 bg-white px-4 pr-10 text-sm text-[#1A1F36] focus:outline-none focus:border-amber-400 transition-colors"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowReauthPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                >
                  {showReauthPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleTwoFaReauth}
                  disabled={!reauthPw || twoFaLoading}
                  className="h-9 px-4 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {twoFaLoading && (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {t("sec.2fa.reauth.confirm", lang)}
                </button>
                <button
                  onClick={() => {
                    setReauthNeeded(null);
                    setReauthPw("");
                  }}
                  className="h-9 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                >
                  {t("sec.2fa.reauth.cancel", lang)}
                </button>
              </div>
            </div>
          )}

          {/* ── TOTP enrollment flow ── */}
          {twoFaView === "enrolling-totp" && !reauthNeeded && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-[#1A1F36]">
                {t("sec.2fa.enroll.title", lang)}
              </p>
              <p className="text-xs text-[#64748B] leading-relaxed">
                {t("sec.2fa.enroll.scan", lang)}
              </p>
              {qrDataUrl && (
                <div className="flex justify-center py-2">
                  <img
                    src={qrDataUrl}
                    alt="TOTP QR code"
                    width={180}
                    height={180}
                    className="rounded-xl border border-[#E8E6E0] p-2 bg-white"
                  />
                </div>
              )}
              {totpSecret && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-[#64748B]">
                    {t("sec.2fa.enroll.secretLabel", lang)}
                  </p>
                  <p className="font-mono text-xs break-all bg-[#F8F7F4] border border-[#E8E6E0] rounded-xl px-3 py-2.5 text-[#1A1F36] select-all leading-relaxed">
                    {totpSecret.secretKey}
                  </p>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                  {t("sec.2fa.enroll.codeLabel", lang)}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) =>
                    setTotpCode(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder={t("sec.2fa.enroll.codePh", lang)}
                  className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors font-mono tracking-[0.5em]"
                  autoComplete="one-time-code"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={verifyTotpEnrollment}
                  disabled={twoFaLoading || totpCode.length !== 6}
                  className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {twoFaLoading && (
                    <Loader2 size={15} className="animate-spin" />
                  )}
                  {twoFaLoading
                    ? t("sec.2fa.enroll.verifying", lang)
                    : t("sec.2fa.enroll.verify", lang)}
                </button>
                <button
                  onClick={() => {
                    setTwoFaView("idle");
                    setTotpSecret(null);
                    setQrDataUrl("");
                    setTotpCode("");
                    setTwoFaMsg(null);
                  }}
                  className="h-10 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                >
                  {t("sec.2fa.enroll.cancel", lang)}
                </button>
              </div>
            </div>
          )}

          {/* ── SMS enrollment flow ── */}
          {twoFaView === "enrolling-sms" && !reauthNeeded && (
            <div className="space-y-4">
              {!smsCodeSent ? (
                <>
                  <p className="text-sm font-semibold text-[#1A1F36]">
                    {t("sec.2fa.method.sms", lang)}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                      {t("sec.2fa.sms.phoneLabel", lang)}
                    </label>
                    <input
                      type="tel"
                      value={smsPhone}
                      onChange={(e) => setSmsPhone(e.target.value)}
                      placeholder={t("sec.2fa.sms.phonePh", lang)}
                      className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors"
                      autoComplete="tel"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setReauthNeeded("enroll-sms")}
                      disabled={twoFaLoading || !smsPhone.trim()}
                      className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {twoFaLoading && (
                        <Loader2 size={15} className="animate-spin" />
                      )}
                      {twoFaLoading
                        ? t("sec.2fa.sms.sending", lang)
                        : t("sec.2fa.sms.sendCode", lang)}
                    </button>
                    <button
                      onClick={cancelSmsEnrollment}
                      className="h-10 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                    >
                      {t("sec.2fa.sms.cancel", lang)}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-[#1A1F36]">
                    {t("sec.2fa.method.sms", lang)}
                  </p>
                  <p className="text-xs text-[#64748B]">
                    {t("sec.2fa.sms.sentTo", lang).replace(
                      "{phone}",
                      smsPhone.trim(),
                    )}
                  </p>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">
                      {t("sec.2fa.sms.codeLabel", lang)}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={smsCode}
                      onChange={(e) =>
                        setSmsCode(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder={t("sec.2fa.sms.codePh", lang)}
                      className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-[#FAFAFA] px-4 text-sm text-[#1A1F36] focus:outline-none focus:border-[#6F5AE8] focus:bg-white transition-colors font-mono tracking-[0.5em]"
                      autoComplete="one-time-code"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={verifySmsEnrollment}
                      disabled={twoFaLoading || smsCode.length !== 6}
                      className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {twoFaLoading && (
                        <Loader2 size={15} className="animate-spin" />
                      )}
                      {twoFaLoading
                        ? t("sec.2fa.sms.verifying", lang)
                        : t("sec.2fa.sms.verify", lang)}
                    </button>
                    <button
                      onClick={() => {
                        setSmsCodeSent(false);
                        setSmsVerificationId("");
                        setSmsCode("");
                        setTwoFaMsg(null);
                      }}
                      className="h-10 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                    >
                      {t("sec.2fa.sms.resend", lang)}
                    </button>
                    <button
                      onClick={cancelSmsEnrollment}
                      className="h-10 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                    >
                      {t("sec.2fa.sms.cancel", lang)}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Idle — two method cards ── */}
          {twoFaView === "idle" && !reauthNeeded && (
            <div className="space-y-3">
              {/* TOTP card */}
              <div className="rounded-xl border border-[#E8E6E0] overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#EDE9FB] flex items-center justify-center flex-shrink-0">
                      <Smartphone size={16} className="text-[#6F5AE8]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-[#1A1F36]">
                          {t("sec.2fa.method.totp", lang)}
                        </p>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EDE9FB] text-[#6F5AE8] flex-shrink-0">
                          {t("sec.2fa.method.recommended", lang)}
                        </span>
                        {isTotpEnabled && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            <CheckCircle2 size={10} />
                            {t("sec.2fa.status.enabled", lang)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        {t("sec.2fa.method.totp.desc", lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center">
                    {isTotpEnabled ? (
                      <button
                        onClick={() => setShowRemoveTotpConfirm((v) => !v)}
                        className="h-8 px-3 rounded-xl bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] text-xs font-medium hover:bg-[#FECACA] transition-colors"
                      >
                        {t("sec.2fa.remove", lang)}
                      </button>
                    ) : (
                      <button
                        onClick={() => setTwoFaView("enrolling-totp")}
                        disabled={twoFaLoading}
                        className="h-8 px-3 rounded-xl bg-[#6F5AE8] text-white text-xs font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 inline-flex items-center"
                      >
                        {t("sec.2fa.enable", lang)}
                      </button>
                    )}
                  </div>
                </div>
                {showRemoveTotpConfirm && isTotpEnabled && (
                  <div className="px-4 pb-4 pt-3 border-t border-[#F0F0F0] bg-red-50 space-y-2.5">
                    <p className="text-xs text-red-700">
                      {t("sec.2fa.remove.confirm", lang)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={removeTotpMfa}
                        disabled={twoFaLoading}
                        className="h-8 px-3 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {twoFaLoading && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        {t("sec.2fa.remove.yes", lang)}
                      </button>
                      <button
                        onClick={() => setShowRemoveTotpConfirm(false)}
                        className="h-8 px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                      >
                        {t("sec.2fa.remove.cancel", lang)}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SMS card */}
              <div className="rounded-xl border border-[#E8E6E0] overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
                      <MessageSquare size={16} className="text-[#16A34A]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-[#1A1F36]">
                          {t("sec.2fa.method.sms", lang)}
                        </p>
                        {isSmsEnabled && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            <CheckCircle2 size={10} />
                            {t("sec.2fa.status.enabled", lang)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        {isSmsEnabled && enrolledSmsPhone
                          ? enrolledSmsPhone
                          : t("sec.2fa.method.sms.desc", lang)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center">
                    {isSmsEnabled ? (
                      <button
                        onClick={() => setShowRemoveSmsConfirm((v) => !v)}
                        className="h-8 px-3 rounded-xl bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] text-xs font-medium hover:bg-[#FECACA] transition-colors"
                      >
                        {t("sec.2fa.remove", lang)}
                      </button>
                    ) : (
                      <button
                        onClick={() => setTwoFaView("enrolling-sms")}
                        disabled={twoFaLoading}
                        className="h-8 px-3 rounded-xl bg-[#6F5AE8] text-white text-xs font-medium hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 inline-flex items-center"
                      >
                        {t("sec.2fa.enable", lang)}
                      </button>
                    )}
                  </div>
                </div>
                {showRemoveSmsConfirm && isSmsEnabled && (
                  <div className="px-4 pb-4 pt-3 border-t border-[#F0F0F0] bg-red-50 space-y-2.5">
                    <p className="text-xs text-red-700">
                      {t("sec.2fa.remove.confirm", lang)}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={removeSmsMfa}
                        disabled={twoFaLoading}
                        className="h-8 px-3 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {twoFaLoading && (
                          <Loader2 size={12} className="animate-spin" />
                        )}
                        {t("sec.2fa.remove.yes", lang)}
                      </button>
                      <button
                        onClick={() => setShowRemoveSmsConfirm(false)}
                        className="h-8 px-3 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
                      >
                        {t("sec.2fa.remove.cancel", lang)}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/*
            Invisible reCAPTCHA container.
            - Never display:none — offsetParent would be null and crash grecaptcha.
            - key={recaptchaKey}: incrementing the key causes React to unmount
              the old <div> and mount a brand-new DOM element. This is the only
              reliable way to clear Google's internal widget registry.
              innerHTML='' removes injected nodes but leaves the element in
              grecaptcha's closure-based map, so render() still throws
              "reCAPTCHA has already been rendered in this element".
          */}
          <div
            key={recaptchaKey}
            id="sms-enroll-recaptcha"
            ref={recaptchaContainerRef}
            style={{
              position: "absolute",
              width: 0,
              height: 0,
              overflow: "hidden",
              top: 0,
              left: 0,
            }}
          />
        </SectionCard>

        {/* ── Email verification ── */}
        <SectionCard
          icon={<Mail size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t("sec.email.title", lang)}
          description={t("sec.email.desc", lang)}
        >
          <MessageBanner msg={verifMsg} onDismiss={() => setVerifMsg(null)} />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#1A1F36] font-medium">
                {user?.email}
              </p>
              {user?.emailVerified ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <CheckCircle2 size={14} className="text-green-600" />
                  <span className="text-xs text-green-600 font-medium">
                    {t("sec.email.verified", lang)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <AlertCircle size={14} className="text-amber-500" />
                  <span className="text-xs text-amber-600 font-medium">
                    {t("sec.email.notVerified", lang)}
                  </span>
                </div>
              )}
            </div>
            {!user?.emailVerified && (
              <button
                onClick={handleResendVerification}
                disabled={verifSending}
                className="h-9 px-4 rounded-xl bg-[#FEF9C3] text-[#CA8A04] border border-[#FDE68A] text-sm font-medium hover:bg-[#FEF08A] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {verifSending && <Loader2 size={14} className="animate-spin" />}
                {t("sec.email.resend", lang)}
              </button>
            )}
          </div>
        </SectionCard>

        {/* ── Sign out ── */}
        <SectionCard
          icon={<LogOut size={20} strokeWidth={1.8} />}
          iconBg="#FEE2E2"
          iconColor="#DC2626"
          title={t("sec.signout.title", lang)}
          description={t("sec.signout.desc", lang)}
        >
          {!signOutConfirm ? (
            <button
              onClick={() => setSignOutConfirm(true)}
              className="h-9 px-4 rounded-xl bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] text-sm font-medium hover:bg-[#FECACA] transition-colors"
            >
              {t("sec.signout.button", lang)}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-sm text-[#64748B]">
                {t("sec.signout.confirm", lang)}
              </p>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="h-9 px-4 rounded-xl bg-[#DC2626] text-white text-sm font-medium hover:bg-[#B91C1C] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {signingOut && <Loader2 size={14} className="animate-spin" />}
                {t("sec.signout.button", lang)}
              </button>
              <button
                onClick={() => setSignOutConfirm(false)}
                className="h-9 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors"
              >
                {t("sec.signout.cancel", lang)}
              </button>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
