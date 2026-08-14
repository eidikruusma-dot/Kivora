import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useState, useEffect } from 'react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import { subscribeToLanguage, getLocalLanguage } from '@/lib/languageStore'
import type { AppLang } from '@/lib/languageStore'
import { t } from '@/lib/translations'

function TermsET() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">1. Üldsätted</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Käesolevad kasutustingimused reguleerivad Kivora veebilehe ja rakenduse kasutamist.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora kasutamisega nõustub kasutaja käesolevate kasutustingimustega.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">2. Teenuse eesmärk</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora on isiklik produktiivsusrakendus, mis aitab kasutajatel planeerida oma aega, hallata ülesandeid, pidada märkmeid, jälgida harjumusi ning seada ja saavutada eesmärke.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Teenust arendatakse pidevalt ning funktsionaalsus võib aja jooksul muutuda või täieneda.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">3. Kasutajakonto</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Mõnede Kivora funktsioonide kasutamiseks võib olla vajalik kasutajakonto loomine.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kasutaja vastutab oma konto turvalisuse ja sisselogimisandmete konfidentsiaalsuse eest.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">4. Kasutaja kohustused</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kasutaja kohustub:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">esitama õigeid andmeid;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">kasutama Kivorat seaduslikel eesmärkidel;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">hoidma oma konto turvalisena;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">mitte kahjustama teenuse toimimist ega turvalisust.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">5. Intellektuaalne omand</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora kujundus, logo, tekstid, tarkvara ja muu sisu kuuluvad Kivorale või nende õigustatud omanikele ning on kaitstud kehtivate õigusaktidega.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Ilma eelneva kirjaliku loata ei ole lubatud Kivora sisu kopeerida, levitada ega kasutada viisil, mis rikub autoriõigusi.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">6. Vastutuse piiramine</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora eesmärk on pakkuda usaldusväärset teenust, kuid ei saa garanteerida teenuse katkematut või veatut toimimist.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora ei vastuta kahju eest, mis võib tuleneda teenuse ajutisest katkestusest, tehnilistest tõrgetest või kasutaja tegevusest.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">7. Konto lõpetamine</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kasutajal on õigus oma konto igal ajal sulgeda.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivoral on õigus piirata või lõpetada teenuse kasutamine juhul, kui kasutaja rikub käesolevaid kasutustingimusi või kehtivaid õigusakte.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">8. Muudatused kasutustingimustes</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Käesolevaid kasutustingimusi võidakse aeg-ajalt uuendada.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Olulistest muudatustest teavitatakse kasutajaid Kivora rakenduses või veebilehel.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">9. Kohaldatav õigus</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Käesolevatele kasutustingimustele kohaldatakse Eesti Vabariigi õigust.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Vaidlused püütakse lahendada läbirääkimiste teel. Vajadusel lahendatakse vaidlused Eesti Vabariigi kohtutes.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">Kontakt</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">Kui sul on küsimusi käesolevate kasutustingimuste kohta, võid meiega ühendust võtta.</p>
        <div className="space-y-2">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">🌐 kivora.ee</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">📧 Lisatakse enne Kivora avalikku versiooni.</p>
        </div>
      </section>
    </div>
  )
}

function TermsEN() {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">1. General provisions</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">These terms of service govern the use of the Kivora website and application.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">By using Kivora, the user agrees to these terms of service.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">2. Purpose of the service</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora is a personal productivity application that helps users plan their time, manage tasks, keep notes, track habits, and set and achieve goals.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">The service is continuously developed and its functionality may change or expand over time.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">3. User account</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Creating a user account may be required to access some Kivora features.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">The user is responsible for the security of their account and the confidentiality of their login credentials.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">4. User obligations</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">The user agrees to:</p>
        <ul className="space-y-2">
          <li className="text-[15px] text-[#64748B] leading-relaxed">provide accurate information;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">use Kivora for lawful purposes;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">keep their account secure;</li>
          <li className="text-[15px] text-[#64748B] leading-relaxed">not harm the operation or security of the service.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">5. Intellectual property</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">The design, logo, text, software, and other content of Kivora belong to Kivora or their respective owners and are protected by applicable laws.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Copying, distributing, or using Kivora content in a way that infringes copyright is not permitted without prior written consent.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">6. Limitation of liability</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora aims to provide a reliable service, but cannot guarantee uninterrupted or error-free operation.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora is not liable for any damages arising from temporary service interruptions, technical failures, or user actions.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">7. Account termination</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">The user has the right to close their account at any time.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Kivora reserves the right to restrict or terminate service access if the user violates these terms or applicable law.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">8. Changes to terms</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">These terms of service may be updated from time to time.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Users will be notified of significant changes through the Kivora application or website.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">9. Applicable law</h2>
        <div className="space-y-3">
          <p className="text-[15px] text-[#64748B] leading-relaxed">These terms of service are governed by the laws of the Republic of Estonia.</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">Disputes will be resolved through negotiation. If necessary, disputes will be resolved in Estonian courts.</p>
        </div>
      </section>
      <section>
        <h2 className="text-lg font-bold text-[#1A1F36] mb-3">Contact</h2>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">If you have any questions about these terms of service, please contact us.</p>
        <div className="space-y-2">
          <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">🌐 kivora.ee</p>
          <p className="text-[15px] text-[#64748B] leading-relaxed">📧 <a href="mailto:info@kivora.ee" className="text-[#6F5AE8] hover:underline">info@kivora.ee</a></p>
        </div>
      </section>
    </div>
  )
}

export default function Terms() {
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

          <h1 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">{t('terms.title', lang)}</h1>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-10">{t('terms.updated', lang)}</p>

          {lang === 'en' ? <TermsEN /> : <TermsET />}
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
