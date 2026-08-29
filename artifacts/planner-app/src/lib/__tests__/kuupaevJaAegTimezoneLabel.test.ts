/**
 * Date & Time settings — the Time Zone dropdown's own <label> ("Ajavöönd")
 * was hardcoded Estonian text, never routed through t(), unlike every
 * other label on this page. An existing key already represented exactly
 * this label — dt.tz.label ("Ajavöönd" / "Time zone") — but was defined
 * and never used anywhere. Fix: the dropdown's label now reads
 * t('dt.tz.label', lang) instead of the literal string.
 *
 * Scope: only that one <label> in KuupaevJaAegPage.tsx changed.
 * translations.ts is untouched (dt.tz.label already existed with correct
 * values in both languages) — everything else on this page (section
 * title/desc, radio labels, the separate Preview panel's dt.preview.tz
 * row, timezone/format logic) is untouched.
 *
 * No React rendering harness exists for settings pages in this repo —
 * verified via structural regex assertions against the raw source,
 * matching the pattern used throughout this session's other tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/kuupaevJaAegTimezoneLabel.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { t } from '@/lib/translations'

const PAGE_SRC = readFileSync(
  resolve(process.cwd(), 'src/views/settings/KuupaevJaAegPage.tsx'),
  'utf8',
)

describe('dt.tz.label translation', () => {
  it('ET resolves to "Ajavöönd"', () => {
    expect(t('dt.tz.label', 'et')).toBe('Ajavöönd')
  })
  it('EN resolves to "Time zone"', () => {
    expect(t('dt.tz.label', 'en')).toBe('Time zone')
  })
})

describe('the Time Zone dropdown label uses the translation key, not a hardcoded literal', () => {
  it('renders via t(\'dt.tz.label\', lang)', () => {
    expect(PAGE_SRC).toMatch(/\{t\('dt\.tz\.label', lang\)\}/)
  })

  it('no longer contains the hardcoded Estonian literal "Ajavöönd" anywhere in the JSX', () => {
    // The only legitimate occurrences of the ET word itself now live in
    // translations.ts (the key's own value) — none should remain as a
    // bare literal inside this component's source.
    expect(PAGE_SRC).not.toMatch(/>\s*Ajavöönd\s*</)
  })

  it('the label sits immediately before the timezone <select>, unchanged structurally', () => {
    const labelIdx = PAGE_SRC.indexOf("{t('dt.tz.label', lang)}")
    const selectIdx = PAGE_SRC.indexOf('<select', labelIdx)
    expect(labelIdx).toBeGreaterThan(-1)
    expect(selectIdx).toBeGreaterThan(labelIdx)
  })
})

describe('scope: the rest of the Time Zone section and the separate Preview panel are untouched', () => {
  it('the section title/description/radio labels still use their existing keys', () => {
    expect(PAGE_SRC).toMatch(/t\('dt\.tz\.title', lang\)/)
    expect(PAGE_SRC).toMatch(/t\('dt\.tz\.desc', lang\)/)
    expect(PAGE_SRC).toMatch(/t\('dt\.tz\.auto', lang\)/)
    expect(PAGE_SRC).toMatch(/t\('dt\.tz\.detected', lang\)/)
    expect(PAGE_SRC).toMatch(/t\('dt\.tz\.manual', lang\)/)
  })

  it('the Preview panel\'s separate timezone row label (dt.preview.tz) is untouched', () => {
    expect(PAGE_SRC).toMatch(/t\('dt\.preview\.tz', lang\)/)
  })

  it('dt.tz.title and dt.preview.tz keep their own distinct, correct values (not affected by this fix)', () => {
    expect(t('dt.tz.title', 'et')).toBe('Ajavöönd')
    expect(t('dt.tz.title', 'en')).toBe('Time zone')
    expect(t('dt.preview.tz', 'et')).toBe('Ajavöönd')
  })
})
