/**
 * ModulesPage — Settings → Modules
 *
 * Shows all 8 selectable modules with name, description and an on/off toggle.
 * Changes are saved to Firestore immediately on toggle.
 * Disabling a module hides its sidebar item and dashboard widget.
 * No data is deleted when a module is disabled.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Calendar, CheckSquare, StickyNote, Activity, Flag,
  Wallet, GraduationCap, Sparkles, ClipboardList,
  CheckCircle2, Loader2, RotateCcw,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  type ModuleId,
  type ModuleSettings,
  useModules,
  saveModuleSettings,
  setModuleSettingsState,
} from '@/lib/modulesStore'
import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'
import { clearOnboardingConversation } from '@/lib/onboardingConversationStore'

// ── Module definitions ───────────────────────────────────────────────────────

const ALL_MODULE_META: {
  id: ModuleId
  icon: React.ReactNode
  accentColor: string
  accentBg: string
}[] = [
  { id: 'calendar',  icon: <Calendar size={20} strokeWidth={1.8} />,     accentColor: '#6F5AE8', accentBg: '#EDE9FB' },
  { id: 'tasks',     icon: <CheckSquare size={20} strokeWidth={1.8} />,   accentColor: '#16A34A', accentBg: '#DCFCE7' },
  { id: 'notes',     icon: <StickyNote size={20} strokeWidth={1.8} />,    accentColor: '#CA8A04', accentBg: '#FEF9C3' },
  { id: 'habits',    icon: <Activity size={20} strokeWidth={1.8} />,      accentColor: '#EA580C', accentBg: '#FFF7ED' },
  { id: 'goals',     icon: <Flag size={20} strokeWidth={1.8} />,          accentColor: '#0891B2', accentBg: '#E0F2FE' },
  { id: 'finance',   icon: <Wallet size={20} strokeWidth={1.8} />,        accentColor: '#16A34A', accentBg: '#DCFCE7' },
  { id: 'plans',     icon: <ClipboardList size={20} strokeWidth={1.8} />,accentColor: '#4F46E5', accentBg: '#E0E7FF' },
  { id: 'school',    icon: <GraduationCap size={20} strokeWidth={1.8} />, accentColor: '#7C3AED', accentBg: '#EDE9FB' },
  { id: 'assistant', icon: <Sparkles size={20} strokeWidth={1.8} />,      accentColor: '#6F5AE8', accentBg: '#EDE9FB' },
]

// Modules gated by a central feature flag are filtered out live from the
// list actually offered to the user — re-enabling the flag makes the entry
// reappear here automatically, with no further changes to this file.
export const MODULE_LIST = ALL_MODULE_META.filter(
  ({ id }) => id !== 'finance' || MONEY_MODULE_ENABLED,
)

// ── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative rounded-full transition-colors flex-shrink-0"
      style={{
        width: '40px',
        height: '23px',
        backgroundColor: enabled ? '#6F5AE8' : '#D1D5DB',
      }}
      aria-checked={enabled}
      role="switch"
    >
      <div
        className="absolute top-[2.5px] bg-white rounded-full shadow-sm transition-all"
        style={{
          width: '18px',
          height: '18px',
          left: enabled ? 'calc(100% - 20.5px)' : '2.5px',
        }}
      />
    </button>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function ModulesPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { settings, loading } = useModules()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmRestartOnboarding, setConfirmRestartOnboarding] = useState(false)

  useEffect(() => subscribeToLanguage(s => setLang(s.appLang)), [])

  // Clears only the local onboarding draft (transcript, timer, any
  // AI-suggested purposes/modules not yet saved) — never touches the
  // user's current module settings or Firestore. The actual module
  // selection changes only later, if the user reaches ModuleSelectionPage's
  // own "Continue" and explicitly confirms it (same as a first-time user).
  function handleRestartOnboarding() {
    if (!user) return
    clearOnboardingConversation(user.uid)
    navigate('/onboarding/chat')
  }

  async function handleToggle(id: ModuleId) {
    if (!user) return
    const next: ModuleSettings = {
      ...settings,
      [id]: !settings[id],
    }
    // Optimistic update — Sidebar, Dashboard, and this page all reflect the
    // change immediately without waiting for the Firestore round-trip.
    setModuleSettingsState(next)
    setSaving(true)
    setSaved(false)
    try {
      await saveModuleSettings(user.uid, next)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // Revert the optimistic update on failure
      setModuleSettingsState(settings)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modules-page h-full overflow-y-auto scrollbar-thin">
      <div className="max-w-2xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-[#F8F7F4] transition-colors text-[#64748B]"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-[#1A1F36]">
              {t('settings.card.modules', lang)}
            </h1>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              {t('modules.settingsDesc', lang)}
            </p>
          </div>
          {/* Save indicator */}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-[#94A3B8]">
            {saving && <Loader2 size={13} className="animate-spin text-[#6F5AE8]" />}
            {saved && !saving && (
              <>
                <CheckCircle2 size={13} className="text-[#16A34A]" />
                <span className="text-[#16A34A]">{t('modules.saved', lang)}</span>
              </>
            )}
          </div>
        </div>

        {/* Info banner */}
        <div className="modules-banner bg-[#F5F3FE] border border-[#E4DFFF] rounded-xl px-4 py-2.5 mb-6 text-sm text-[#6F5AE8]">
          {lang === 'et'
            ? 'Mooduli keelamine ei kustuta sinu andmeid. Saad selle igal ajal uuesti sisse lülitada.'
            : 'Disabling a module does not delete your data. You can re-enable it at any time.'}
        </div>

        {/* Module list */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#6F5AE8]" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#EBEBEB] overflow-hidden">
            {MODULE_LIST.map(({ id, icon, accentColor, accentBg }, idx) => {
              const enabled = settings[id]
              return (
                <div
                  key={id}
                  className={`flex items-center gap-4 px-5 py-[14px] ${
                    idx < MODULE_LIST.length - 1 ? 'border-b border-[#F0F0F0]' : ''
                  }`}
                >
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      backgroundColor: enabled ? accentBg : '#F8F9FB',
                      color: enabled ? accentColor : '#CBD5E1',
                    }}
                  >
                    {icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${enabled ? 'text-[#1A1F36]' : 'text-[#94A3B8]'}`}>
                      {t(('modules.name.' + id) as Parameters<typeof t>[0], lang)}
                    </p>
                    <p className="text-xs text-[#94A3B8] mt-0.5 leading-snug">
                      {t(('modules.desc.' + id) as Parameters<typeof t>[0], lang)}
                    </p>
                  </div>

                  {/* Toggle */}
                  <Toggle enabled={enabled} onToggle={() => handleToggle(id)} />
                </div>
              )
            })}
          </div>
        )}

        {/* Restart the AI onboarding chat — lets an already-onboarded user
            voluntarily go through it again for fresh suggestions. */}
        <div className="bg-white rounded-2xl border border-[#EBEBEB] px-5 py-4 mt-5 flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#EDE9FB', color: '#6F5AE8' }}
          >
            <RotateCcw size={18} strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight text-[#1A1F36]">
              {t('modules.restartOnboarding', lang)}
            </p>
            <p className="text-xs text-[#94A3B8] mt-0.5 leading-snug">
              {t('modules.restartOnboardingDesc', lang)}
            </p>
          </div>
          {!confirmRestartOnboarding ? (
            <button
              onClick={() => setConfirmRestartOnboarding(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-[#6F5AE8]/10 text-[#6D28D9] text-xs font-semibold hover:bg-[#6F5AE8]/20 transition-colors whitespace-nowrap"
            >
              {t('modules.restartOnboarding', lang)}
            </button>
          ) : (
            <div className="shrink-0 flex items-center gap-2 flex-wrap bg-[#F5F3FE] border border-[#E4DFFF] rounded-lg px-3 py-1.5">
              <span className="text-xs font-medium text-[#6D28D9] whitespace-nowrap">
                {lang === 'et' ? 'Kindel?' : 'Sure?'}
              </span>
              <button
                onClick={handleRestartOnboarding}
                className="text-xs font-semibold text-[#6F5AE8] hover:underline whitespace-nowrap"
              >
                {lang === 'et' ? 'Jah, alusta uuesti' : 'Yes, start over'}
              </button>
              <button
                onClick={() => setConfirmRestartOnboarding(false)}
                className="text-xs font-medium text-[#64748B] hover:underline whitespace-nowrap"
              >
                {lang === 'et' ? 'Tühista' : 'Cancel'}
              </button>
            </div>
          )}
        </div>

        {/* Footer note */}
        <p className="modules-footer-note text-xs text-[#94A3B8] text-center mt-5">
          {t('modules.hint', lang)}
        </p>
      </div>
    </div>
  )
}
