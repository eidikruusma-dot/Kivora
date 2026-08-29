/**
 * PublicHeader.tsx's #features/#how-it-works/#about nav links were plain
 * `<a href="#features">` anchors. Since PublicHeader is also rendered on
 * /privacy, /terms, and /contact (pages with no matching element ids),
 * clicking those links there did nothing — they only worked while already
 * on the landing page ('/').
 *
 * Fix: reuse the existing useLocation() call already in this component (no
 * new router/location system) to compute the href — bare `#anchor` on '/',
 * `/#anchor` everywhere else, so the link navigates to the landing page and
 * the browser's native hash-scroll lands on the target section there.
 *
 * No React rendering harness exists for this component in this repo —
 * verified via structural regex assertions against the raw source, matching
 * the pattern used throughout this session's other Settings/landing tests.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/publicHeaderRouteAwareAnchors.test.ts
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(
  resolve(process.cwd(), 'src/components/layout/PublicHeader.tsx'),
  'utf8',
)

describe('PublicHeader nav anchors are route-aware', () => {
  it('reuses the existing useLocation() call — no new router/location system introduced', () => {
    expect(SRC).toMatch(/import \{ useNavigate, useLocation \} from 'react-router-dom'/)
    const useLocationCalls = SRC.match(/useLocation\(\)/g) ?? []
    expect(useLocationCalls.length).toBe(1)
  })

  it('computes onLanding from location.pathname and a navHref helper that prefixes with "/" off-landing', () => {
    expect(SRC).toMatch(/const onLanding = location\.pathname === '\/'/)
    expect(SRC).toMatch(/function navHref\(anchor: string\): string \{/)
    expect(SRC).toMatch(/return onLanding \? anchor : `\/\$\{anchor\}`/)
  })

  it('both the desktop and mobile nav-link lists use navHref(link.href), not the bare anchor', () => {
    const hrefUsages = SRC.match(/href=\{navHref\(link\.href\)\}/g) ?? []
    expect(hrefUsages.length).toBe(2)
    expect(SRC).not.toMatch(/href=\{link\.href\}/)
  })

  it('the navLinks array itself still stores plain anchors (#features etc.), unchanged', () => {
    const block = SRC.match(/const navLinks = \[[\s\S]*?\n  \]/)?.[0] ?? ''
    expect(block).toMatch(/href: '#features'/)
    expect(block).toMatch(/href: '#how-it-works'/)
    expect(block).toMatch(/href: '#about'/)
  })
})

describe('unrelated PublicHeader behavior is untouched', () => {
  it('the logo click handler, install button, and login/register buttons are unchanged', () => {
    expect(SRC).toMatch(/function handleLogoClick\(\)/)
    expect(SRC).toMatch(/<InstallButton lang=\{lang\} \/>/)
    expect(SRC).toMatch(/onClick=\{\(\) => navigate\('\/login'\)\}/)
    expect(SRC).toMatch(/onClick=\{\(\) => navigate\('\/register'\)\}/)
  })

  it('the mobile hamburger toggle and menu-close-on-click wiring are unchanged', () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setMobileOpen\(!mobileOpen\)\}/)
    expect(SRC).toMatch(/onClick=\{\(\) => setMobileOpen\(false\)\}/)
  })
})
