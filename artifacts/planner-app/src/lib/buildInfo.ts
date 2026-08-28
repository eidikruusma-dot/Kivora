/**
 * buildInfo.ts
 *
 * Temporary build/version marker — lets us verify exactly which commit a
 * given deployment (e.g. kivora.ee) is actually serving, without changing
 * any app behavior. The commit hash is injected at build time by
 * vite.config.ts (via `git rev-parse --short HEAD`, run once when the
 * config loads) — never hardcoded here.
 *
 * Falls back to 'unknown' when the define wasn't applied (e.g. a test
 * environment that doesn't run vite.config.ts's build step) or the build
 * machine had no git history available.
 *
 * Safe to remove later: delete this file, its two call sites (main.tsx and
 * RakendusePage.tsx), the `define` block in vite.config.ts, and the
 * appInfo.app.build translation keys.
 */

export const BUILD_COMMIT: string = import.meta.env.VITE_GIT_COMMIT ?? 'unknown'

// Exposed as a plain global so it can be read from the browser console on
// any page, without navigating to Settings → App.
if (typeof window !== 'undefined') {
  ;(window as typeof window & { __KIVORA_BUILD__?: string }).__KIVORA_BUILD__ = BUILD_COMMIT
}
