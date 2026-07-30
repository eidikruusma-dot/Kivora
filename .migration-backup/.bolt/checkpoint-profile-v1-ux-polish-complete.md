# Profile V1 – UX Polish Complete

**Kuupäev:** 2026-07-23
**Staatus:** Lõpetatud, ootab kinnitust

## Tehtud muudatused

### 1. Ühtlustatud "Muuda" nupu asukoht
- **ProfileOverview.tsx** — "Muuda" nupp tõsteti avatarirea paremasse serva, samasse positsiooni nagu PreferencesSection sektsiooni päises. Mõlemad kaardid nüüd visuaalselt identse paigutusega.

### 2. Accessibility parandused
- **ProfilePage.tsx** — teadete bändile lisatud `role="alert"` ja `aria-live="assertive"`. Sulgemisnupule lisatud `aria-label="Sulge teade"` ja suurem puutepind (w-6 h-6).
- **ProfileOverview.tsx** — profiilipildi hover-overlay muudetud päris `<button>` elemendiks `aria-label="Muuda profiilipilti"` ja `focus:opacity-100` klassiga. Avatarile enam ei anta `onClick`-i, nii et kattuvaid klikitavaid kihte pole.

### 3. Eemaldatud dubleerimine
- **Uus fail:** `src/lib/profileConstants.ts` — ühtne allikas kõigile jagatud konstantidele:
  - `PLAN_LABEL`
  - `SUPPORTED_LANGUAGES` + `LANGUAGE_LABELS`
  - `START_OF_WEEK_OPTIONS` + `START_OF_WEEK_LABELS`
  - `TIME_FORMAT_OPTIONS` + `TIME_FORMAT_LABELS`
  - `DATE_FORMAT_OPTIONS` + `DATE_FORMAT_LABELS`
- **ProfileEditForm.tsx** — eemaldatud kohalikud `SUPPORTED_LANGUAGES` ja `PLAN_LABEL`, imporditakse ühisest failist.
- **PreferencesSection.tsx** — eemaldatud kohalikud labelite mapid, imporditakse ühisest failist.
- **PreferencesEditForm.tsx** — eemaldatud kohalikud optionsite massiivid, imporditakse ühisest fileist.

### 4. Eemaldatud surnud UI
- **ProfilePhotoUploader.tsx** — eemaldatud "Pilt salvestatud" edukuse bänd, mida kasutaja praktiliselt kunagi ei näinud (vaade sulgus kohe). Edasi kasutatakse ainult lehe tasemel edukuse teadet. Eemaldatud ka vastav `Check` import.

### 5. Salvestamise käitumise ühtlustamine
- **ProfileEditForm.tsx** — "Salvesta" nupp on nüüd keelatud, kui muudatusi pole (`!isDirty`), samamoodi nagu PreferencesEditForm-is. Varem lubas Personal Data vorm salvestada isegi muudetud andmeteta.

## Muudetud failid

| Fail | Muudatus |
|------|----------|
| `src/lib/profileConstants.ts` | **Uus** — ühised konstandid |
| `src/components/profile/ProfileOverview.tsx | "Muuda" nupu asukoht ühtlustatud, avatar overlay ligipääsetavus |
| `src/components/profile/ProfileEditForm.tsx` | Impordid ühisest failist, Salvesta keelatud kui !isDirty |
| `src/components/profile/PreferencesSection.tsx` | Impordid ühisest failist |
| `src/components/profile/PreferencesEditForm.tsx` | Impordid ühisest failist |
| `src/components/profile/ProfilePhotoUploader.tsx` | Eemaldatud surnud edukuse bänd ja Check import |
| `src/views/ProfilePage.tsx` | Teadete bändile role/aria-live, sulgemisnupule aria-label |

## Verifikatsioon

- **npm run build:** edukas (exit 0)
- **tsc --noEmit:** edukas (exit 0, vigu ei leitud)

## Testnimekiri

1. Profiili vaade: "Muuda" nupp asub mõlemas sektsioonis samas kohas (päise paremas servas)
2. Profiili vaade: avatar hover näitab "Muuda pilti" overlay-d, klõps avab foto üleslaadija
3. Profiili vaade: avatar hover overlay on klahvistuuga fookustatav (Tab), fookuses nähtav
4. Teadete bänd: edukuse/viga teade ilmub ja ekraanilugeja teatab sellest (role/aria-live)
5. Teadete bänd: sulgemisnupul on aria-label ja piisav puutepind
6. Personal Data redigeerimine: "Salvesta" on keelatud, kui ühtegi välja pole muudetud
7. Preferences redigeerimine: "Salvesta" on keelatud, kui ühtegi välja pole muudetud (nii jäi)
8. Foto üleslaadimine: pärast salvestamist ilmub lehe tasemel edukuse teade (mitte üleslaadija sees)
9. Ehitus ja tüübi kontroll läbivad

## Mitte-tehtud (kinnitatud piirangud)

- Pakett ja Konto loodud väljad jäävad nähtavale nii vaate kui redigeerimise vormides
- Sektsioone ei ühendatud üheks vormiks
- Uusi funktsioone ei lisatud
- Arhitektuuri, Firestore andmemudelit, Authentication V1 ega Storage'i ei muudetud

## Järgmine samm

Ootab kinnitust enne järgmise profiilietapi alustamist.
