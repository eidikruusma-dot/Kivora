/**
 * modulesStore.ts
 *
 * Firestore-backed store for per-user module (feature) visibility.
 * Stored at users/{uid}/settings/modules.
 *
 * Pattern matches all other Kivora stores:
 *   - singleton state + pub/sub (no React state leak between users)
 *   - React hook for components: useModules()
 *   - initModulesStore(uid) called from AuthContext on auth change
 *   - ensureModulesInitialized(uid, creationTime) called once to bootstrap
 */

import { subscribeSettings, saveSettings } from '@/lib/settingsStore'
import { useState, useEffect } from 'react'

// ── Types ────────────────────────────────────────────────────────────────────

export type ModuleId =
  | 'calendar'
  | 'tasks'
  | 'notes'
  | 'habits'
  | 'goals'
  | 'finance'
  | 'plans'
  | 'school'
  | 'assistant'

export const ALL_MODULE_IDS: ModuleId[] = [
  'calendar', 'tasks', 'notes', 'habits', 'goals', 'finance', 'plans', 'school', 'assistant',
]

export interface ModuleSettings {
  calendar: boolean
  tasks: boolean
  notes: boolean
  habits: boolean
  goals: boolean
  finance: boolean
  plans: boolean
  school: boolean
  assistant: boolean
  onboardingComplete: boolean
}

/** Default: all modules on + onboarding already done (safe for existing users). */
export const DEFAULT_MODULE_SETTINGS: ModuleSettings = {
  calendar: true,
  tasks: true,
  notes: true,
  habits: true,
  goals: true,
  finance: true,
  plans: true,
  school: true,
  assistant: true,
  onboardingComplete: true,
}

const DOC_ID = 'modules'

/**
 * Defaults used when the Firestore doc does NOT exist yet.
 * onboardingComplete: false — absence of the doc means the user needs onboarding.
 * All modules default to true so the user starts with everything available.
 */
const NO_DOC_DEFAULTS: ModuleSettings = {
  ...DEFAULT_MODULE_SETTINGS,
  onboardingComplete: false,
}

// ── Singleton store ──────────────────────────────────────────────────────────

type Listener = (s: ModuleSettings) => void

let _settings: ModuleSettings = { ...DEFAULT_MODULE_SETTINGS }
let _loading = true
let _unsub: (() => void) | null = null
const _listeners = new Set<Listener>()

function notify() {
  _listeners.forEach(l => l(_settings))
}

/** Called from AuthContext.onAuthStateChanged — sets up / tears down the listener. */
export function initModulesStore(uid: string | null): void {
  _unsub?.()
  _unsub = null

  if (!uid) {
    _settings = { ...DEFAULT_MODULE_SETTINGS }
    _loading = false
    notify()
    return
  }

  _loading = true
  _unsub = subscribeSettings<ModuleSettings>(uid, DOC_ID, NO_DOC_DEFAULTS, (data) => {
    _settings = data
    _loading = false
    notify()
  })
}

export function subscribeToModules(listener: Listener): () => void {
  _listeners.add(listener)
  listener(_settings)
  return () => { _listeners.delete(listener) }
}

export function getModuleSettings(): ModuleSettings {
  return _settings
}

/**
 * Optimistic in-memory update — immediately applies settings and notifies all
 * subscribers without waiting for a Firestore round-trip.
 * Call this before saveModuleSettings() so the UI responds instantly.
 */
export function setModuleSettingsState(settings: ModuleSettings): void {
  _settings = settings
  notify()
}

export function isModulesLoading(): boolean {
  return _loading
}

// ── Persistence ──────────────────────────────────────────────────────────────

export async function saveModuleSettings(uid: string, settings: ModuleSettings): Promise<void> {
  await saveSettings(uid, DOC_ID, settings)
}

/**
 * No longer called — kept for any callers that may reference it externally.
 * The source of truth is now simply the presence of the Firestore doc:
 *   doc absent  → onboardingComplete: false (NO_DOC_DEFAULTS)
 *   doc present → use its stored values
 * ModuleSelectionPage creates the doc with onboardingComplete: true on Continue.
 * @deprecated Call site removed from AuthContext.
 */
export async function ensureModulesInitialized(
  _uid: string,
  _creationTime: string,
): Promise<void> {
  // no-op
}

// ── React hook ───────────────────────────────────────────────────────────────

interface ModulesState {
  settings: ModuleSettings
  loading: boolean
}

export function useModules(): ModulesState {
  const [state, setState] = useState<ModulesState>({
    settings: _settings,
    loading: _loading,
  })

  useEffect(() => {
    let loadingTimer: ReturnType<typeof setTimeout> | null = null

    function handleUpdate(s: ModuleSettings) {
      if (loadingTimer) clearTimeout(loadingTimer)
      // Use the actual store loading flag — not a hardcoded false.
      // subscribeToModules calls this immediately (before Firestore responds),
      // so we must respect _loading here: if still true the UI should keep
      // showing the loading screen rather than briefly rendering with stale
      // DEFAULT_MODULE_SETTINGS (onboardingComplete: true).
      setState({ settings: s, loading: _loading })
    }

    const unsub = subscribeToModules(handleUpdate)

    // Safety fallback: if Firestore hasn't responded after 3 s (network issue),
    // unblock the UI with whatever settings are available.
    if (_loading) {
      loadingTimer = setTimeout(() => {
        setState({ settings: _settings, loading: false })
      }, 3000)
    }

    return () => {
      unsub()
      if (loadingTimer) clearTimeout(loadingTimer)
    }
  }, [])

  return state
}
