# Checkpoint: Profile V1 — Personal Data

**Kuupäev:** 2026-07-23
**Staatus:** Lukustatud lõplikult (kinnitatud 2026-07-23, UI kontrollitud)

## Lisatud väljad

- **Konto loodud** — kuvab profiili loomise kuupäeva (Firestore `createdAt` väli, vormindatud Eesti lokaadiga)
- **Pakett** — ajutine UI väärtus "Tasuta" (ei salvestu Firestore'i)

## Muudetud failid

- `src/components/profile/ProfileOverview.tsx` — lisatud "Konto loodud" ja "Pakett" väljad

## Kinnitatud kontrollpunktid

- Pakett kuvatakse väärtusega "Tasuta"
- Konto loodud kuvatakse korrektses eesti kuupäeva vormingus
- Mõlemad väljad on ainult loetavad
- Profiilipilt töötab
- Olemasolevad profiiliandmed jäid muutmata
- Firestore'i andmemudel jäi muutmata
- Authentication V1 jäi muutmata
- Storage ja profiilipildi loogika jäid muutmata
- Build ja typecheck läbisid

## Piirangud

- Authentication V1 — muutmata
- Firestore andmemudel — muutmata (uusi välju ei lisatud)
- `plan` välja Firestore'i ei lisatud
- Storage — muitmata
- Profile Photo loogika — muutmata
- Kasutatud olemasolevad Profile komponendid
