/**
 * Regression tests for the Kivora brand-symbol consistency fix.
 *
 * Prior defects (found by a read-only brand audit):
 *   - ModuleSelectionPage.tsx rendered a fake placeholder mark (a purple
 *     square with a hardcoded white "K") instead of the official symbol.
 *   - Eight call sites (PublicHeader, PublicFooter, AuthShell,
 *     AbiJaTugiPage, InstallButton ×3, Sidebar) each hand-rolled their own
 *     <img src="/kivora-logo.png"|"/kivora-symbol.png"> instead of reusing
 *     the existing KivoraLogo component, which was imported nowhere.
 *   - Sidebar.tsx set the "Kivora" wordmark color via an inline
 *     style={{ color: '#1A1F36' }}, which the app's global dark-mode CSS
 *     (class-selector based) cannot override — making the wordmark
 *     illegible against the sidebar's dark-mode background.
 *
 * Fix: every call site now renders <KivoraLogo /> (or <KivoraLogo
 * symbolOnly />) from src/components/brand/KivoraLogo.tsx, which wraps the
 * same official /kivora-logo.png and /kivora-symbol.png assets — no new
 * artwork was introduced. Sidebar keeps "Kivora" as separate text but via
 * the theme-aware `text-[#1A1F36]` Tailwind class (covered by the global
 * dark-mode override in index.css) instead of an inline color.
 *
 * No React rendering harness exists in this repo, so this is verified
 * structurally against the component/page source, consistent with every
 * other regression test here.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/kivoraBrandSymbolConsistency.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const MODULE_SELECTION_SRC = readSrc('src/views/onboarding/ModuleSelectionPage.tsx')
const SIDEBAR_SRC = readSrc('src/components/layout/Sidebar.tsx')
const PUBLIC_HEADER_SRC = readSrc('src/components/layout/PublicHeader.tsx')
const PUBLIC_FOOTER_SRC = readSrc('src/components/layout/PublicFooter.tsx')
const AUTH_SHELL_SRC = readSrc('src/components/auth/AuthShell.tsx')
const HELP_PAGE_SRC = readSrc('src/views/settings/AbiJaTugiPage.tsx')
const INSTALL_BUTTON_SRC = readSrc('src/components/landing/InstallButton.tsx')
const KIVORA_LOGO_SRC = readSrc('src/components/brand/KivoraLogo.tsx')

const MANIFEST_SRC = readSrc('public/manifest.json')
const INDEX_HTML_SRC = readSrc('index.html')

describe('ModuleSelectionPage no longer renders the fake "K" placeholder logo', () => {
  it('the hardcoded purple square + white "K" letter is gone', () => {
    expect(MODULE_SELECTION_SRC).not.toMatch(/bg-\[#6F5AE8\] flex items-center justify-center/)
    expect(MODULE_SELECTION_SRC).not.toMatch(/>K<\/span>/)
  })

  it('renders the official KivoraLogo component instead', () => {
    expect(MODULE_SELECTION_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    expect(MODULE_SELECTION_SRC).toMatch(/<KivoraLogo height=\{36\} \/>/)
  })

  it('the onboarding purpose-selection behavior is untouched', () => {
    expect(MODULE_SELECTION_SRC).toMatch(/saveModuleSettings/)
    expect(MODULE_SELECTION_SRC).toMatch(/togglePurpose/)
  })
})

describe('PublicHeader, PublicFooter, AuthShell, AbiJaTugiPage, and InstallButton all use KivoraLogo', () => {
  it('PublicHeader imports and renders KivoraLogo, no raw <img> logo remains', () => {
    expect(PUBLIC_HEADER_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    expect(PUBLIC_HEADER_SRC).toMatch(/<KivoraLogo height=\{28\} \/>/)
    expect(PUBLIC_HEADER_SRC).not.toMatch(/src="\/kivora-(logo|symbol)\.png"/)
  })

  it('PublicFooter imports and renders KivoraLogo, no raw <img> logo remains', () => {
    expect(PUBLIC_FOOTER_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    expect(PUBLIC_FOOTER_SRC).toMatch(/<KivoraLogo height=\{24\} \/>/)
    expect(PUBLIC_FOOTER_SRC).not.toMatch(/src="\/kivora-(logo|symbol)\.png"/)
  })

  it('AuthShell (Login/Register/Forgot/Reset/Verify-email) imports and renders KivoraLogo', () => {
    expect(AUTH_SHELL_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    expect(AUTH_SHELL_SRC).toMatch(/<KivoraLogo height=\{28\} \/>/)
    expect(AUTH_SHELL_SRC).not.toMatch(/src="\/kivora-(logo|symbol)\.png"/)
  })

  it('AbiJaTugiPage (Help & Support) imports and renders KivoraLogo', () => {
    expect(HELP_PAGE_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    expect(HELP_PAGE_SRC).toMatch(/<KivoraLogo height=\{28\} \/>/)
    expect(HELP_PAGE_SRC).not.toMatch(/src="\/kivora-(logo|symbol)\.png"/)
  })

  it('all three InstallButton modal occurrences use KivoraLogo symbolOnly, no raw <img> logo remains', () => {
    expect(INSTALL_BUTTON_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    const occurrences = (INSTALL_BUTTON_SRC.match(/<KivoraLogo symbolOnly height=\{28\} \/>/g) ?? []).length
    expect(occurrences).toBe(3)
    expect(INSTALL_BUTTON_SRC).not.toMatch(/src="\/kivora-(logo|symbol)\.png"/)
  })
})

describe('Sidebar uses the official symbol and theme-aware separate wordmark text', () => {
  it('imports and renders KivoraLogo with symbolOnly for the mark', () => {
    expect(SIDEBAR_SRC).toMatch(/import KivoraLogo from '@\/components\/brand\/KivoraLogo'/)
    expect(SIDEBAR_SRC).toMatch(/<KivoraLogo symbolOnly height=\{40\} \/>/)
    expect(SIDEBAR_SRC).not.toMatch(/src="\/kivora-(logo|symbol)\.png"/)
  })

  it('"Kivora" remains separate visible text, not baked into a flattened logo image', () => {
    expect(SIDEBAR_SRC).toMatch(/>\s*Kivora\s*<\/span>/)
  })

  it('the wordmark color is no longer a hardcoded inline style — it uses the theme-aware Tailwind class', () => {
    expect(SIDEBAR_SRC).not.toMatch(/color:\s*'#1A1F36'/)
    expect(SIDEBAR_SRC).not.toMatch(/color:\s*"#1A1F36"/)
    const logoBlock = SIDEBAR_SRC.match(/<KivoraLogo symbolOnly height=\{40\} \/>[\s\S]*?<\/span>\s*\n\s*<\/span>/)?.[0] ?? ''
    expect(logoBlock).toMatch(/className="text-\[#1A1F36\]"/)
  })
})

describe('favicon, manifest, and PWA icon configuration are unchanged', () => {
  it('index.html favicon and apple-touch-icon links are untouched', () => {
    expect(INDEX_HTML_SRC).toMatch(/<link rel="icon" type="image\/x-icon" href="\.\/favicon\.ico" \/>/)
    expect(INDEX_HTML_SRC).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg" \/>/)
    expect(INDEX_HTML_SRC).toMatch(/<link rel="manifest" href="\/manifest\.json" crossorigin="use-credentials" \/>/)
    expect(INDEX_HTML_SRC).toMatch(/<link rel="apple-touch-icon" sizes="180x180" href="\.\/apple-touch-icon\.png" \/>/)
  })

  it('manifest.json icon list is untouched (all six entries, same sizes/paths/purposes)', () => {
    const manifest = JSON.parse(MANIFEST_SRC)
    expect(manifest.icons).toEqual([
      { src: './favicon.ico', sizes: '16x16 32x32', type: 'image/x-icon' },
      { src: './apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
      { src: './icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: './icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: './icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })
})

describe('the KivoraLogo component itself is untouched by this task (only its consumers changed)', () => {
  it('still wraps the same two official asset paths, no new SVG or artwork introduced', () => {
    expect(KIVORA_LOGO_SRC).toMatch(/src="\/kivora-symbol\.png"/)
    expect(KIVORA_LOGO_SRC).toMatch(/src="\/kivora-logo\.png"/)
    expect(KIVORA_LOGO_SRC).not.toMatch(/<svg/)
  })
})
