# Checkpoint: Profile V1 — Preferences (05_Eelistused)

**Kuupäev:** 2026-07-23
**Staatus:** Ehitatud, eeldab kinnitamist

## Lisatud väljad

- `preferences.startOfWeek` — `'monday' | 'sunday'` (vaikimisi: `'monday'`)
- `preferences.timeFormat` — `'24h' | '12h'` (vaikimisi: `'24h'`)
- `preferences.dateFormat` — `'DD.MM.YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'` (vaikimisi: `'DD.MM.YYYY'`)

## Firestore'i käitumine

- Eelistused salvestuvad olemasolevasse `users/{uid}` dokumenti `preferences` alamobjektina
- Alamkollektsiooni ei looda
- Olemasolevaid kasutajaid ei kirjutata automaatselt üle
- Puuduvate eelistuste korral kasutatakse runtime vaikimisi väärtusi (`getEffectivePreferences`)
- Firestore'i kirjutatakse alles siis, kui kasutaja salvestab eelistused
- `ensureUserProfile` lisab vaikeväärtused ainult täiesti uue kasutaja loomisel

## Komponendid

- `src/components/profile/PreferencesSection.tsx` — eelistuste kuvamine ülevaates (uus)
- `src/components/profile/PreferencesEditForm.tsx` — eelistuste muutmine (uus)
- `ProfileOverview.tsx` ja `ProfileEditForm.tsx` jäid muutmata (ainult isikuandmed)
- `ProfilePage.tsx` seob isikuandmete ja eelistuste sektsioonid kokku sõltumatu redigeerimisrežiimiga

## Muudetud failid

- `src/types/index.ts` — lisatud `UserPreferences`, `StartOfWeek`, `TimeFormat`, `DateFormat` tüübid; `UserProfile` laiendatud valikulise `preferences` väljaga
- `src/lib/userProfile.ts` — lisatud `DEFAULT_PREFERENCES`, `getEffectivePreferences`, `updateUserPreferences`; `ensureUserProfile` lisab vaikeväärtused uue kasutaja loomisel
- `src/components/profile/PreferencesSection.tsx` — uus komponent
- `src/components/profile/PreferencesEditForm.tsx` — uus komponent
- `src/views/ProfilePage.tsx` — eelistuste sektsiooni sidumine, sõltumatu salvestamisloogika

## Eemaldatud selles etapis

- `theme` — ei kuulu profiilietappi (tuleb Seaded → Välimus moodulisse)
- `notificationsEnabled` — ei kuulu profiili eelistustesse (tuleb eraldi Teavituste moodulisse)
- `plan` — jääb ajutiseks UI väärtuseks

## Piirangud

- Authentication V1 — muutmata
- Firestore Rules — muutmata
- Storage ja profiilipildi loogika — muutmata
- Olemasolevad profiiliväljad — muutmata

## Kontrollpunktid

- Build läbis (npm run build)
- Typecheck läbis (tsc --noEmit)
- `theme`, `notifications`, `plan` välju ei lisatud
- Eraldi komponendid loodud (PreferencesSection, PreferencesEditForm)
- ProfileOverview ja ProfileEditForm jäid muutmata
