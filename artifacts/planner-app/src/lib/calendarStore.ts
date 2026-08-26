import { useState, useEffect } from "react";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { MockCalendarEvent } from "@/lib/calendar/eventLayout";

// ── Local pub/sub ───────────────────────────────────────────────────────────
type Listener = (events: MockCalendarEvent[]) => void;
type LoadingListener = (loading: boolean) => void;

// ── Module-level state ──────────────────────────────────────────────────────
let _events: MockCalendarEvent[] = [];
let _loading = false;
let _currentUid: string | null = null;
let _unsubscribe: Unsubscribe | null = null;

const _listeners = new Set<Listener>();
const _loadingListeners = new Set<LoadingListener>();

function emit() {
  for (const l of _listeners) l(_events);
}

function setLoading(v: boolean) {
  _loading = v;
  for (const l of _loadingListeners) l(v);
}

// ── Firestore paths ─────────────────────────────────────────────────────────
function eventsCol(uid: string) {
  return collection(db, "users", uid, "calendarEvents");
}

// Exported so other stores (e.g. tasksStore's delete cascade) can build a
// reference to a calendar event doc to include in their own writeBatch,
// without duplicating this collection's path segments.
export function eventDoc(uid: string, id: string) {
  return doc(db, "users", uid, "calendarEvents", id);
}

// ── Initialisation ──────────────────────────────────────────────────────────
export function initCalendarStore(uid: string | null): void {
  if (uid === _currentUid) return;

  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }

  _currentUid = uid;
  _events = [];
  emit();

  if (!uid) {
    setLoading(false);
    return;
  }

  setLoading(true);

  _unsubscribe = onSnapshot(
    eventsCol(uid),
    (snap) => {
      _events = snap.docs.map((d) => d.data() as MockCalendarEvent);
      emit();
      setLoading(false);
    },
    () => {
      setLoading(false);
    },
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

import { sanitizeForFirestore } from '@/lib/firestoreUtils'

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function addCalendarEvent(
  event: MockCalendarEvent,
): Promise<MockCalendarEvent> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: calendar store has no authenticated user')
  await setDoc(eventDoc(_currentUid, event.id), sanitizeForFirestore(event));
  return event;
}

export async function updateCalendarEvent(
  updated: MockCalendarEvent,
): Promise<void> {
  if (!_currentUid) return;
  await setDoc(eventDoc(_currentUid, updated.id), sanitizeForFirestore(updated));
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  if (!_currentUid) return;
  await deleteDoc(eventDoc(_currentUid, id));
}

// ── Sync read ────────────────────────────────────────────────────────────────
export function getAllEvents(): MockCalendarEvent[] {
  return _events;
}

// ── React hooks ──────────────────────────────────────────────────────────────

export function useCalendarEvents(): MockCalendarEvent[] {
  const [state, setState] = useState<MockCalendarEvent[]>(_events);
  useEffect(() => {
    setState(_events);
    const l: Listener = (e) => setState(e);
    _listeners.add(l);
    return () => {
      _listeners.delete(l);
    };
  }, []);
  return state;
}

export function useCalendarLoading(): boolean {
  const [state, setState] = useState<boolean>(_loading);
  useEffect(() => {
    setState(_loading);
    const l: LoadingListener = (v) => setState(v);
    _loadingListeners.add(l);
    return () => {
      _loadingListeners.delete(l);
    };
  }, []);
  return state;
}
