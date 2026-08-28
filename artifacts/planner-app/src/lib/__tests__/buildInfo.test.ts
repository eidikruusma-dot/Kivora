// @vitest-environment jsdom
/**
 * Temporary build/version marker (see buildInfo.ts) — verifies the
 * fallback behavior when the build-time define isn't present (this test
 * run, like any non-`vite build` environment) and that vite.config.ts
 * derives the commit hash from git at build time rather than hardcoding
 * it. Safe to delete alongside buildInfo.ts.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('buildInfo: falls back safely when no build-time commit was injected', () => {
  it('BUILD_COMMIT is "unknown" and window.__KIVORA_BUILD__ mirrors it', async () => {
    const { BUILD_COMMIT } = await import('@/lib/buildInfo')
    expect(BUILD_COMMIT).toBe('unknown')
    expect((window as typeof window & { __KIVORA_BUILD__?: string }).__KIVORA_BUILD__).toBe('unknown')
  })
})

const VITE_CONFIG_SRC = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

describe('vite.config.ts: the commit hash is derived from git at build time, never hardcoded', () => {
  it('resolves the commit via `git rev-parse --short HEAD` with a safe fallback', () => {
    expect(VITE_CONFIG_SRC).toMatch(/execSync\('git rev-parse --short HEAD'/)
    expect(VITE_CONFIG_SRC).toMatch(/catch \{\s*\n\s*return 'unknown'/)
  })

  it('injects it as import.meta.env.VITE_GIT_COMMIT via define, not a literal commit string', () => {
    expect(VITE_CONFIG_SRC).toMatch(/'import\.meta\.env\.VITE_GIT_COMMIT': JSON\.stringify\(gitCommit\)/)
    // No hardcoded 7/40-char hex hash anywhere in the config.
    expect(VITE_CONFIG_SRC).not.toMatch(/VITE_GIT_COMMIT['"]?\s*:\s*['"][0-9a-f]{7,40}['"]/)
  })
})
