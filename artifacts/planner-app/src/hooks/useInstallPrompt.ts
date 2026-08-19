/**
 * useInstallPrompt.ts
 *
 * Reads from the global installPromptStore (populated in main.tsx before React
 * renders) via useSyncExternalStore so it stays in sync without effects or
 * timers. InstallState is determined synchronously — no "checking" phase.
 */
import { useSyncExternalStore, useCallback } from 'react'
import { installPromptStore } from '@/lib/installPromptStore'

export type InstallState =
  | 'installed'   // running in standalone mode or appinstalled event fired
  | 'promptable'  // deferred prompt available → native dialog ready
  | 'ios'         // iOS Safari — no prompt API; show Share instructions
  | 'pending'     // Chrome/Edge/Android but prompt not yet captured

// ── Synchronous helpers ───────────────────────────────────────────────────────

function checkStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function checkIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as { MSStream?: unknown }).MSStream
  )
}

// ── Store snapshot — called on every render & subscription notification ───────

function getSnapshot(): InstallState {
  if (installPromptStore.installed || checkStandalone()) return 'installed'
  if (installPromptStore.prompt) return 'promptable'
  if (checkIOS()) return 'ios'
  return 'pending'
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export type PromptOutcome = 'accepted' | 'dismissed' | 'not-ready'

interface UseInstallPromptReturn {
  state: InstallState
  triggerPrompt: () => Promise<PromptOutcome>
}

export function useInstallPrompt(): UseInstallPromptReturn {
  // useSyncExternalStore: subscribes to the store and re-renders whenever
  // setPrompt / clearPrompt / setInstalled are called.
  const state = useSyncExternalStore(
    installPromptStore.subscribe,
    getSnapshot,
    getSnapshot,
  )

  const triggerPrompt = useCallback(async (): Promise<PromptOutcome> => {
    const p = installPromptStore.prompt
    if (!p) return 'not-ready'
    await p.prompt()
    const { outcome } = await p.userChoice
    installPromptStore.clearPrompt()
    if (outcome === 'accepted') installPromptStore.setInstalled()
    return outcome
  }, [])

  return { state, triggerPrompt }
}
