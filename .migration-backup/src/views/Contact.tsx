import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import PublicHeader from '@/components/layout/PublicHeader'
import PublicFooter from '@/components/layout/PublicFooter'

export default function Contact() {
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

          <h1 className="text-2xl font-bold text-[#1A1F36] text-center mb-3">Kontakt</h1>
          <p className="text-base font-semibold text-[#6F5AE8] text-center mb-10">Võta meiega ühendust</p>

          <div className="space-y-5 mb-10">
            <p className="text-[15px] text-[#64748B] leading-relaxed text-center">
              Kas sul on küsimusi, ettepanekuid või vajad abi?
            </p>
            <p className="text-[15px] text-[#64748B] leading-relaxed text-center">
              Meile on oluline kasutajate tagasiside ja kõik ideed, mis aitavad Kivorat paremaks muuta.
            </p>
            <p className="text-[15px] text-[#64748B] leading-relaxed text-center">
              Kui soovid meiega ühendust võtta, täida allolev kontaktivorm. Vastame esimesel võimalusel.
            </p>
          </div>

          {/* Kontaktivorm */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-6">
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Nimi</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8E6E0] text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors"
                  placeholder="Sinu nimi"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">E-posti aadress</label>
                <input
                  type="email"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8E6E0] text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors"
                  placeholder="sinu@email.ee"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Teema</label>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8E6E0] text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors"
                  placeholder="Teema"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1A1F36] mb-1.5">Sõnum</label>
                <textarea
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8E6E0] text-sm text-[#1A1F36] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6F5AE8] focus:ring-1 focus:ring-[#6F5AE8] transition-colors resize-none"
                  placeholder="Sinu sõnum"
                />
              </div>
              <button
                type="submit"
                className="w-full px-6 py-3 rounded-xl bg-[#6F5AE8] text-white text-sm font-semibold hover:bg-[#5B4AD5] transition-colors"
              >
                Saada sõnum
              </button>
            </form>
          </div>

          {/* Kontaktandmed */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-5">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">Kontaktandmed</h3>
            <div className="space-y-2">
              <p className="text-[15px] text-[#64748B] leading-relaxed">
                Veebileht: kivora.ee
              </p>
              <p className="text-[15px] text-[#64748B] leading-relaxed">
                E-post: Lisatakse enne Kivora avalikku versiooni.
              </p>
            </div>
          </div>

          {/* Privaatsus */}
          <div className="bg-white rounded-2xl border border-[#EBEBEB] p-5 sm:p-6 mb-10">
            <h3 className="text-lg font-bold text-[#1A1F36] mb-3">Privaatsus</h3>
            <p className="text-[15px] text-[#64748B] leading-relaxed">
              Kontaktivormi kaudu saadetud andmeid kasutatakse ainult sinu päringule vastamiseks. Neid ei jagata kolmandatele osapooltele ega kasutata turunduslikel eesmärkidel.
            </p>
          </div>

          <p className="text-center text-xl font-bold text-[#1A1F36]">
            Aitäh, et aitad Kivorat paremaks muuta.
          </p>
        </div>
      </main>

      <PublicFooter />
    </div>
  )
}
