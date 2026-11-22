# Konto ja isikuandmete käsitsi kustutamise juhend (administraatorile)

See juhend on mõeldud kasutamiseks siis, kui Kivora kasutaja taotleb oma
konto ja kõigi isikuandmete kustutamist "Abi ja tugi" lehe kaudu, ja
rakenduse enda iseteenindus ("Andmete kustutamine" seadetes) on ajutiselt
piiratud (vt `accountDeletionService.ts`'s `checkAutomaticDeletionAvailability()`
ja `featureFlags.ts`'s kolme `ACCOUNT_DELETION_*` lippu).

See ei ole automatiseeritud protsess — iga samm tehakse käsitsi, enamik
ükshaaval, konkreetse kinnitusega enne pöördumatuid samme. Järgi samme
täpses järjekorras. Ära jäta vahele ühtegi kontrolli, isegi kui tundub
kiirem.

**Enne alustamist loe läbi terve see dokument.** Ära alusta punkti 3
(Firestore'i pöördumatu kustutamine) enne, kui punkt 1 (identiteedikontroll)
**ja** punkt 2 (Storage'i ligipääsu ja teostatavuse kontroll) on mõlemad
lõpetatud ja kinnitatud. Punkti 2 ei tohi vahele jätta ega "hiljem ära
teha" — Storage'i olukord peab olema teada **enne**, mitte pärast
Firestore'i andmete pöördumatut kustutamist.

---

## 1. Kustutamistaotluse vastuvõtmine ja kasutaja turvaline tuvastamine

### 1.1 Mis jõuab sinuni ja mida see EI tõenda

Kui kasutaja saadab "Abi ja tugi" lehelt sõnumi, jõuab sinuni e-kiri
aadressilt `support@kivora.ee`, teemaga `[Support] New message from Help
& Support`. **Selle kirja sisu sisaldab ainult kasutaja sõnumit ja tema
`User UID`-d — mitte tema nime ega e-posti aadressi.** UID väärtus kirja
sees on saadetud otse kasutaja brauserist, ilma serveripoolse
kontrollita (`/api/support` ei nõua autentimistõendit) — seega **ÄRA
usalda kirjas olevat UID-d iseenesest piisava tõendina**, kelle konto
kustutada.

### 1.2 Tegelik identiteet: kontrolli Firestore'i kirjet — aga ka see pole iseenesest piisav tõend

1. Ava Firebase Console → Firestore Database → kogumik `supportMessages`
   (see kogumik on kliendile lugematu, aga sinule Console'is nähtav).
2. Leia kirje, mille `createdAt` ja `message` vastavad saabunud e-kirjale.
3. Loe sealt välja **`uid`**, **`senderEmail`** ja **`senderName`**.

**Oluline piirang:** ka need kolm välja on **kliendipoolsed andmed** —
need kirjutati taotluse saatmise hetkel otse kasutaja brauserist
(`auth.currentUser.uid` / `.email` / `.displayName`), mitte sinu enda
(administraatori) poolt sõltumatult kontrollitud. Need tõendavad ainult,
et *mingi brauserisessioon, mis oli sel hetkel sellesse kontosse sisse
logitud, saatis selle sõnumi* — mitte seda, et konkreetne, õige inimene
seda praegu endiselt soovib ja kontrollib. Firestore'i kirje annab sulle
usaldusväärse **lähtepunkti** (parem kui pelk e-kirjas olev UID), aga
**mitte veel piisavat identiteeditõendit iseseisvalt** — jätka alati
punktidega 1.3–1.5, enne kui loed isiku tuvastatuks.

### 1.3 Kinnita, et UID ja e-post käivad kokku

1. Ava Firebase Console → Authentication → Users.
2. Otsi üles `senderEmail` ja veendu, et selle kasutaja **UID ühtib**
   Firestore'i kirjest leitud `uid`-ga.
3. Võrdle `senderEmail`-i (taotluse saatmise hetke e-post) ka kasutaja
   **praeguse** `users/{uid}` profiilidokumendi `email`-väljaga
   Firestore'is — need peaksid tavaliselt kattuma, kuna profiili e-post
   peegeldab Authenticationi oma. Kui need lahknevad, on kasutaja
   vahepeal oma e-posti vahetanud — jätka punktiga 1.4.
4. Kui UID Authenticationis üldse ei leidu, või kui `senderEmail`
   kuulub mõnele teisele UID-le — **peata protsess**. See on anomaalia
   ja vajab täiendavat uurimist enne mistahes kustutamist.

### 1.4 Kui kasutaja e-post on muutunud või tal puudub sellele enam ligipääs

Ära jätka kustutamisega ainuüksi `senderEmail`-ile saadetud kirja põhjal,
kui tead või kahtlustad, et kasutajal pole sellele aadressile enam
ligipääsu (nt vastust ei tule mõistliku aja — näiteks mõne nädala —
jooksul, või kasutaja ütleb seda ise).

1. Kontrolli punktis 1.3.3 kirjeldatud võrdlust — kui kasutaja **praegune**
   registreeritud e-post (Authentication / `users/{uid}.email`) erineb
   `senderEmail`-ist, salda kinnituskiri hoopis **praegusele**
   registreeritud e-postile, mitte vana(le) `senderEmail`-ile.
2. Kui ka praegune registreeritud e-post ei vasta, või kasutaja teatab
   otse, et tal pole enam ligipääsu ühelegi oma e-posti aadressile:
   kasutaja on reeglina endiselt oma Kivora kontoga sisse logitav
   (automaatne iseteenindus on ainult ajutiselt keelatud, mitte
   sisselogimine tervikuna). Palu tal **saata uus kinnitussõnum uuesti
   "Abi ja tugi" lehe kaudu, hetkel sisse logituna** — see genereerib
   uue Firestore'i kirje, mis on jälle tema **hetke** autentitud
   sessiooniga seotud, ja annab värskema, usaldusväärsema signaali kui
   vana e-posti teel kinnituse ootamine.
3. Kui kasutaja ei saa ka ennast enam Kivorasse sisse logida (nt kaotanud
   ligipääsu kontole tervikuna) — see juhtum vajab juhtumipõhist
   lisakontrolli (nt mõni muu varem kokkulepitud identiteeditõend), mida
   see dokument ette ei kirjuta. **Ära kustuta midagi, kui ei suuda
   piisavalt usaldusväärselt veenduda, et taotlus tuleb tõesti konto
   valdajalt.** Peatu ja küsi vajadusel täiendavat nõu, enne kui jätkad.

### 1.5 Kinnita taotlus otse kasutajaga, enne mistahes kustutamist

1. Vasta kindlaks tehtud, kehtivale e-posti aadressile (punktide 1.3–1.4
   järgi — mitte automaatselt alati algsele `senderEmail`-ile) tavalise
   kirjaga, kinnitades: "Said meilt taotluse oma Kivora konto ja kõigi
   andmete kustutamiseks. Palun kinnita vastuskirjaga, et soovid seda
   jätkata — pärast kinnitust ei ole kustutamist võimalik tagasi võtta."
2. Oota kasutaja selgesõnalist kinnitust **samalt** aadressilt.
3. Alles pärast kinnituse saamist jätka punktiga 2.

### 1.6 Jäta endale logi

Soovita pidada lihtsat sisemist märget (nt tabelis või tekstifailis, mis
EI lähe repositooriumisse ega sisalda isikuandmeid rohkem kui vajalik):
taotluse kuupäev, UID, võimalik e-posti lahknevus (punkt 1.4), kinnituse
kuupäev, kustutamise kuupäev, kes tegi. See on sinu enda vastutuse
tõendamiseks, kui kunagi küsitakse, millal ja kuidas konto kustutati.

---

## 2. Firebase Storage'i ligipääsu ja teostatavuse kontroll (TEE SEE ENNE punkti 3!)

See kontroll käib **enne** Firestore'i andmete kustutamist, mitte pärast
— kui Firestore on juba pöördumatult kustutatud, ei saa sa enam hiljem
Storage'i probleemi tõttu protsessi tagasi kerida.

1. Ava Firebase Console → Storage.
2. **Kontrolli, kas Storage on üldse ligipääsetav/nähtav.** Kivora
   projekt pole hetkel Blaze paketil, mistõttu see võib olla osaliselt
   või täielikult piiratud.

### 2a. Kui Storage ON ligipääsetav

1. Otsi kaustad:
   - `users/<uid>/documents/`
   - `users/<uid>/profile/`
2. **Kui leiad faile:** kustuta need käsitsi Console'i kaudu (kausta
   valimine → Delete). Märgi see enda logisse (punkt 1.6) ära.
3. **Kui faile ei leia:** märgi selgelt kirja "Storage kontrollitud,
   faile ei leitud, kuupäev X".
4. Alles pärast seda jätka punktiga 3 (Firestore'i kustutamine).

### 2b. Kui Storage EI OLE ligipääsetav või selle teostatavust ei saa kontrollida

**Ära juhenda ennast ega kedagi teist ülejäänud andmeid automaatselt
kustutama.** Selle asemel:

1. **Peata kogu protsess siinkohal.** Ära jätka punktiga 3 (Firestore)
   ega punktiga 4 (Auth) enne, kui üks järgnevatest on lahendatud.
2. Dokumenteeri täpselt (punkt 1.6 logisse), miks Storage'i ei õnnestunud
   kontrollida (nt "Spark pakett, Storage pole kasutajale ega
   administraatorile Console'is nähtav, kuupäev X").
3. Teavita kasutajat, et tema taotlus on vastu võetud ja kinnitatud, aga
   selle täielik täitmine on ajutiselt peatatud tehnilise piirangu tõttu
   — anna ausalt teada, et osa võimalikest andmetest (üleslaaditud
   failid, profiilipilt) ei ole hetkel kontrollitavad, ja et jätkad
   niipea kui see on võimalik. Ära lubat kindlat tähtaega, mida sa ei
   suuda täita.
4. Edasised võimalused (vali üks, sinu/omaniku otsus — mitte
   administraatori enda vaikimisi valik):
   - **Oota**, kuni Storage'i olukord laheneb (nt Blaze pakett
     võetakse kasutusele), seejärel jätka punktist 2a.
   - **Teadlik erand**: kui omanik otsustab teadlikult jätkata
     Firestore'i ja Auth'i kustutamisega hoolimata kontrollimata
     Storage'ist, peab see olema **eraldi, kirjalikult põhjendatud
     otsus omaniku enda poolt** (mitte rutiinse täitmise vaikeväärtus),
     logitud koos põhjendusega punkti 1.6 logisse. Sellisel juhul
     tuleb kasutajale antavas vastuses (punkt 6.2) see selgelt ja
     ausalt välja tuua, mitte varjata.
5. Ilma ühe neist kahest valikust selge dokumenteeritud otsuseta —
   **ära kustuta midagi edasi.**

---

## 3. Firestore'i andmete kustutamine olemasoleva admin-tööriistaga

Jätka siia alles pärast seda, kui punkt 2 on läbitud (Storage kontrollitud
ja korras, VÕI omanik on teinud ja logind punktis 2b kirjeldatud teadliku
erandiotsuse).

Tööriist: `artifacts/api-server/src/scripts/fullAccountRemoval.ts`
(käivitatakse `runFullAccountRemovalCli.ts` kaudu).

**See tööriist nõuab kehtivat varukoopiat enne päris kustutamist — ei lase
end mööda minna.** Seega varundus käib alati enne eemaldamist.

### 3.1 Loo kõigepealt täisvarukoopia

1. Mine GitHubi repositooriumi Actions-vaatesse → töövoog **"Kivora full
   account backup"**.
2. Käivita see käsitsi ("Run workflow"), sisestades kinnitatud kasutaja
   **UID**.
3. Oota, kuni töövoog lõpeb edukalt (roheline linnuke).
4. Ava selle käivituse logi ja leia sealt rida kujul:
   `Varukoopia ID: bk_<ajatempel>_<juhuslik>`
   — **kirjuta see täpselt üles**, seda on vaja järgmises sammus (`BACKUP_ID`).
5. Töövoog laadib üles ka krüpteeritud `.enc` artefakti (vt punkt 5) —
   see on eraldi varukoopia GitHubi Actionsi enda juures, erinev
   Firestore'i `_fullBackups` kirjest, mille ID sa just said.

### 3.2 Kontrolli (dry-run) enne päris kustutamist

Kohalikus terminalis, kaustast `artifacts/api-server`:

```bash
EXPECTED_UID=<uid> EXPECTED_PROJECT_ID=<kivora-projekti-id> CLEANUP_MODE=dry-run \
  npx esbuild --bundle --platform=node --format=esm --packages=external \
  src/scripts/runFullAccountRemovalCli.ts --outfile=.tmp-runFullAccountRemovalCli.mjs \
  && node .tmp-runFullAccountRemovalCli.mjs
```

(Vajalikud ka `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY` keskkonnamuutujad — samad Admin SDK mandaadid, mida
teisedki selle projekti skriptid kasutavad.)

Loe läbi väljund täies mahus. Veendu, et:
- Tuvastatud UID vastab täpselt sinu kinnitatud kasutajale.
- Pole hoiatusi ootamatute/tundmatute alamkogumike kohta.
- Kokkuvõte loetleb täpselt need kogumikud, mida ootad (tasks, notes,
  habits, goals, calendarEvents, schoolItems, entityLinks,
  pushSubscriptions, settings, plans, calendars, documents, transactions,
  bills, monthlyBudgets, aiConversations+sõnumid,
  feedbackSubmissions/supportMessages — ainult selle UID omad).

Dry-run **ei kustuta midagi**, ükskõik mitu korda seda käivitad.

### 3.3 Käivita päriselt (execute)

Alles pärast seda, kui dry-run näeb täpselt ootuspärane välja:

```bash
EXPECTED_UID=<uid> EXPECTED_PROJECT_ID=<kivora-projekti-id> \
CLEANUP_MODE=execute \
CONFIRMATION_PHRASE="KUSTUTA KIVORA VANA KONTO TÄIELIKULT" \
BACKUP_ID=<punktist 3.1 saadud bk_... väärtus> \
  npx esbuild --bundle --platform=node --format=esm --packages=external \
  src/scripts/runFullAccountRemovalCli.ts --outfile=.tmp-runFullAccountRemovalCli.mjs \
  && node .tmp-runFullAccountRemovalCli.mjs
```

Tööriist kontrollib enne iga kustutamist varukoopia terviklikkust uuesti
(mitte ainult et see "eksisteerib") — kui kontroll ebaõnnestub, katkeb
kogu protsess ilma midagi kustutamata, ja väljund ütleb täpselt, miks.

**Mida see tööriist EI puutu — jäta meelde, need vajavad eraldi samme:**
- `users/{uid}/backups` (kasutaja enda käsitsi loodud varukoopiad rakenduses)
- `users/{uid}/_fullBackups` ja selle `chunks`
- `users/{uid}/_restoreVerificationScratch` (peaks niikuinii alati tühi olema)
- Firebase Storage (juba tehtud punktis 2 — mitte siin)
- Firebase Auth konto ise (punkt 4)

---

## 4. Firebase Auth konto kustutamine

Tee seda alles pärast punkti 3 edukat lõpetamist (`overallSuccess: true`,
ilma `failedCategory`-ta) — ja ainult siis, kui punkt 2 (Storage) on
korras lahendatud (mitte vaikimisi vahele jäetud).

1. Ava Firebase Console → Authentication → Users.
2. Otsi kasutaja üles **UID** järgi (mitte e-posti järgi — konto võib
   olla juba muudetud).
3. Kolme-punkti menüü selle kasutaja real → **Delete account**.
4. Kinnita Console'i enda kinnitusdialoog.
5. Veendu otsingut uuesti tehes, et kasutaja enam nimekirjas ei ole.

See samm on pöördumatu ja ainus, mis tegelikult sulgeb kasutaja
sisselogimisvõimaluse. Ükski selle projekti skript ei tee seda sinu eest
automaatselt — see on teadlik disainiotsus (vt
`runFullAccountRemovalCli.ts`'i enda dokumentatsioonikommentaari).

---

## 5. Varukoopiate säilitamine ja kustutamine

Kolm erinevat varukoopiat tekivad selle protsessi käigus. Need jagunevad
selgelt kahte erinevasse kategooriasse — **ära aja neid kokku**:

**(A) Tehniliselt juba kindlaks määratud säilitusaeg** (kood ise seda
juba rakendab, siin pole administraatoril valikut):

| Varukoopia | Kus asub | Säilitusaeg |
|---|---|---|
| Krüpteeritud `.enc` artefakt GitHub Actionsi juures | GitHub Actions'i artifacts | **90 päeva**, kõvakodeeritud `.github/workflows/full-account-backup.yml`-is (`retention-days: 90`). Kustub ise pärast seda tähtaega. Kui soovid seda varem kustutada, saad seda teha käsitsi GitHubi Actions → vastava käivituse → Artifacts alt. |

**(B) Veel otsustamata säilitamispoliitika** (ei ole kood ega
dokument määranud — vajab eraldi otsust, enne mille tegemist **ära
kustuta ise meelevaldse tähtaja järgi**):

| Varukoopia | Kus asub | Olukord |
|---|---|---|
| `users/{uid}/backups` (kasutaja enda käsitsi varundused rakenduses) | Firestore | Need kuuluvad äsja kustutatud kasutajale ja **jäävad fullAccountRemoval'i poolt puutumata**. Kas ja millal need pärast kustutamist eemaldada, **ei ole veel otsustatud**. |
| `users/{uid}/_fullBackups/{backupId}` (punktis 3.1 loodud, kasutatud varukoopia kontrolliks) | Firestore | JÄÄB alles pärast execute-režiimi (tööriist ei kustuta iseennast kasutatud varukoopiat). Säilitustähtaeg **pole määratud** — see on sinu/omaniku eraldi otsustada, mitte midagi, mida see juhend ette kirjutab. |

**Ära kehtesta siin omaette "vaikimisi" tähtaega (nt kindel päevade arv)
ilma eraldi põhjenduseta otsuseta** — kategooria (B) jaoks tee kirjalik
otsus eraldi, ja alles siis lisa see sellesse tabelisse viitena.

**Oluline: kooskõla privaatsuspoliitikaga.** Mis tahes säilitamis- või
kustutamispõhimõte, mille (B)-kategooria jaoks kehtestad, peab ühtima
Kivora privaatsuspoliitikas lubatavaga (andmete säilitustähtaeg,
kustutamisõigus). Praeguses privaatsuspoliitikas pole säilitustähtaegu
veel konkreetselt kirjas (vt varasem audit) — kui kehtestad siin reaalse
tähtaja, veendu, et see kajastuks ka privaatsuspoliitika enda
ajakohastamisel, mitte ainult selles sisemises juhendis.

---

## 6. Kustutamise tulemuste kontrollimine ning kasutajale vastamine

### 6.1 Kontrolli

- `fullAccountRemoval.ts`'i väljundi kokkuvõte (`removedCounts`,
  `overallSuccess`) — veendu, et **ei** ole `failedCategory`-t.
- Firestore'is otsi veel kord `users/{uid}` juurdokumenti — see peaks
  olema kadunud.
- Firebase Authenticationis otsi kasutajat UID/e-posti järgi — ei tohiks
  leiduda.
- Punktis 2 tehtud Storage-kontrolli tulemus (leitud+kustutatud, tühi,
  või katkestatud/erandiga jätkatud) on logitud.
- Punktis 5 tehtud otsused `backups`/`_fullBackups` kohta on logitud.

### 6.2 Vasta kasutajale — eristades kolme kategooriat

**Ära koosta kirja, mis väidab lihtsalt "kõik on kustutatud".** Jaga
vastus selgelt kolmeks:

1. **Edukalt kustutatud andmed** — need, mille kustutamise sa punktis 6.1
   tegelikult kontrollisid (Firestore'i kogumikud, mida
   `fullAccountRemoval.ts` raporteeris, Storage-failid, mille ise
   punktis 2a kustutasid, ja Auth-konto).
2. **Põhjendatult ajutiselt säilitatavad andmed** — nt `_fullBackups`
   (vajalik oli kustutamise enda kontrollimiseks) ja GitHub'i krüpteeritud
   varukoopia (säilib tehniliselt veel kuni 90 päeva) — koos lühikese
   põhjendusega, miks need veel alles on.
3. **Andmed, mille kustutamist ei saanud kontrollida** — kui punktis 2
   jõudsid 2b-haru (Storage ligipääsmatu) ja omanik otsustas siiski
   edasi minna, ütle seda otse: "Üleslaaditud failide/profiilipildi
   kustutamist ei õnnestunud praegu kontrollida tehnilise piirangu
   tõttu; jätkame sellega niipea kui võimalik."

Näidis (kohanda tegeliku olukorra järgi — ÄRA kasuta seda muutmata
kujul, kui mõni osa ei vasta tõele):

> Tere!
>
> Kinnitame, et sinu Kivora kontoga seotud järgmised andmed on
> kustutatud: [loetle tegelikult kustutatud kategooriad — nt ülesanded,
> märkmed, harjumused, eesmärgid, kalendrisündmused, dokumendid,
> AI-vestlused, seaded, tagasiside-/toekirjed] ning sinu kasutajakonto
> on suletud.
>
> Mõned sinu kontoga seotud varukoopiad säilivad meil veel [lühike
> põhjendus, nt "kuni 90 päeva, turvalisuse ja taastatavuse
> kontrollimise eesmärgil"] — nende kohta kehtib meie [privaatsuspoliitika
> / sisemine säilituspõhimõte].
>
> [Ainult juhul, kui see on tõsi:] Osa sinu andmetest (nt üleslaaditud
> failid) ei olnud meil hetkel tehnilise piirangu tõttu võimalik
> kontrollida — jätkame sellega niipea kui võimalik ja anname Sulle
> teada.
>
> Soovi korral võid küsida täpsustusi.

Ära väida midagi, mida sa ise ei ole punktis 6.1 kontrollinud.

---

## Kiirülevaade (järjekord)

1. Tuvasta kasutaja Firestore'i `supportMessages` kirjest; kinnita
   UID↔e-post; kontrolli võimalikku e-posti vahetust (p 1.4);
   **kinnita taotlus kasutajaga e-kirja/sisselogitud sessiooni teel**.
2. **Kontrolli Firebase Storage'i ligipääsu ja teostatavust (p 2) —
   enne mistahes Firestore'i toimingut.** Kui ligipääsmatu: peata ja
   käsitle p 2b järgi, ära jätka automaatselt.
3. Käivita täisvarundus (GitHub Actions) → kirjuta üles `BACKUP_ID`.
4. Käivita `runFullAccountRemovalCli.ts` dry-run, kontrolli väljundit.
5. Käivita `runFullAccountRemovalCli.ts` execute, kontrolli tulemust.
6. Otsusta ja käsitle `users/{uid}/backups` ja `_fullBackups` (p 5).
7. Kustuta Firebase Auth konto Console'ist.
8. Kontrolli kõike üle, vasta kasutajale ausalt, kolme kategooriasse
   jaotatuna (p 6.2).
