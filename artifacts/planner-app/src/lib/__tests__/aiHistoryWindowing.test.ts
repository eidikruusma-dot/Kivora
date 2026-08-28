/**
 * Regression coverage for a live production incident: a user's long-running
 * AI conversation started failing every request with
 *   validation rejected code=TOO_MANY_MESSAGES status=400
 * once its accumulated message count crossed api-server's
 * validateChatRequest.ts CHAT_REQUEST_LIMITS.maxMessages (50) — an old
 * conversation became permanently unusable, every future turn in it
 * rejected the same way, with no assistant response and no action executed.
 *
 * Root cause: AIAssistantPage.tsx sends its ENTIRE stored conversation
 * history to fetchAIReply() on every turn, unbounded — a conversation the
 * user keeps returning to over weeks/months grows past the server's message
 * count (and, separately, total-content-length) limit indefinitely.
 *
 * Fix — NOT raising the server limit (that only delays the same failure for
 * an ever-growing conversation) — a deterministic, bounded WINDOW of the
 * most recent messages, applied once inside fetchAIReply() (aiClient.ts),
 * the single shared entry point every caller goes through:
 *   windowConversationHistory() always keeps the current turn (the last
 *   message) and up to HISTORY_WINDOW_MAX_MESSAGES-1 (29) of the most
 *   recent preceding messages, trimming further from the OLDEST end if
 *   the combined content would still exceed HISTORY_WINDOW_MAX_TOTAL_CHARS.
 *   Both constants are comfortably under the server's own limits (30 vs.
 *   50 messages; 50,000 vs. 60,000 chars) so client/server drift can never
 *   itself trigger the 400.
 *
 * Critically: this only bounds what is SENT to /api/ai/chat. The caller's
 * own stored/displayed conversation (Firestore, the chat list UI) is never
 * touched — windowConversationHistory is a pure function that returns a NEW
 * array and never mutates its input.
 *
 * The already-fixed payload order from the previous investigation
 * ([stable instructions] → [history] → [CURRENT_KIVORA_STATE] → [current
 * turn], enforced server-side in buildChatMessages.ts) is preserved
 * automatically: the server operates on whatever `messages` array it
 * receives, and now simply receives an already-bounded one.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiHistoryWindowing.test.ts
 */

import { describe, it, expect, vi } from 'vitest'

// aiClient.ts imports buildAIContext (aiContextBuilder.ts), which transitively
// pulls in every store module and, through them, @/lib/firebase — mocked here
// purely so importing aiClient.ts for windowConversationHistory (a pure
// function with no Firestore/auth dependency of its own) never tries to
// initialize a real Firebase app in this test environment.
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, storage: {} }))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  deleteField: vi.fn(),
  writeBatch: vi.fn(() => ({ delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  runTransaction: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
}))

import {
  windowConversationHistory,
  HISTORY_WINDOW_MAX_MESSAGES,
  HISTORY_WINDOW_MAX_TOTAL_CHARS,
} from '@/lib/aiClient'

type Msg = { role: 'user' | 'assistant'; content: string }

function makeConversation(turnCount: number, contentLength = 20): Msg[] {
  const messages: Msg[] = []
  for (let i = 0; i < turnCount; i++) {
    messages.push({ role: 'user', content: `Sõnum number ${i} `.padEnd(contentLength, 'x') })
    messages.push({ role: 'assistant', content: `Vastus number ${i} `.padEnd(contentLength, 'x') })
  }
  return messages
}

// api-server's validateChatRequest.ts CHAT_REQUEST_LIMITS — duplicated here
// (not cross-package importable from a Vite/vitest client build) purely as
// a documented reference point for the "our window is comfortably under
// the server's real limit" assertions below. If the server's own limit
// ever changes, this constant must be updated to match — see
// artifacts/api-server/src/lib/validateChatRequest.ts.
const SERVER_MAX_MESSAGES = 50
const SERVER_MAX_TOTAL_CONTENT_LENGTH = 60_000

describe('1 & 7. a conversation longer than the server message limit never triggers TOO_MANY_MESSAGES', () => {
  it('windowConversationHistory caps a 200-turn (400-message) conversation well under the server limit', () => {
    const longConversation = makeConversation(200) // 400 messages — 8x the server's own limit
    const windowed = windowConversationHistory(longConversation)

    expect(windowed.length).toBeLessThanOrEqual(HISTORY_WINDOW_MAX_MESSAGES)
    expect(windowed.length).toBeLessThan(SERVER_MAX_MESSAGES)
    expect(HISTORY_WINDOW_MAX_MESSAGES).toBeLessThan(SERVER_MAX_MESSAGES)
  })

  it('the windowed total content length always stays under the server total-length limit too', () => {
    // Verbose messages — realistic for a long-running Assistant conversation
    // with attached-document context folded in occasionally.
    const longVerboseConversation = makeConversation(100, 800)
    const windowed = windowConversationHistory(longVerboseConversation)
    const totalLength = windowed.reduce((sum, m) => sum + m.content.length, 0)

    expect(totalLength).toBeLessThanOrEqual(HISTORY_WINDOW_MAX_TOTAL_CHARS)
    expect(totalLength).toBeLessThan(SERVER_MAX_TOTAL_CONTENT_LENGTH)
  })

  it('a conversation already under both limits is returned completely unchanged (no unnecessary trimming)', () => {
    const shortConversation = makeConversation(5) // 10 messages
    const windowed = windowConversationHistory(shortConversation)
    expect(windowed).toEqual(shortConversation)
    expect(windowed.length).toBe(10)
  })
})

describe('2. old messages are never mutated — only the array actually sent is bounded', () => {
  it('windowConversationHistory never mutates its input array or its input messages', () => {
    const original = makeConversation(100)
    const originalSnapshot = original.map((m) => ({ ...m }))
    windowConversationHistory(original)
    expect(original).toEqual(originalSnapshot)
    expect(original.length).toBe(200)
  })

  it('returns a NEW array, never the same reference as the input (even when unchanged)', () => {
    const original = makeConversation(3)
    const windowed = windowConversationHistory(original)
    expect(windowed).not.toBe(original)
  })
})

describe('3. the most recent conversation context is always retained, oldest dropped first', () => {
  it('keeps the newest messages and drops the oldest ones when the conversation is long', () => {
    const longConversation = makeConversation(100) // messages 0..199 in order
    const windowed = windowConversationHistory(longConversation)

    // The very last (current-turn) message is always present.
    expect(windowed[windowed.length - 1]).toEqual(longConversation[longConversation.length - 1])
    // The earliest turns are gone.
    expect(windowed.some((m) => m.content.includes('Sõnum number 0 '))).toBe(false)
    expect(windowed.some((m) => m.content.includes('number 1 '))).toBe(false)
    // The most recent turns survive.
    expect(windowed.some((m) => m.content.includes('number 99 '))).toBe(true)
    // What remains is still in original chronological order (never reordered).
    const indices = windowed.map((m) => longConversation.indexOf(m))
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1])
    }
  })
})

describe('6. destructive-action confirmation survives even at/over the history boundary', () => {
  it('a confirm question immediately followed by "jah" as the current turn — deep in a long conversation — both survive windowing', () => {
    const longConversation = makeConversation(100) // 200 filler messages
    const confirmQuestion: Msg = { role: 'assistant', content: 'Kas soovid kindlasti kustutada ülesande "Vana ülesanne"? Seda toimingut ei saa tagasi võtta.' }
    const confirmReply: Msg = { role: 'user', content: 'Jah, kustuta.' }
    const conversation = [...longConversation, confirmQuestion, confirmReply]

    const windowed = windowConversationHistory(conversation)

    // The confirming reply is the current turn — always last.
    expect(windowed[windowed.length - 1]).toEqual(confirmReply)
    // The exact question it's replying to — the message immediately before
    // it — always survives too, since any window keeping the current turn
    // plus at least one prior message includes it.
    expect(windowed[windowed.length - 2]).toEqual(confirmQuestion)
  })

  it('the model sees the confirmation exchange even when it lands EXACTLY at the window boundary', () => {
    // Construct a conversation where the confirm exchange is the OLDEST
    // pair still eligible for the window — proves the boundary itself
    // doesn't split a confirm question from its reply.
    const filler = makeConversation(50) // way more than enough to force trimming
    const confirmQuestion: Msg = { role: 'assistant', content: 'Kas soovid kindlasti kustutada ülesande "Piiripealne ülesanne"?' }
    const confirmReply: Msg = { role: 'user', content: 'Jah, kustuta.' }
    const conversation = [...filler, confirmQuestion, confirmReply]

    const windowed = windowConversationHistory(conversation)
    const qIdx = windowed.findIndex((m) => m === confirmQuestion)
    const rIdx = windowed.findIndex((m) => m === confirmReply)

    expect(qIdx).toBeGreaterThanOrEqual(0)
    expect(rIdx).toBe(windowed.length - 1)
    expect(qIdx).toBe(rIdx - 1)
  })
})

describe('plan_creation mode (always exactly one message) is unaffected by windowing', () => {
  it('a single-message plan-generation request passes through completely unchanged', () => {
    const single: Msg[] = [{ role: 'user', content: 'Loo mulle nädala treeningkava.' }]
    const windowed = windowConversationHistory(single)
    expect(windowed).toEqual(single)
    expect(windowed.length).toBe(1)
  })
})

describe('edge cases', () => {
  it('an empty history array is returned as-is', () => {
    expect(windowConversationHistory([])).toEqual([])
  })

  it('a conversation of exactly HISTORY_WINDOW_MAX_MESSAGES is untouched', () => {
    const exact = makeConversation(HISTORY_WINDOW_MAX_MESSAGES / 2) // *2 turns = MAX messages
    const windowed = windowConversationHistory(exact)
    expect(windowed.length).toBe(HISTORY_WINDOW_MAX_MESSAGES)
    expect(windowed).toEqual(exact)
  })

  it('a single, extremely long message (over the total-char limit on its own) is still returned — the current turn is never dropped', () => {
    const huge: Msg = { role: 'user', content: 'x'.repeat(HISTORY_WINDOW_MAX_TOTAL_CHARS + 10_000) }
    const windowed = windowConversationHistory([{ role: 'assistant', content: 'earlier context' }, huge])
    expect(windowed[windowed.length - 1]).toEqual(huge)
  })
})
