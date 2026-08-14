# Profile V1 — Editing

## Status
- Profile V1 – Editing Complete
- Build: PASS
- Typecheck: PASS (vite build)

## What was built
Profile viewing and editing for authenticated users. Users can view their Firestore profile and edit displayName, preferredLanguage, and timezone. Email is read-only. Avatar is displayed but upload is not built.

## Loodavad failid (created)
- `src/views/ProfilePage.tsx` — konteiner: laadimine, olekuhaldus, vorm/ülevaate vahetus, salvestamata muudatuste kaitse
- `src/components/profile/ProfileHeader.tsx` — pealkirja ja tagasi-nupu riba
- `src/components/profile/ProfileOverview.tsx` — loetav profiiliülevaade (väljad + avatar)
- `src/components/profile/ProfileEditForm.tsx` — muudetav vorm + valideerimine + salvestamise olek

## Muudetavad failid (modified)
- `src/lib/userProfile.ts` — lisatud `getUserProfile(uid)` ja `updateUserProfile(uid, changes)` teenusfunktsioonid
- `src/App.tsx` — lisatud `/app/profile` marsruut (samas struktuuris nagu teised `/app/*` routes)
- `src/components/layout/Header.tsx` — "Minu profiil" nupp navigeerib `/app/profile`
- `firestore.rules` — täiendatud väljatasemel kaitsega

## Lõplik andmevoog
1. Kasutaja klõpsab Header dropdownis "Minu profiil" → navigeerib `/app/profile`
2. `ProfilePage` laadib `getUserProfile(user.uid)` → Firestore `users/{uid}` dokument
3. Kuvatakse `ProfileOverview` (nimi, email, keel, ajavöönd, avatar)
4. Kasutaja klõpsab "Muuda" → `ProfileEditForm` avaneb sama lehe sees
5. Vorm eeltäidetakse kehtivate väärtustega
6. Kasutaja muudab välju → `onDirtyChange(true)` aktiveerib beforeunload + router blocker
7. Klõps "Salvesta" → valideerimine → `updateUserProfile(uid, changes)` → Firestore `updateDoc`
8. Edu korral: `updateProfile(user, { displayName })` → `reloadUser()` → AuthContext värskendub
9. Kui Authi nime uuendamine ebaõnnestub: Firestore salvestatud, kuvatakse hoiatusteade
10. Edu: inline kinnitus + naaseb ülevaatele

## Lõplikud Firestore turvareeglid
- **read**: omanik (uid == auth.uid)
- **create**: omanik, nõutud väljad ja valideerimine
- **update**: omanik, `affectedKeys().hasOnly(['displayName','preferredLanguage','timezone','updatedAt'])`, lukustatud väljad (uid, email, photoURL, createdAt) ei tohi muutuda, väljavalideerimine
- **delete**: omanik
- Väljaspool `users/{uid}` kõik keelatud

## Valideerimisreeglid
- `displayName`: trimmitud > 0 ja ≤ 40 tähemärki
- `preferredLanguage`: 'et' või 'en'
- `timezone`: kehtiv IANA ajavöönd (`Intl.supportedValuesOf('timeZone')` fallback loendiga)

## Salvestamata muudatuste kaitse
- `beforeunload` event (lehe värskendamine/sulgemine)
- `useBlocker` (React Router v7 rakendusesisene navigeerimine)
- "Loobu" nupu kinnitus ainult siis, kui vorm on dirty

## Testnimekiri
- [ ] Profiili vaade avaneb `/app/profile` (ProtectedRoute all)
- [ ] Firestore profiil laaditakse ja kuvatakse
- [ ] "Muuda" avab vormi eeltäidetud väärtustega
- [ ] displayName valideerimine (tühi, > 40 märki)
- [ ] Keel ja ajavöönd select töötavad
- [ ] Salvestamine uuendab Firestore dokumendi
- [ ] Edu kinnitus kuvatakse
- [ ] Firebase Auth displayName sünkroniseeritakse
- [ ] Authi nime uuendamise ebaõnnestumine: hoiatusteade, Firestore salvestatud
- [ ] Loobu nupp: kinnitus ainult dirty vormi korral
- [ ] beforeunload hoiatus dirty vormi korral
- [ ] Router blocker hoiatab rakendusesisesel navigeerimisel
- [ ] Email väli on ainult loetav
- [ ] Avatar kuvatakse, üleslaadimist ei ole
- [ ] uid, email, createdAt, photoURL ei muutu
- [ ] Authentication V1 ja Profile Creation loogika toimib endiselt

## Selles etapis ei ehitatud
- Profiilipildi üleslaadimine
- E-posti muutmine
- Parooli muutmine
- Konto kustutamine
- Privaatsusseaded
- Teavituseelistused
- Andmete eksport
- Tume režiim

## Kinnitus
- Authentication V1 loogikat ei muudetud
- Profile Creation (`ensureUserProfile`) loogikat ei muudetud
- `firestore.rules` täiendatud, create reeglid lasevad `ensureUserProfile` endiselt läbi
