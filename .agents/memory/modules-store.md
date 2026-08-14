---
name: Modules store
description: Per-user module visibility system — architecture, persistence, new-user detection, and integration points
---

# Modules store

## Rule
`modulesStore.ts` is the single source of truth for which Kivora modules are enabled per user. All visibility decisions (Sidebar, Dashboard, ProtectedRoute) read from this store. Never duplicate the logic elsewhere.

**Why:** Modules must stay in sync across Sidebar, Dashboard, and ProtectedRoute without prop-drilling or duplication.

**How to apply:** Import `useModules()` in any component that needs to conditionally show/hide module-related UI.

---

## Data shape
Firestore path: `users/{uid}/settings/modules`  
Document: `ModuleSettings` — one boolean per module (`calendar`, `tasks`, `notes`, `habits`, `goals`, `finance`, `school`, `assistant`) + `onboardingComplete: boolean`.

Default (all `true`, `onboardingComplete: true`) is the safe fallback for existing users who have no doc.

---

## New-user detection
`ensureModulesInitialized(uid, creationTime)` is called from `AuthContext.onAuthStateChanged` after `ensureUserProfile`. If the doc does NOT exist:
- Account created < 24 h ago → `onboardingComplete: false` (sends to /onboarding)
- Account older → all modules on, `onboardingComplete: true` (skips onboarding)

This means existing users are never forced through onboarding.

---

## Onboarding route
`/onboarding` → `ModuleSelectionPage` wrapped in `<ProtectedRoute skipOnboarding>`.  
`skipOnboarding` prop prevents the redirect loop: onboarding route itself bypasses the onboarding check.

---

## Sidebar redirect-on-disable
`Sidebar.tsx` has a `useEffect` that watches `modules` + `location.pathname`. If the current route's module becomes disabled, it immediately navigates to `/app`. This prevents blank pages.

---

## Dashboard layout
`Dashboard.tsx` builds `row1` and `row2` arrays dynamically from enabled modules. Uses inline `gridTemplateColumns: repeat(N, ...)` so the grid auto-adapts without needing static Tailwind classes.

- `QuickActionsWidget` is always in row2 (never hidden).
- If both rows are empty, the dashboard shows only the HeroCard.

---

## Settings entry point
Settings → App section → "Modules" card (routeKey: `'Moodulid'`) → `ModulesPage`.  
Changes save immediately on toggle (no explicit save button). The save indicator shows a spinner then a green checkmark.
