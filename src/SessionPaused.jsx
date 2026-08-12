import { Play, Flag } from 'lucide-react'
import { MICRO, NUM, flatPanel } from './designTokens'

// The Cards tab with a session paused on it.
//
// This exists because Back had nowhere to go. A flashcard session owns the whole
// screen, so it has to consume Back before the Cards tab is allowed to step
// anywhere — otherwise the first press on the most focused screen in the app
// jumped to Home, which is not "leaving the session", it is leaving Cards.
//
// Nothing is lost by dismissing the session: cards are written as they are
// graded, and the Cards tab root is persistent now, so the queue is still in
// memory. This screen is the queue made visible — the state the session was
// always in, with the two things a learner can do about it, and an explicit
// line saying the work is safe so the absence of a confirmation dialog reads as
// deliberate rather than careless.
export default function SessionPaused({ variant = 'paused', studied, remaining, accentHex, onResume, onFinish }) {
  // Two moments, one screen. Pressing X is an OUTCOME — the learner just did
  // it, so the screen reports what happened. Coming back to the Cards tab with
  // an unfinished session is an OFFER — nothing just happened, and a screen
  // that says "paused" there reads as the app having decided something.
  const offering = variant === 'continue'
  return (
    <div style={{ maxWidth: '440px', margin: '0 auto', padding: '48px 16px 40px' }}>
      <div style={{ ...flatPanel({ padding: '26px 22px' }), textAlign: 'center' }}>
        <span style={{ ...MICRO, color: 'var(--text-faint)' }}>
          {offering ? 'Unfinished session' : 'Session paused'}
        </span>

        <div style={{
          fontSize: '19px', fontWeight: 700, color: 'var(--text)',
          lineHeight: 1.3, margin: '12px 0 8px',
        }}>
          <span style={NUM}>{studied}</span>
          {' reviewed'}
          <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>{' · '}</span>
          <span style={NUM}>{remaining}</span>
          {offering ? ' cards remaining' : ' remaining'}
        </div>

        {/* The reason there is no "are you sure?" here: there is nothing to be
            sure about. Cards are written the moment they are graded. Saying so
            plainly is what makes the absence of a confirmation feel deliberate
            rather than careless. */}
        <div style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {offering ? 'Pick up where you left off.' : 'Your progress has been saved.'}
        </div>

        <button
          onClick={onResume}
          className="hd-press"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            width: '100%', minHeight: '52px', marginTop: '20px',
            borderRadius: '12px', border: 'none', cursor: 'pointer',
            background: accentHex, color: '#fff',
            fontSize: '15px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
          }}
        >
          <Play size={18} strokeWidth={2.2} color="#fff" />
          {offering ? 'Continue session' : 'Resume session'}
        </button>

        <button
          onClick={onFinish}
          className="hd-press"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', minHeight: '46px', marginTop: '10px',
            borderRadius: '12px', border: '1px solid var(--border)', cursor: 'pointer',
            background: 'none', color: 'var(--text-muted)',
            fontSize: '13.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif',
          }}
        >
          <Flag size={16} strokeWidth={2} />
          Finish for now
        </button>
      </div>
    </div>
  )
}
