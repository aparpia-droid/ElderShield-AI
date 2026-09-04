interface ScenarioIconProps {
  /** Scenario id; unknown ids render nothing. */
  scenario: string
  size?: number
}

/**
 * Hand-authored line icons for the scenario cards, one per scenario.
 *
 * All share a 24-unit grid, a 1.9 stroke, round caps and joins, and no fill,
 * so they read as one set and match the logo's weight. Colour comes from the
 * surrounding text (currentColor), so they inherit the card's palette. Purely
 * decorative — every card still has its full text label beside the icon.
 */
export default function ScenarioIcon({ scenario, size = 32 }: ScenarioIconProps) {
  const path = PATHS[scenario]
  if (!path) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  )
}

const PATHS: Record<string, JSX.Element> = {
  // Government building — columns and a pediment.
  social_security: (
    <>
      <path d="M3 9 12 4l9 5" />
      <path d="M4 9h16" />
      <path d="M6 9v8M10 9v8M14 9v8M18 9v8" />
      <path d="M3 20h18" />
    </>
  ),
  // Support headset.
  tech_support: (
    <>
      <path d="M5 13v-1a7 7 0 0 1 14 0v1" />
      <rect x="3" y="13" width="4" height="6" rx="1.2" />
      <rect x="17" y="13" width="4" height="6" rx="1.2" />
      <path d="M19 19v1a3 3 0 0 1-3 3h-3" />
    </>
  ),
  // Wrapped gift / prize.
  lottery_giveaway: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M4 13h16" />
      <path d="M12 9v11" />
      <path d="M12 9C12 6 9 4 8 6s1 3 4 3ZM12 9c0-3 3-5 4-3s-1 3-4 3Z" />
    </>
  ),
  // Graduation cap.
  financial_aid: (
    <>
      <path d="M12 5 2 9l10 4 10-4-10-4Z" />
      <path d="M6 11v5c0 1 3 2.5 6 2.5s6-1.5 6-2.5v-5" />
      <path d="M22 9v5" />
    </>
  ),
  // Laptop with a login lock.
  campus_it: (
    <>
      <rect x="4" y="5" width="16" height="10" rx="1.2" />
      <path d="M2 19h20" />
      <rect x="9.5" y="8" width="5" height="4.5" rx="1" />
      <path d="M10.5 8V7a1.5 1.5 0 0 1 3 0v1" />
    </>
  ),
  // Briefcase.
  internship_offer: (
    <>
      <rect x="3" y="8" width="18" height="12" rx="1.5" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
}
