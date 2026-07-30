import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'

export default function Terms() {
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
            Tagasi avalehele
          </Link>

          <h1 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">Kasutustingimused</h1>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-10">Viimati uuendatud: 27.07.2026</p>

          <div className="space-y-6">
            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">1. Üldsätted</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Käesolevad kasutustingimused reguleerivad Kivora veebilehe ja rakenduse kasutamist.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kivora kasutamisega nõustub kasutaja käesolevate kasutustingimustega.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">2. Teenuse eesmärk</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kivora on isiklik produktiivsusrakendus, mis aitab kasutajatel planeerida oma aega, hallata ülesandeid, pidada märkmeid, jälgida harjumusi ning seada ja saavutada eesmärke.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Teenust arendatakse pidevalt ning funktsionaalsus võib aja jooksul muutuda või täieneda.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">3. Kasutajakonto</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Mõnede Kivora funktsioonide kasutamiseks võib olla vajalik kasutajakonto loomine.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kasutaja vastutab oma konto turvalisuse ja sisselogimisandmete konfidentsiaalsuse eest.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">4. Kasutaja kohustused</h2>
              <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">
                Kasutaja kohustub:
              </p>
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
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kivora kujundus, logo, tekstid, tarkvara ja muu sisu kuuluvad Kivorale või nende õigustatud omanikele ning on kaitstud kehtivate õigusaktidega.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Ilma eelneva kirjaliku loata ei ole lubatud Kivora sisu kopeerida, levitada ega kasutada viisil, mis rikub autoriõigusi.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">6. Vastutuse piiramine</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kivora eesmärk on pakkuda usaldusväärset teenust, kuid ei saa garanteerida teenuse katkematut või veatut toimimist.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kivora ei vastuta kahju eest, mis võib tuleneda teenuse ajutisest katkestusest, tehnilistest tõrgetest või kasutaja tegevusest.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">7. Konto lõpetamine</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kasutajal on õigus oma konto igal ajal sulgeda.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Kivoral on õigus piirata või lõpetada teenuse kasutamine juhul, kui kasutaja rikub käesolevaid kasutustingimusi või kehtivaid õigusakte.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">8. Muudatused kasutustingimustes</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Käesolevaid kasutustingimusi võidakse aeg-ajalt uuendada.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Olulistest muudatustest teavitatakse kasutajaid Kivora rakenduses või veebilehel.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">9. Kohaldatav õigus</h2>
              <div className="space-y-3">
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Käesolevatele kasutustingimustele kohaldatakse Eesti Vabariigi õigust.
                </p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">
                  Vaidlused püütakse lahendada läbirääkimiste teel. Vajadusel lahendatakse vaidlused Eesti Vabariigi kohtutes.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-bold text-[#1A1F36] mb-3">Kontakt</h2>
              <p className="text-[15px] text-[#64748B] leading-relaxed mb-3">
                Kui sul on küsimusi käesolevate kasutustingimuste kohta, võid meiega ühendust võtta.
              </p>
              <div className="space-y-2">
                <p className="text-[15px] text-[#64748B] leading-relaxed">Eidi Kruusmaa / Kivora</p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">🌐 kivora.ee</p>
                <p className="text-[15px] text-[#64748B] leading-relaxed">📧 Lisatakse enne Kivora avalikku versiooni.</p>
              </div>
            </section>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
