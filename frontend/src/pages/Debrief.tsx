import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getSession, type LineFinding, type SessionData } from '../lib/api'
import { gradeForScore, styleForFinding } from '../lib/grades'
import PageContainer from '../ui/PageContainer'
import Card from '../ui/Card'
import Button from '../ui/Button'

/** Key to the five-level highlighting, so the colours are never the only cue. */
const LEGEND: { className: string; label: string }[] = [
  { className: 'finding-best', label: 'Good move' },
  { className: 'finding-good', label: 'Minor slip' },
  { className: 'finding-middling', label: 'Risky' },
  { className: 'finding-poor', label: 'Serious' },
  { className: 'finding-worst', label: 'Critical' },
]

function TranscriptLegend() {
  return (
    <ul className="transcript-legend" aria-label="What the highlight colours mean">
      {LEGEND.map((item) => (
        <li key={item.className} className={`transcript-legend-item ${item.className}`}>
          <span className="transcript-legend-swatch" aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** Tips by risk tier (matches PDF 6-tier system) */
const TIPS: Record<string, string[]> = {
  'Scam-Proof': [
    'Excellent awareness! Keep verifying callers by hanging up and calling the official number.',
    "You recognized the red flags immediately — that's exactly what keeps you safe.",
    'Share your knowledge with family and friends to help protect them too.',
  ],
  'Cautious': [
    'Good instincts! You limited your exposure but shared minor details.',
    'Even small details like your name or email can be used for targeted follow-up scams.',
    "Legitimate callers won't pressure you to act immediately.",
  ],
  'Aware but Exposed': [
    'You showed some awareness but shared enough data for a fraud attempt.',
    'Hang up and call back using a number from official documents — never trust caller ID.',
    "Don't confirm or deny anything; let them send written notice instead.",
  ],
  'Vulnerable': [
    'You disclosed information that could enable account access attempts.',
    'Never share SSN, DOB, or account numbers over the phone.',
    "Banks won't ask for full account numbers; scammers will.",
    'If pressured, hang up immediately — real institutions will understand.',
  ],
  'High Risk': [
    'Serious information was compromised — in a real call this could lead to identity theft.',
    'Never share SSN, DOB, or account numbers over the phone.',
    "Hang up immediately if pressured — real institutions won't do this.",
    'Report suspected scams to FTC at reportfraud.ftc.gov.',
    'Consider a credit freeze if you ever share sensitive data with an unknown caller.',
  ],
  'Compromised': [
    'Critical information was disclosed — in a real scenario, immediate financial damage would be expected.',
    'If this ever happens in real life: freeze your credit immediately at all three bureaus.',
    'Change all passwords and enable 2FA on every account.',
    'Report to FTC at reportfraud.ftc.gov and file a police report.',
    'Monitor your bank and credit card statements daily for unauthorized charges.',
  ],
}

function getTips(tier: string | null): string[] {
  if (tier && TIPS[tier]) return TIPS[tier]
  return TIPS['Compromised']
}

/** Parse line into speaker + text */
function parseLine(line: string): { speaker: string; text: string } {
  const m = line.match(/^(Caller|You):\s*(.*)$/i)
  if (m) return { speaker: m[1], text: m[2] }
  return { speaker: '', text: line }
}

/** Index the backend's findings by transcript line for lookup while rendering. */
function indexFindings(findings: LineFinding[] | null | undefined): Map<number, LineFinding> {
  const map = new Map<number, LineFinding>()
  if (!findings) return map
  for (const f of findings) map.set(f.index, f)
  return map
}

export default function Debrief() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<SessionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Poll until score exists (backend auto-scores shortly after call ends)
  useEffect(() => {
    if (!sessionId) return

    let cancelled = false
    let timer: number | undefined

    const load = async () => {
      try {
        const s = await getSession(sessionId)
        if (cancelled) return
        setData(s)

        // Keep polling until the backend produces a score. A recorded
        // scoringError means one is never coming, so stop and show it.
        if (s.score === null && !s.scoringError) {
          timer = window.setTimeout(load, 1200)
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      }
    }

    load()

    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [sessionId])

  if (!sessionId) return <PageContainer><p>Missing session</p></PageContainer>
  if (error) return <PageContainer><p role="alert">{error}</p></PageContainer>
  if (!data) return <PageContainer><p>Loading your results...</p></PageContainer>

  const tips = getTips(data.tier)
  const band = data.score == null ? null : gradeForScore(data.score)
  const findings = indexFindings(data.lineFindings)
  const hasAnnotations = findings.size > 0

  return (
    <PageContainer>
      <h1>How your call went</h1>
      <p className="muted" style={{ marginBottom: 'var(--space-7)' }}>
        Here is your grade, what you said, and what to do differently next time.
      </p>

      {data.persistError && (
        <div className="alert-warning" role="alert">
          <p className="alert-warning-title">This call was not saved for the study</p>
          <p className="alert-warning-body">
            Your results below are correct, but they could not be written to the study
            records. Please tell the person running the session before you leave.
          </p>
          <p className="alert-warning-detail">Technical details: {data.persistError}</p>
        </div>
      )}

      <section style={{ marginBottom: 'var(--space-8)' }}>
        <h2 className="section-title">Your grade</h2>
        {data.scoringError ? (
          <div className="alert-error" role="alert">
            <p className="alert-error-title">We could not grade this call</p>
            <p className="alert-error-body">
              The service that marks these calls did not respond, so there is no
              grade this time. Nothing you did caused this, and your conversation
              below is complete. Please try another practice call.
            </p>
            <p className="alert-error-detail">
              Technical details: {data.scoringError}
            </p>
          </div>
        ) : band == null ? (
          <p>Working out your grade...</p>
        ) : (
          <>
            <div className="grade-panel">
              <div
                className="grade-letter"
                style={{ color: band.fg, background: band.bg }}
                aria-hidden="true"
              >
                {band.grade}
              </div>
              <div className="grade-meta">
                <p className="grade-tier">
                  <span className="visually-hidden">Grade {band.grade}. </span>
                  {data.tier}
                </p>
                <p className="grade-caption">
                  Grades run from A (best) down to F. Yours is a {band.grade}.
                </p>
                <p className="grade-score">
                  Points: {data.score} out of 100
                  {data.scoringModel ? ` · Scored by ${data.scoringModel}` : ''}
                </p>
              </div>
            </div>
            {data.explanation && <p className="grade-explanation">{data.explanation}</p>}
          </>
        )}
      </section>

      <section style={{ marginBottom: 'var(--space-8)' }}>
        <h2 className="section-title">What you said</h2>
        <p className="muted" style={{ marginBottom: 'var(--space-4)' }}>
          {hasAnnotations
            ? 'Each highlighted line carries a label showing how risky it was, from a minor slip up to critical. Green lines are the ones that protected you.'
            : 'Your full conversation, word for word.'}
        </p>
        {hasAnnotations && <TranscriptLegend />}
        <Card>
          <div className="transcript">
            {data.transcript.length === 0 ? (
              <p className="muted">No transcript</p>
            ) : (
              data.transcript.map((line, i) => {
                const { speaker, text } = parseLine(line)
                const finding = findings.get(i)
                const style = finding ? styleForFinding(finding) : null
                return (
                  <div
                    key={i}
                    className={`transcript-line ${style ? style.className : ''}`.trim()}
                  >
                    {speaker && (
                      <span
                        className={`transcript-speaker ${
                          speaker.toLowerCase() === 'caller'
                            ? 'transcript-speaker-caller'
                            : 'transcript-speaker-you'
                        }`}
                      >
                        {speaker}:
                      </span>
                    )}
                    {text}
                    {finding && style && (
                      <span className="transcript-note">
                        <span className="transcript-note-label">{style.label}</span>
                        {finding.note}
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </section>

      <section style={{ marginBottom: 'var(--space-8)' }}>
        <h2 className="section-title">Tips for next time</h2>
        <ul className="tips-list">
          {tips.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>
      </section>

      <Button primary onClick={() => navigate('/')}>
        Try another practice call
      </Button>
    </PageContainer>
  )
}
