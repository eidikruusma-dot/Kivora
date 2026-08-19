---
name: Automatic linking service
description: runAutomaticLinking() + AutoLinkToast — how automatic cross-module links are created and surfaced.
---

# Automatic linking service

## Service: automaticLinking.ts

`artifacts/planner-app/src/lib/automaticLinking.ts`

`runAutomaticLinking(type: EntityType, id: string, lang: AppLang): Promise<AutoLinkResult>`

Returns `{ linkIds: string[], calendarEventId: string | null }`.

**Flow:**
1. Calls `computeSuggestions(type, id, lang, new Set())` — empty dismissed set so nothing is skipped
2. Filters to `isHighConfidence === true` (score ≥ 0.65)
3. Calls `addLink()` for each — idempotent, won't duplicate
4. If entity has ISO `YYYY-MM-DD` date, no calendar link yet, and no duplicate event with same title+date exists → calls `addCalendarEvent` (calendarId: `'school'` for school entities, `'mine'` for all others)
5. Returns all created link IDs + calendarEventId for undo

## Toast: AutoLinkToast.tsx

`artifacts/planner-app/src/components/links/AutoLinkToast.tsx`

Fixed bottom-right non-blocking banner. Props: `linkIds`, `calendarEventId`, `lang`, `onClose`, `onViewLinks?`

- Auto-dismisses after 8 seconds
- Undo calls `removeLink()` for each linkId + `deleteCalendarEvent()` if calendarEventId is set
- Progress bar shows remaining dismiss time

## Page wiring pattern (all 7 pages)

Each page has TWO post-save states:
1. `postSave` → `PostSaveLinkSuggestionsDialog` (medium-confidence, modal)
2. `autoLink` → `AutoLinkToast` (high-confidence already linked, non-blocking)

Both can be visible simultaneously. AutoLinkToast is rendered at z-[70], PostSaveLinkSuggestionsDialog at z-[60].

Pattern in create handler:
```tsx
const result = await runAutomaticLinking(type, id, lang)
if (result.linkIds.length > 0) setAutoLink(result)
setPostSave({ type, id })
```

For synchronous stores (habits), use `.then()`:
```tsx
runAutomaticLinking('habit', habit.id, lang).then((r) => { if (r.linkIds.length > 0) setAutoLink(r) })
```

## Why postSave still matters after auto-linking

PostSaveLinkSuggestionsDialog only shows items score 0.20–0.65. After auto-linking runs and creates the high-confidence links, those items are excluded from `computeSuggestions` (already linked). The dialog shows the remaining medium-confidence items. If none remain, it auto-closes immediately.
