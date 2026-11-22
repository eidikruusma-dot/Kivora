import { Link } from 'react-router-dom'
import { ArrowLeft, Database, Sparkles, Server, Mail, GitBranch } from 'lucide-react'
import { useState, useEffect } from 'react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import AuroraBackground from '@/components/landing/AuroraBackground'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

// Aurora Living Premium glass-card look, matching the already-approved
// auth pages (Login/Register/ForgotPassword/ResetPassword/VerifyEmail).
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
  '2. Vastutav töötleja',
  '3. Milliseid andmeid me kogume',
  '4. Kasutuseesmärk ja õiguslik alus',
  '5. Kellega andmeid jagame',
  '6. AI-assistent',
  '7. Rahvusvahelised andmeedastused',
  '8. Varukoopiad',
  '9. Konto ja andmete kustutamine',
  '10. Tagasiside ja toe säilitamine',
  '11. Andmete turvalisus',
  '12. Sinu õigused',
  '13. Küpsised ja kohalik salvestusruum',
  '14. Alaealised',
  '15. Muudatused poliitikas',
]

const TOC_EN = [
  '1. General provisions',
  '2. Data controller',
  '3. What data we collect',
  '4. Purpose and legal basis',
  '5. Who we share data with',
  '6. AI assistant',
  '7. International data transfers',
  '8. Backups',
  '9. Account and data deletion',
  '10. Support & feedback retention',
  '11. Data security',
  '12. Your rights',
  '13. Cookies and local storage',
  '14. Minors',
  '15. Changes to this policy',
]

function TableOfContents({ lang }: { lang: AppLang }) {
  const items = lang === 'en' ? TOC_EN : TOC_ET
  return (
    <>
      {/* Desktop — sticky sidebar */}
      <nav
        aria-label={t('privacy.toc.label', lang)}
        className="hidden lg:block lg:sticky lg:top-24 lg:self-start w-[220px] shrink-0"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-[#9A94B8] mb-3">
          {t('privacy.toc.label', lang)}
        </p>
        <ul className="space-y-1.5">
          {items.map((label, i) => (
            <li key={i}>
              <a
                href={`#privacy-s${i + 1}`}
                className="block text-[13px] text-[#6B6485] hover:text-[#6D28D9] transition-colors leading-snug"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* Mobile — compact horizontally scrollable chip row (nav only;
          the actual policy text below always renders fully, never
          collapsed). */}
      <nav
        aria-label={t('privacy.toc.label', lang)}
        className="lg:hidden -mx-4 px-4 mb-6 overflow-x-auto"
      >
        <div className="flex gap-2 w-max pb-1">
          {items.map((label, i) => (
            <a
              key={i}
              href={`#privacy-s${i + 1}`}
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
      {t('privacy.draftBadge', lang)}
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

function PrivacyET() {
  return (
    <div className="space-y-5">
      <Section id="privacy-s1">
        <h2 className={H2}>1. Üldsätted</h2>
        <p className={P}>
          Käesolev privaatsuspoliitika kirjeldab, kuidas Kivora kogub, kasutab, säilitab ja kaitseb
          kasutajate isikuandmeid.
        </p>
      </Section>

      <Section id="privacy-s2">
        <h2 className={H2}>2. Vastutav töötleja</h2>
        <p className={P}>
          Kivorat arendab eraisik (mitte äriühing ega füüsilisest isikust ettevõtja):
          "Kivora – eraisikust arendaja".
        </p>
        <ul className={`${UL} mt-3`}>
          <li className={LI}>Andmekaitseküsimused ja üldine kontakt: <Email>info@kivora.ee</Email></li>
          <li className={LI}>Kasutajatugi ning konto/andmete kustutamise taotlused: <Email>support@kivora.ee</Email></li>
        </ul>
      </Section>

      <Section id="privacy-s3">
        <h2 className={H2}>3. Milliseid andmeid me kogume</h2>
        <ul className={UL}>
          <li className={LI}>Konto- ja profiiliandmed: nimi, e-post, telefon, sünnipäev, profiilipilt, eelistatud keel, ajavöönd.</li>
          <li className={LI}>Sisselogimisandmed: e-post ja parool, või Google'i/Facebooki konto.</li>
          <li className={LI}>Sinu enda loodud sisu: ülesanded, kalendrisündmused, märkmed, eesmärgid, harjumused, plaanid, kooliga seotud kirjed, sinu loodud kalendrid.</li>
          <li className={LI}>Üleslaaditud failid: dokumendid ja profiilipilt.</li>
          <li className={LI}>AI-assistendi kasutamine (vt punkt 6).</li>
          <li className={LI}>Push-teavitused: seadme/brauseri teavituste tellimuse tehniline identifikaator, kui lubad teavitusi.</li>
          <li className={LI}>Tagasiside ja tugi: sõnumi sisu, mille saadad "Tagasiside" või "Abi ja tugi" lehe kaudu, koos sinu konto identifikaatori, nime ja e-postiga.</li>
          <li className={LI}>Kontaktivorm: nimi, e-post ja sõnum avalikult kättesaadava kontaktivormi kaudu (ei nõua kontot, pole sinu kontoga seotav).</li>
          <li className={LI}>Varukoopiad (vt punkt 8).</li>
          <li className={LI}>Tehniline teave, mis on vajalik rakenduse toimimiseks.</li>
        </ul>
      </Section>

      <Section id="privacy-s4">
        <h2 className={H2}>4. Milleks andmeid kasutame ja millel see põhineb</h2>
        <ul className={UL}>
          <li className={LI}>Kivora teenuse osutamiseks ja konto haldamiseks — lepingu täitmiseks.</li>
          <li className={LI}>AI-assistendi vastuste koostamiseks — lepingu täitmiseks, kuna see toimub ainult sinu enda valikul.</li>
          <li className={LI}>Kasutajatoe ja tagasiside käsitlemiseks — lepingu täitmiseks ja meie õigustatud huvi alusel teenust parandada.</li>
          <li className={LI}>Teenuse turvalisuse tagamiseks — õigustatud huvi alusel.</li>
          <li className={LI}>Seadusest tulenevate kohustuste täitmiseks, kui kohaldatav.</li>
        </ul>
      </Section>

      <Section id="privacy-s5">
        <h2 className={H2}>5. Kellega andmeid jagame</h2>
        <p className={`${P} mb-4`}>
          Kivora ei müü kasutajate isikuandmeid. Teenuse toimimiseks kasutame järgmisi teenusepakkujaid:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[
            { Icon: Database, label: 'Firebase' },
            { Icon: Sparkles, label: 'OpenAI' },
            { Icon: Server, label: 'Render' },
            { Icon: Mail, label: 'Zone' },
            { Icon: GitBranch, label: 'GitHub' },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/60 border border-[#E4DEFB]">
              <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
                <Icon size={17} className="text-[#6D28D9]" />
              </div>
              <span className="text-[12px] font-semibold text-[#1A1F36]">{label}</span>
            </div>
          ))}
        </div>
        <ul className={UL}>
          <li className={LI}><strong className="text-[#1A1F36]">Firebase / Google Cloud</strong> — kontode haldus, andmebaas, failihoidla.</li>
          <li className={LI}><strong className="text-[#1A1F36]">OpenAI</strong> — AI-assistendi vastuste genereerimine (vt punkt 6).</li>
          <li className={LI}><strong className="text-[#1A1F36]">Render</strong> — Kivora taustateenuse majutamine.</li>
          <li className={LI}><strong className="text-[#1A1F36]">Zone veebimajutus</strong> — meie enda e-kirja edastusskript kontakti-, toe- ja tagasisidekirjade saatmiseks.</li>
          <li className={LI}><strong className="text-[#1A1F36]">GitHub</strong> — varukoopiate turvaline hoidmine (vt punkt 8).</li>
        </ul>
      </Section>

      <Section id="privacy-s6">
        <h2 className={H2}>6. AI-assistent</h2>
        <p className={`${P} mb-3`}>
          Kui avad ja kasutad Kivora AI-assistenti, saadame sinu sõnumi ja lühikese ülevaate sinu
          hetke ülesannetest, eesmärkidest, harjumustest, märkmetest ja kalendrist meie
          AI-teenuse pakkujale OpenAI (asub USA-s), et koostada sulle vastus. See toimub ainult
          siis, kui ise AI-assistenti avad ja kasutad.
        </p>
        <p className={P}>
          Sinu AI-vestlused salvestatakse, et saaksid varasemaid vestlusi vaadata ja neid
          jätkata. Sa saad igal ajal kustutada üksikuid vestlusi.
        </p>
      </Section>

      <Section id="privacy-s7">
        <h2 className={H2}>7. Rahvusvahelised andmeedastused</h2>
        <p className={P}>
          Mõned meie teenusepakkujad (näiteks OpenAI, kelle poole pöördume AI-assistendi
          kasutamisel) võivad asuda väljaspool Euroopa Liitu/Majanduspiirkonda. See tähendab,
          et osa sinu andmetest võib mõnel juhul liikuda väljapoole Euroopa Liitu.
        </p>
      </Section>

      <Section id="privacy-s8">
        <h2 className={H2}>8. Varukoopiad</h2>
        <p className={P}>
          Sinu enda rakenduses loodud varukoopiaid saad igal ajal ise hallata ja kustutada.
          Lisaks võime aeg-ajalt luua täiendavaid turvalisi, krüpteeritud varukoopiaid sinu
          andmetest, et vältida andmekadu. Osa neist kustutame automaatselt kuni 90 päeva
          möödudes; teiste säilitusaeg ei ole praegu tehniliselt sama rangelt piiratud, kuid me
          ei hoia neid kauem, kui on mõistlikult vajalik.
        </p>
      </Section>

      <Section id="privacy-s9">
        <h2 className={H2}>9. Konto ja andmete kustutamine</h2>
        <p className={`${P} mb-3`}>
          Sul on õigus taotleda oma Kivora konto ja sellega seotud andmete kustutamist,
          kirjutades <Email>support@kivora.ee</Email> aadressile või "Abi ja tugi" lehe kaudu.
          Vaatame iga taotluse läbi käsitsi.
        </p>
        <p className={P}>
          Teeme mõistlikke pingutusi, et kustutada kõik sinu andmed mõistliku aja jooksul. Mõne
          andmeliigi (näiteks teatud üleslaaditud failide) puhul ei saa me praegu tehniliste
          piirangute tõttu alati garanteerida kustutamise täielikkust kindlaksmääratud tähtaja
          jooksul — sellisel juhul käsitleme neid eraldi ja käsitsi. Teavitame sind, kui sinu
          taotlus on täidetud, ning ütleme ausalt, kui mõni osa vajab veel täiendavat tegevust.
        </p>
      </Section>

      <Section id="privacy-s10">
        <h2 className={H2}>10. Tagasiside ja kasutajatoe kirjavahetuse säilitamine</h2>
        <p className={P}>
          Tagasiside ja kasutajatoe kirjavahetust säilitame nii kaua, kui see on vajalik sinu
          pöördumise lahendamiseks.
        </p>
      </Section>

      <Section id="privacy-s11">
        <h2 className={H2}>11. Andmete turvalisus</h2>
        <p className={P}>
          Rakendame mõistlikke tehnilisi ja organisatsioonilisi turvameetmeid kasutajate andmete
          kaitsmiseks volitamata juurdepääsu, muutmise, avalikustamise või hävitamise eest. Ükski
          süsteem ei ole 100% turvaline.
        </p>
      </Section>

      <Section id="privacy-s12">
        <h2 className={H2}>12. Sinu õigused</h2>
        <p className={`${P} mb-3`}>Sul on õigus:</p>
        <ul className={UL}>
          <li className={LI}>tutvuda enda isikuandmetega;</li>
          <li className={LI}>taotleda ebaõigete andmete parandamist;</li>
          <li className={LI}>taotleda oma andmete kustutamist (vt punkt 9);</li>
          <li className={LI}>piirata andmete töötlemist seaduses sätestatud juhtudel;</li>
          <li className={LI}>saada oma andmed masinloetaval kujul, kui kohaldatav;</li>
          <li className={LI}>esitada vastuväiteid õigustatud huvil põhinevale töötlemisele;</li>
          <li className={LI}>võtta tagasi antud nõusolek, kui töötlemine põhineb nõusolekul;</li>
          <li className={LI}>esitada kaebus Andmekaitse Inspektsioonile.</li>
        </ul>
        <p className={`${P} mb-3`}>
          Vastame GDPR-i alusel esitatud taotlustele üldjuhul ühe kuu jooksul; seadus lubab
          teatud juhtudel seda tähtaega pikendada.
        </p>
        <p className={P}>Õiguste kasutamiseks kirjuta: <Email>info@kivora.ee</Email></p>
      </Section>

      <Section id="privacy-s13">
        <h2 className={H2}>13. Küpsised ja kohalik salvestusruum</h2>
        <p className={`${P} mb-3`}>
          Kivora ei kasuta jälgimis- ega analüütikaküpsiseid ega kolmandate osapoolte
          reklaamitehnoloogiaid. Kasutame brauseri kohalikku salvestusruumi (localStorage) sinu
          enda eelistuste (nt keel, välimus) meelespidamiseks sinu enda seadmes. Selline teave
          jääb tavapäraselt sinu seadmesse ja ei ole meile otse nähtav.
        </p>
        <p className={P}>
          Sisselogimise säilitamiseks kasutab Kivora brauseri IndexedDB-tehnoloogiat, mida
          rakendab meie kasutatav sisselogimisteenus.
        </p>
      </Section>

      <Section id="privacy-s14">
        <h2 className={H2}>14. Alaealised</h2>
        <p className={P}>
          Kivora on mõeldud kasutamiseks alates 13. eluaastast. Kui arvad, et alla 13-aastane
          laps on loonud Kivora konto, kirjuta <Email>info@kivora.ee</Email> ja me kustutame
          selle konto.
        </p>
      </Section>

      <Section id="privacy-s15">
        <h2 className={H2}>15. Muudatused privaatsuspoliitikas</h2>
        <p className={P}>
          Võime seda poliitikat aeg-ajalt uuendada. Olulistest muudatustest teavitame kasutajaid
          rakenduses või veebilehel.
        </p>
      </Section>

      <Section id="privacy-s16">
        <h2 className={H2}>Kontakt</h2>
        <p className={P}>Küsimuste korral käesoleva privaatsuspoliitika kohta kirjuta: <Email>info@kivora.ee</Email></p>
      </Section>
    </div>
  )
}

function PrivacyEN() {
  return (
    <div className="space-y-5">
      <Section id="privacy-s1">
        <h2 className={H2}>1. General provisions</h2>
        <p className={P}>
          This privacy policy describes how Kivora collects, uses, stores and protects users'
          personal data.
        </p>
      </Section>

      <Section id="privacy-s2">
        <h2 className={H2}>2. Data controller</h2>
        <p className={P}>
          Kivora is developed by a private individual (not a registered company):
          "Kivora – an independent developer".
        </p>
        <ul className={`${UL} mt-3`}>
          <li className={LI}>Privacy and data protection contact: <Email>info@kivora.ee</Email></li>
          <li className={LI}>Support and account/data deletion requests: <Email>support@kivora.ee</Email></li>
        </ul>
      </Section>

      <Section id="privacy-s3">
        <h2 className={H2}>3. What data we collect</h2>
        <ul className={UL}>
          <li className={LI}>Account and profile data: name, email, phone, birthday, profile photo, preferred language, timezone.</li>
          <li className={LI}>Sign-in data: email and password, or your Google/Facebook account.</li>
          <li className={LI}>Content you create: tasks, calendar events, notes, goals, habits, plans, school-related entries, calendars you create.</li>
          <li className={LI}>Uploaded files: documents and a profile photo.</li>
          <li className={LI}>AI assistant usage (see section 6).</li>
          <li className={LI}>Push notifications: your device/browser's subscription identifier, if you enable notifications.</li>
          <li className={LI}>Feedback and support: the content of messages sent via "Feedback" or "Help & support", with your account identifier, name and email.</li>
          <li className={LI}>Contact form: name, email and message via our public contact form (no login required, not linked to your account).</li>
          <li className={LI}>Backups (see section 8).</li>
          <li className={LI}>Technical information needed for the app to function.</li>
        </ul>
      </Section>

      <Section id="privacy-s4">
        <h2 className={H2}>4. Why we use your data, and the legal basis</h2>
        <ul className={UL}>
          <li className={LI}>To provide the service and manage your account — contract.</li>
          <li className={LI}>To generate AI assistant responses — contract, since this only happens at your own choice.</li>
          <li className={LI}>To handle support and feedback — contract and our legitimate interest in improving the service.</li>
          <li className={LI}>To keep the service secure — legitimate interest.</li>
          <li className={LI}>To meet legal obligations, where applicable.</li>
        </ul>
      </Section>

      <Section id="privacy-s5">
        <h2 className={H2}>5. Who we share data with</h2>
        <p className={`${P} mb-4`}>Kivora does not sell personal data. We use the following service providers:</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
          {[
            { Icon: Database, label: 'Firebase' },
            { Icon: Sparkles, label: 'OpenAI' },
            { Icon: Server, label: 'Render' },
            { Icon: Mail, label: 'Zone' },
            { Icon: GitBranch, label: 'GitHub' },
          ].map(({ Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white/60 border border-[#E4DEFB]">
              <div className="w-9 h-9 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
                <Icon size={17} className="text-[#6D28D9]" />
              </div>
              <span className="text-[12px] font-semibold text-[#1A1F36]">{label}</span>
            </div>
          ))}
        </div>
        <ul className={UL}>
          <li className={LI}><strong className="text-[#1A1F36]">Firebase / Google Cloud</strong> — account management, database, file storage.</li>
          <li className={LI}><strong className="text-[#1A1F36]">OpenAI</strong> — generating AI assistant responses (see section 6).</li>
          <li className={LI}><strong className="text-[#1A1F36]">Render</strong> — hosting Kivora's backend service.</li>
          <li className={LI}><strong className="text-[#1A1F36]">Zone web hosting</strong> — our own email relay for contact, support and feedback messages.</li>
          <li className={LI}><strong className="text-[#1A1F36]">GitHub</strong> — secure storage of backups (see section 8).</li>
        </ul>
      </Section>

      <Section id="privacy-s6">
        <h2 className={H2}>6. AI assistant</h2>
        <p className={`${P} mb-3`}>
          When you open and use Kivora's AI assistant, we send your message and a short overview
          of your current tasks, goals, habits, notes and calendar to our AI service provider,
          OpenAI (located in the United States), to generate a response. This only happens when
          you choose to open and use the AI assistant.
        </p>
        <p className={P}>
          Your AI conversations are saved so you can view and continue earlier conversations.
          You can delete individual conversations at any time.
        </p>
      </Section>

      <Section id="privacy-s7">
        <h2 className={H2}>7. International data transfers</h2>
        <p className={P}>
          Some of our service providers (for example OpenAI, which we use for the AI assistant)
          may be located outside the European Union/European Economic Area. This means some of
          your data may, in certain cases, be transferred outside the EU.
        </p>
      </Section>

      <Section id="privacy-s8">
        <h2 className={H2}>8. Backups</h2>
        <p className={P}>
          You can manage and delete backups you create yourself inside the app at any time. We
          may also periodically create additional secure, encrypted backups of your data to
          prevent data loss. Some of these are automatically deleted after up to 90 days; others
          do not currently have the same strict technical time limit, but we do not keep them
          for longer than is reasonably necessary.
        </p>
      </Section>

      <Section id="privacy-s9">
        <h2 className={H2}>9. Account and data deletion</h2>
        <p className={`${P} mb-3`}>
          You may request deletion of your Kivora account and related data by writing to{' '}
          <Email>support@kivora.ee</Email> or via the "Help & support" page. We review every
          request manually.
        </p>
        <p className={P}>
          We make reasonable efforts to delete all your data within a reasonable time. For some
          types of data (for example certain uploaded files), we cannot currently always
          guarantee complete deletion within a fixed timeframe due to technical limitations — in
          that case we handle it separately and manually. We will let you know once your request
          has been completed, and will tell you honestly if any part still needs further action.
        </p>
      </Section>

      <Section id="privacy-s10">
        <h2 className={H2}>10. Retention of support and feedback correspondence</h2>
        <p className={P}>
          We retain feedback and support correspondence for as long as necessary to resolve your
          request.
        </p>
      </Section>

      <Section id="privacy-s11">
        <h2 className={H2}>11. Data security</h2>
        <p className={P}>
          We apply reasonable technical and organisational measures to protect your data against
          unauthorised access, alteration, disclosure or destruction. No system is 100% secure.
        </p>
      </Section>

      <Section id="privacy-s12">
        <h2 className={H2}>12. Your rights</h2>
        <p className={`${P} mb-3`}>You have the right to:</p>
        <ul className={UL}>
          <li className={LI}>access your personal data;</li>
          <li className={LI}>request correction of inaccurate data;</li>
          <li className={LI}>request deletion of your data (see section 9);</li>
          <li className={LI}>restrict processing in cases provided by law;</li>
          <li className={LI}>receive your data in a machine-readable format, where applicable;</li>
          <li className={LI}>object to processing based on legitimate interest;</li>
          <li className={LI}>withdraw consent, where processing is based on consent;</li>
          <li className={LI}>lodge a complaint with the Estonian Data Protection Inspectorate.</li>
        </ul>
        <p className={`${P} mb-3`}>
          We generally respond to GDPR requests within one month; the law allows this period to
          be extended in certain cases.
        </p>
        <p className={P}>To exercise your rights, write to: <Email>info@kivora.ee</Email></p>
      </Section>

      <Section id="privacy-s13">
        <h2 className={H2}>13. Cookies and local storage</h2>
        <p className={`${P} mb-3`}>
          Kivora does not use tracking or analytics cookies, nor third-party advertising
          technology. We use your browser's local storage (localStorage) to remember your own
          preferences (such as language or appearance) on your own device. This information
          typically stays on your device and is not directly visible to us.
        </p>
        <p className={P}>
          Kivora uses your browser's IndexedDB technology, used by our sign-in service, to keep
          you signed in.
        </p>
      </Section>

      <Section id="privacy-s14">
        <h2 className={H2}>14. Minors</h2>
        <p className={P}>
          Kivora is intended for use by people aged 13 and older. If you believe a child under
          13 has created a Kivora account, write to <Email>info@kivora.ee</Email> and we will
          delete it.
        </p>
      </Section>

      <Section id="privacy-s15">
        <h2 className={H2}>15. Changes to this privacy policy</h2>
        <p className={P}>
          We may update this policy from time to time. We will notify users of significant
          changes in the app or on the website.
        </p>
      </Section>

      <Section id="privacy-s16">
        <h2 className={H2}>Contact</h2>
        <p className={P}>If you have any questions about this privacy policy, write to: <Email>info@kivora.ee</Email></p>
      </Section>
    </div>
  )
}

export default function Privacy() {
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
                {t('privacy.title', lang)}
              </h1>
              <p className="text-sm font-semibold text-[#6D28D9]">{t('privacy.updated', lang)}</p>
            </div>

            <div className="lg:flex lg:gap-10">
              <TableOfContents lang={lang} />
              <div className="flex-1 min-w-0">
                {lang === 'en' ? <PrivacyEN /> : <PrivacyET />}
              </div>
            </div>
          </div>
        </main>

        <PublicFooter />
      </div>
    </div>
  )
}
