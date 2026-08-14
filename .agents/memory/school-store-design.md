---
name: School store design
description: Key decisions and constraints for the school module Firestore store (schoolStore.tsx)
---

## Rule
`schoolStore.tsx` must be a `.tsx` file (not `.ts`) because it creates JSX elements for icon reconstruction.

**Why:** Task and Subject types have `subjectIcon`/`icon: React.ReactNode` fields. These can't be stored in Firestore. The store reconstructs them from color hex strings using JSX (`<BookOpen size={16} strokeWidth={1.8} />`). JSX requires a `.tsx` file.

**How to apply:** Any future edits to `src/lib/schoolStore.tsx` that add icon types must continue using this file's JSX transform.

## Icon reconstruction pattern
Icons are NOT stored in Firestore. They are rebuilt on every `onSnapshot` read via `iconFromColor(colorHex)` which maps the 5 SUBJECT_PALETTE colors to their corresponding lucide icons. Default fallback: `<BookOpen>`.

## daysLeft is computed, not stored
`ExamItem.daysLeft` is computed from `date` on every snapshot read using `computeDaysLeft()`. It is never written to Firestore. The page's old `useEffect` that recalculated daysLeft on mount was removed — the store handles this.

## Single collection, kind discriminator
All 4 entity types (task, exam, subject, lesson) live in `users/{uid}/schoolItems/{itemId}` with a `kind: 'task' | 'exam' | 'subject' | 'lesson'` field. Document IDs: `task-${id}`, `exam-${id}`, `subject-${subjectId}`, `lesson-${lessonId}`.

## Structural type compatibility
The store defines internal types (`SchoolTask`, `SchoolExam`, `SchoolSubject`, `SchoolLesson`) that are structurally identical to SchoolPage's local types. TypeScript's structural typing allows the page to use store hook results as its own local types without explicit casts or shared type imports.

## markSchoolTaskUndone pattern
Pass `prevProgress: undefined` into `taskToStored()` — the helper's conditional spread `(t.prevProgress !== undefined ? { prevProgress: t.prevProgress } : {})` then omits the field from the Firestore write, achieving a clean field removal via `setDoc` full-replace semantics.
