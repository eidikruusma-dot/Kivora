// @vitest-environment jsdom
/**
 * Smallest-safe PWA-install hardening (see the inspection this fix is based
 * on): the goal is that a website-installed Kivora guides Android users
 * toward a REAL standalone PWA install ("Install app" / "Paigalda
 * rakendus"), not a plain "Add to Home Screen" browser bookmark that still
 * shows kivora.ee browser chrome.
 *
 * Two small, independent changes, both covered here:
 *   1. public/manifest.json gains a stable "id": "/app" (consistent with
 *      the existing start_url "./app" -> "/app"), with display, start_url,
 *      scope, icons, and theme/background colors all unchanged.
 *   2. The Android "pending" fallback copy (InstallButton.tsx's
 *      NotReadyDialog, translations.ts's pub.install.notready.body) no
 *      longer presents "Add to Home Screen" as an equivalent alternative to
 *      "Install app" — it points specifically at the real install action.
 *      The iOS Add-to-Home-Screen instructions (pub.install.ios.*) are the
 *      correct iOS install flow and are untouched.
 *
 * beforeinstallprompt handling (installPromptStore.ts / useInstallPrompt.ts)
 * and the already-installed "Open Kivora" -> /app behavior are unchanged;
 * this file also pins down that those two behaviors still work, so a future
 * copy/manifest edit can't silently regress them.
 *
 * No React rendering harness exists for InstallButton.tsx's iOS/Android
 * dialog copy in this repo — verified structurally against source, the
 * same established pattern as kivoraBrandSymbolConsistency.test.ts. The
 * promptable/installed behavioral claims ARE exercised via a real render
 * (InstallButton has no Firestore/router dependency, so no mocking is
 * needed beyond a MemoryRouter for its internal useNavigate).
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/pwaInstallHardening.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InstallButton from '@/components/landing/InstallButton'
import { installPromptStore, type BeforeInstallPromptEvent } from '@/lib/installPromptStore'

function readSrc(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), 'utf8')
}

const MANIFEST_SRC = readSrc('public/manifest.json')
const INSTALL_BUTTON_SRC = readSrc('src/components/landing/InstallButton.tsx')
const TRANSLATIONS_SRC = readSrc('src/lib/translations.ts')

describe('manifest.json: stable id added, everything else that must not change is unchanged', () => {
  const manifest = JSON.parse(MANIFEST_SRC)

  it('has a stable id consistent with the existing /app start_url', () => {
    expect(manifest.id).toBe('/app')
  })

  it('still declares standalone display', () => {
    expect(manifest.display).toBe('standalone')
  })

  it('start_url and scope are unchanged', () => {
    expect(manifest.start_url).toBe('./app')
    expect(manifest.scope).toBe('./')
  })

  it('theme_color and background_color are unchanged', () => {
    expect(manifest.theme_color).toBe('#6D4CFF')
    expect(manifest.background_color).toBe('#F4F3EF')
  })

  it('still has a 192px and a 512px icon (both "any" and "maskable")', () => {
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    expect(manifest.icons).toHaveLength(6)
  })
})

describe('Android pending/fallback copy no longer presents "Add to Home Screen" as install-equivalent', () => {
  it('Estonian notready.body points specifically at "Paigalda rakendus", not "Lisa avakuvale"', () => {
    const match = TRANSLATIONS_SRC.match(/"pub\.install\.notready\.body":\s*"([^"]*(?:\\.[^"]*)*)"/)
    expect(match).not.toBeNull()
    const body = match![1]
    expect(body).toMatch(/Paigalda rakendus/)
    expect(body).not.toMatch(/Lisa avakuvale/)
  })

  it('English notready.body points specifically at "Install app", not "Add to Home Screen"', () => {
    const matches = [...TRANSLATIONS_SRC.matchAll(/"pub\.install\.notready\.body":\s*"([^"]*(?:\\.[^"]*)*)"/g)]
    // First match is the Estonian entry (checked above); the second is English.
    expect(matches).toHaveLength(2)
    const body = matches[1][1]
    expect(body).toMatch(/Install app/)
    expect(body).not.toMatch(/Add to Home Screen/)
  })
})

describe('iOS Add-to-Home-Screen instructions are preserved (that IS the correct iOS install flow)', () => {
  it('pub.install.ios.step2 (both languages) still says Add to Home Screen', () => {
    expect(TRANSLATIONS_SRC).toMatch(/"pub\.install\.ios\.step2":\s*'Vali \\u201ELisa avakuvale\\u201D'/)
    expect(TRANSLATIONS_SRC).toMatch(/"pub\.install\.ios\.step2":\s*'Choose \\u201CAdd to Home Screen\\u201D'/)
  })

  it('InstallButton.tsx still shows the IOSDialog (Share -> Add to Home Screen -> Add) for iOS state', () => {
    expect(INSTALL_BUTTON_SRC).toMatch(/if \(state === 'ios'\) \{\s*setDialog\('ios'\)/)
    expect(INSTALL_BUTTON_SRC).toMatch(/text=\{t\('pub\.install\.ios\.step2', lang\)\}/)
  })
})

// ── Behavioral: promptable state still drives the real beforeinstallprompt ──

function makeDeferredPrompt(outcome: 'accepted' | 'dismissed'): BeforeInstallPromptEvent {
  return {
    platforms: ['web'],
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  } as unknown as BeforeInstallPromptEvent
}

function renderInstallButton() {
  return render(
    <MemoryRouter>
      <InstallButton lang="en" />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  // installPromptStore is a module-level singleton with no reset API —
  // drive it back to its initial (no prompt, not installed) shape via its
  // real setters/getters so tests don't leak state into each other.
  if (installPromptStore.prompt) installPromptStore.clearPrompt()

  // jsdom doesn't implement matchMedia — useInstallPrompt's checkStandalone()
  // calls it unconditionally whenever installPromptStore.installed is false,
  // which both the 'promptable' and 'pending' branches hit.
  window.matchMedia = window.matchMedia || (((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia)
})

afterEach(cleanup)

describe('promptable state still calls the real beforeinstallprompt.prompt()', () => {
  it('clicking the button awaits the deferred prompt and reads its userChoice', async () => {
    const deferred = makeDeferredPrompt('accepted')
    installPromptStore.setPrompt(deferred)

    renderInstallButton()
    fireEvent.click(screen.getByRole('button', { name: /Install Kivora/i }))
    // triggerPrompt is async (awaits prompt() and userChoice) — flush microtasks.
    await Promise.resolve()
    await Promise.resolve()

    expect(deferred.prompt).toHaveBeenCalledTimes(1)
  })
})

describe('installed state still opens /app', () => {
  it('shows "Open Kivora" and navigating from it targets /app', () => {
    installPromptStore.setInstalled()
    renderInstallButton()

    const openButton = screen.getByRole('button', { name: /Open Kivora/i })
    expect(openButton).toBeTruthy()
    expect(INSTALL_BUTTON_SRC).toMatch(/onClick=\{\(\) => \{ onAction\?\.\(\); navigate\('\/app'\) \}\}/)
  })
})
