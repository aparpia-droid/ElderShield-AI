/**
 * Letter grade scale for the debrief.
 *
 * The single source of truth for thresholds and colours — components read this
 * rather than defining bands of their own. Colours are references to the custom
 * properties in index.css, so the palette still lives in one place.
 *
 * This is a display mapping only. It never affects how a score is calculated.
 */

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
