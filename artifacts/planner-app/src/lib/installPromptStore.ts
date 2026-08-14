/**
 * installPromptStore.ts
 *
 * Global singleton that captures the beforeinstallprompt event BEFORE React
 * renders (the listener is registered in main.tsx). This prevents the race
 * condition where Android Chrome fires the event before useEffect runs.
 *
 * Implements a minimal pub/sub so React can subscribe via useSyncExternalStore.
 */

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt(): Promise<void>
}

type Listener = () => void

let _prompt: BeforeInstallPromptEvent | null = null
let _installed = false
const _listeners = new Set<Listener>()

function notify() {
  _listeners.forEach((fn) => fn())
}

export const installPromptStore = {
  /** The captured deferred install prompt, or null if not yet available. */
  get prompt(): BeforeInstallPromptEvent | null {
    return _prompt
  },

  /** True once the app has been installed (appinstalled event or standalone). */
  get installed(): boolean {
    return _installed
  },

  /** Called from main.tsx when beforeinstallprompt fires. */
  setPrompt(e: BeforeInstallPromptEvent): void {
    _prompt = e
    notify()
  },

  /** Called after the prompt has been used (accepted or dismissed). */
  clearPrompt(): void {
    _prompt = null
    notify()
  },

  /** Called when the app is installed. */
  setInstalled(): void {
    _installed = true
    _prompt = null
    notify()
  },

  /**
   * Subscribe to store changes. Returns an unsubscribe function.
   * Compatible with React's useSyncExternalStore.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },
}
