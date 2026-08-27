import { useState, useEffect } from "react";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sanitizeForFirestore } from "@/lib/firestoreUtils";

// User-created calendars (e.g. via the "Uus kalender" action), separate
// from the fixed built-in calendars declared in CalendarPage.tsx and from
// calendarStore.ts, which stores calendar *events*, not calendar
// *definitions*.
export interface UserCalendar {
  id: string;
  label: string;
  color: string;
}

// ── Local pub/sub ───────────────────────────────────────────────────────────
type Listener = (calendars: UserCalendar[]) => void;

// ── Module-level state ──────────────────────────────────────────────────────
let _calendars: UserCalendar[] = [];
let _currentUid: string | null = null;
let _unsubscribe: Unsubscribe | null = null;

const _listeners = new Set<Listener>();

function emit() {
  for (const l of _listeners) l(_calendars);
}

// ── Firestore paths ─────────────────────────────────────────────────────────
function calendarsCol(uid: string) {
  return collection(db, "users", uid, "calendars");
}

function calendarDoc(uid: string, id: string) {
  return doc(db, "users", uid, "calendars", id);
}

// ── Initialisation ──────────────────────────────────────────────────────────
export function initUserCalendarsStore(uid: string | null): void {
  if (uid === _currentUid) return;

  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }

  _currentUid = uid;
  _calendars = [];
  emit();

  if (!uid) return;

  _unsubscribe = onSnapshot(calendarsCol(uid), (snap) => {
    _calendars = snap.docs.map((d) => d.data() as UserCalendar);
    emit();
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
export async function addUserCalendar(
  calendar: UserCalendar,
): Promise<UserCalendar> {
  if (!_currentUid) throw new Error('STORE_NOT_INITIALIZED: user calendars store has no authenticated user')
  await setDoc(calendarDoc(_currentUid, calendar.id), sanitizeForFirestore(calendar));
  return calendar;
}

// ── Sync read ────────────────────────────────────────────────────────────────
export function getAllUserCalendars(): UserCalendar[] {
  return _calendars;
}

// ── React hook ───────────────────────────────────────────────────────────────
export function useUserCalendars(): UserCalendar[] {
  const [state, setState] = useState<UserCalendar[]>(_calendars);
  useEffect(() => {
    setState(_calendars);
    const l: Listener = (c) => setState(c);
    _listeners.add(l);
    return () => {
      _listeners.delete(l);
    };
  }, []);
  return state;
}
