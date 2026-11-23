import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadOnboardingConversation,
  saveOnboardingConversation,
  clearOnboardingConversation,
  pruneExpiredOnboardingConversations,
  CONVERSATION_MAX_AGE_MS,
} from '@/lib/onboardingConversationStore'

// This project's default vitest environment is 'node' (see
// vitest.config.ts), which has no global localStorage — a minimal,
// Map-backed Web Storage stand-in is installed instead, exercising the
// real store implementation's logic end to end rather than mocking the
// module away (same documented reasoning as aiLanguagePreference.test.ts,
// which mocks the module itself where a store's logic isn't the thing
// under test — here it is, so a real localStorage shape is used instead).
function createFakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
    clear: () => { store.clear() },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  } as Storage
}

vi.stubGlobal('localStorage', createFakeLocalStorage())

describe('onboardingConversationStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useRealTimers()
  })

  it('returns null when nothing has been saved for this user', () => {
    expect(loadOnboardingConversation('user-a')).toBeNull()
  })

  it('round-trips a saved conversation for the same user', () => {
    const startedAt = new Date().toISOString()
    const messages = [
      { role: 'assistant' as const, content: 'Tere!' },
      { role: 'user' as const, content: 'Tere, olen õpetaja.' },
    ]
    saveOnboardingConversation('user-a', startedAt, messages)
    const loaded = loadOnboardingConversation('user-a')
    expect(loaded).not.toBeNull()
    expect(loaded?.startedAt).toBe(startedAt)
    expect(loaded?.messages).toEqual(messages)
  })

  it('isolates conversations per user — one user can never load another user\'s saved conversation', () => {
    saveOnboardingConversation('user-a', new Date().toISOString(), [{ role: 'user', content: 'from A' }])
    saveOnboardingConversation('user-b', new Date().toISOString(), [{ role: 'user', content: 'from B' }])

    const a = loadOnboardingConversation('user-a')
    const b = loadOnboardingConversation('user-b')
    expect(a?.messages[0].content).toBe('from A')
    expect(b?.messages[0].content).toBe('from B')

    clearOnboardingConversation('user-a')
    expect(loadOnboardingConversation('user-a')).toBeNull()
    expect(loadOnboardingConversation('user-b')?.messages[0].content).toBe('from B') // untouched
  })

  it('clearOnboardingConversation removes exactly that user\'s entry', () => {
    saveOnboardingConversation('user-a', new Date().toISOString(), [{ role: 'user', content: 'hi' }])
    expect(loadOnboardingConversation('user-a')).not.toBeNull()
    clearOnboardingConversation('user-a')
    expect(loadOnboardingConversation('user-a')).toBeNull()
  })

  it('clearing a user with nothing saved is a harmless no-op', () => {
    expect(() => clearOnboardingConversation('nobody-home')).not.toThrow()
  })

  it('a conversation saved just now is not expired', () => {
    saveOnboardingConversation('user-a', new Date().toISOString(), [{ role: 'user', content: 'hi' }])
    expect(loadOnboardingConversation('user-a')).not.toBeNull()
  })

  it('a conversation older than the max age is treated as gone and removed on load', () => {
    const longAgo = new Date(Date.now() - (CONVERSATION_MAX_AGE_MS + 60_000))
    // Write the raw shape directly, bypassing saveOnboardingConversation
    // (which always stamps savedAt to "now") so savedAt can be backdated.
    localStorage.setItem(
      'kivora_onboarding_chat_v1_user-a',
      JSON.stringify({ startedAt: longAgo.toISOString(), savedAt: longAgo.toISOString(), messages: [{ role: 'user', content: 'old' }] }),
    )
    expect(loadOnboardingConversation('user-a')).toBeNull()
    // Side effect: the expired entry is actually deleted, not just ignored.
    expect(localStorage.getItem('kivora_onboarding_chat_v1_user-a')).toBeNull()
  })

  it('a conversation one millisecond under the max age still loads', () => {
    const justUnder = new Date(Date.now() - (CONVERSATION_MAX_AGE_MS - 1000))
    localStorage.setItem(
      'kivora_onboarding_chat_v1_user-a',
      JSON.stringify({ startedAt: justUnder.toISOString(), savedAt: justUnder.toISOString(), messages: [{ role: 'user', content: 'still here' }] }),
    )
    expect(loadOnboardingConversation('user-a')).not.toBeNull()
  })

  it('malformed stored data is treated as absent, and removed, rather than thrown', () => {
    localStorage.setItem('kivora_onboarding_chat_v1_user-a', 'not even json')
    expect(loadOnboardingConversation('user-a')).toBeNull()

    localStorage.setItem('kivora_onboarding_chat_v1_user-b', JSON.stringify({ startedAt: 123, messages: 'nope' }))
    expect(loadOnboardingConversation('user-b')).toBeNull()
  })

  it('filters out malformed individual messages while keeping well-formed ones', () => {
    localStorage.setItem(
      'kivora_onboarding_chat_v1_user-a',
      JSON.stringify({
        startedAt: new Date().toISOString(),
        savedAt: new Date().toISOString(),
        messages: [
          { role: 'user', content: 'good' },
          { role: 'system', content: 'bad role' },
          { role: 'assistant', content: 42 },
          null,
          { role: 'assistant', content: 'also good' },
        ],
      }),
    )
    const loaded = loadOnboardingConversation('user-a')
    expect(loaded?.messages).toEqual([
      { role: 'user', content: 'good' },
      { role: 'assistant', content: 'also good' },
    ])
  })

  it('pruneExpiredOnboardingConversations removes only expired entries, across multiple users', () => {
    const fresh = new Date().toISOString()
    const expired = new Date(Date.now() - (CONVERSATION_MAX_AGE_MS + 60_000)).toISOString()

    localStorage.setItem('kivora_onboarding_chat_v1_user-fresh', JSON.stringify({ startedAt: fresh, savedAt: fresh, messages: [] }))
    localStorage.setItem('kivora_onboarding_chat_v1_user-expired', JSON.stringify({ startedAt: expired, savedAt: expired, messages: [] }))
    localStorage.setItem('some_unrelated_key', 'left completely alone')

    pruneExpiredOnboardingConversations()

    expect(localStorage.getItem('kivora_onboarding_chat_v1_user-fresh')).not.toBeNull()
    expect(localStorage.getItem('kivora_onboarding_chat_v1_user-expired')).toBeNull()
    expect(localStorage.getItem('some_unrelated_key')).toBe('left completely alone')
  })

  it('pruneExpiredOnboardingConversations removes unparseable entries too', () => {
    localStorage.setItem('kivora_onboarding_chat_v1_user-broken', 'not json at all')
    pruneExpiredOnboardingConversations()
    expect(localStorage.getItem('kivora_onboarding_chat_v1_user-broken')).toBeNull()
  })

  it('saving overwrites any previous conversation for the same user rather than appending', () => {
    saveOnboardingConversation('user-a', new Date().toISOString(), [{ role: 'user', content: 'first attempt' }])
    saveOnboardingConversation('user-a', new Date().toISOString(), [{ role: 'user', content: 'second attempt' }])
    const loaded = loadOnboardingConversation('user-a')
    expect(loaded?.messages).toEqual([{ role: 'user', content: 'second attempt' }])
  })
})
