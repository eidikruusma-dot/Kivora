import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AppearanceSettings, PrimaryColor, ThemeMode, CardRadius, Density } from '@/types'

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  themeMode: 'light',
  primaryColor: 'purple',
  cardRadius: 'rounded',
  density: 'comfortable',
}

const STORAGE_KEY = 'kivora:appearance'

export const PRIMARY_COLORS: Record<PrimaryColor, { label: string; value: string; preview: string }> = {
  purple: { label: 'Lilla', value: '#6F5AE8', preview: '#6F5AE8' },
  blue: { label: 'Sinine', value: '#3B82F6', preview: '#3B82F6' },
  green: { label: 'Roheline', value: '#10B981', preview: '#10B981' },
  rose: { label: 'Roosa', value: '#F43F5E', preview: '#F43F5E' },
  amber: { label: 'Merevaigukollane', value: '#F59E0B', preview: '#F59E0B' },
}

export const THEME_MODES: { value: ThemeMode; label: string; icon: string }[] = [
  { value: 'light', label: 'Hele', icon: 'sun' },
  { value: 'dark', label: 'Tume', icon: 'moon' },
  { value: 'system', label: 'Süsteemi järgi', icon: 'monitor' },
]

export const CARD_RADII: Record<CardRadius, { label: string; value: string }> = {
  sharp: { label: 'Tugev ümar', value: '0.375rem' },
  rounded: { label: 'Ümar', value: '0.75rem' },
  smooth: { label: 'Pehme', value: '1.25rem' },
}

export const DENSITIES: Record<Density, { label: string; description: string }> = {
  comfortable: { label: 'Tavaline', description: 'Rohkem ruumi ja õhku elementide vahel' },
  compact: { label: 'Kompaktne', description: 'Vähem ruumi, rohkem infot ühe vaate kohta' },
}

function readLocal(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppearanceSettings>
      return { ...DEFAULT_APPEARANCE, ...parsed }
    }
  } catch {
    // ignore
  }
  return DEFAULT_APPEARANCE
}

function writeLocal(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

function resolveEffectiveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return mode
}

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement
  const effective = resolveEffectiveTheme(settings.themeMode)

  // Theme mode
  root.setAttribute('data-theme', effective)
  root.style.colorScheme = effective

  // Primary color tokens
  const primary = PRIMARY_COLORS[settings.primaryColor].value
  root.style.setProperty('--kv-primary', primary)
  root.style.setProperty('--kv-primary-hover', shadeColor(primary, -12))
  root.style.setProperty('--kv-primary-soft', hexToRgba(primary, 0.12))
  root.style.setProperty('--kv-primary-border', hexToRgba(primary, 0.28))

  // Card radius
  root.style.setProperty('--kv-radius-card', CARD_RADII[settings.cardRadius].value)

  // Density
  root.style.setProperty('--kv-density-pad', settings.density === 'compact' ? '0.875rem' : '1.25rem')
  root.style.setProperty('--kv-density-gap', settings.density === 'compact' ? '0.5rem' : '0.75rem')

  writeLocal(settings)
}

// Apply on load so the app reflects saved preferences immediately
if (typeof window !== 'undefined') {
  applyAppearance(readLocal())
}

export async function getAppearanceSettings(uid: string): Promise<AppearanceSettings> {
  const local = readLocal()
  try {
    const ref = doc(db, 'users', uid)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const data = snap.data()
      const appearance = data.appearance as Partial<AppearanceSettings> | undefined
      if (appearance) {
        return { ...DEFAULT_APPEARANCE, ...appearance }
      }
    }
  } catch {
    // fall back to local
  }
  return local
}

export async function saveAppearanceSettings(uid: string, settings: AppearanceSettings): Promise<void> {
  writeLocal(settings)
  applyAppearance(settings)
  try {
    const ref = doc(db, 'users', uid)
    await updateDoc(ref, {
      appearance: settings,
      updatedAt: serverTimestamp(),
    })
  } catch {
    // local-only fallback is fine
  }
}

// --- color helpers ---

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function shadeColor(hex: string, percent: number): string {
  const h = hex.replace('#', '')
  let r = parseInt(h.substring(0, 2), 16)
  let g = parseInt(h.substring(2, 4), 16)
  let b = parseInt(h.substring(4, 6), 16)
  r = Math.max(0, Math.min(255, Math.round((r * (100 + percent)) / 100)))
  g = Math.max(0, Math.min(255, Math.round((g * (100 + percent)) / 100)))
  b = Math.max(0, Math.min(255, Math.round((b * (100 + percent)) / 100)))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}
