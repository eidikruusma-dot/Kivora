// @vitest-environment jsdom
/**
 * Release-audit finding: AIAssistantPage's per-message Edit/Delete actions
 * were hover-only (`opacity-0 group-hover:opacity-100`), and an apparent
 * mobile fallback existed in name only — a `msgActionId` state was declared,
 * reset on mouse-leave and on an outside click, but NO production code path
 * ever called `setMsgActionId(m.id)` to actually open it. Touch devices have
 * no reliable hover, so Edit/Delete on a user's own AI-chat message were
 * completely unreachable there.
 *
 * Fix (AIAssistantPage.tsx only, reusing the existing msgActionId state —
 * no second mobile action system):
 *   - the message bubble (the rendered content div, not the edit-mode
 *     textarea) gained an onClick that toggles msgActionId for that
 *     message: `setMsgActionId(msgActionId === m.id ? null : m.id)`,
 *     stopping propagation so it doesn't immediately re-trigger the
 *     existing "click outside closes it" window listener;
 *   - the action-buttons row's className changed from
 *     `opacity-0 group-hover:opacity-100` to
 *     `sm:group-hover:opacity-100` plus a data-driven
 *     `msgActionId === m.id ? "opacity-100" : "opacity-0"` — visible
 *     whenever msgActionId matches this message (any width, including
 *     touch), and still hover-revealed at sm: (640px) and up exactly as
 *     before.
 * Nothing else changed: startEditMessage/requestDelete/commitEdit/
 * confirmDelete, the delete-confirmation dialog, message IDs, conversation
 * state, and Firestore persistence are all untouched. Edit is still gated
 * to `m.role === "user"` — assistant messages never render it.
 *
 * This test renders the ACTUAL AIAssistantPage component (not just its
 * source text) against a mocked Firestore, seeding a real conversation via
 * the real aiConversationsStore (initAIConversationsStore), deep-linking
 * into it the same way the app already does from other panels
 * (location.state.openId — an existing, unmodified code path), and
 * exercises real clicks — not readFileSync/regex assertions.
 *
 * Compile and run standalone:
 *   cd artifacts/planner-app
 *   npx vitest run src/lib/__tests__/aiAssistantMessageActionsTouchVisibility.test.tsx
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AIAssistantPage from '@/views/AIAssistantPage'

afterEach(cleanup)

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, storage: {} }))

const fakeDb = new Map<string, Record<string, unknown>>()
const UID = 'user-a'
function convPath(chatId: string) { return `users/${UID}/aiConversations/${chatId}` }

const unsubscribeMock = vi.fn()
const onSnapshotMock = vi.fn(
  (
    _colRef: unknown,
    _onNext: (snap: { docs: { data: () => unknown }[] }) => void,
    _onError: (err: unknown) => void,
  ) => unsubscribeMock,
)
const setDocMock = vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
  fakeDb.set(ref.path, { ...data })
})
const deleteDocMock = vi.fn(async (ref: { path: string }) => {
  fakeDb.delete(ref.path)
})

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  setDoc: (...args: Parameters<typeof setDocMock>) => setDocMock(...args),
  deleteDoc: (...args: Parameters<typeof deleteDocMock>) => deleteDocMock(...args),
  onSnapshot: (...args: Parameters<typeof onSnapshotMock>) => onSnapshotMock(...args),
}))

import { initAIConversationsStore, getAllChats } from '@/lib/aiConversationsStore'

function pumpChats() {
  act(() => {
    const call = onSnapshotMock.mock.calls.find(([, onNext]) => typeof onNext === 'function')
    const onNext = call?.[1]
    const docs = [...fakeDb.entries()]
      .filter(([path]) => path.startsWith(`users/${UID}/aiConversations/`))
      .map(([, data]) => ({ data: () => data }))
    onNext?.({ docs })
  })
}

const CHAT_ID = 'chat-1'
const USER_MSG_ID = 'msg-user-1'
const ASSISTANT_MSG_ID = 'msg-assistant-1'
const USER_MSG_2_ID = 'msg-user-2'

function seedChat() {
  fakeDb.set(convPath(CHAT_ID), {
    id: CHAT_ID,
    title: 'Test chat',
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    iconColor: '#6F5AE8',
    iconBg: '#EDE9FB',
    messages: [
      { id: USER_MSG_ID, role: 'user', content: 'Hello there', time: '10:00' },
      { id: ASSISTANT_MSG_ID, role: 'assistant', content: 'Hi! How can I help?', time: '10:01' },
      { id: USER_MSG_2_ID, role: 'user', content: 'Second message', time: '10:02' },
    ],
  })
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/app/assistant', state: { openId: CHAT_ID } }]}
    >
      <AIAssistantPage />
    </MemoryRouter>,
  )
}

/** The rendered bubble content div for a given message text (its click target). */
function bubbleFor(text: string) {
  return screen.getByText(text)
}

/** The action-row wrapper immediately preceding a message's bubble in the DOM
 * (same sibling structure the component renders: action row, then bubble). */
function actionRowFor(bubbleText: string) {
  const bubble = bubbleFor(bubbleText)
  // bubble -> message-bubble-content div -> "relative ..." wrapper -> its first child is the action row
  const wrapper = bubble.closest('.relative')!
  return wrapper.querySelector(':scope > div.absolute') as HTMLElement | null
}

// jsdom doesn't load the app's compiled CSS, so getComputedStyle can't
// resolve what a Tailwind opacity-* class actually paints — read the class
// list directly instead, which is exactly what the fix toggles.
function isVisible(el: HTMLElement | null): boolean {
  if (!el) return false
  return el.classList.contains('opacity-100') && !el.classList.contains('opacity-0')
}

beforeEach(() => {
  initAIConversationsStore(null)
  fakeDb.clear()
  unsubscribeMock.mockClear()
  onSnapshotMock.mockClear()
  setDocMock.mockClear()
  deleteDocMock.mockClear()
  seedChat()
  initAIConversationsStore(UID)
  pumpChats()
})

describe('user message actions are reachable on touch (no hover needed)', () => {
  it('the action row for a user message is hidden until tapped, then visible', () => {
    renderPage()
    const row = actionRowFor('Hello there')
    expect(isVisible(row)).toBe(false)

    fireEvent.click(bubbleFor('Hello there'))
    expect(isVisible(actionRowFor('Hello there'))).toBe(true)
  })
})

describe('opening actions sets the correct message ID', () => {
  it('tapping message 1 reveals only message 1\'s actions, not message 2\'s', () => {
    renderPage()
    fireEvent.click(bubbleFor('Hello there'))
    expect(isVisible(actionRowFor('Hello there'))).toBe(true)
    expect(isVisible(actionRowFor('Second message'))).toBe(false)
  })
})

describe('switching messages changes the active action row', () => {
  it('tapping a second message closes the first\'s actions and opens the second\'s', () => {
    renderPage()
    fireEvent.click(bubbleFor('Hello there'))
    expect(isVisible(actionRowFor('Hello there'))).toBe(true)

    fireEvent.click(bubbleFor('Second message'))
    expect(isVisible(actionRowFor('Hello there'))).toBe(false)
    expect(isVisible(actionRowFor('Second message'))).toBe(true)
  })

  it('tapping the same message again closes it', () => {
    renderPage()
    fireEvent.click(bubbleFor('Hello there'))
    expect(isVisible(actionRowFor('Hello there'))).toBe(true)
    fireEvent.click(bubbleFor('Hello there'))
    expect(isVisible(actionRowFor('Hello there'))).toBe(false)
  })
})

describe('Edit invokes the existing edit flow', () => {
  it('tapping Edit on a revealed user message switches it into the existing inline edit textarea', () => {
    renderPage()
    fireEvent.click(bubbleFor('Hello there'))
    const row = actionRowFor('Hello there')!
    // Titles are localized (Estonian by default, per getLocalLanguage) —
    // "Muuda" = Edit, matching the real rendered <button title="Muuda">.
    fireEvent.click(within(row).getByTitle('Muuda'))

    const textarea = screen.getByDisplayValue('Hello there') as HTMLTextAreaElement
    expect(textarea.tagName).toBe('TEXTAREA')
  })
})

describe('Delete invokes the existing delete/confirmation flow', () => {
  it('tapping Delete on a revealed user message opens the existing confirmation dialog, and confirming deletes it via the real store', async () => {
    renderPage()
    fireEvent.click(bubbleFor('Second message'))
    const row = actionRowFor('Second message')!
    // "Kustuta" = Delete, matching the real rendered <button title="Kustuta">.
    fireEvent.click(within(row).getByTitle('Kustuta'))

    const dialogTitle = screen.getByText('Kustuta sõnum?')
    expect(dialogTitle).toBeDefined()
    const dialog = dialogTitle.closest('.fixed')!
    fireEvent.click(within(dialog as HTMLElement).getByRole('button', { name: 'Kustuta' }))

    // deleteChatMessage (aiConversationsStore.ts) removes the message from
    // the array and re-saves the whole chat document via setDoc — it does
    // not call Firestore's deleteDoc (that's reserved for deleting an
    // entire chat, a separate, untouched code path).
    await vi.waitFor(() => {
      expect(setDocMock).toHaveBeenCalled()
    })
    pumpChats()
    const chat = getAllChats().find((c) => c.id === CHAT_ID)
    expect(chat?.messages.some((m) => m.id === USER_MSG_2_ID)).toBe(false)
    expect(chat?.messages.some((m) => m.id === USER_MSG_ID)).toBe(true)
  })
})

describe('assistant messages do not expose user-only actions', () => {
  it('tapping an assistant message reveals only Delete, never Edit', () => {
    renderPage()
    fireEvent.click(bubbleFor('Hi! How can I help?'))
    const row = actionRowFor('Hi! How can I help?')!
    expect(isVisible(row)).toBe(true)
    expect(within(row).queryByTitle('Muuda')).toBeNull()
    expect(within(row).getByTitle('Kustuta')).toBeDefined()
  })
})

describe('desktop hover behavior remains intact', () => {
  it('sm:group-hover:opacity-100 is still present so hover reveals the row at sm: and up, without any tap', () => {
    renderPage()
    const row = actionRowFor('Hello there')
    expect(row?.className).toMatch(/sm:group-hover:opacity-100/)
    // Untapped, unhovered: still hidden (jsdom doesn't evaluate :hover, but
    // this confirms the class that drives it is present and opacity starts at 0).
    expect(isVisible(row)).toBe(false)
  })
})
