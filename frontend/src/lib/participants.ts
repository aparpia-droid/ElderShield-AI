/**
 * Anonymous participant codes for the user study.
 *
 * The code is the only identifier in the system: no names, no emails, and no
 * mapping to real people anywhere. It is kept in localStorage so it survives
 * across visits and across both of a participant's calls.
 *
 * Mirrors PARTICIPANT_CODES in server.js — keep the two in step.
 */

export const PARTICIPANT_CODES: readonly string[] = Array.from(
  { length: 20 },
  (_, i) => `P${String(i + 1).padStart(2, '0')}`
)

const STORAGE_KEY = 'eldershield.participantCode'

/** Uppercases and trims so "p7 " and "P07" both resolve sensibly. */
export function normaliseParticipantCode(raw: string): string {
  const trimmed = raw.trim().toUpperCase()
  // Accept "P7" as shorthand for "P07".
  const m = trimmed.match(/^P(\d{1,2})$/)
  return m ? `P${m[1].padStart(2, '0')}` : trimmed
}

export function isValidParticipantCode(code: string): boolean {
  return PARTICIPANT_CODES.includes(code)
}

export function getStoredParticipantCode(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v && isValidParticipantCode(v) ? v : null
  } catch {
    return null
  }
}

export function storeParticipantCode(code: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Storage unavailable (private mode, blocked). The code still works for
    // this visit; it just will not persist.
  }
}

export function clearParticipantCode(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
