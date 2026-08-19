---
name: Link suggestions engine
description: Scoring rules, confidence thresholds, dismiss storage, and component integration for the smart link suggestions system.
---

## Files
- `src/lib/linkSuggestions.ts` — pure scoring engine + localStorage helpers
- `src/components/links/SuggestedLinksPanel.tsx` — renders above LinkedItemsPanel

## Scoring (0–1, capped)
| Signal | Score added |
|--------|-------------|
| ≥3 shared tokens (title+context) | +0.55 |
| 2 shared tokens | +0.40 |
| 1 shared token | +0.22 |
| Exact category/subject/folder match | +0.30 |
| Date within 3 days | +0.25 |
| Date within 7 days | +0.20 |
| Date within 14 days | +0.10 |

**Threshold:** show ≥ 0.20, high-confidence (auto-linkable) ≥ 0.65.

**Why 0.65 for high-confidence:** requires at least word overlap + category match (0.22 + 0.30 = 0.52) plus a small date boost, or 2 shared words + category (0.40 + 0.30 = 0.70). Single-keyword matches alone never auto-link.

## Dismiss storage
Key: `kv-link-dismissed:${type}:${entityId}` in localStorage.
Value: JSON array of `"${candidateType}:${candidateId}"` strings.
Helpers: `loadDismissed()` / `saveDismissed()` in linkSuggestions.ts.

## Reactivity
SuggestedLinksPanel uses `useLinksForEntity` (which triggers on Firestore onSnapshot) as a dependency in its `useMemo` — suggestions automatically exclude newly added links without extra subscriptions.

## LinkedItemsPanel integration
SuggestedLinksPanel is embedded at the top of LinkedItemsPanel, above the header row. Remove buttons are always visible (no `opacity-0 group-hover` hiding).

## Calendar sanitization (calendarStore.ts)
`sanitizeForFirestore<T>(obj: T)` strips all `undefined` keys before setDoc. Applied to both addCalendarEvent and updateCalendarEvent. Prevents Firestore "unsupported field value: undefined" errors.
