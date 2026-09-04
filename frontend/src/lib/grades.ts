/**
 * Letter grade scale for the debrief.
 *
 * The single source of truth for thresholds and colours — components read this
 * rather than defining bands of their own. Colours are references to the custom
 * properties in index.css, so the palette still lives in one place.
 *
 * This is a display mapping only. It never affects how a score is calculated.
 */

import type { FindingSeverity, LineFinding } from './api'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

export interface GradeBand {
  grade: Grade
  /** Inclusive lower bound of the band. */
  min: number
  /** Inclusive upper bound of the band. */
  max: number
  fg: string
  bg: string
}

export const GRADE_SCALE: readonly GradeBand[] = [
  { grade: 'A', min: 90, max: 100, fg: 'var(--grade-a-fg)', bg: 'var(--grade-a-bg)' },
  { grade: 'B', min: 75, max: 89, fg: 'var(--grade-b-fg)', bg: 'var(--grade-b-bg)' },
  { grade: 'C', min: 60, max: 74, fg: 'var(--grade-c-fg)', bg: 'var(--grade-c-bg)' },
  { grade: 'D', min: 40, max: 59, fg: 'var(--grade-d-fg)', bg: 'var(--grade-d-bg)' },
  { grade: 'F', min: 0, max: 39, fg: 'var(--grade-f-fg)', bg: 'var(--grade-f-bg)' },
]

/** Band for a score. Scores outside 0-100 clamp to the nearest band. */
export function gradeForScore(score: number): GradeBand {
  const clamped = Math.max(0, Math.min(100, score))
  return (
    GRADE_SCALE.find((band) => clamped >= band.min && clamped <= band.max) ??
    GRADE_SCALE[GRADE_SCALE.length - 1]
  )
}

/**
 * Transcript-line severity scale for the debrief.
 *
 * Five levels from best to worst, mapped 1:1 onto the scoring rubric's own
 * disclosure bands plus defensive behaviour, so the colours reflect the rubric
 * rather than a parallel judgement. Never hue alone: every level carries a text
 * label, and the label word is what a colour-blind reader relies on.
 *
 * Ordering, best -> worst: good behaviour, recon disclosure, identity data,
 * authentication data, critical compromise. Per design, the second-best level
 * is light green, not yellow — yellow first appears at the middle.
 */

export type FindingLevel = 'best' | 'good' | 'middling' | 'poor' | 'worst'

export interface FindingStyle {
  level: FindingLevel
  /** Short word shown next to the line; the non-colour signal of severity. */
  label: string
  /** CSS class carrying the level's colour, defined once in index.css. */
  className: string
}

const SEVERITY_TO_STYLE: Record<FindingSeverity, FindingStyle> = {
  strong: { level: 'best', label: 'Great move', className: 'finding-best' },
  minor: { level: 'best', label: 'Good move', className: 'finding-best' },
  recon: { level: 'good', label: 'Minor slip', className: 'finding-good' },
  identity: { level: 'middling', label: 'Risky', className: 'finding-middling' },
  authentication: { level: 'poor', label: 'Serious', className: 'finding-poor' },
  critical: { level: 'worst', label: 'Critical', className: 'finding-worst' },
}

/**
 * Style for a finding. Falls back for findings scored before severity existed:
 * a good moment reads as best, a risk as middling (yellow) — never benign.
 */
export function styleForFinding(finding: LineFinding): FindingStyle {
  if (finding.severity && SEVERITY_TO_STYLE[finding.severity]) {
    return SEVERITY_TO_STYLE[finding.severity]
  }
  return finding.type === 'good'
    ? { level: 'best', label: 'Good move', className: 'finding-best' }
    : { level: 'middling', label: 'Risky', className: 'finding-middling' }
}
