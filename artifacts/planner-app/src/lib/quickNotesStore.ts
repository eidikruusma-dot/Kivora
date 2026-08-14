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
import type { Note, NoteFolder } from '@/data/notesData'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── Local pub/sub ───────────────────────────────────────────────────────────
type Listener = () => void
type LoadingListener = (loading: boolean) => void

// ── Module-level state ──────────────────────────────────────────────────────
let _notes: Note[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

const _listeners = new Set<Listener>()
const _loadingListeners = new Set<LoadingListener>()

function emit() {
  for (const l of _listeners) l()
}

function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Firestore paths ─────────────────────────────────────────────────────────
function notesCol(uid: string) {
  return collection(db, 'users', uid, 'notes')
}

function noteDoc(uid: string, id: string) {
  return doc(db, 'users', uid, 'notes', id)
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function nowTimestamp(): string {
  return new Intl.DateTimeFormat('et-EE', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())
}

function folderIcon(
  folder: NoteFolder,
): { icon: Note['icon']; iconBg: string; iconColor: string } {
  switch (folder) {
    case 'Kool':    return { icon: 'graduation', iconBg: '#DBEAFE', iconColor: '#2563EB' }
    case 'Töö':     return { icon: 'briefcase',  iconBg: '#F1F5F9', iconColor: '#475569' }
    case 'Kodu':    return { icon: 'cart',       iconBg: '#DCFCE7', iconColor: '#16A34A' }
    case 'Ideed':   return { icon: 'bulb',       iconBg: '#FEF9C3', iconColor: '#CA8A04' }
    case 'Päevik':  return { icon: 'heart',      iconBg: '#FFE4E6', iconColor: '#E11D48' }
    case 'Isiklik':
    default:        return { icon: 'document',   iconBg: '#EDE9FB', iconColor: '#6F5AE8' }
  }
}

// ── Initialisation ──────────────────────────────────────────────────────────
export function initNotesStore(uid: string | null): void {
  if (uid === _currentUid) return

  if (_unsubscribe) {
    _unsubscribe()
    _unsubscribe = null
  }

  _currentUid = uid
  _notes = []
  emit()

  if (!uid) {
    setLoading(false)
    return
  }

  setLoading(true)

  _unsubscribe = onSnapshot(
    notesCol(uid),
    (snap) => {
      // Sort by timestamp descending (newest first) using document data
      // We store a sortKey (ISO string) alongside human-readable timestamp
      _notes = snap.docs
        .map((d) => d.data() as Note)
        .sort((a, b) => ((b as Note & { sortKey?: string }).sortKey ?? '').localeCompare(
          (a as Note & { sortKey?: string }).sortKey ?? '',
        ))
      emit()
      setLoading(false)
    },
    () => {
      setLoading(false)
    },
  )
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function addQuickNote(content: string): Promise<Note> {
  const trimmed = content.trim()
  const { icon, iconBg, iconColor } = folderIcon('Isiklik')
  const note: Note = {
    id: `quick-${Date.now()}`,
    title: trimmed.slice(0, 40),
    preview: trimmed,
    folder: 'Isiklik',
    timestamp: nowTimestamp(),
    starred: false,
    iconBg,
    iconColor,
    icon,
  }
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: notes store has no authenticated user')
  await setDoc(noteDoc(_currentUid, note.id), sanitizeForFirestore({
    ...note,
    sortKey: new Date().toISOString(),
  }))
  return note
}

export async function addNote(
  title: string,
  content: string,
  folder: NoteFolder,
  starred: boolean,
): Promise<Note> {
  const { icon, iconBg, iconColor } = folderIcon(folder)
  const note: Note = {
    id: `note-${Date.now()}`,
    title: title.trim(),
    preview: content.trim(),
    folder,
    timestamp: nowTimestamp(),
    starred,
    iconBg,
    iconColor,
    icon,
  }
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: notes store has no authenticated user')
  await setDoc(noteDoc(_currentUid, note.id), sanitizeForFirestore({
    ...note,
    sortKey: new Date().toISOString(),
  }))
  return note
}

export async function updateNote(
  id: string,
  updates: Partial<Pick<Note, 'title' | 'preview' | 'folder' | 'starred'>>,
): Promise<void> {
  if (!_currentUid) return
  const existing = _notes.find((n) => n.id === id)
  if (!existing) return

  const next: Note = { ...existing, ...updates }
  if (updates.folder && updates.folder !== existing.folder) {
    const fi = folderIcon(updates.folder)
    next.icon = fi.icon
    next.iconBg = fi.iconBg
    next.iconColor = fi.iconColor
  }
  if (updates.title !== undefined) next.title = updates.title.trim()
  if (updates.preview !== undefined) next.preview = updates.preview.trim()
  next.timestamp = nowTimestamp()

  await setDoc(noteDoc(_currentUid, id), sanitizeForFirestore({
    ...next,
    sortKey: new Date().toISOString(),
  }))
}

export async function moveNote(id: string, folder: NoteFolder): Promise<void> {
  return updateNote(id, { folder })
}

export async function toggleStar(id: string): Promise<void> {
  if (!_currentUid) return
  const note = _notes.find((n) => n.id === id)
  if (!note) return
  await setDoc(noteDoc(_currentUid, id), sanitizeForFirestore({
    ...note,
    starred: !note.starred,
    sortKey: (note as Note & { sortKey?: string }).sortKey ?? new Date().toISOString(),
  }))
}

export async function deleteNote(id: string): Promise<void> {
  if (!_currentUid) return
  await deleteDoc(noteDoc(_currentUid, id))
}

// ── Sync reads ────────────────────────────────────────────────────────────────

export function getAllNotes(): Note[] {
  return _notes
}

export function getLatestQuickNotes(count: number): Note[] {
  return _notes.slice(0, count)
}

export function subscribeNotes(cb: () => void): () => void {
  _listeners.add(cb)
  return () => { _listeners.delete(cb) }
}

// ── React hooks ──────────────────────────────────────────────────────────────

export function useNotes(): Note[] {
  const [state, setState] = useState<Note[]>(_notes)
  useEffect(() => {
    setState(_notes)
    const l: Listener = () => setState([..._notes])
    _listeners.add(l)
    return () => { _listeners.delete(l) }
  }, [])
  return state
}

export function useNotesLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading)
  useEffect(() => {
    setState(_loading)
    const l: LoadingListener = (v) => setState(v)
    _loadingListeners.add(l)
    return () => { _loadingListeners.delete(l) }
  }, [])
  return state
}
