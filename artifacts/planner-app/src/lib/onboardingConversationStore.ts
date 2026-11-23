/**
 * onboardingConversationStore.ts
 *
 * Local-only (no Firestore) persistence for the AI onboarding conversation,
 * so a user who closes the tab mid-chat can resume on the same device. By
 * design, the raw conversation transcript is NEVER written to Firestore —
 * only the user's own browser storage, and only this one device/browser —
 * see the Kivora 2.0 onboarding plan's explicit requirement that
 * conversation content is never persisted server-side without separate,
 * explicit consent (which this feature does not currently ask for; cross-
 * device resume is consequently not supported — see OnboardingChatPage.tsx).
 *
 * Three safeguards this module exists to guarantee:
 *   1. Per-user isolation: the storage key includes the signed-in uid, so a
 *      second person signing into a different Kivora account in the same
 *      browser can never see the first person's onboarding conversation.
 *   2. Expiry: a saved conversation older than CONVERSATION_MAX_AGE_MS is
 *      treated as gone and is actively removed the next time anything in
 *      this module touches localStorage — it never resurfaces stale
 *      personal context.
 *   3. User-initiated deletion: clearOnboardingConversation() is the one
 *      function that removes a conversation outright — called when the
 *      user explicitly deletes it, AND from ModuleSelectionPage.tsx once
 *      module settings are actually saved to Firestore ("after successful
 *      setup", not merely after the AI summary call succeeds).
 */

const STORAGE_PREFIX = 'kivora_onboarding_chat_v1_'
export const CONVERSATION_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface OnboardingConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface OnboardingConversationState {
  startedAt: string // ISO timestamp — also the value sent to the server as `startedAt`
  savedAt: string // ISO timestamp of the last write, used for expiry
  messages: OnboardingConversationMessage[]
}

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`
}

function isExpired(state: OnboardingConversationState): boolean {
  const savedAtMs = new Date(state.savedAt).getTime()
  if (Number.isNaN(savedAtMs)) return true
  return Date.now() - savedAtMs >= CONVERSATION_MAX_AGE_MS
}

/**
 * Returns the saved conversation for this user, or null if there is none,
 * it's malformed, or it has expired (an expired entry is also removed as a
 * side effect, so it never has to be checked again).
 *
 * Every localStorage access in this module is wrapped in try/catch: private
 * browsing, blocked storage, or a full quota can all make localStorage throw
 * or behave unreliably — none of that should ever break onboarding, it
 * should just behave as if no saved conversation exists.
 */
export function loadOnboardingConversation(uid: string): OnboardingConversationState | null {
  try {
    const raw = localStorage.getItem(storageKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<OnboardingConversationState>
    if (
      typeof parsed.startedAt !== 'string' ||
      typeof parsed.savedAt !== 'string' ||
      !Array.isArray(parsed.messages)
    ) {
      clearOnboardingConversation(uid)
      return null
    }
    const state: OnboardingConversationState = {
      startedAt: parsed.startedAt,
      savedAt: parsed.savedAt,
      messages: parsed.messages.filter(
        (m): m is OnboardingConversationMessage =>
          !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
      ),
    }
    if (isExpired(state)) {
      clearOnboardingConversation(uid)
      return null
    }
    return state
  } catch {
    return null
  }
}

/** Persists the given conversation state for this user, overwriting any previous one. */
export function saveOnboardingConversation(
  uid: string,
  startedAt: string,
  messages: OnboardingConversationMessage[],
): void {
  try {
    const state: OnboardingConversationState = { startedAt, savedAt: new Date().toISOString(), messages }
    localStorage.setItem(storageKey(uid), JSON.stringify(state))
  } catch {
    // Storage unavailable/full — onboarding still works, it just won't be resumable later.
  }
}

/**
 * Removes this user's saved conversation outright. Called when the user
 * explicitly asks to delete it, and from ModuleSelectionPage.tsx right
 * after module settings are actually saved to Firestore.
 */
export function clearOnboardingConversation(uid: string): void {
  try {
    localStorage.removeItem(storageKey(uid))
  } catch {
    // Nothing to do — worst case a now-pointless entry lingers until it expires on its own.
  }
}

/**
 * Best-effort sweep of every onboarding conversation this browser has ever
 * stored (across however many Kivora accounts have signed in on it) that
 * has aged past CONVERSATION_MAX_AGE_MS — called once when the chat page
 * mounts, purely so abandoned attempts from other accounts don't sit in
 * localStorage forever. Never throws; a storage error simply means nothing
 * gets swept this time.
 */
export function pruneExpiredOnboardingConversations(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue
      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const parsed = JSON.parse(raw) as Partial<OnboardingConversationState>
        if (typeof parsed.savedAt !== 'string' || isExpired({ ...parsed, savedAt: parsed.savedAt } as OnboardingConversationState)) {
          keysToRemove.push(key)
        }
      } catch {
        keysToRemove.push(key) // unparseable entry — safe to drop
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key))
  } catch {
    // localStorage.length/key() unavailable — nothing to sweep.
  }
}
