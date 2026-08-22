import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startSession } from '../lib/api'
import Input from '../ui/Input'

const SCENARIOS = [
  {
    id: 'social_security',
    label: 'The Social Security call',
    description:
      'The caller says there is a problem with your Social Security number or your benefits, and that you must act right now to fix it. They will ask you to confirm personal details.',
  },
  {
    id: 'tech_support',
    label: 'The computer virus call',
    description:
      'The caller says your computer is infected or has been hacked. They will try to get you to let them into your computer, or to pay for a repair you do not need.',
  },
  {
    id: 'lottery_giveaway',
    label: 'The prize winner call',
    description:
      'The caller says you have won money or a prize. To claim it, they will ask you for a fee, your bank details, or other personal information.',
  },
]

/** Basic phone validation: at least 10 digits */
function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 10 && digits.length <= 15
}

export default function Home() {
  const navigate = useNavigate()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    setError(null)

    if (!isValidPhone(phoneNumber)) {
      setError('Please enter a valid phone number (at least 10 digits).')
      return
    }

    setLoading(true)
    try {
      const { sessionId, callPlaced } = await startSession({ phoneNumber, scenarioId })
      navigate(`/live/${sessionId}`, { state: { demoMode: !callPlaced } })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="home-page">
      <div className="home-card">
        {/* 1. What this is — the first and largest thing on the page. */}
        <section className="home-banner">
          <p className="home-banner-eyebrow">Practice, not a real scam</p>
          <h1 className="home-banner-title">
            This is practice. The scammer is not real.
          </h1>
          <p className="home-banner-text">
            ElderShield gives you a <strong>pretend scam call</strong> so you can practise
            saying no. The caller is a computer voice, not a real person. Nobody is trying to
            take your money, and nothing you say on the call can harm you.
          </p>
        </section>

        {/* 2. What will happen */}
        <section className="home-section">
          <h2 className="home-section-title">What will happen</h2>
          <ol className="home-steps">
            <li className="home-step">
              <span className="home-step-title">You choose a type of call</span>
              <span className="home-step-text">
                Pick one of the three practice calls further down this page.
              </span>
            </li>
            <li className="home-step">
              <span className="home-step-title">Your phone rings, about 10 seconds later</span>
              <span className="home-step-text">
                Answer it the way you would answer any call.
              </span>
            </li>
            <li className="home-step">
              <span className="home-step-title">A pretend scammer talks to you</span>
              <span className="home-step-text">
                Say whatever you would really say. You can hang up at any moment — hanging up
                early is a good result, not a failure.
              </span>
            </li>
            <li className="home-step">
              <span className="home-step-title">You get your results</span>
              <span className="home-step-text">
                As soon as you hang up, this page shows you how you did.
              </span>
            </li>
          </ol>
        </section>

        {/* 3. What you'll learn */}
        <section className="home-section">
          <h2 className="home-section-title">What you will find out afterwards</h2>
          <div className="home-panel">
            <ul className="home-panel-list">
              <li>
                <strong>A grade from A to F</strong>, so you can see at a glance how the call
                went.
              </li>
              <li>
                <strong>Your conversation, written out</strong>, with the risky answers marked
                in red and the good ones marked in green.
              </li>
              <li>
                <strong>A plain explanation</strong> of anything you gave away and why it
                matters.
              </li>
              <li>
                <strong>Advice for next time</strong>, based on what actually happened on your
                call.
              </li>
            </ul>
          </div>
        </section>

        {/* 4. Universal safety tips */}
        <section className="home-section">
          <h2 className="home-section-title">Worth knowing before you start</h2>
          <div className="home-tips">
            <p className="home-tips-title">These are true of every real call</p>
            <ul className="home-tips-list">
              <li>
                Real government offices never phone to demand immediate payment, and never
                threaten you with arrest over the phone.
              </li>
              <li>
                No real bank, government office or company will ask for your full Social
                Security number, your PIN or your password over the phone.
              </li>
              <li>
                Nobody legitimate asks to be paid in gift cards, wire transfers or
                cryptocurrency.
              </li>
              <li>
                Caller ID can be faked. If you are unsure, hang up and call back on a number
                you looked up yourself.
              </li>
              <li>
                You are always allowed to hang up. You never owe a caller an explanation.
              </li>
            </ul>
          </div>
        </section>

        {/* 5. Pick a scenario */}
        <section className="home-section">
          <h2 className="home-section-title">Choose your practice call</h2>
          <p className="home-section-intro">
            All three work the same way. Pick whichever one you would like to practise.
          </p>
          <div className="home-scenario-grid" role="radiogroup" aria-label="Choose your practice call">
            {SCENARIOS.map((s) => {
              const selected = scenarioId === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setScenarioId(s.id)}
                  className={`home-scenario-card ${selected ? 'selected' : ''}`}
                >
                  <span className="home-scenario-marker" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                  <span className="home-scenario-title">{s.label}</span>
                  <span className="home-scenario-desc">{s.description}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* 6. Phone number — deliberately last */}
        <section className="home-section">
          <h2 className="home-section-title">Where should we call you?</h2>
          <div className="home-phone-panel">
            <Input
              label="Your phone number"
              type="tel"
              value={phoneNumber}
              onChange={setPhoneNumber}
              placeholder="+1 234 567 8900"
              describedBy="phone-privacy"
            />
            <p className="home-privacy" id="phone-privacy">
              <span aria-hidden="true">&#128274;</span>
              <span>
                Your number is used once, to place this practice call, and is deleted when the
                call ends. We never share it, and we will not call you again.
              </span>
            </p>

            {error && (
              <p className="home-error" role="alert">
                {error}
              </p>
            )}

            <div style={{ marginTop: 'var(--space-6)' }}>
              <button
                type="button"
                className="home-cta"
                onClick={handleStart}
                disabled={loading || !phoneNumber.trim()}
              >
                {loading ? 'Starting your call...' : 'Call me for practice'}
              </button>
              <p className="home-cta-helper">Your phone will ring in about 10 seconds.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
