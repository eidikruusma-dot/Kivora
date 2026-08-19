---
name: Entity links system
description: Unified cross-module linking system for Kivora — schema, store, resolver, UI components, and integration points.
---

## Rule
All cross-module links live in `users/{uid}/entityLinks/{linkId}` via `src/lib/entityLinksStore.ts`. Never build one-off linking per module.

**Why:** Keeps link data normalised, single subscription, idempotent writes, and a single `LinkedItemsPanel` component reused everywhere.

**How to apply:** To add linking to a new module, import `LinkedItemsPanel` and drop it into the detail view. No new store or Firestore collection needed.

---

## Schema (`src/types/entityLinks.ts`)
- `EntityType`: `task | calendar | note | habit | goal | school | ai`
- `RelationType`: `related | scheduled | supports | createdFrom | belongsTo`
- `EntityLink`: `{ id, fromType, toType, fromId, toId, relationType, createdAt, updatedAt }`
- School IDs are compound: `encodeSchoolId(kind, rawId)` → `"task:42"`, `decodeSchoolId("task:42")` → `{ kind, rawId }`.

---

## Key files
- `src/types/entityLinks.ts` — types + school ID encode/decode helpers
- `src/lib/entityLinksStore.ts` — Firestore singleton; exports `addLink`, `removeLink`, `removeLinksForEntity`, `hasCalendarLink`, `useLinksForEntity`, `useEntityLinks`
- `src/lib/entityResolver.ts` — (EntityType, id) → `{ title, subtitle, bg, color }` using sync store getters
- `src/components/links/LinkedItemsPanel.tsx` — drop-in "Linked items" section; props: `type, entityId, lang`
- `src/components/links/LinkPickerModal.tsx` — modal to pick item + relation; handles calendar "create & link" flow

---

## Allowed targets per source type
```
task     → calendar, note, goal, habit, school
note     → task, calendar, goal, habit, school, ai
habit    → goal, calendar, note, task
goal     → task, habit, note, calendar, school
school   → calendar, note, task, goal
calendar → task, note, habit, goal, school
ai       → task, note, goal, habit, calendar, school
```

---

## Integration points (all done)
- `EventDetailsModal.tsx` — calendar events
- `NotesPage.tsx` — note detail overlay
- `AddTaskModal.tsx` — task edit mode (`initialTask` prop must be set)
- `SchoolPage.tsx` — `ExamDetailModal` + `TaskDetailModal` (both use `encodeSchoolId`)

---

## Deep-link navigation pattern
`LinkedItemsPanel` calls `navigate(TYPE_PATH[type], { state: { openId: id } })`.
Each target page has a `useEffect([location.key])` declared **after** the existing reset effect that:
1. Reads `(location.state as { openId?: string } | null)?.openId`
2. Calls `window.history.replaceState({ ...(window.history.state ?? {}), usr: null }, '')` to clear state without triggering another React Router render
3. Finds the entity in its local store snapshot and opens the detail modal

Order matters: the reset effect clears modals first, then the deep-link effect opens the target. React 18 batches both state updates in the same commit so the final state is "modal open".

HabitsPage has no detail modal — uses `highlightId` state + scroll-into-view + 2.5 s ring highlight instead.

## Firestore rules
`users/{uid}/entityLinks/{linkId}` owner-only rule already added to `firestore.rules`. Run `firebase deploy --only firestore:rules` to publish.

---

## habitsStore note
`useHabits()` was added to `src/lib/habitsStore.ts` in this session (it didn't have a React hook before). It follows the standard `useState + subscribeHabits` pattern.
