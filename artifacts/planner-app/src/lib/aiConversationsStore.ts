import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── Shared types (re-exported for consumers) ────────────────────────────────
export type Role = 'user' | 'assistant'

/** Metadata for a file attached to a message — shown as a compact chip in the UI. */
export interface AttachmentMeta {
  name: string
  mimeType: string
}

export interface ChatMessage {
  id: string
  role: Role
  /** The user-visible text only. Never contains raw file content. */
  content: string
  time: string
  pending?: boolean
  error?: boolean
  /** File chips shown in the message bubble. Populated on user messages only. */
  attachments?: AttachmentMeta[]
  /**
   * Hidden attachment context sent to the AI as part of the conversation history.
   * Never rendered in the chat UI. Stored in Firestore so context survives reloads.
   * For bank statements this is structured JSON; for other files it is extracted text.
   */
  hiddenContext?: string
}

export interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  pinned: boolean
  createdAt: number
  updatedAt: number
  iconColor: string
  iconBg: string
}

// ── Local pub/sub ───────────────────────────────────────────────────────────
type ChatsListener = (chats: Chat[]) => void
type LoadingListener = (loading: boolean) => void

// ── Module-level state ──────────────────────────────────────────────────────
let _chats: Chat[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

const _chatsListeners = new Set<ChatsListener>()
const _loadingListeners = new Set<LoadingListener>()

function emitChats() {
  for (const l of _chatsListeners) l(_chats)
}

function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Firestore paths ─────────────────────────────────────────────────────────
function convCol(uid: string) {
  return collection(db, 'users', uid, 'aiConversations')
}

function convDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'aiConversations', id)
}

// ── Initialisation ──────────────────────────────────────────────────────────
export function initAIConversationsStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _chats = []
  emitChats()

  if (!uid) {
    setLoading(false)
    return
  }

  setLoading(true)

  _unsubscribe = onSnapshot(
    convCol(uid),
    (snap) => {
      _chats = snap.docs
        .map((d) => d.data() as Chat)
        // Strip any leftover pending flags from crashed sessions
        .map((c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.pending ? { ...m, pending: false, content: m.content || '…' } : m,
          ),
        }))
      emitChats()
      setLoading(false)
    },
    () => {
      setLoading(false)
    },
  )
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
// Only committed (non-pending) chats are written to Firestore.
// Pending AI messages are held in local React state only.

export async function saveChat(chat: Chat): Promise<void> {
  if (!_currentUid) return
  // Strip pending / error UI states before persisting
  const toStore: Chat = {
    ...chat,
    messages: chat.messages
      .filter((m) => !m.pending)
      .map((m) => sanitizeForFirestore(m)),
  }
  await setDoc(convDoc(_currentUid, chat.id), sanitizeForFirestore(toStore))
}

export async function deleteChat(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(convDoc(_currentUid, id))
}

/**
 * Update a single message in a chat (text content only — never hiddenContext/actions).
 * Writes the whole chat document (messages are stored as an array in the parent doc).
 */
export async function updateChatMessage(
  chatId: string,
  messageId: string,
  updates: { content: string },
): Promise<void> {
  if (!_currentUid) return
  const chat = _chats.find((c) => c.id === chatId)
  if (!chat) return
  const updated: Chat = {
    ...chat,
    updatedAt: Date.now(),
    messages: chat.messages.map((m) =>
      m.id === messageId ? { ...m, content: updates.content } : m,
    ),
  }
  // Optimistic local update
  _chats = _chats.map((c) => (c.id === chatId ? updated : c))
  emitChats()
  await saveChat(updated)
}

/**
 * Delete a single message from a chat.
 */
export async function deleteChatMessage(
  chatId: string,
  messageId: string,
): Promise<void> {
  if (!_currentUid) return
  const chat = _chats.find((c) => c.id === chatId)
  if (!chat) return
  const updated: Chat = {
    ...chat,
    updatedAt: Date.now(),
    messages: chat.messages.filter((m) => m.id !== messageId),
  }
  _chats = _chats.map((c) => (c.id === chatId ? updated : c))
  emitChats()
  await saveChat(updated)
}

/**
 * Delete a message AND all messages that come after it in the conversation.
 * Used when editing an older message to remove now-stale AI responses.
 */
export async function deleteMessagesFrom(
  chatId: string,
  messageId: string,
): Promise<void> {
  if (!_currentUid) return
  const chat = _chats.find((c) => c.id === chatId)
  if (!chat) return
  const idx = chat.messages.findIndex((m) => m.id === messageId)
  if (idx === -1) return
  const updated: Chat = {
    ...chat,
    updatedAt: Date.now(),
    messages: chat.messages.slice(0, idx),
  }
  _chats = _chats.map((c) => (c.id === chatId ? updated : c))
  emitChats()
  await saveChat(updated)
}

// ── Sync getter ──────────────────────────────────────────────────────────────

export function getAllChats(): Chat[] {
  return _chats
}

// ── React hooks ──────────────────────────────────────────────────────────────

export function useChats(): Chat[] {
  const [state, setState] = useState<Chat[]>(_chats)
  useEffect(() => {
    setState(_chats)
    const l: ChatsListener = (c) => setState(c)
    _chatsListeners.add(l)
    return () => { _chatsListeners.delete(l) }
  }, [])
  return state
}

export function useChatsLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading)
  useEffect(() => {
    setState(_loading)
    const l: LoadingListener = (v) => setState(v)
    _loadingListeners.add(l)
    return () => { _loadingListeners.delete(l) }
  }, [])
  return state
}
