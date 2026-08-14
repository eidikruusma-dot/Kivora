/**
 * themeColors.ts
 *
 * Shared utilities for components that use inline-style colors that cannot be
 * overridden by CSS (e.g. status badge maps, SVG stroke attributes).
 *
 * Usage:
 *   const isDark = useIsDark()
 *   style={{ backgroundColor: isDark ? darkBg(lightHex) : lightHex }}
 */

import { useState, useEffect } from 'react'
import { subscribeToAppearance, getLocalAppearance, resolveEffectiveTheme } from './appearanceStore'

// ── Hook ──────────────────────────────────────────────────────────────────────

/** Returns true when the active theme is dark. Re-renders when the user toggles. */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(() =>
    resolveEffectiveTheme(getLocalAppearance().themeMode) === 'dark'
  )
  useEffect(() => {
    return subscribeToAppearance((s) => {
      setIsDark(resolveEffectiveTheme(s.themeMode) === 'dark')
    })
  }, [])
  return isDark
}

// ── Light → Dark background color map ─────────────────────────────────────────
// Light pastel / off-white backgrounds used in inline styles → dark equivalents.

const DARK_BG_MAP: Record<string, string> = {
  // success (green)
  '#DCFCE7': '#0D2418',
  '#D1FAE5': '#0A2016',
  '#F0FDF4': '#0A1F14',
  '#BBF7D0': '#0D2418',
  // warning (yellow / amber)
  '#FEF9C3': '#1F1507',
  '#FEF3C7': '#1F1507',
  '#FDE68A': '#231A06',
  '#FEF08A': '#231A06',
  // danger (red / rose)
  '#FEE2E2': '#200A0A',
  '#FEF2F2': '#200A0A',
  '#FFF5F5': '#200A0A',
  '#FFF1F2': '#200A0A',
  '#FECACA': '#3D1010',
  '#FDA4AF': '#3A0D15',
  // info / sky (blue)
  '#DBEAFE': '#0A1628',
  '#EFF6FF': '#0A1628',
  '#E0E7FF': '#0D1530',
  '#E0F2FE': '#071824',
  '#F0F9FF': '#071420',
  // teal
  '#CCFBF1': '#041E1A',
  // purple / violet
  '#EDE9FB': '#1E1B2E',
  '#F4F2FF': '#1E1B2E',
  '#FDF4FF': '#1A1228',
  '#F3E8FF': '#1A1228',
  '#E0DCFF': '#1E1B2E',
  // pink
  '#FCE7F3': '#200A1A',
  // orange
  '#FFEDD5': '#1F1007',
  // neutral
  '#F1F5F9': '#1A2332',
  '#F1F0F8': '#1A2030',
  '#F1F0EB': '#1A2030',
}

// ── Light → Dark text/icon color map ──────────────────────────────────────────
// Light-mode saturated text colors used for status badge text → dark equivalents.

const DARK_TEXT_MAP: Record<string, string> = {
  '#16A34A': '#4ADE80',
  '#15803D': '#22C55E',
  '#059669': '#34D399',
  '#0D9488': '#2DD4BF',
  '#0EA5E9': '#38BDF8',
  '#CA8A04': '#FCD34D',
  '#D97706': '#FBBF24',
  '#854D0E': '#FCD34D',
  '#EA580C': '#FB923C',
  '#DC2626': '#F87171',
  '#B91C1C': '#FCA5A5',
  '#E11D48': '#FB7185',
  '#DB2777': '#F472B6',
  '#2563EB': '#60A5FA',
  '#0284C7': '#38BDF8',
  '#4F46E5': '#818CF8',
  '#7C3AED': '#A78BFA',
  '#9333EA': '#C084FC',
  '#64748B': '#8B9EB5',
  '#94A3B8': '#5A7085',
}

/**
 * Returns the dark-mode equivalent of a light background hex.
 * Falls back to a neutral card surface (#1A2332) for unmapped values.
 */
export function darkBg(lightHex: string): string {
  return DARK_BG_MAP[lightHex] ?? '#1A2332'
}

/**
 * Returns the dark-mode equivalent of a light text/icon hex.
 * Falls back to the original (most saturated colors already work on dark bg).
 */
export function darkText(lightHex: string): string {
  return DARK_TEXT_MAP[lightHex] ?? lightHex
}

/** Convenience: pick between a light and dark value. */
export function tc(light: string, dark: string, isDark: boolean): string {
  return isDark ? dark : light
}
