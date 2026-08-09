import { Play, Flag } from 'lucide-react'
import { MICRO, NUM, flatPanel } from './designTokens'

// The Cards tab with a session paused on it.
//
// This exists because Back had nowhere to go. A flashcard session owns the whole
// screen, so it has to consume Back before the Cards tab is allowed to step
// anywhere — otherwise the first press on the most focused screen in the app
// jumped to Home, which is not "leaving the session", it is leaving Cards.
//
// Nothing is lost by pausing: cards are written as they are graded, and the
// Cards tab root is persistent now, so the queue is still in memory. This screen
// is the queue made visible — the state the session was always in, with the two
// things a learner can do about it.
export default function SessionPaused({ studied, remaining, accentHex, onResume, onFinish }) {
  return (
    <div style={{ maxWidth: '440px', margin: '0 auto', padding: '48px 16px 40px' }}>
      <div style={{ ...flatPanel({ radius: 20, padding: '26px 22px' }), textAlign: 'center' }}>
        <span style={{ ...MICRO, color: 'var(--text-faint)' }}>Session paused</span>

        <div style={{
          ...NUM, fontSize: '40px', fontWeight: 700, color: 'var(--text)',
          lineHeight: 1, margin: '14px 0 6px', letterSpacing: '-0.03em',
        }}>
          {remaining}
        </div>
        <div style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {remaining === 1 ? 'card still waiting' : 'cards still waiting'}
          {studied > 0 && (
            <>
              {' · '}
              <span style={NUM}>{studied}</span>
              {' reviewed, and saved'}
            </>
          )}
        </div>

        <button
          onClick={onResume}
          className="hd-press"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
            width: '100%', minHeight: '52px', marginTop: '20px',
            borderRadius: '15px', border: 'none', cursor: 'pointer',
            background: accentHex, color: '#fff',
            fontSize: '15px', fontWeight: 750, fontFamily: 'Inter, sans-serif',
          }}
        >
          <Play size={18} strokeWidth={2.2} color="#fff" />
          Resume session
        </button>

        <button
          onClick={onFinish}
          className="hd-press"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', minHeight: '46px', marginTop: '10px',
            borderRadius: '14px', border: '1px solid var(--border)', cursor: 'pointer',
            background: 'none', color: 'var(--text-muted)',
            fontSize: '14px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
          }}
        >
          <Flag size={16} strokeWidth={2} />
          Finish for now
        </button>
      </div>
    </div>
  )
}
