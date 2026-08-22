import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { connectTranscriptWs } from '../lib/ws'
import PageContainer from '../ui/PageContainer'
import Card from '../ui/Card'
import Button from '../ui/Button'

/** Parse "Caller: text" or "You: text" into speaker + text */
function parseLine(line: string): { speaker: string; text: string } {
  const callerMatch = line.match(/^Caller:\s*(.*)$/i)
  if (callerMatch) return { speaker: 'Caller', text: callerMatch[1] }
  const youMatch = line.match(/^You:\s*(.*)$/i)
  if (youMatch) return { speaker: 'You', text: youMatch[1] }
  return { speaker: '', text: line }
}

export default function Live() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const [lines, setLines] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [autoscroll, setAutoscroll] = useState(true)
  const [typing, setTyping] = useState(false)
  const [callEnded, setCallEnded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionId) return
    setTyping(true)
    let typingTimer: ReturnType<typeof setTimeout>
    const disconnect = connectTranscriptWs(
      sessionId,
      (line) => {
        setTyping(false)
        clearTimeout(typingTimer)
        setLines((prev) => [...prev, line])
        typingTimer = setTimeout(() => setTyping(true), 1400)
      },
      () => {
        // Call ended
        clearTimeout(typingTimer)
        setTyping(false)
        setCallEnded(true)
      },
      () => setError('Connection error')
    )
    return () => {
      clearTimeout(typingTimer)
      disconnect()
    }
  }, [sessionId])

  useEffect(() => {
    if (autoscroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [lines, autoscroll, typing])

  // Auto-redirect to debrief 2s after call ends
  useEffect(() => {
    if (!callEnded || !sessionId) return
    const t = setTimeout(() => {
      navigate(`/debrief/${sessionId}`)
    }, 2000)
    return () => clearTimeout(t)
  }, [callEnded, sessionId, navigate])

  if (!sessionId) return <PageContainer><p>Missing session</p></PageContainer>

  return (
    <PageContainer>
      <h1>Your call is happening now</h1>
      <p className="muted" style={{ marginBottom: 'var(--space-6)' }}>
        Answer your phone and talk as you normally would. Hang up whenever you want to.
      </p>

      <div className="live-status">
        <span
          className="live-status-dot"
          style={{
            background: error
              ? 'var(--color-border-strong)'
              : callEnded
                ? 'var(--color-good-border)'
                : 'var(--color-accent)',
            animation: error || callEnded ? undefined : 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <span className="live-status-text">
          {error ? 'Disconnected' : callEnded ? 'Call ended — loading your results...' : 'Call in progress'}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <Button onClick={() => setAutoscroll(!autoscroll)}>
            {autoscroll ? 'Autoscroll on' : 'Autoscroll off'}
          </Button>
        </div>
      </div>

      <Card>
        <h2 className="section-title">What is being said</h2>
        <div
          ref={containerRef}
          className="transcript"
          style={{ maxHeight: 420, overflowY: 'auto' }}
        >
          {lines.length === 0 && !error && (
            <p className="muted">Waiting for the call to start...</p>
          )}
          {error && <p role="alert">{error}</p>}
          {lines.map((line, i) => {
            const { speaker, text } = parseLine(line)
            return (
              <div key={i} className="transcript-line">
                {speaker && (
                  <span
                    className={`transcript-speaker ${
                      speaker === 'Caller' ? 'transcript-speaker-caller' : 'transcript-speaker-you'
                    }`}
                  >
                    {speaker}:
                  </span>
                )}
                {text}
              </div>
            )
          })}
          {typing && (
            <p className="muted" style={{ marginTop: 'var(--space-2)' }}>
              Speaking...
            </p>
          )}
        </div>
      </Card>
    </PageContainer>
  )
}
