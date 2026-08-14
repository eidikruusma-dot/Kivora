import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

function PrivacyET() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">1. Üldsätted</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Käesolev privaatsuspoliitika kirjeldab, kuidas Kivora kogub, kasutab ja kaitseb kasutajate isikuandmeid.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora väärtustab kasutajate privaatsust ning töötleb isikuandmeid vastutustundlikult, turvaliselt ja kooskõlas kehtivate õigusaktidega.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">2. Vastutav töötleja</h2>
        <div className="space-y-2">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Veebileht: kivora.ee</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">E-post: Lisatakse enne Kivora avalikku versiooni.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">3. Milliseid andmeid kogume?</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Sõltuvalt kasutatavatest funktsioonidest võime koguda järgmisi andmeid:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">konto loomisel sisestatud andmed;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">kasutaja profiiliandmed;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">kontaktivormi kaudu saadetud teave;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">rakenduse kasutamisega seotud tehniline teave;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">kasutaja poolt vabatahtlikult sisestatud sisu (näiteks märkmed, ülesanded ja kalendrisündmused).</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">4. Milleks andmeid kasutame?</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kogutud andmeid kasutatakse selleks, et:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">võimaldada Kivora kasutamist;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">hallata kasutajakontosid;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">vastata kasutajate päringutele;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">parandada rakenduse toimivust ja kasutajakogemust;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">tagada teenuse turvalisus;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">täita seadusest tulenevaid kohustusi.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">5. Andmete säilitamine</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Isikuandmeid säilitatakse ainult nii kaua, kui see on vajalik teenuse osutamiseks või seadusest tulenevate kohustuste täitmiseks.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kui kasutaja kustutab oma konto, kustutatakse või anonüümitakse isikuandmed mõistliku aja jooksul, välja arvatud juhul, kui seadus nõuab nende säilitamist.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">6. Andmete jagamine</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kivora ei müü kasutajate isikuandmeid.</p>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Andmeid võidakse jagada ainult juhul, kui:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">see on vajalik teenuse osutamiseks;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">seda nõuab seadus;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">kasutaja on selleks andnud nõusoleku.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">7. Andmete turvalisus</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed">Rakendame mõistlikke tehnilisi ja organisatoonilisi turvameetmeid, et kaitsta kasutajate andmeid volitamata juurdepääsu, muutmise, avalikustamise või hävitamise eest.</p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">8. Kasutaja õigused</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kasutajal on õigus:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">tutvuda enda isikuandmetega;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">parandada ebaõigeid andmeid;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">taotleda andmete kustutamist;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">piirata andmete töötlemist seaduses sätestatud juhtudel;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">saada oma andmed masinloetaval kujul, kui see on kohaldatav;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">võtta tagasi antud nõusolek, kui andmetöötlus põhineb nõusolekul.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">9. Küpsised</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora võib kasutada küpsiseid ja sarnaseid tehnoloogiaid rakenduse toimimise tagamiseks ning kasutajakogemuse parandamiseks.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Täiendav teave küpsiste kasutamise kohta lisatakse enne Kivora avalikku versiooni.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">10. Muudatused privaatsuspoliitikas</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Käesolevat privaatsuspoliitikat võidakse aeg-ajalt uuendada.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Olulistest muudatustest teavitatakse kasutajaid Kivora rakenduses või veebilehel.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">Kontakt</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kui sul on küsimusi käesoleva privaatsuspoliitika kohta, võid meiega ühendust võtta.</p>
        <div className="space-y-2">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">🌐 kivora.ee</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">📧 Lisatakse enne Kivora avalikku versiooni.</p>
        </div>
      </section>
    </div>
  )
}

function PrivacyEN() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">1. General provisions</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">This privacy policy describes how Kivora collects, uses, and protects users' personal data.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora values user privacy and processes personal data responsibly, securely, and in accordance with applicable law.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">2. Data controller</h2>
        <div className="space-y-2">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Website: kivora.ee</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Email: To be added before Kivora's public launch.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">3. What data do we collect?</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Depending on the features you use, we may collect the following data:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">data entered when creating an account;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">user profile data;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">information submitted via the contact form;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">technical information related to app usage;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">content voluntarily entered by the user (e.g. notes, tasks, and calendar events).</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">4. How do we use your data?</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Collected data is used to:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">enable use of Kivora;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">manage user accounts;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">respond to user requests;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">improve application performance and user experience;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">ensure service security;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">fulfil legal obligations.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">5. Data retention</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Personal data is retained only for as long as necessary to provide the service or fulfil legal obligations.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">If a user deletes their account, personal data will be deleted or anonymised within a reasonable time, unless the law requires it to be retained.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">6. Data sharing</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kivora does not sell users' personal data.</p>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Data may be shared only if:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">it is necessary to provide the service;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">required by law;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">the user has given consent.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">7. Data security</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed">We apply reasonable technical and organisational security measures to protect users' data against unauthorised access, alteration, disclosure, or destruction.</p>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">8. Your rights</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">You have the right to:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">access your personal data;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">correct inaccurate data;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">request deletion of your data;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">restrict processing of your data in cases provided by law;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">receive your data in a machine-readable format, where applicable;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">withdraw consent, where processing is based on consent.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">9. Cookies</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora may use cookies and similar technologies to ensure the application functions correctly and to improve the user experience.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Further information on cookie use will be added before Kivora's public launch.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">10. Changes to the privacy policy</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">This privacy policy may be updated from time to time.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Users will be notified of significant changes through the Kivora application or website.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">Contact</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">If you have any questions about this privacy policy, please contact us.</p>
        <div className="space-y-2">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">🌐 kivora.ee</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">📧 <a href="mailto:info@kivora.ee" className="text-[#6F5AE8] hover:underline">info@kivora.ee</a></p>
        </div>
      </section>
    </div>
  )
}

export default function Privacy() {
  const [lang, setLang] = useState<AppLang>(getLocalLanguage)
  useEffect(() => subscribeToLanguage((s) => setLang(s.appLang)), [])

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      <PublicHeader />

      <main className="flex-1 py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#1A1F36] transition-colors mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('pub.backToHome', lang)}
          </Link>

          <h1 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">{t('privacy.title', lang)}</h1>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-10">{t('privacy.updated', lang)}</p>

          {lang === 'en' ? <PrivacyEN /> : <PrivacyET />}
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
