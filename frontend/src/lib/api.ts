/**
 * API client for FraudGuard backend.
 * Base URL is relative so Vite proxy forwards /api to the backend.
 */

const BASE = '/api'

async function throwIfNotOk(res: Response) {
  if (res.ok) return

  let msg = res.statusText
  try {
    const data = await res.json()
    msg = data?.error ?? data?.message ?? msg
  } catch {
    // ignore JSON parse errors
  }

  throw new Error(msg || `Request failed (${res.status})`)
}

export interface StartSessionInput {
  phoneNumber: string
  scenarioId: string
  /** Anonymous study code, e.g. "P07". Required by the backend. */
  participantCode: string
}

export interface StartSessionResponse {
  sessionId: string
  callPlaced: boolean
}

export async function startSession(
  input: StartSessionInput
): Promise<StartSessionResponse> {
  const res = await fetch(`${BASE}/sessions/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  await throwIfNotOk(res)
  return res.json()
}

/**
 * One annotated line of the transcript, produced by the backend alongside the
 * score. `index` refers to a position in `transcript`.
 */
export interface LineFinding {
  index: number
  type: 'risk' | 'good'
  note: string
}

export interface SessionData {
  sessionId: string
  status: 'pending' | 'in_progress' | 'completed'
  transcript: string[]
  score: number | null
  /** Risk tier: Scam-Proof | Cautious | Aware but Exposed | Vulnerable | High Risk | Compromised */
  tier: string | null
  explanation: string | null
  /** Absent on older sessions or if annotation failed — always guard. */
  lineFindings?: LineFinding[] | null
  /** Groq model that produced the score, recorded for auditability. */
  scoringModel?: string | null
  /** Set when scoring failed. Present means there will never be a score. */
  scoringError?: string | null
  participantCode?: string | null
  runNumber?: number | null
  startedAt?: string | null
  endedAt?: string | null
  /** Set when this call could not be written to the study data store. */
  persistError?: string | null
}

export async function getSession(sessionId: string): Promise<SessionData> {
  const res = await fetch(`${BASE}/sessions/${sessionId}`)
  await throwIfNotOk(res)
  return res.json()
}

export async function scoreSession(
  sessionId: string
): Promise<{ score: number; tier: string; explanation: string }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/score`, { method: 'POST' })
  await throwIfNotOk(res)
  return res.json()
}
