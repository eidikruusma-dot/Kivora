/**
 * ModuleSelectionPage
 *
 * One-time onboarding screen shown to new users after email verification.
 * Lets them choose their purposes (pre-selects modules) and fine-tune the
 * individual module selection before entering the app.
 *
 * Saves the selection + sets onboardingComplete: true, then redirects to /app.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar, CheckSquare, StickyNote, Activity, Flag,
  Wallet, GraduationCap, Sparkles, ClipboardList,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import {
  type ModuleId,
  type ModuleSettings,
  ALL_MODULE_IDS,
  saveModuleSettings,
  getModuleSettings,
} from '@/lib/modulesStore'
import { MONEY_MODULE_ENABLED } from '@/lib/featureFlags'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// ── Purpose → module mapping ─────────────────────────────────────────────────

const ALL_PURPOSE_MODULES: Record<string, ModuleId[]> = {
  personal:  ['calendar', 'tasks', 'notes', 'habits', 'goals', 'plans'],
  learning:  ['calendar', 'tasks', 'notes', 'school'],
  finance:   ['finance', 'goals', 'tasks'],
  work:      ['calendar', 'tasks', 'notes', 'goals'],
}

// Modules gated by a central feature flag are filtered out live — re-enabling
// the flag makes the purpose/module reappear automatically, no further
// changes to this file needed.
export const PURPOSE_MODULES: Record<string, ModuleId[]> = Object.fromEntries(
  Object.entries(ALL_PURPOSE_MODULES)
    .filter(([key]) => key !== 'finance' || MONEY_MODULE_ENABLED)
    .map(([key, ids]) => [key, ids.filter((id) => id !== 'finance' || MONEY_MODULE_ENABLED)]),
)

// ── Module metadata ──────────────────────────────────────────────────────────

const ALL_MODULE_META: {
  id: ModuleId
  icon: React.ReactNode
  accentColor: string
  accentBg: string
}[] = [
  { id: 'calendar',  icon: <Calendar size={20} strokeWidth={1.8} />,    accentColor: '#6F5AE8', accentBg: '#EDE9FB' },
  { id: 'tasks',     icon: <CheckSquare size={20} strokeWidth={1.8} />,  accentColor: '#16A34A', accentBg: '#DCFCE7' },
  { id: 'notes',     icon: <StickyNote size={20} strokeWidth={1.8} />,   accentColor: '#CA8A04', accentBg: '#FEF9C3' },
  { id: 'habits',    icon: <Activity size={20} strokeWidth={1.8} />,     accentColor: '#EA580C', accentBg: '#FFF7ED' },
  { id: 'goals',     icon: <Flag size={20} strokeWidth={1.8} />,         accentColor: '#0891B2', accentBg: '#E0F2FE' },
  { id: 'finance',   icon: <Wallet size={20} strokeWidth={1.8} />,       accentColor: '#16A34A', accentBg: '#DCFCE7' },
  { id: 'plans',     icon: <ClipboardList size={20} strokeWidth={1.8} />,accentColor: '#4F46E5', accentBg: '#E0E7FF' },
  { id: 'school',    icon: <GraduationCap size={20} strokeWidth={1.8} />,accentColor: '#7C3AED', accentBg: '#EDE9FB' },
  { id: 'assistant', icon: <Sparkles size={20} strokeWidth={1.8} />,     accentColor: '#6F5AE8', accentBg: '#EDE9FB' },
]

export const MODULE_META = ALL_MODULE_META.filter(
  ({ id }) => id !== 'finance' || MONEY_MODULE_ENABLED,
)

// Selectable module IDs for this onboarding page, live-filtered by the flag.
export const SELECTABLE_MODULE_IDS: ModuleId[] = ALL_MODULE_IDS.filter(
  (id) => id !== 'finance' || MONEY_MODULE_ENABLED,
)

// ── Component ────────────────────────────────────────────────────────────────

export default function ModuleSelectionPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)

  const [selectedPurposes, setSelectedPurposes] = useState<Set<string>>(new Set())
  const [enabledModules, setEnabledModules] = useState<Set<ModuleId>>(
    () => new Set(SELECTABLE_MODULE_IDS),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeToLanguage(s => setLang(s.appLang)), [])

  // When purposes change, update the recommended modules
  function togglePurpose(purposeKey: string) {
    const next = new Set(selectedPurposes)
    if (next.has(purposeKey)) {
      next.delete(purposeKey)
    } else {
      next.add(purposeKey)
    }
    setSelectedPurposes(next)

    // Recompute recommended modules from all selected purposes
    if (next.size === 0) {
      // No purpose selected: keep current manual selection as-is
      return
    }
    const recommended = new Set<ModuleId>()
    next.forEach(p => PURPOSE_MODULES[p]?.forEach(m => recommended.add(m)))
    setEnabledModules(recommended)
  }

  function toggleModule(id: ModuleId) {
    const next = new Set(enabledModules)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setEnabledModules(next)
    setError('')
  }

  function selectAll() {
    setEnabledModules(new Set(SELECTABLE_MODULE_IDS))
    setError('')
  }

  function clearOptional() {
    setEnabledModules(new Set())
    setError('')
  }

  async function handleContinue() {
    if (enabledModules.size === 0) {
      setError(t('modules.atLeastOne', lang))
      return
    }
    if (!user) return
    setSaving(true)
    try {
      const current = getModuleSettings()
      const settings: ModuleSettings = {
        calendar:  enabledModules.has('calendar'),
        tasks:     enabledModules.has('tasks'),
        notes:     enabledModules.has('notes'),
        habits:    enabledModules.has('habits'),
        goals:     enabledModules.has('goals'),
        finance:   enabledModules.has('finance'),
        plans:     enabledModules.has('plans'),
        school:    enabledModules.has('school'),
        assistant: enabledModules.has('assistant'),
        onboardingComplete: true,
      }
      // Preserve any other fields that may have been stored
      await saveModuleSettings(user.uid, { ...current, ...settings })
      navigate('/app', { replace: true })
    } catch {
      setError(lang === 'et' ? 'Salvestamine ebaõnnestus. Proovi uuesti.' : 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const allPurposes = [
    { key: 'personal',  label: t('modules.purpose.personal', lang) },
    { key: 'learning',  label: t('modules.purpose.learning', lang) },
    { key: 'finance',   label: t('modules.purpose.finance', lang) },
    { key: 'work',      label: t('modules.purpose.work', lang) },
  ]
  const purposes = allPurposes.filter((p) => p.key !== 'finance' || MONEY_MODULE_ENABLED)

  return (
    <div className="min-h-[100dvh] bg-[#F4F3EF] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">

        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-8">
          <div className="w-9 h-9 rounded-xl bg-[#6F5AE8] flex items-center justify-center">
            <span className="text-white font-bold text-sm tracking-tight">K</span>
          </div>
          <span className="text-xl font-bold text-[#1A1F36] tracking-tight">kivora</span>
        </div>

        <div className="bg-white rounded-2xl border border-[#EBEBEB] shadow-lg p-8">

          {/* Heading */}
          <div className="mb-7 text-center">
            <h1 className="text-[22px] font-bold text-[#1A1F36] leading-snug mb-2">
              {t('modules.heading', lang)}
            </h1>
            <p className="text-sm text-[#64748B]">
              {t('modules.subHeading', lang)}
            </p>
          </div>

          {/* Purpose chips */}
          <div className="mb-6">
            <p className="text-xs font-semibold text-[#475569] mb-3 uppercase tracking-wide">
              {t('modules.purpose.title', lang)}
            </p>
            <div className="flex flex-wrap gap-2">
              {purposes.map(({ key, label }) => {
                const active = selectedPurposes.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => togglePurpose(key)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-[#6F5AE8] border-[#6F5AE8] text-white'
                        : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#6F5AE8] hover:text-[#6F5AE8]'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#F0F0F0] mb-5" />

          {/* Module grid */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-[#475569] uppercase tracking-wide">
                {lang === 'et' ? 'Vali moodulid' : 'Select modules'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={selectAll}
                  className="text-xs text-[#6F5AE8] font-medium hover:underline"
                >
                  {t('modules.selectAll', lang)}
                </button>
                <span className="text-[#D1D5DB]">·</span>
                <button
                  onClick={clearOptional}
                  className="text-xs text-[#94A3B8] font-medium hover:underline"
                >
                  {t('modules.clearOptional', lang)}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {MODULE_META.map(({ id, icon, accentColor, accentBg }) => {
                const enabled = enabledModules.has(id)
                return (
                  <button
                    key={id}
                    onClick={() => toggleModule(id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      enabled
                        ? 'border-[#6F5AE8] bg-[#EDE9FB]'
                        : 'border-[#E8ECF0] bg-white hover:border-[#C4B8F8]'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: enabled ? accentBg : '#F8F9FB',
                        color: enabled ? accentColor : '#94A3B8',
                      }}
                    >
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold leading-tight ${enabled ? 'text-[#1A1F36]' : 'text-[#64748B]'}`}>
                        {t(('modules.name.' + id) as Parameters<typeof t>[0], lang)}
                      </p>
                      <p className="text-[11px] text-[#94A3B8] leading-tight mt-0.5 line-clamp-1">
                        {t(('modules.desc.' + id) as Parameters<typeof t>[0], lang)}
                      </p>
                    </div>
                    {/* Checkmark */}
                    <div
                      className={`ml-auto w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        enabled ? 'border-[#6F5AE8] bg-[#6F5AE8]' : 'border-[#D1D5DB]'
                      }`}
                    >
                      {enabled && (
                        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                          <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 text-center mb-3">{error}</p>
          )}

          {/* Continue button */}
          <button
            onClick={handleContinue}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5D4AD0] disabled:opacity-60 transition-colors"
          >
            {saving
              ? (lang === 'et' ? 'Salvestamine...' : 'Saving...')
              : t('modules.continue', lang)}
          </button>

          {/* Hint */}
          <p className="text-xs text-[#94A3B8] text-center mt-4">
            {t('modules.hint', lang)}
          </p>
        </div>
      </div>
    </div>
  )
}
