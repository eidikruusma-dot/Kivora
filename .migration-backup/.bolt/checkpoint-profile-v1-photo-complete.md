# Profile V1 – Photo Complete

**Kuupäev:** 2026-07-23
**Etapp:** Profile V1 – Etapp 3: Profiilipilt
**Staatus:** Lõpetatud, kinnitamise ootel

## Loodud failid

| Fail | Otstarve |
|---|---|
| `src/components/ui/Avatar.tsx` | Ühine avatari komponent (pilt / initsiaal fallback, 3 suurust: sm/md/lg, hover-overlay tugi) |
| `src/components/profile/ProfilePhotoUploader.tsx` | Faili valimine, eelvaade, üleslaadimine, eemaldamine, vea- ja laadimiseolekud |
| `src/lib/profilePhoto.ts` | Storage teenus: `uploadProfilePhoto(uid, file, oldPhotoURL)`, `deleteProfilePhoto(uid, oldPhotoURL)` |
| `src/lib/processImage.ts` | Canvas API pilditöötlus: ruutkärpe, 512×512, WebP eelis / JPEG fallback, EXIF eemaldamine |
| `storage.rules` | Firebase Storage turvareeglid (ainult omanikule) |

## Muudetud failid

| Fail | Muudatus |
|---|---|
| `src/lib/firebase.ts` | Lisatud `getStorage(app)` eksport |
| `src/lib/userProfile.ts` | `UserProfileUpdate` lisatud `photoURL?: string \| null`; `updateUserProfile` edastab `photoURL` |
| `src/components/profile/ProfileOverview.tsx` | Inline avatari asendatud `<Avatar>`-ga; lisatud hover-overlay "Muuda pilti" |
| `src/components/profile/ProfileEditForm.tsx` | Inline avatari asendatud `<Avatar>`-ga; `Intl.supportedValuesOf` typecast lisatud |
| `src/components/layout/Header.tsx` | Inline avatari asendatud `<Avatar>`-ga |
| `src/views/ProfilePage.tsx` | `ProfilePhotoUploader` integratsioon; photoURL salvestamine/eemaldamine; Firebase Auth sünkroniseerimine |
| `firestore.rules` | `photoURL` muutunud lubatud väljaks; valideerimine lisatud (string või puudub) |

## Lõplik Storage tee

```
users/{uid}/profile/avatar-{timestamp}.webp
users/{uid}/profile/avatar-{timestamp}.jpg   (JPEG fallback)
```

## Pildi töötlemise loogika

1. Faili valideerimine: MIME tüüp (JPEG/PNG/WebP), suurus ≤ 5 MB
2. `createImageBitmap(file)` laadimine
3. Ruudukujuline kärpe (keskendatud, `min(width, height)`)
4. Canvas 512×512 px
5. WebP eksport (`canvas.toBlob('image/webp', 0.85)`) — kui brauer toetab
6. JPEG fallback (`canvas.toBlob('image/jpeg', 0.85)`) — kui WebP ebaõnnestub
7. Tagastab `{ blob, extension }` — algfaili ei salvestata
8. EXIF metaandmed eemaldatakse (Canvas API ei säilita neid)

## Firestore'i turvareeglid

- `photoURL` eemaldatud lukustatud väljade nimekirjast
- `photoURL` lisatud `affectedKeys().hasOnly(...)` nimekirja
- `photoURL` valideerimine: `is string || !('photoURL' in request.resource.data)`
- Create reegel: `photoURL` valideerimine lisatud
- `uid`, `email`, `createdAt` jäävad lukustatuks

## Storage'i turvareeglid

- Lugemine: `request.auth.uid == uid` (ainult omanik)
- Kirjutamine: `request.auth.uid == uid` + `contentType.matches('image/(jpeg|png|webp)')` + `size < 5 MB`
- Kõik muud teed: `allow read, write: if false`

## Osaliste ebaõnnestumiste käsitlemine

1. **Storage õnnestub, Firestore ebaõnnestub:** uus fail kustutatakse (`deleteObject(newRef)`)
2. **Vana pildi kustutamine:** alles pärast Firestore'i uuendamise õnnestumist (best-effort)
3. **Kustutamise ebaõnnestumine:** orb-fail jääb, kuid ei mõjuta kasutajat (best-effort)
4. **Katkestatud üleslaadimine:** vana pilt jääb alles (versioonitud failinime tõttu)

## Avataride kohese uuendamise mehhanism

1. `ProfilePage.handlePhotoChange()` uuendab kohalikku `profile` state-i
2. `updateProfile(user, { photoURL })` sünkroniseerib Firebase Authi
3. `reloadUser()` uuendab `user` objekti AuthContextis
4. Kõik komponendid, mis kasutavad `useAuth().user.photoURL` (Header) või `profile.photoURL` (ProfileOverview, ProfileEditForm), uuenevad React re-renderi kaudu
5. Lehe värskendamist ei vaja

## Testnimekiri

- [ ] **T1:** Avatar kuvab fallback initsiaali kui photoURL puudub
- [ ] **T2:** Avatar kuvab pilti kui photoURL on olemas
- [ ] **T3:** Headeri avatar uueneb pärast salvestamist ilma lehe värskenduseta
- [ ] **T4:** Profiili avatar uueneb pärast salvestamist ilma lehe värskenduseta
- [ ] **T5:** Hover-overlay "Muuda pilti" ilmub profiilivaates
- [ ] **T6:** Faili valimine kuvab eelvaate
- [ ] **T7:** "Loobu eelvaatest" tühistab eelvaate
- [ ] **T8:** "Salvesta pilt" laeb üles ja uuendab avatari
- [ ] **T9:** "Eemalda pilt" kustutab pildi ja kuvab fallback avatari
- [ ] **T10:** SVG faili valimine annab veateate
- [ ] **T11:** GIF faili valimine annab veateate
- [ ] **T12:** Üle 5 MB faili valimine annab veateate
- [ ] **T13:** Vale MIME tüübi fail annab veateate
- [ ] **T14:** "Sulge" nupp sulgeb üleslaadija
- [ ] **T15:** Profiili muutmine (displayName, keel, ajavöönd) töötab endiselt
- [ ] **T16:** Sisselogimine ja registreerimine töötavad endiselt
- [ ] **T17:** Firebase Console Storage aktiveeritud (käsitsi kontrollimisel)

## Build ja typecheck

- `npm run typecheck`: **läbitud** (exit 0)
- `npm run build`: **läbitud** (exit 0)

## Varasemad etappid

- Profile V1 – Creation: puutumata
- Profile V1 – Editing: puutumata (ainult `Intl.supportedValuesOf` typecast lisatud typecheck vea parandamiseks)
- Authentication V1: puutumata

## Enne testimist

Kontrolli, et Firebase Console → Storage on aktiveeritud. Kui pole:
1. Ava [Firebase Console](https://console.firebase.google.com)
2. Vali projekt `kivora-f1281`
3. Vasakus menüüs klõpsa "Storage"
4. Klõpsa "Get started"
5. Vali production mode
5. Avalda `storage.rules` faili sisu Firebase Console → Storage → Rules
6. Avalda `firestore.rules` faili sisu Firebase Console → Firestore → Rules
