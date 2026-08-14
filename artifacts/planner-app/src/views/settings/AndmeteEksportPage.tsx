import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  CheckSquare,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Square,
  LayoutGrid,
} from "lucide-react";
import { subscribeToLanguage, getLocalLanguage } from "@/lib/languageStore";
import type { AppLang } from "@/lib/languageStore";
import { t } from "@/lib/translations";
import { dispatch as dispatchNotif } from "@/lib/notificationItemsStore";
import { useAuth } from "@/context/AuthContext";
import { loadSettings, saveSettings } from "@/lib/settingsStore";
import { runExport } from "@/lib/exportService";
import type { ExportFormat, DataKey } from "@/lib/exportService";

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

// ── Format selector ────────────────────────────────────────────────────────────

const FORMAT_OPTIONS: {
  value: ExportFormat;
  icon: React.ReactNode;
  labelKey: "export.format.xlsx" | "export.format.pdf";
  descKey: "export.format.xlsx.desc" | "export.format.pdf.desc";
}[] = [
  {
    value: "xlsx",
    icon: <FileSpreadsheet size={20} strokeWidth={1.8} />,
    labelKey: "export.format.xlsx",
    descKey: "export.format.xlsx.desc",
  },
  {
    value: "pdf",
    icon: <FileText size={20} strokeWidth={1.8} />,
    labelKey: "export.format.pdf",
    descKey: "export.format.pdf.desc",
  },
];

function FormatCard({
  option,
  selected,
  onSelect,
  lang,
}: {
  option: (typeof FORMAT_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
  lang: AppLang;
}) {
  return (
    <button
      onClick={onSelect}
      className={`flex-1 min-w-[120px] flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 text-center transition-all ${
        selected
          ? "border-[#6F5AE8] bg-[#F4F2FF]"
          : "border-[#E2E8F0] bg-white hover:border-[#CBD5E1] hover:bg-[#FAFAFA]"
      }`}
    >
      <span
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{
          background: selected ? "#EDE9FB" : "#F1F5F9",
          color: selected ? "#6F5AE8" : "#64748B",
        }}
      >
        {option.icon}
      </span>
      <div>
        <p className={`text-sm font-semibold ${selected ? "text-[#6F5AE8]" : "text-[#1A1F36]"}`}>
          {t(option.labelKey, lang)}
        </p>
        <p className="text-xs text-[#94A3B8] mt-0.5 leading-snug">
          {t(option.descKey, lang)}
        </p>
      </div>
    </button>
  );
}

// ── Data checkbox row (DataKey imported from exportService) ───────────────────

function CheckRow({
  label,
  checked,
  onChange,
  indeterminate,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  indeterminate?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 w-full py-2 text-left group"
    >
      <span
        className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
          checked || indeterminate
            ? "border-[#6F5AE8] bg-[#6F5AE8]"
            : "border-[#D1D5DB] bg-white group-hover:border-[#A5B4FC]"
        }`}
      >
        {checked && !indeterminate && (
          <CheckSquare size={12} className="text-white" strokeWidth={3} />
        )}
        {indeterminate && <span className="w-2 h-0.5 bg-white rounded-full" />}
        {!checked && !indeterminate && <Square size={0} />}
      </span>
      <span className="text-sm text-[#1A1F36] font-medium">{label}</span>
    </button>
  );
}

// ── Data items ────────────────────────────────────────────────────────────────

const DATA_ITEMS: {
  key: DataKey;
  labelKey:
    | "export.data.tasks"
    | "export.data.calendar"
    | "export.data.habits"
    | "export.data.goals"
    | "export.data.notes"
    | "export.data.school";
}[] = [
  { key: "tasks",    labelKey: "export.data.tasks" },
  { key: "calendar", labelKey: "export.data.calendar" },
  { key: "habits",   labelKey: "export.data.habits" },
  { key: "goals",    labelKey: "export.data.goals" },
  { key: "notes",    labelKey: "export.data.notes" },
  { key: "school",   labelKey: "export.data.school" },
];

// ── Settings shape ────────────────────────────────────────────────────────────

interface ExportSettings {
  format: ExportFormat;
  data: Record<DataKey, boolean>;
  lastExportAt?: string;
}

const DEFAULT_DATA: Record<DataKey, boolean> = {
  tasks: true, calendar: true, habits: true,
  goals: true, notes: true, school: false,
};

const DEFAULTS: ExportSettings = { format: "xlsx", data: DEFAULT_DATA };

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

export default function AndmeteEksportPage({ onBack }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [lang, setLang] = useState<AppLang>(getLocalLanguage);
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), []);

  const [settings, setSettings] = useState<ExportSettings>(DEFAULTS);

  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [exportDone, setExportDone]   = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Load from Firestore on mount (migrate legacy "csv" → "xlsx")
  useEffect(() => {
    if (!uid) return;
    loadSettings<ExportSettings>(uid, "export", DEFAULTS).then((s) => {
      const rawFormat = s.format as string;
      const format: ExportFormat = rawFormat === "pdf" ? "pdf" : "xlsx";
      setSettings({
        format,
        data: { ...DEFAULT_DATA, ...(s.data ?? {}) },
      });
    });
  }, [uid]);

  const selectedKeys = DATA_ITEMS.filter((d) => settings.data[d.key]);
  const allSelected  = selectedKeys.length === DATA_ITEMS.length;
  const noneSelected = selectedKeys.length === 0;
  const someSelected = !allSelected && !noneSelected;

  function setFormat(format: ExportFormat) {
    setSettings((prev) => ({ ...prev, format }));
  }

  function toggleDataKey(key: DataKey, value: boolean) {
    setSettings((prev) => ({ ...prev, data: { ...prev.data, [key]: value } }));
  }

  function setAll(value: boolean) {
    const next = {} as Record<DataKey, boolean>;
    DATA_ITEMS.forEach((d) => { next[d.key] = value; });
    setSettings((prev) => ({ ...prev, data: next }));
  }

  async function handleSave() {
    if (!uid) return;
    setSaving(true);
    await saveSettings(uid, "export", settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleExport() {
    if (noneSelected || !uid) return;
    setExporting(true);
    setExportDone(false);
    setExportError(null);
    try {
      await runExport(
        uid,
        settings.format,
        selectedKeys.map((d) => d.key),
        lang,
      );
      // Update lastExportAt only after a real successful download
      await saveSettings(uid, "export", {
        ...settings,
        lastExportAt: new Date().toISOString(),
      }).catch(() => {});
      setExportDone(true);
      setTimeout(() => setExportDone(false), 3500);
      dispatchNotif({
        type: "export-done",
        module: "system",
        title: t("notif.exportDone.title", lang),
        description: t("notif.exportDone.desc", lang),
        timeLabel: t("notif.today", lang),
        read: false,
        icon: "download",
        accent: "#6F5AE8",
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

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
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t("export.title", lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{t("export.subtitle", lang)}</p>
        </div>

        {/* ── 1. Export format ── */}
        <SectionCard
          icon={<FileText size={20} strokeWidth={1.8} />}
          iconBg="#EDE9FB"
          iconColor="#6F5AE8"
          title={t("export.format.title", lang)}
          description={t("export.format.desc", lang)}
        >
          <div className="flex gap-3 flex-wrap">
            {FORMAT_OPTIONS.map((opt) => (
              <FormatCard
                key={opt.value}
                option={opt}
                selected={settings.format === opt.value}
                onSelect={() => setFormat(opt.value)}
                lang={lang}
              />
            ))}
          </div>
        </SectionCard>

        {/* ── 2. Data to export ── */}
        <SectionCard
          icon={<LayoutGrid size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t("export.data.title", lang)}
          description={t("export.data.desc", lang)}
        >
          <div className="space-y-1">
            <div className="pb-2 mb-1 border-b border-[#F0F0F0]">
              <CheckRow
                label={t("export.data.all", lang)}
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(v) => setAll(v)}
              />
              <p className="text-xs text-[#94A3B8] ml-8 -mt-1 leading-relaxed">
                {t("export.data.all.desc", lang)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              {DATA_ITEMS.map((item) => (
                <CheckRow
                  key={item.key}
                  label={t(item.labelKey, lang)}
                  checked={settings.data[item.key]}
                  onChange={(v) => toggleDataKey(item.key, v)}
                />
              ))}
            </div>
          </div>
        </SectionCard>

        {/* ── 3. Export action ── */}
        <SectionCard
          icon={<Download size={20} strokeWidth={1.8} />}
          iconBg="#DCFCE7"
          iconColor="#16A34A"
          title={t("export.action.title", lang)}
          description={t("export.action.desc", lang)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                disabled={exporting || noneSelected}
                className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} strokeWidth={2} />
                )}
                {exporting ? t("export.action.exporting", lang) : t("export.action.button", lang)}
              </button>

              {exportDone && (
                <div className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 size={15} />
                  {t("export.action.done", lang)}
                </div>
              )}

              {exportError && (
                <div className="flex items-start gap-1.5 text-sm text-red-500 max-w-sm">
                  <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                  <span>{t("export.action.error", lang)}: {exportError}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              {t("export.action.note", lang)}
            </p>
          </div>
        </SectionCard>

        {/* ── Save bar ── */}
        <div className="flex items-center justify-end gap-3 pb-2">
          {saved && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} />
              {t("export.saved", lang)}
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !uid}
            className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {saving ? t("export.saving", lang) : t("export.save", lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
