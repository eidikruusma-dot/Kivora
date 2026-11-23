import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import AuroraBackground from '@/components/landing/AuroraBackground'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// Aurora Living Premium glass-card look, matching Privacy.tsx (duplicated
// locally — not imported — so this page can evolve independently).
const CARD =
  'rounded-[28px] bg-white/70 backdrop-blur-xl border border-white/70 shadow-[0_30px_70px_-30px_rgba(111,90,232,0.35)] px-6 py-7 sm:px-9 sm:py-9'

const P = 'text-[15px] text-[#64748B] leading-relaxed'
const H2 = 'text-lg font-bold text-[#1A1F36] mb-3'
const UL = 'space-y-2 mb-3'
const LI = 'text-[15px] text-[#64748B] leading-relaxed'

function Email({ children }: { children: string }) {
  return (
    <a href={`mailto:${children}`} className="text-[#6D28D9] font-semibold hover:underline">
      {children}
    </a>
  )
}

// ── Table of contents — language-agnostic numeric ids so anchors survive
// a language switch, and a single source of truth shared by the desktop
// sticky sidebar and the mobile chip row below. ─────────────────────────
const TOC_ET = [
  '1. Üldsätted',
  '2. Teenusepakkuja',
  '3. Teenuse kirjeldus',
  '4. Vanusepiirang',
  '5. Kasutajakonto ja turvalisus',
  '6. Kasutaja kohustused',
  '7. Kasutaja loodud sisu',
  '8. AI-assistendi kasutamine',
  '9. Teenuse hind',
  '10. Teenuse kättesaadavus ja muudatused',
  '11. Konto peatamine ja lõpetamine',
  '12. Intellektuaalne omand',
  '13. Vastutuse piiramine',
  '14. Tarbijaõigused',
  '15. Tingimuste muutmine',
  '16. Kohaldatav õigus ja vaidluste lahendamine',
  '17. Seos privaatsuspoliitikaga',
]

const TOC_EN = [
  '1. General provisions',
  '2. Service provider',
  '3. Description of the service',
  '4. Age requirement',
  '5. User account and security',
  '6. User obligations',
  '7. User-generated content',
  '8. Use of the AI assistant',
  '9. Pricing',
  '10. Service availability and changes',
  '11. Suspension and termination of account',
  '12. Intellectual property',
  '13. Limitation of liability',
  '14. Consumer rights',
  '15. Changes to these terms',
  '16. Governing law and dispute resolution',
  '17. Relationship to the Privacy Policy',
]

function TableOfContents({ lang }: { lang: AppLang }) {
  const items = lang === 'en' ? TOC_EN : TOC_ET
  return (
    <>
      {/* Desktop — sticky sidebar */}
      <nav
        aria-label={t('terms.toc.label', lang)}
        className="hidden lg:block lg:sticky lg:top-24 lg:self-start w-[220px] shrink-0"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-[#9A94B8] mb-3">
          {t('terms.toc.label', lang)}
        </p>
        <ul className="space-y-1.5">
          {items.map((label, i) => (
            <li key={i}>
              <a
                href={`#terms-s${i + 1}`}
                className="block text-[13px] text-[#6B6485] hover:text-[#6D28D9] transition-colors leading-snug"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile — compact horizontally scrollable chip row (nav only;
          the actual terms text below always renders fully, never
          collapsed). */}
      <nav
        aria-label={t('terms.toc.label', lang)}
        className="lg:hidden -mx-4 px-4 mb-6 overflow-x-auto"
      >
        <div className="flex gap-2 w-max pb-1">
          {items.map((label, i) => (
            <a
              key={i}
              href={`#terms-s${i + 1}`}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full bg-white/70 border border-[#E4DEFB] text-[12.5px] font-semibold text-[#6D28D9] whitespace-nowrap"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>
    </>
  )
}

function DraftBadge({ lang }: { lang: AppLang }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-[12.5px] font-semibold text-amber-700 mb-4">
      {t('terms.draftBadge', lang)}
    </span>
  )
}

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className={`${CARD} scroll-mt-28`}>
      {children}
    </section>
  )
}

function TermsET() {
  return (
    <div className="space-y-5">
      <Section id="terms-s1">
        <h2 className={H2}>1. Üldsätted</h2>
        <p className={P}>
          Käesolevad kasutustingimused ("tingimused") reguleerivad Kivora veebilehe ja
          rakenduse ("Kivora", "teenus") kasutamist. Kivorat kasutades kinnitad, et nõustud
          käesolevate tingimustega. Kui sa nendega ei nõustu, palun ära kasuta teenust.
        </p>
      </Section>

      <Section id="terms-s2">
        <h2 className={H2}>2. Teenusepakkuja</h2>
        <p className={P}>
          Kivorat arendab eraisik (mitte äriühing ega füüsilisest isikust ettevõtja):
          "Kivora – eraisikust arendaja".
        </p>
        <ul className={`${UL} mt-3`}>
          <li className={LI}>Üldised ja õiguslikud küsimused: <Email>info@kivora.ee</Email></li>
          <li className={LI}>Kasutajatugi ning konto ja andmete kustutamise taotlused: <Email>support@kivora.ee</Email></li>
          <li className={LI}>Andmekaitseküsimused: <Email>info@kivora.ee</Email></li>
        </ul>
      </Section>

      <Section id="terms-s3">
        <h2 className={H2}>3. Teenuse kirjeldus</h2>
        <p className={P}>
          Kivora on isiklik produktiivsusrakendus, mis aitab kasutajatel hallata ülesandeid,
          kalendrisündmusi, märkmeid, harjumusi, eesmärke, plaane, kooliga seotud kirjeid ja
          isiklikke rahaasju, laadida üles dokumente ning kasutada AI-assistenti. Teenust
          arendatakse pidevalt ning funktsionaalsus võib aja jooksul muutuda, täieneda või mõni
          osa sellest lõppeda.
        </p>
      </Section>

      <Section id="terms-s4">
        <h2 className={H2}>4. Vanusepiirang</h2>
        <p className={P}>
          Kivora on mõeldud kasutamiseks alates 13. eluaastast. Luues konto või kasutades
          teenust kinnitad, et oled vähemalt 13-aastane. Kui saame teada, et konto kuulub alla
          13-aastasele lapsele, vaatame juhtumi käsitsi läbi ja võtame asjakohased meetmed,
          sealhulgas konto kustutamise, vastavalt privaatsuspoliitika punktile 14. Konto
          kustutamine, sealhulgas sellistel juhtudel, toimub käsitsi — automaatset
          kustutamissüsteemi praegu ei ole.
        </p>
      </Section>

      <Section id="terms-s5">
        <h2 className={H2}>5. Kasutajakonto ja turvalisus</h2>
        <p className={`${P} mb-3`}>
          Mõnede funktsioonide kasutamiseks on vajalik konto loomine e-posti ja parooliga või
          Google'i/Facebooki kontoga. Vastutad:
        </p>
        <ul className={UL}>
          <li className={LI}>enda kohta esitatud andmete õigsuse eest;</li>
          <li className={LI}>oma parooli ja sisselogimisandmete konfidentsiaalsuse eest;</li>
          <li className={LI}>kogu tegevuse eest, mis toimub sinu kontol, välja arvatud kui tegevus on tingitud meiepoolsest turvanõuete rikkumisest.</li>
        </ul>
        <p className={P}>
          Kui kahtlustad oma konto volitamata kasutamist, teavita meid viivitamata aadressil{' '}
          <Email>support@kivora.ee</Email>.
        </p>
      </Section>

      <Section id="terms-s6">
        <h2 className={H2}>6. Kasutaja kohustused</h2>
        <p className={`${P} mb-3`}>Kivorat kasutades kohustud:</p>
        <ul className={UL}>
          <li className={LI}>esitama õigeid andmeid;</li>
          <li className={LI}>kasutama teenust ainult seaduslikel eesmärkidel;</li>
          <li className={LI}>mitte üles laadima ega looma sisu, mis rikub kolmandate isikute õigusi (sh autoriõigus) või kehtivaid õigusakte;</li>
          <li className={LI}>mitte proovima teenusesse volitamata juurde pääseda, selle toimimist häirida või selle turvalisust kahjustada (sh pöördprojekteerimine, automatiseeritud päringute kuritarvitamine, pahavara levitamine);</li>
          <li className={LI}>mitte kasutama teenust teise isiku ahistamiseks, petmiseks ega õigusvastaseks jälgimiseks.</li>
        </ul>
        <p className={P}>
          Tingimuste olulise rikkumise korral võime konto kasutamist piirata või lõpetada (vt
          punkt 11).
        </p>
      </Section>

      <Section id="terms-s7">
        <h2 className={H2}>7. Kasutaja loodud sisu</h2>
        <p className={`${P} mb-3`}>
          Sisu, mille sa Kivorasse lisad (ülesanded, märkmed, kalendrisündmused, harjumused,
          eesmärgid, plaanid, üleslaaditud dokumendid, finantskirjed jms), kuulub sulle. Me ei
          väida selle sisu suhtes omandiõigust ega kasuta seda turunduseks või muudel
          kõrvalistel eesmärkidel. Sisu säilitamiseks, kuvamiseks ja sulle kättesaadavaks
          tegemiseks vajame õigust seda tehniliselt töödelda ainult teenuse osutamiseks
          vajalikus ulatuses, vastavalt privaatsuspoliitikale.
        </p>
        <p className={`${P} mb-3`}>
          Vastutad enda loodud sisu ja üleslaaditud failide seaduslikkuse eest. Meil on õigus
          eemaldada sisu, mis rikub käesolevaid tingimusi või õigusakte, kui sellest teada
          saame.
        </p>
        <p className={P}>
          Sisu ja konto kustutamine toimub vastavalt privaatsuspoliitika punktidele 8 ja 9:
          teeme mõistlikke pingutusi kustutamiseks mõistliku aja jooksul, kuid mõne andmeliigi
          (sh varukoopiate) puhul ei saa me tehniliste piirangute tõttu alati garanteerida
          kustutamise täielikkust kindlaksmääratud tähtaja jooksul.
        </p>
      </Section>

      <Section id="terms-s8">
        <h2 className={H2}>8. AI-assistendi kasutamine</h2>
        <p className={`${P} mb-3`}>
          Kivora pakub AI-assistenti, mis genereerib vastuseid sinu sõnumite ja Kivorasse
          sisestatud andmete (nt ülesanded, märkmed, eesmärgid) põhjal, kasutades meie
          AI-teenuse pakkuja tehnoloogiat (vt privaatsuspoliitika punkt 6). AI-assistent
          avaneb ja töötab ainult siis, kui sa ise selle avad ja kasutad.
        </p>
        <p className={`${P} mb-3`}>
          AI-assistendi vastused võivad sisaldada ebatäpsusi — need on abistavad soovitused,
          mitte professionaalne (nt finants-, õigus- või meditsiiniline) nõuanne, ja vastutad
          selle eest, kuidas vastuseid kasutad.
        </p>
        <p className={P}>
          AI-assistent saab sinu juhiste alusel luua sisu (nt ülesandeid, märkmeid,
          kalendrisündmusi). Sisu kustutamiseks (nt ülesande, märkme või harjumuse
          kustutamine) küsib AI-assistent sinult eraldi kinnitust, enne kui toimingu läbi
          viib. Mõned toimingud (nt pangaväljavõtte importimine või plaani loomine) kuvatakse
          esmalt ülevaatamiseks ettenähtud eelvaatena — midagi ei salvestata enne, kui sa seda
          eelvaates eraldi kinnitad. AI-assistendi toimingud ei rakendu automaatselt ilma sinu
          juhise või kinnituseta.
        </p>
      </Section>

      <Section id="terms-s9">
        <h2 className={H2}>9. Teenuse hind</h2>
        <p className={P}>
          Kivora on praegu kasutajatele tasuta. Me ei nõua praegu teenuse kasutamise eest
          tasu. Kui see muutub tulevikus, teavitame kasutajaid enne muudatuse jõustumist ja
          täpsustame vastavad tingimused eraldi.
        </p>
      </Section>

      <Section id="terms-s10">
        <h2 className={H2}>10. Teenuse kättesaadavus ja muudatused</h2>
        <p className={P}>
          Kivora eesmärk on pakkuda usaldusväärset teenust, kuid ei saa garanteerida
          katkematut, veatut või kõigile seadmetele ja brauseritele täielikult sobivat
          toimimist. Teenust võidakse ajutiselt piirata hoolduse, tehniliste tõrgete või
          meist sõltumatute asjaolude (nt meie teenusepakkujate katkestuste) tõttu. Meil on
          õigus funktsioone lisada, muuta või eemaldada, kui see on teenuse arendamiseks
          vajalik; oluliste muudatuste korral teavitame kasutajaid mõistlikult ette, kui see
          on võimalik.
        </p>
      </Section>

      <Section id="terms-s11">
        <h2 className={H2}>11. Konto peatamine ja lõpetamine</h2>
        <p className={`${P} mb-3`}>
          Sul on õigus oma konto ja sellega seotud andmete kustutamist taotleda igal ajal,
          kirjutades aadressile <Email>support@kivora.ee</Email> või "Abi ja tugi" lehe
          kaudu. Vaatame taotlused läbi käsitsi vastavalt privaatsuspoliitika punktile 9.
        </p>
        <p className={P}>
          Meil on õigus piirata või lõpetada konto kasutamine, kui kasutaja rikub olulisel
          viisil käesolevaid tingimusi, kehtivaid õigusakte või ohustab teenuse turvalisust.
          Võimaluse korral teavitame sellest enne piiramist või pärast seda, välja arvatud
          juhul, kui viivitamatu tegutsemine on vajalik teenuse või teiste kasutajate
          kaitseks.
        </p>
      </Section>

      <Section id="terms-s12">
        <h2 className={H2}>12. Intellektuaalne omand</h2>
        <p className={P}>
          Kivora kujundus, logo, tekstid (välja arvatud kasutajate loodud sisu), tarkvara ja
          muu Kivora-poolne sisu kuuluvad Kivorale või selle õigustatud omanikele ning on
          kaitstud kehtivate õigusaktidega. Ilma eelneva kirjaliku loata ei ole lubatud seda
          sisu kopeerida, levitada, muuta ega kasutada viisil, mis rikub autoriõigusi.
        </p>
      </Section>

      <Section id="terms-s13">
        <h2 className={H2}>13. Vastutuse piiramine</h2>
        <p className={`${P} mb-3`}>
          Kivorat pakutakse "nii nagu see on" ("as is"), ilma garantiideta katkematu, veatu
          või konkreetsele eesmärgile sobiva toimimise kohta. Mõistlikus ulatuses, mis on
          seadusega lubatud, ei vastuta Kivora kaudse, juhusliku või tulenenud kahju eest,
          mis tuleneb teenuse kasutamisest või kasutamise võimatusest.
        </p>
        <p className={P}>
          Käesolev punkt ei piira ega välista vastutust, mida seadus ei luba piirata või
          välistada — sealhulgas vastutust tahtlikult tekitatud kahju, raske hooletuse,
          surma või kehavigastuse eest, ega tarbija seadusest tulenevaid õigusi (vt punkt
          14).
        </p>
      </Section>

      <Section id="terms-s14">
        <h2 className={H2}>14. Tarbijaõigused</h2>
        <p className={P}>
          Käesolevad tingimused ei piira ega välista kasutaja seadusest tulenevaid
          tarbijaõigusi, mis kehtivad Eesti ja Euroopa Liidu tarbijakaitseõiguse alusel ja
          mida lepinguga ei saa kitsendada. Kui mõni käesoleva lepingu tingimus on vastuolus
          selliste kohustuslike õigustega, kohaldatakse õigusakti sätet.
        </p>
      </Section>

      <Section id="terms-s15">
        <h2 className={H2}>15. Tingimuste muutmine</h2>
        <p className={P}>
          Käesolevaid tingimusi võidakse aeg-ajalt uuendada, näiteks teenuse arenemise või
          õigusaktide muutumise tõttu. Olulistest muudatustest teavitame kasutajaid Kivora
          rakenduses või veebilehel enne muudatuse jõustumist, kui see on mõistlikult
          võimalik. Üldjuhul loetakse teenuse jätkuv kasutamine pärast sellist teavitamist
          uuendatud tingimustega nõustumiseks. Juhtudel, kus kohaldatav õigus nõuab
          muudatuse jaoks sinu selgesõnalist eraldi nõusolekut, küsime seda nõusolekut
          eraldi, enne kui muudatus sinu suhtes jõustub.
        </p>
      </Section>

      <Section id="terms-s16">
        <h2 className={H2}>16. Kohaldatav õigus ja vaidluste lahendamine</h2>
        <p className={P}>
          Käesolevatele tingimustele kohaldatakse Eesti Vabariigi õigust, arvestades
          kohustuslikke tarbijakaitsesätteid, mis võivad kehtida sinu elukohariigi järgi.
          Vaidlusi püütakse esmalt lahendada läbirääkimiste teel, pöördudes aadressile{' '}
          <Email>support@kivora.ee</Email>. Käesolev punkt ei piira sinu õigust pöörduda
          igal ajal pädevasse kohtusse vastavalt kohaldatavale õigusele.
        </p>
      </Section>

      <Section id="terms-s17">
        <h2 className={H2}>17. Seos privaatsuspoliitikaga</h2>
        <p className={P}>
          Isikuandmete töötlemist käesoleva teenuse raames reguleerib Kivora
          privaatsuspoliitika (vt <Link to="/privacy" className="text-[#6D28D9] font-semibold hover:underline">/privacy</Link>).
          Kui käesolevate kasutustingimuste ja privaatsuspoliitika vahel tekiks
          tõlgenduserinevus isikuandmete töötlemise küsimustes, on ülimuslik
          privaatsuspoliitika.
        </p>
      </Section>

      <Section id="terms-s18">
        <h2 className={H2}>Kontakt</h2>
        <p className={`${P} mb-3`}>
          Kui sul on küsimusi käesolevate kasutustingimuste kohta, võid meiega ühendust
          võtta.
        </p>
        <p className={P}>
          <Email>info@kivora.ee</Email> (üldised küsimused) / <Email>support@kivora.ee</Email> (kasutajatugi)
        </p>
      </Section>
    </div>
  )
}

function TermsEN() {
  return (
    <div className="space-y-5">
      <Section id="terms-s1">
        <h2 className={H2}>1. General provisions</h2>
        <p className={P}>
          These terms of use ("terms") govern the use of the Kivora website and application
          ("Kivora", "the service"). By using Kivora, you confirm that you agree to these
          terms. If you do not agree, please do not use the service.
        </p>
      </Section>

      <Section id="terms-s2">
        <h2 className={H2}>2. Service provider</h2>
        <p className={P}>
          Kivora is developed by a private individual (not a company or sole
          proprietorship): "Kivora – private individual developer".
        </p>
        <ul className={`${UL} mt-3`}>
          <li className={LI}>General and legal matters: <Email>info@kivora.ee</Email></li>
          <li className={LI}>Support and account/data deletion requests: <Email>support@kivora.ee</Email></li>
          <li className={LI}>Data protection matters: <Email>info@kivora.ee</Email></li>
        </ul>
      </Section>

      <Section id="terms-s3">
        <h2 className={H2}>3. Description of the service</h2>
        <p className={P}>
          Kivora is a personal productivity application that helps users manage tasks,
          calendar events, notes, habits, goals, plans, school-related records, and
          personal finances, upload documents, and use an AI assistant. The service is
          continuously developed, and its functionality may change, expand, or be
          discontinued in part over time.
        </p>
      </Section>

      <Section id="terms-s4">
        <h2 className={H2}>4. Age requirement</h2>
        <p className={P}>
          Kivora is intended for use by people aged 13 and older. By creating an account or
          using the service, you confirm that you are at least 13 years old. If we become
          aware that an account belongs to a child under 13, we review the matter manually
          and take appropriate action, including deleting the account, in line with Privacy
          Policy section 14. Account deletion, including in such cases, is carried out
          manually — there is currently no automatic deletion system.
        </p>
      </Section>

      <Section id="terms-s5">
        <h2 className={H2}>5. User account and security</h2>
        <p className={`${P} mb-3`}>
          Some features require creating an account using email and password, or a
          Google/Facebook account. You are responsible for:
        </p>
        <ul className={UL}>
          <li className={LI}>the accuracy of the information you provide;</li>
          <li className={LI}>the confidentiality of your password and login credentials;</li>
          <li className={LI}>all activity that occurs under your account, except where that activity results from our failure to meet applicable security obligations.</li>
        </ul>
        <p className={P}>
          If you suspect unauthorized use of your account, notify us immediately at{' '}
          <Email>support@kivora.ee</Email>.
        </p>
      </Section>

      <Section id="terms-s6">
        <h2 className={H2}>6. User obligations</h2>
        <p className={`${P} mb-3`}>When using Kivora, you agree to:</p>
        <ul className={UL}>
          <li className={LI}>provide accurate information;</li>
          <li className={LI}>use the service only for lawful purposes;</li>
          <li className={LI}>not upload or create content that infringes the rights of third parties (including copyright) or violates applicable law;</li>
          <li className={LI}>not attempt to gain unauthorized access to the service, disrupt its operation, or compromise its security (including reverse engineering, abusive automated requests, or distributing malware);</li>
          <li className={LI}>not use the service to harass, deceive, or unlawfully monitor another person.</li>
        </ul>
        <p className={P}>
          In case of a material breach of these terms, we may restrict or terminate your
          use of the account (see section 11).
        </p>
      </Section>

      <Section id="terms-s7">
        <h2 className={H2}>7. User-generated content</h2>
        <p className={`${P} mb-3`}>
          Content you add to Kivora (tasks, notes, calendar events, habits, goals, plans,
          uploaded documents, financial entries, and similar) belongs to you. We do not
          claim ownership of this content, and we do not use it for marketing or other
          unrelated purposes. To store, display, and make this content available to you,
          we need the right to technically process it only to the extent necessary to
          provide the service, in accordance with the Privacy Policy.
        </p>
        <p className={`${P} mb-3`}>
          You are responsible for the legality of the content and files you create or
          upload. We reserve the right to remove content that violates these terms or
          applicable law, if we become aware of it.
        </p>
        <p className={P}>
          Deletion of content and accounts is carried out in accordance with Privacy Policy
          sections 8 and 9: we make reasonable efforts to delete data within a reasonable
          time, but for some types of data (including backups), technical limitations mean
          we cannot always guarantee complete deletion within a fixed deadline.
        </p>
      </Section>

      <Section id="terms-s8">
        <h2 className={H2}>8. Use of the AI assistant</h2>
        <p className={`${P} mb-3`}>
          Kivora provides an AI assistant that generates responses based on your messages
          and the data you have entered into Kivora (e.g. tasks, notes, goals), using our
          AI service provider's technology (see Privacy Policy, section 6). The AI
          assistant is only activated and operates when you yourself open and use it.
        </p>
        <p className={`${P} mb-3`}>
          AI assistant responses may contain inaccuracies — they are supportive
          suggestions, not professional (e.g. financial, legal, or medical) advice, and you
          are responsible for how you use them.
        </p>
        <p className={P}>
          Based on your instructions, the AI assistant can create content (e.g. tasks,
          notes, calendar events). Before deleting content (e.g. a task, note, or habit),
          the AI assistant asks for your separate confirmation before carrying out the
          action. Some actions (e.g. importing a bank statement or generating a plan) are
          first shown as a preview for your review — nothing is saved until you separately
          confirm it in that preview. AI assistant actions are not applied automatically
          without your instruction or confirmation.
        </p>
      </Section>

      <Section id="terms-s9">
        <h2 className={H2}>9. Pricing</h2>
        <p className={P}>
          Kivora is currently provided to users free of charge. We do not currently require
          payment for use of the service. If this changes in the future, we will notify
          users before the change takes effect and will set out the applicable terms
          separately.
        </p>
      </Section>

      <Section id="terms-s10">
        <h2 className={H2}>10. Service availability and changes</h2>
        <p className={P}>
          Kivora aims to provide a reliable service but cannot guarantee uninterrupted,
          error-free operation, or full compatibility with every device and browser. The
          service may be temporarily limited due to maintenance, technical failures, or
          circumstances beyond our control (e.g. outages at our service providers). We
          reserve the right to add, change, or remove features as needed to develop the
          service; where reasonably possible, we will give advance notice of significant
          changes.
        </p>
      </Section>

      <Section id="terms-s11">
        <h2 className={H2}>11. Suspension and termination of account</h2>
        <p className={`${P} mb-3`}>
          You have the right to request deletion of your account and related data at any
          time, by writing to <Email>support@kivora.ee</Email> or through the "Help &amp;
          Support" page. Requests are reviewed manually in accordance with section 9 of the
          Privacy Policy.
        </p>
        <p className={P}>
          We reserve the right to restrict or terminate account access if a user materially
          breaches these terms, violates applicable law, or endangers the security of the
          service. Where possible, we will notify the user before or after such action,
          except where immediate action is necessary to protect the service or other users.
        </p>
      </Section>

      <Section id="terms-s12">
        <h2 className={H2}>12. Intellectual property</h2>
        <p className={P}>
          The design, logo, text (excluding user-generated content), software, and other
          Kivora-authored content belong to Kivora or its rightful owners and are protected
          by applicable law. Copying, distributing, modifying, or using this content in a
          way that infringes copyright is not permitted without prior written consent.
        </p>
      </Section>

      <Section id="terms-s13">
        <h2 className={H2}>13. Limitation of liability</h2>
        <p className={`${P} mb-3`}>
          Kivora is provided "as is", without warranties of uninterrupted, error-free, or
          fitness-for-a-particular-purpose operation. To the extent permitted by law,
          Kivora is not liable for indirect, incidental, or consequential damages arising
          from the use of, or inability to use, the service.
        </p>
        <p className={P}>
          This section does not limit or exclude liability that cannot be limited or
          excluded by law — including liability for intentional harm, gross negligence,
          death or personal injury, or a consumer's statutory rights (see section 14).
        </p>
      </Section>

      <Section id="terms-s14">
        <h2 className={H2}>14. Consumer rights</h2>
        <p className={P}>
          These terms do not limit or exclude a user's statutory consumer rights under
          Estonian and European Union consumer protection law that cannot be restricted by
          agreement. Where any provision of these terms conflicts with such mandatory
          rights, the statutory provision prevails.
        </p>
      </Section>

      <Section id="terms-s15">
        <h2 className={H2}>15. Changes to these terms</h2>
        <p className={P}>
          These terms may be updated from time to time, for example as the service evolves
          or applicable law changes. We will notify users of significant changes through
          the Kivora application or website before the change takes effect, where
          reasonably possible. Generally, continued use of the service after such notice is
          treated as acceptance of the updated terms. Where applicable law requires your
          explicit separate consent for a given change, we will request that consent
          separately before the change takes effect for you.
        </p>
      </Section>

      <Section id="terms-s16">
        <h2 className={H2}>16. Governing law and dispute resolution</h2>
        <p className={P}>
          These terms are governed by the laws of the Republic of Estonia, subject to any
          mandatory consumer protection provisions that may apply under the law of your
          country of residence. Disputes will first be addressed through negotiation by
          contacting <Email>support@kivora.ee</Email>. This section does not limit your
          right, under applicable law, to bring a claim before a competent court at any
          time.
        </p>
      </Section>

      <Section id="terms-s17">
        <h2 className={H2}>17. Relationship to the Privacy Policy</h2>
        <p className={P}>
          The processing of personal data in connection with this service is governed by
          the Kivora Privacy Policy (see <Link to="/privacy" className="text-[#6D28D9] font-semibold hover:underline">/privacy</Link>).
          If an interpretive conflict arises between these terms and the Privacy Policy
          regarding personal data processing, the Privacy Policy prevails.
        </p>
      </Section>

      <Section id="terms-s18">
        <h2 className={H2}>Contact</h2>
        <p className={`${P} mb-3`}>
          If you have any questions about these terms of use, please get in touch.
        </p>
        <p className={P}>
          <Email>info@kivora.ee</Email> (general questions) / <Email>support@kivora.ee</Email> (support)
        </p>
      </Section>
    </div>
  )
}

export default function Terms() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FBFAFF] flex flex-col">
      <AuroraBackground />
      <div className="relative z-[1] flex flex-col min-h-screen">
        <PublicHeader />

        <main className="flex-1 py-12 sm:py-16 px-4 sm:px-6">
          <div className="max-w-[1100px] mx-auto">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('pub.backToHome', lang)}
            </Link>

            <div className="text-center mb-10">
              <DraftBadge lang={lang} />
              <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#1A1F36] mb-2">
                {t('terms.title', lang)}
              </h1>
              <p className="text-sm font-semibold text-[#6D28D9]">{t('terms.updated', lang)}</p>
            </div>

            <div className="lg:flex lg:gap-10">
              <TableOfContents lang={lang} />
              <div className="flex-1 min-w-0">
                {lang === 'en' ? <TermsEN /> : <TermsET />}
              </div>
            </div>
          </div>
        </main>

        <PublicFooter />
      </div>
    </div>
  )
}
