/**
 * The new Kivora "leaf + seed" mark used on the redesigned landing hero.
 * This is a hand-authored, from-scratch recreation (not an extracted
 * image) that closely matches the user-supplied visual reference, kept
 * as a standalone component so it never touches the site's official
 * brand assets (public/kivora-logo.png, public/kivora-symbol.png) or the
 * shared <KivoraLogo /> component used in the real header/footer/PWA
 * icons. Sitewide adoption is a separate, explicitly-confirmed step.
 */
export default function KivoraSymbolNew({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kv-leaf-grad" x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#B197FC" />
          <stop offset="50%" stopColor="#7C5CF0" />
          <stop offset="100%" stopColor="#5531D6" />
        </linearGradient>
      </defs>
      <circle cx="19" cy="23" r="11" fill="#C9BBFC" />
      <path
        d="M49 6
           C 38 9 25 18 19 32
           C 15 41 14 49 18 57
           C 27 51 38 42 45 29
           C 49 21 51 13 49 6
           Z"
        fill="url(#kv-leaf-grad)"
      />
      <path d="M20 51 L45 15" stroke="#F5F3FF" strokeWidth="2.3" strokeLinecap="round" opacity="0.85" />
      <circle cx="18" cy="48" r="9" fill="#4B2FCB" />
    </svg>
  )
}
