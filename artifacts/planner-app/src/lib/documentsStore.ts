import { useState, useEffect } from 'react'
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage'
import { db, storage } from '@/lib/firebase'
import { sanitizeForFirestore } from '@/lib/firestoreUtils'
import type { NoteFolder } from '@/data/notesData'

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentModule = 'notes' | 'school' | 'personal'

export interface KivoraDocument {
  id: string
  name: string
  mimeType: string
  storagePath: string
  downloadURL: string
  size: number
  module: DocumentModule
  folder?: NoteFolder      // module=notes
  subjectId?: string       // module=school
  subjectName?: string     // module=school, display name
  createdAt: string        // ISO
  updatedAt: string        // ISO
}

export interface DocumentDestination {
  module: DocumentModule
  folder?: NoteFolder
  subjectId?: string
  subjectName?: string
}

// ── Store state ───────────────────────────────────────────────────────────────

let _docs: KivoraDocument[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null

type Listener = () => void
type LoadingListener = (v: boolean) => void
const _listeners = new Set<Listener>()
const _loadingListeners = new Set<LoadingListener>()

function emit() { for (const l of _listeners) l() }
function setLoading(v: boolean) {
  _loading = v
  for (const l of _loadingListeners) l(v)
}

// ── Firestore paths ───────────────────────────────────────────────────────────

function docsCol(uid: string) {
  return collection(db, 'users', uid, 'documents')
}

function docRef(uid: string, id: string) {
  return doc(db, 'users', uid, 'documents', id)
}

// ── Init / teardown ───────────────────────────────────────────────────────────

export function initDocumentsStore(uid: string | null): void {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null }
  if (!uid) { _docs = []; _currentUid = null; emit(); return }
  if (uid === _currentUid) return
  _currentUid = uid
  setLoading(true)
  _unsubscribe = onSnapshot(docsCol(uid), (snap) => {
    _docs = snap.docs.map(d => d.data() as KivoraDocument)
    _docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    setLoading(false)
    emit()
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function genId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

// ── Mutation functions ────────────────────────────────────────────────────────

/**
 * Upload a File blob to Firebase Storage, then write metadata to Firestore.
 * Returns the full KivoraDocument record on success.
 */
export async function uploadAndSaveDocument(
  uid: string,
  file: File,
  destination: DocumentDestination,
  overrideName?: string,
): Promise<KivoraDocument> {
  const id = genId()
  const fileName = overrideName || file.name
  const storagePath = `users/${uid}/documents/${id}/${fileName}`
  const storageRef = ref(storage, storagePath)

  const snapshot = await uploadBytes(storageRef, file)
  const downloadURL = await getDownloadURL(snapshot.ref)

  const now = new Date().toISOString()
  const record: KivoraDocument = {
    id,
    name: fileName,
    mimeType: file.type || 'application/octet-stream',
    storagePath,
    downloadURL,
    size: file.size,
    module: destination.module,
    createdAt: now,
    updatedAt: now,
    ...(destination.folder      && { folder:      destination.folder }),
    ...(destination.subjectId   && { subjectId:   destination.subjectId }),
    ...(destination.subjectName && { subjectName: destination.subjectName }),
  }

  await setDoc(docRef(uid, id), sanitizeForFirestore(record))
  return record
}

/** Update a document's destination (module/folder/subject). */
export async function moveDocument(
  uid: string,
  id: string,
  destination: DocumentDestination,
): Promise<void> {
  await updateDoc(docRef(uid, id), sanitizeForFirestore({
    module:      destination.module,
    folder:      destination.folder      ?? null,
    subjectId:   destination.subjectId   ?? null,
    subjectName: destination.subjectName ?? null,
    updatedAt:   new Date().toISOString(),
  }))
}

/** Rename a document (Firestore metadata only — Storage path is immutable). */
export async function renameDocument(uid: string, id: string, newName: string): Promise<void> {
  await updateDoc(docRef(uid, id), { name: newName, updatedAt: new Date().toISOString() })
}

/** Delete a document record from Firestore and its file from Storage. */
export async function deleteDocument(uid: string, id: string): Promise<void> {
  const existing = _docs.find(d => d.id === id)
  await deleteDoc(docRef(uid, id))
  if (existing?.storagePath) {
    try { await deleteObject(ref(storage, existing.storagePath)) } catch { /* already gone */ }
  }
}

/** Find a document by name in a given destination (for duplicate detection). */
export function findDuplicate(
  name: string,
  destination: DocumentDestination,
): KivoraDocument | undefined {
  const lower = name.toLowerCase()
  return _docs.find(d => {
    if (d.name.toLowerCase() !== lower) return false
    if (d.module !== destination.module)  return false
    if (destination.module === 'notes'   && d.folder     !== destination.folder)     return false
    if (destination.module === 'school'  && d.subjectId  !== destination.subjectId)  return false
    return true
  })
}

export function getAllDocuments(): KivoraDocument[] { return _docs }

export function getDocumentById(id: string): KivoraDocument | undefined {
  return _docs.find(d => d.id === id)
}

// ── React hooks ───────────────────────────────────────────────────────────────

export function subscribeDocuments(cb: Listener): () => void {
  _listeners.add(cb)
  return () => _listeners.delete(cb)
}

export function useDocuments(): KivoraDocument[] {
  const [docs, setDocs] = useState<KivoraDocument[]>(_docs)
  useEffect(() => {
    setDocs([..._docs])
    return subscribeDocuments(() => setDocs([..._docs]))
  }, [])
  return docs
}

export function useDocumentsLoading(): boolean {
  const [loading, setLoad] = useState(_loading)
  useEffect(() => {
    const fn = (v: boolean) => setLoad(v)
    _loadingListeners.add(fn)
    return () => { _loadingListeners.delete(fn) }
  }, [])
  return loading
}
