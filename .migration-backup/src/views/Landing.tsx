import { useNavigate } from 'react-router-dom'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'
import { CheckSquare, Calendar, StickyNote, Activity, Target, Sparkles, ArrowRight } from 'lucide-react'

const features = [
  { icon: CheckSquare, title: 'Ülesanded', desc: 'Planeer ja halda oma päevaseid ülesandeid ühest kohast.' },
  { icon: Calendar, title: 'Kalender', desc: 'Hoia sündmused ja tähtajad alati silme ees.' },
  { icon: StickyNote, title: 'Märkmed', desc: 'Salvest kiirelt mõtted ja ideed, mis hiljem vajavad tähelepanu.' },
  { icon: Activity, title: 'Harjumused', desc: 'Ehita järjepidevaid harjumusi ja järgi oma arengut.' },
  { icon: Target, title: 'Eesmärgid', desc: 'Sea eesmärke ja jagu need tegevusteks, mis viivad tulemuseni.' },
  { icon: Sparkles, title: 'AI assistent', desc: 'Too nutikas abiline oma tootlikkuse haldamiseks.' },
]

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-[100dvh] bg-[#F4F3EF]">
      <PublicHeader />

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EDE9FB] text-[#6F5AE8] text-xs font-semibold mb-6">
            <Sparkles size={14} />
            Sinu isiklik tootlikkuse keskkond
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1A1F36] leading-tight mb-5">
            Korralda oma päev<br />üks lihtne vaade korraga
          </h1>
          <p className="text-lg text-[#64748B] leading-relaxed mb-8 max-w-xl mx-auto">
            Kivora ühendab ülesanded, kalendri, märkmed, harjumused ja eesmärgid ühte rahulikku ja õhulisse keskkonda — nii saad keskenduda sellele, mis loeb.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => navigate('/register')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] transition-colors flex items-center justify-center gap-2"
            >
              Alusta tasuta
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white border border-[#E8E6E0] text-[#1A1F36] text-sm font-semibold hover:bg-[#F8F7F4] transition-colors"
            >
              Logi sisse
            </button>
          </div>
          <p className="text-xs text-[#94A3B8] mt-4">Tasuta kasutamiseks. Krediitkaarti pole vaja.</p>
        </div>
      </section>

      {/* Features preview */}
      <section id="features" className="py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">Kõik, mida vajad ühes kohas</h2>
          <p className="text-sm text-[#64748B] text-center mb-10">Lihtne ja rahulik viis oma igapäevase elu haldamiseks.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white rounded-2xl p-6 border border-[#EBEBEB] hover:shadow-sm transition-shadow">
                <div className="w-11 h-11 rounded-xl bg-[#EDE9FB] flex items-center justify-center mb-4">
                  <Icon size={20} className="text-[#6F5AE8]" />
                </div>
                <h3 className="text-sm font-bold text-[#1A1F36] mb-1.5">{title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-16 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-[#1A1F36] mb-3">Lihtne algus</h2>
          <p className="text-sm text-[#64748B] mb-10">Kolm sammu ja oled valmis.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Loo konto', desc: 'Registreeri end tasuta vähem kui minutiga.' },
              { step: '2', title: 'Seadista päev', desc: 'Lisa ülesanded, eesmärgid ja harjumused.' },
              { step: '3', title: 'Saavuta rohkem', desc: 'Jälgi oma arengut ja hoia fookust.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-10 h-10 rounded-full bg-[#6F5AE8] text-white font-bold text-sm flex items-center justify-center mx-auto mb-3">
                  {step}
                </div>
                <h3 className="text-sm font-bold text-[#1A1F36] mb-1">{title}</h3>
                <p className="text-sm text-[#64748B]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About / Meist */}
      <section id="about" className="py-16 px-4 sm:px-6 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">Meist</h2>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-12">Kõik oluline. Ühes kohas.</p>

          <div className="space-y-8 mb-12">
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Kivora sündis soovist muuta igapäevaelu lihtsamaks.
            </p>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Me usume, et inimesed ei peaks kasutama kümneid erinevaid rakendusi oma elu korraldamiseks. Kalender ühes kohas, ülesanded teises, märkmed kolmandas ja eesmärgid neljandas muudavad igapäeva killustatuks ning võtavad rohkem aega, kui peaks.
            </p>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Kivora eesmärk on tuua kõik oluline kokku ühte kohta.
            </p>
            <div className="border-l-[5px] border-[#6F5AE8] pl-7 py-1 rounded-r-lg bg-[#6F5AE8]/[0.04]">
              <p className="text-[15px] text-[#1A1F36] font-semibold leading-relaxed">
                Üks rakendus. Üks selge vaade. Üks koht, kus saad planeerida oma päeva, hallata ülesandeid, jälgida harjumusi, pidada märkmeid, seada eesmärke ja hoida oma elu korrastatuna.
              </p>
            </div>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Me usume, et tehnoloogia peaks aitama inimest, mitte muutma tema päeva keerulisemaks. Seetõttu keskendume lihtsale, rahulikule ja läbimõeldud kasutuskogemusele, kus iga funktsioon on loodud päriselt väärtust looma.
            </p>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Kivora ei ole lihtsalt kalender ega ülesannete nimekiri. See on isiklik produktiivsuskeskus, mis aitab sul näha tervikpilti, keskenduda olulisele ja liikuda samm-sammult oma eesmärkide poole.
            </p>
          </div>

          {/* Meie põhimõtted */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-5">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-4">Meie põhimõtted</h3>
            <ul className="space-y-3">
              {[
                'Lihtsus. Kõik peab olema arusaadav ja kiiresti kasutatav.',
                'Selgus. Oluline info on alati esiplaanil.',
                'Privaatsus. Sinu andmed kuuluvad sulle.',
                'Usaldusväärsus. Rakendus peab töötama stabiilselt ja ennustatavalt.',
                'Pidev areng. Kivora areneb koos oma kasutajatega ning muutub paremaks iga uuendusega.',
              ].map((principle) => (
                <li key={principle} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#6F5AE8] flex-shrink-0" />
                  <span className="text-[15px] text-[#64748B] leading-relaxed">{principle}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Meie missioon */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 sm:p-5 mb-5">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">Meie missioon</h3>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Aidata inimestel kulutada vähem aega erinevate rakenduste vahel liikumisele ja rohkem aega sellele, mis on päriselt oluline.
            </p>
          </div>

          {/* Meie visioon */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-4 sm:p-5 mb-8">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">Meie visioon</h3>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Luua usaldusväärne ja terviklik platvorm, kus kõik igapäevaelu olulised tegevused on ühendatud ühte lihtsasse, kaasaegsesse ja kasutajasõbralikku rakendusse.
            </p>
          </div>

          <p className="text-center text-xl font-bold text-[#1A1F36]">
            Kivora. Kõik oluline. Ühes kohas.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center bg-white rounded-2xl border border-[#EBEBEB] px-8 py-12">
          <h2 className="text-2xl font-bold text-[#1A1F36] mb-3">Alusta oma teekonda täna</h2>
          <p className="text-sm text-[#64748B] mb-6">Loo konto ja sa oma esimese päeva planeeritud vähem kui minutiga.</p>
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] transition-colors inline-flex items-center gap-2"
          >
            Alusta tasuta
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
