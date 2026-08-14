---
name: Firestore sanitizer
description: Shared recursive sanitizeForFirestore helper — where it lives and which stores apply it.
---

# Firestore sanitizer

**Rule:** Every Firestore `setDoc`/`addDoc` call must wrap its payload in `sanitizeForFirestore()` before writing.

**Why:** Firestore rejects payloads containing `undefined` values with "Unsupported field value: undefined". TypeScript optional fields (e.g. `time?: string`, `notes?: string`) pass through as `undefined` when not set.

**Where it lives:** `artifacts/planner-app/src/lib/firestoreUtils.ts` — `sanitizeForFirestore<T>(value: T): T`

**Recursive:** Handles nested objects and arrays. The old version in calendarStore.ts was top-level only; the shared version is recursive.

**Applied to:**
- tasksStore.ts — addTask, updateTask
- quickNotesStore.ts — addQuickNote, addNote, updateNote, toggleStar
- goalsStore.ts — addGoal, updateGoal (and all step operations via setDoc)
- schoolStore.tsx — addSchoolTask (via taskToStored), addSchoolExam
- aiConversationsStore.ts — saveChat (also sanitizes each message individually)
- entityLinksStore.ts — addLink's setDoc call
- calendarStore.ts — already applied; now imports from firestoreUtils instead of local function

**Habits:** habitsStore.ts is in-memory only (no Firestore writes) — no sanitize needed there.

**How to apply:** Import from firestoreUtils: `import { sanitizeForFirestore } from '@/lib/firestoreUtils'` then wrap: `await setDoc(ref, sanitizeForFirestore(payload))`
