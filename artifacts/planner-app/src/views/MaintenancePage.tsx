/**
 * Temporary production maintenance page ("Kivora uueneb").
 *
 * Deliberately standalone: no PublicHeader/PublicFooter (no nav, no
 * login/register links), no router, no translations system, no Firebase.
 *
 * Logo: renders `kivora-logo-maintenance.png` directly (not the shared
 * KivoraLogo component) — that file is a transparent-background export of
 * the exact same confirmed logo artwork (identical symbol, wordmark,
 * colors and proportions; only its near-white background pixels were
 * made transparent, via a plain colour-keyed export, nothing redrawn).
 * The original `kivora-logo.png` and the shared KivoraLogo component used
 * everywhere else in the app are untouched by this — this page just
 * needed a version that sits cleanly on a non-white backdrop.
 *
 * Visual style: pearl-white base with soft lavender light washes and a
 * couple of gentle floating "3D" blob shapes — a small, self-contained
 * take on the same Aurora Living Premium palette used elsewhere on the
 * site, built fresh here (not imported from another branch) so this
 * branch stays fully independent of the in-progress landing redesign.
 */
export default function MaintenancePage() {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#FBFAFF] flex items-center justify-center px-6 py-16">
      {/* Soft lavender light washes + two floating blob shapes — purely
          decorative, aria-hidden, static under prefers-reduced-motion
          (see src/index.css's `.kv-maint-float`/`.kv-maint-breathe`). */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <span
          className="kv-maint-breathe absolute rounded-full blur-[90px] opacity-60 w-[420px] h-[420px] -top-32 -left-32 sm:w-[620px] sm:h-[620px] sm:-top-48 sm:-left-48"
          style={{ background: 'radial-gradient(circle, #C4B5FD 0%, rgba(196,181,253,.4) 50%, transparent 78%)' }}
        />
        <span
          className="kv-maint-breathe absolute rounded-full blur-[90px] opacity-50 w-[380px] h-[380px] -bottom-28 -right-28 sm:w-[560px] sm:h-[560px] sm:-bottom-40 sm:-right-40"
          style={{ background: 'radial-gradient(circle, #DDD6FE 0%, rgba(221,214,254,.38) 50%, transparent 78%)', animationDelay: '1.4s' }}
        />
        <span
          className="kv-maint-float absolute rounded-[42%_58%_55%_45%/48%_42%_58%_52%] blur-[2px] opacity-70 w-[120px] h-[120px] top-[14%] right-[12%] hidden sm:block"
          style={{ background: 'radial-gradient(circle at 32% 28%, #F3E8FF 0%, #C4B5FD 55%, #A78BFA 100%)' }}
        />
        <span
          className="kv-maint-float absolute rounded-[55%_45%_48%_52%/45%_55%_42%_58%] blur-[2px] opacity-60 w-[90px] h-[90px] bottom-[16%] left-[10%] hidden sm:block"
          style={{ background: 'radial-gradient(circle at 32% 28%, #FBE4F1 0%, #E8A9D1 60%, #C77DB0 100%)', animationDelay: '.8s' }}
        />
      </div>

      <div className="relative z-[1] max-w-[560px] w-full text-center">
        <div className="flex justify-center mb-10 sm:mb-12">
          <img
            src="/kivora-logo-maintenance.png"
            alt="Kivora"
            height={40}
            width={Math.round(40 * (133 / 56))}
            style={{ height: 40, width: Math.round(40 * (133 / 56)), objectFit: 'contain' }}
            draggable={false}
          />
        </div>

        <h1 className="text-[1.75rem] leading-[1.2] sm:text-4xl font-extrabold tracking-tight text-[#1A1F36] mb-5">
          Midagi erilist on tulekul.
        </h1>

        <p className="text-base sm:text-lg text-[#4A4F6A] leading-relaxed mb-7">
          Kivora on uuendamisel, et tuua sinuni veel nutikam, ilusam ja mugavam elujuhtimise keskkond.
        </p>

        <p className="text-base sm:text-lg font-semibold text-[#6D28D9] mb-10 sm:mb-14">
          Peagi kohtume taas! 💜
        </p>

        <p className="text-sm text-[#8A84A8] font-medium">
          Kivora — kõik oluline ühes kohas.
        </p>
      </div>
    </div>
  )
}
