// ── Language store ─────────────────────────────────────────────────────────
// Mirrors the pattern of appearanceStore.ts: module-level pub/sub + localStorage.
// Components subscribe with subscribeToLanguage() and read the current value
// with getLocalLanguage(). KeelPage calls applyLanguage() to update + notify.

export type AppLang = 'et' | 'en'
export type AiLang  = 'same' | 'et' | 'en'

export interface LangSettings {
  appLang: AppLang
  aiLang:  AiLang
}

export const DEFAULT_LANG_SETTINGS: LangSettings = {
  appLang: 'et',
  aiLang:  'same',
}

const STORAGE_KEY = 'kivora:language'

function readLocal(): LangSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_LANG_SETTINGS, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_LANG_SETTINGS
}

function writeLocal(s: LangSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch { /* ignore */ }
}

// ── Pub/sub ────────────────────────────────────────────────────────────────
type LangListener = (settings: LangSettings) => void
const _listeners = new Set<LangListener>()

export function subscribeToLanguage(cb: LangListener): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

// ── Public API ─────────────────────────────────────────────────────────────
export function getLocalLangSettings(): LangSettings {
  return readLocal()
}

export function getLocalLanguage(): AppLang {
  return readLocal().appLang
}

/** Write settings to localStorage and notify all subscribers immediately. */
export function applyLanguage(settings: LangSettings): void {
  writeLocal(settings)
  _listeners.forEach((cb) => cb(settings))
}
