---
name: Firebase auth config
description: Confirmed production Firebase config values and web auth diagnosis
---

## Confirmed production values (extracted from live bundle at kivora.ee)

- **projectId**: `kivora-f1281`
- **authDomain**: `kivora-f1281.firebaseapp.com` ← correct; must NOT be changed to `kivora.ee`
- **storageBucket**: `kivora-f1281.firebasestorage.app`

## Auth handler URL

- Real handler: `https://kivora-f1281.firebaseapp.com/__/auth/handler`
- `kivora.ee/__/auth/handler` returns the SPA's `index.html` — kivora.ee is NOT on Firebase Hosting

## Diagnosed web auth breakage (Aug 2026)

Root cause: `kivora.ee` was not in Firebase Auth → Authentication → Settings → Authorized Domains.
Firebase throws `auth/unauthorized-domain` which was not in `errorMap`, so users saw only the generic fallback.

**Fix applied to code:**
- Added `auth/unauthorized-domain` to `firebaseErrors.ts` errorMap
- Unknown error codes now surface as `Sisselogimine ebaõnnestus (<code>)` instead of silent generic text
- Added `console.error('[Auth] ...')` in SocialButtons.tsx and AuthContext.tsx redirect handler (marked TODO: remove after confirmed working)

**Required console actions (user must do):**
1. Firebase Console → Authentication → Settings → Authorized Domains → Add `kivora.ee`
2. Facebook Developer Console → Facebook Login → Settings → Valid OAuth Redirect URIs → confirm `https://kivora-f1281.firebaseapp.com/__/auth/handler` is listed

**Why:**
- `authDomain` is `firebaseapp.com` so Firebase popup/redirect uses Firebase's own domain — no Replit proxy needed
- But Firebase still validates that the *initiating* origin (`kivora.ee`) is in the authorized domains list
