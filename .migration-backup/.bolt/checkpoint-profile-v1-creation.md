# Profile V1 — Creation

## Status
- Profile V1 – Creation Complete (confirmed)
- Build: PASS
- Typecheck: PASS

## What was built
Automatic Firestore profile creation for every authenticated user.

## Files created
- `src/types/index.ts` — added `UserProfile` type
- `src/lib/userProfile.ts` — `ensureUserProfile(user)` service function
- `firestore.rules` — Firestore security rules (owner-only access)

## Files modified
- `src/lib/firebase.ts` — added Firestore `getFirestore` export
- `src/context/AuthContext.tsx` — call `ensureUserProfile` on every auth state change

## Firestore schema
Collection: `users`
Document ID: `{uid}`

Fields:
- uid: string
- displayName: string
- email: string
- photoURL: string | null
- preferredLanguage: string ("et")
- timezone: string (IANA, from browser)
- createdAt: serverTimestamp()
- updatedAt: serverTimestamp()

## Security rules
- read: owner only (uid == auth.uid)
- create: owner only
- update: owner only
- delete: owner only
- all other collections: denied

## Test checklist
- [ ] Email registration → profile created in Firestore
- [ ] Google sign-in → profile created with Google displayName
- [ ] Existing user login (no profile) → profile created on next login
- [ ] Existing user login (profile exists) → NOT overwritten
- [ ] Second login (profile exists) → NOT overwritten
- [ ] User cannot read another user's profile
- [ ] User cannot write another user's profile

## Not built (per spec)
- Profile editing view
- Profile photo upload
- Account deletion
- Email change
- Password change
- Plan change
- Privacy settings UI
- Notification preferences UI
