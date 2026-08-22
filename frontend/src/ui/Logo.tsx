interface LogoProps {
  /** Rendered size in px. The mark is drawn on a 24-unit grid and scales cleanly. */
  size?: number
  /** When set, the mark is exposed to assistive tech with this label. */
  title?: string
}

/**
 * ElderShield mark: a telephone handset set on a solid shield.
 *
 * Constructed on a 24-unit grid from three primitives — two earpieces and an
 * offset handle — rotated as one group, so the geometry stays deliberate at
 * every size. Two flat colours, no gradients, shadows or glows.
 */
export default function Logo({ size = 40, title }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <path
        d="M12 1.6 20.8 4.8V11.7C20.8 17 17.1 21 12 22.6 6.9 21 3.2 17 3.2 11.7V4.8Z"
        fill="var(--color-primary, #14532d)"
      />
      <g transform="rotate(-38 12 11.7) translate(5.5 9.4)" fill="var(--color-mark-accent, #f5a524)">
        <rect x="0" y="0" width="4.6" height="4.6" rx="1.6" />
        <rect x="8.4" y="0" width="4.6" height="4.6" rx="1.6" />
        <rect x="3.4" y="2.1" width="6.2" height="2.5" rx="1.25" />
      </g>
    </svg>
  )
}
