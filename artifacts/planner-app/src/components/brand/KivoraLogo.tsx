/**
 * KivoraLogo — official brand component.
 *
 * Usage:
 *   <KivoraLogo />                  symbol + wordmark (default)
 *   <KivoraLogo symbolOnly />       symbol only (no wordmark)
 *   <KivoraLogo height={28} />      custom height (wordmark scales with symbol)
 */

interface KivoraLogoProps {
  /** Render only the symbol, no "Kivora" wordmark. */
  symbolOnly?: boolean
  /** Height in px of the symbol. Wordmark scales proportionally. Default 28. */
  height?: number
  className?: string
}

export default function KivoraLogo({
  symbolOnly = false,
  height = 28,
  className = '',
}: KivoraLogoProps) {
  if (symbolOnly) {
    return (
      <img
        src="/kivora-symbol.png"
        alt="Kivora"
        height={height}
        width={height}            // symbol is roughly square
        className={className}
        style={{ height, width: height, objectFit: 'contain' }}
        draggable={false}
      />
    )
  }

  // Full logo: symbol + wordmark as a single image (official proportions preserved)
  // The source image is 133×56 px; maintain aspect ratio from the symbol height.
  const logoWidth = Math.round(height * (133 / 56))

  return (
    <img
      src="/kivora-logo.png"
      alt="Kivora"
      height={height}
      width={logoWidth}
      className={className}
      style={{ height, width: logoWidth, objectFit: 'contain' }}
      draggable={false}
    />
  )
}
