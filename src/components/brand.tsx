/**
 * Marchio Pronta: una porta aperta con una spunta nel vano.
 * Disegnato su una griglia di 48 unità; i file completi sono in public/brand.
 */

type MarkProps = { className?: string; inverted?: boolean };

export function ProntaMark({ className, inverted = false }: MarkProps) {
  const ink = inverted ? "#FFFFFF" : "#171717";
  const accent = inverted ? "#E0794A" : "#C2562B";
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <path d="M20 8h19v33H20" fill="none" stroke={ink} strokeWidth={4} strokeLinejoin="miter" />
      <path d="M20 6.2 9 10.5v27L20 42.8z" fill={ink} />
      <path
        d="M24.5 25.5l4 4 7-8"
        fill="none"
        stroke={accent}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
