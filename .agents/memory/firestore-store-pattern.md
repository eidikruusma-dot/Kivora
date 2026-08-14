---
name: Firestore store pattern
description: Template for all Kivora Firestore module stores (tasks, goals, calendar, notes, AI, school)
---

## Rule
Every store in `src/lib/` follows this exact singleton pattern. New stores MUST match it.

**Why:** Consistency makes AuthContext wiring, testing, and debugging predictable across all modules.

## Template structure
```ts
// Module-level singletons
let _data: T[] = []
let _loading = false
let _currentUid: string | null = null
let _unsubscribe: Unsubscribe | null = null
const _listeners = new Set<(items: T[]) => void>()
const _loadingListeners = new Set<(v: boolean) => void>()

// initXxxStore(uid | null): idempotent, tears down old listener, opens new onSnapshot
// onSnapshot success: updates _data, emits to listeners, sets _loading = false
// CRUD functions: async, guard on _currentUid, use setDoc/updateDoc/deleteDoc
// useXxx() hook: subscribes to listener set, initializes from _data on mount
// useXxxLoading() hook: same pattern for loading boolean
```

## AuthContext wiring
Every `initXxxStore(uid)` call lives in `onAuthStateChanged` in `src/context/AuthContext.tsx`. Adding a new store requires adding its `initXxxStore` call there. Pass `uid` from Firebase auth (or `null` on sign-out).

## Firestore paths
| Module      | Path                                    |
|-------------|----------------------------------------|
| Tasks       | users/{uid}/tasks/{taskId}             |
| Goals       | users/{uid}/goals/{goalId}             |
| Calendar    | users/{uid}/calendarEvents/{eventId}   |
| Notes       | users/{uid}/notes/{noteId}             |
| AI chats    | users/{uid}/aiConversations/{chatId}   |
| School      | users/{uid}/schoolItems/{itemId}       |
