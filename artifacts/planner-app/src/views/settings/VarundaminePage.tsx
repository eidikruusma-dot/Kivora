import { useState, useEffect } from 'react'
import {
  ArrowLeft,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Archive,
  Clock,
  History,
  RotateCcw,
  Trash2,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { dispatch as dispatchNotif } from '@/lib/notificationItemsStore'
import { useAuth } from '@/context/AuthContext'
import { loadSettings } from '@/lib/settingsStore'
import {
  createBackup,
  listBackups,
  deleteBackup,
  restoreBackup,
  type BackupMeta,
} from '@/lib/backupService'
import { initTasksStore } from '@/lib/tasksStore'
import { initGoalsStore } from '@/lib/goalsStore'
import { initCalendarStore } from '@/lib/calendarStore'
import { initNotesStore } from '@/lib/quickNotesStore'
import { initHabitsStore } from '@/lib/habitsStore'
import { initSchoolStore } from '@/lib/schoolStore'
import { initEntityLinksStore } from '@/lib/entityLinksStore'
import { initAIConversationsStore } from '@/lib/aiConversationsStore'
import { initNotificationItemsStore } from '@/lib/notificationItemsStore'

// ── Shared sub-components ──────────────────────────────────────────────────────

function SectionCard({
  icon,
  iconBg,
  iconColor,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
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
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#1A1F36]">{label}</p>
        <p className="text-xs text-[#94A3B8] mt-0.5 leading-relaxed">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-[22px] rounded-full flex-shrink-0 transition-colors duration-200 ${
          checked ? 'bg-[#6F5AE8]' : 'bg-[#CBD5E1]'
        }`}
      >
        <span
          className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

// ── Restore confirmation modal ─────────────────────────────────────────────────

function RestoreModal({
  backup,
  lang,
  restoring,
  restoreDone,
  restoreError,
  restoreErrorMsg,
  onConfirm,
  onClose,
}: {
  backup: BackupMeta
  lang: AppLang
  restoring: boolean
  restoreDone: boolean
  restoreError: boolean
  restoreErrorMsg: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={!restoring ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={20} className="text-amber-500" />
          </div>
          <h2 className="text-base font-semibold text-[#1A1F36]">
            {t('backup.restore.confirm.title', lang)}
          </h2>
        </div>

        <p className="text-sm text-[#64748B] leading-relaxed">
          {t('backup.restore.confirm.body', lang)}
        </p>

        {/* Backup details */}
        <div className="bg-[#F8FAFC] rounded-xl p-3 text-xs text-[#64748B] space-y-1">
          <div className="flex justify-between">
            <span className="font-medium text-[#1A1F36]">{formatDate(new Date(backup.createdAt), lang)}</span>
            <span>{backup.totalItems} {t('backup.history.items', lang)}</span>
          </div>
          <div className="text-[#94A3B8]">{t('backup.restore.safetyNote', lang)}</div>
        </div>

        {restoreDone && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 size={15} />
            {t('backup.restore.done', lang)}
          </div>
        )}

        {restoreError && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{t('backup.restore.error', lang)}{restoreErrorMsg ? `: ${restoreErrorMsg}` : ''}</span>
          </div>
        )}

        {!restoreDone && (
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              disabled={restoring}
              className="h-9 px-4 rounded-xl border border-[#E2E8F0] text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] transition-colors disabled:opacity-50"
            >
              {t('backup.restore.confirm.cancel', lang)}
            </button>
            <button
              onClick={onConfirm}
              disabled={restoring}
              className="h-9 px-4 rounded-xl bg-amber-500 text-white text-sm font-medium flex items-center gap-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
            >
              {restoring ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('backup.restore.running', lang)}
                </>
              ) : (
                <>
                  <RotateCcw size={14} />
                  {t('backup.restore.confirm.cta', lang)}
                </>
              )}
            </button>
          </div>
        )}

        {restoreDone && (
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="h-9 px-4 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium hover:bg-[#5B4AD5] transition-colors"
            >
              {t('backup.restore.confirm.cancel', lang)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

interface BackupSettings {
  autoBackup: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  lastBackupAt: string | null
}

const DEFAULTS: BackupSettings = {
  autoBackup: false,
  frequency: 'weekly',
  lastBackupAt: null,
}

function formatDate(d: Date, lang: AppLang): string {
  return d.toLocaleString(lang === 'et' ? 'et-EE' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatItemCounts(counts: Record<string, number>, lang: AppLang): string {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  return `${total} ${t('backup.history.items', lang)}`
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface Props {
  onBack: () => void
}

export default function VarundaminePage({ onBack }: Props) {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  const [settings, setSettings] = useState<BackupSettings>(DEFAULTS)

  // Manual backup state
  const [creating, setCreating]         = useState(false)
  const [createDone, setCreateDone]     = useState(false)
  const [createError, setCreateError]   = useState(false)
  const [createErrMsg, setCreateErrMsg] = useState('')

  // Backup history
  const [backups, setBackups]           = useState<BackupMeta[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [deletingId, setDeletingId]     = useState<string | null>(null)

  // Restore state
  const [restoreTarget, setRestoreTarget]     = useState<BackupMeta | null>(null)
  const [restoring, setRestoring]             = useState(false)
  const [restoreDone, setRestoreDone]         = useState(false)
  const [restoreError, setRestoreError]       = useState(false)
  const [restoreErrorMsg, setRestoreErrorMsg] = useState('')

  // Load settings on mount
  useEffect(() => {
    if (!uid) return
    loadSettings<BackupSettings>(uid, 'backup', DEFAULTS).then(setSettings)
  }, [uid])

  // Load backup history on mount
  useEffect(() => {
    if (!uid) return
    setLoadingHistory(true)
    listBackups(uid)
      .then(setBackups)
      .catch(() => {})
      .finally(() => setLoadingHistory(false))
  }, [uid])

  const lastBackup = settings.lastBackupAt ? new Date(settings.lastBackupAt) : null

  async function handleCreateBackup() {
    if (!uid) return
    setCreating(true)
    setCreateDone(false)
    setCreateError(false)
    setCreateErrMsg('')
    try {
      const meta = await createBackup(uid)
      // Refresh settings to get updated lastBackupAt
      const updated = await loadSettings<BackupSettings>(uid, 'backup', DEFAULTS)
      setSettings(updated)
      // Refresh history
      const history = await listBackups(uid)
      setBackups(history)
      setCreating(false)
      setCreateDone(true)
      setTimeout(() => setCreateDone(false), 4000)
      dispatchNotif({
        type: 'backup-done',
        module: 'system',
        title: t('notif.backupDone.title', lang),
        description: lang === 'et'
          ? `Varundati ${meta.totalItems} kirjet`
          : `Backed up ${meta.totalItems} items`,
        timeLabel: t('notif.today', lang),
        read: false,
        icon: 'database',
        accent: '#16A34A',
      })
    } catch (err) {
      setCreating(false)
      setCreateError(true)
      setCreateErrMsg(err instanceof Error ? err.message : String(err))
      setTimeout(() => { setCreateError(false); setCreateErrMsg('') }, 6000)
    }
  }

  async function handleDeleteBackup(backupId: string) {
    if (!uid) return
    setDeletingId(backupId)
    try {
      await deleteBackup(uid, backupId)
      setBackups((prev) => prev.filter((b) => b.id !== backupId))
    } catch {
      // ignore delete error — leave UI unchanged
    } finally {
      setDeletingId(null)
    }
  }

  function handleRestoreClick(backup: BackupMeta) {
    setRestoreTarget(backup)
    setRestoreDone(false)
    setRestoreError(false)
    setRestoreErrorMsg('')
  }

  async function handleConfirmRestore() {
    if (!uid || !restoreTarget) return
    setRestoring(true)
    setRestoreDone(false)
    setRestoreError(false)
    setRestoreErrorMsg('')
    try {
      // 1. Create safety backup of current state
      await createBackup(uid)
      // 2. Restore selected backup
      await restoreBackup(uid, restoreTarget.id)
      // 3. Re-initialise all affected stores so the UI refreshes immediately
      initTasksStore(uid)
      initGoalsStore(uid)
      initCalendarStore(uid)
      initNotesStore(uid)
      initHabitsStore(uid)
      initSchoolStore(uid)
      initEntityLinksStore(uid)
      initAIConversationsStore(uid)
      initNotificationItemsStore(uid)
      // 4. Refresh backup history (safety backup was added)
      const history = await listBackups(uid)
      setBackups(history)
      const updated = await loadSettings<BackupSettings>(uid, 'backup', DEFAULTS)
      setSettings(updated)
      setRestoring(false)
      setRestoreDone(true)
    } catch (err) {
      setRestoring(false)
      setRestoreError(true)
      setRestoreErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }

  function handleCloseRestoreModal() {
    if (restoring) return
    setRestoreTarget(null)
    setRestoreDone(false)
    setRestoreError(false)
    setRestoreErrorMsg('')
  }

  const hasBackup = lastBackup !== null
  const statusLabel = hasBackup ? t('backup.status.ok', lang) : t('backup.status.none', lang)
  const statusColor = hasBackup ? 'text-green-700' : 'text-[#94A3B8]'
  const statusIcon = hasBackup
    ? <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
    : <AlertCircle size={16} className="text-[#CBD5E1] flex-shrink-0" />

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-[#64748B] hover:text-[#6F5AE8] transition-colors mb-6"
      >
        <ArrowLeft size={16} strokeWidth={2} />
        {t('settings.back', lang)}
      </button>

      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1F36]">{t('backup.title', lang)}</h1>
          <p className="text-sm text-[#94A3B8] mt-1">{t('backup.subtitle', lang)}</p>
        </div>

        {/* ── 1. Backup status ── */}
        <SectionCard
          icon={<HardDrive size={20} strokeWidth={1.8} />}
          iconBg={hasBackup ? '#DCFCE7' : '#F1F5F9'}
          iconColor={hasBackup ? '#16A34A' : '#64748B'}
          title={t('backup.status.title', lang)}
          description={t('backup.status.desc', lang)}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex items-center gap-2">
              {statusIcon}
              <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="hidden sm:block w-px h-4 bg-[#E2E8F0]" />
            <div className="flex items-center gap-1.5 text-xs text-[#94A3B8]">
              <Clock size={12} strokeWidth={2} />
              <span>
                {t('backup.status.lastBackup', lang)}:{' '}
                <span className="text-[#64748B] font-medium">
                  {lastBackup ? formatDate(lastBackup, lang) : t('backup.status.never', lang)}
                </span>
              </span>
            </div>
          </div>
        </SectionCard>

        {/* ── 2. Manual backup ── */}
        <SectionCard
          icon={<Archive size={20} strokeWidth={1.8} />}
          iconBg="#FEF9C3"
          iconColor="#CA8A04"
          title={t('backup.manual.title', lang)}
          description={t('backup.manual.desc', lang)}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleCreateBackup}
                disabled={creating || !uid}
                className="h-10 px-5 rounded-xl bg-[#6F5AE8] text-white text-sm font-medium flex items-center gap-2 hover:bg-[#5B4AD5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Archive size={15} strokeWidth={2} />
                )}
                {creating ? t('backup.manual.creating', lang) : t('backup.manual.button', lang)}
              </button>

              {createDone && (
                <div className="flex items-center gap-1.5 text-sm text-green-600">
                  <CheckCircle2 size={15} />
                  {t('backup.manual.done', lang)}
                </div>
              )}

              {createError && (
                <div className="flex items-center gap-1.5 text-sm text-red-600">
                  <AlertCircle size={15} />
                  {t('backup.status.error', lang)}{createErrMsg ? `: ${createErrMsg}` : ''}
                </div>
              )}
            </div>

            <p className="text-xs text-[#94A3B8] leading-relaxed">
              {t('backup.manual.note', lang)}
            </p>
          </div>
        </SectionCard>

        {/* ── 3. Backup history ── */}
        <SectionCard
          icon={<History size={20} strokeWidth={1.8} />}
          iconBg="#EFF6FF"
          iconColor="#3B82F6"
          title={t('backup.history.title', lang)}
          description={t('backup.history.desc', lang)}
        >
          {loadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-[#94A3B8] py-2">
              <Loader2 size={14} className="animate-spin" />
              {t('backup.history.loading', lang)}
            </div>
          ) : backups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Archive size={32} className="text-[#CBD5E1]" strokeWidth={1.5} />
              <p className="text-sm text-[#94A3B8]">{t('backup.history.empty', lang)}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0F0]">
              {backups.map((backup) => {
                const isDeleting = deletingId === backup.id
                return (
                  <div
                    key={backup.id}
                    className="py-3 flex items-center gap-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1A1F36]">
                        {formatDate(new Date(backup.createdAt), lang)}
                      </p>
                      <p className="text-xs text-[#94A3B8] mt-0.5">
                        {formatItemCounts(backup.itemCounts, lang)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleRestoreClick(backup)}
                        disabled={isDeleting || !!deletingId}
                        className="h-8 px-3 rounded-lg border border-[#E2E8F0] text-xs font-medium text-[#64748B] flex items-center gap-1.5 hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <RotateCcw size={12} strokeWidth={2} />
                        {t('backup.history.restore', lang)}
                      </button>

                      <button
                        onClick={() => handleDeleteBackup(backup.id)}
                        disabled={isDeleting || !!deletingId}
                        className="h-8 w-8 rounded-lg border border-[#E2E8F0] text-[#94A3B8] flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title={t('backup.history.delete', lang)}
                      >
                        {isDeleting ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Trash2 size={13} strokeWidth={2} />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Habits note */}
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[#94A3B8]">
            <Info size={12} className="flex-shrink-0" />
            {t('backup.history.habits', lang)}
          </div>
        </SectionCard>
      </div>

      {/* ── Restore confirmation modal ── */}
      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          lang={lang}
          restoring={restoring}
          restoreDone={restoreDone}
          restoreError={restoreError}
          restoreErrorMsg={restoreErrorMsg}
          onConfirm={handleConfirmRestore}
          onClose={handleCloseRestoreModal}
        />
      )}
    </div>
  )
}
