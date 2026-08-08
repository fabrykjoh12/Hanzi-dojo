import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'

// The first screen inside the store apps, in place of the marketing landing
// page (see initialLandingMode in prelogin.js for why they differ).
//
// It is deliberately almost empty. Someone who installed the app has already
// read the pitch on the store listing and is waiting to get in; a second sales
// page here is a wall between them and the app. So: the mark, one line about
// what happens next, and the only two things they can want — start, or sign in.
//
// Everything is measured from the safe-area insets rather than from the screen
// edge, because on a notched phone the screen edge is under the status bar and
// the home indicator.

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

export default function NativeWelcome({ onStart, onLogIn }) {
  const [pressed, setPressed] = useState(false)

  return (
    <div style={{
      // dvh, not vh: vh is the *largest* possible viewport on mobile, so with
      // any browser chrome showing, a 100vh column runs off the bottom of the
      // screen — which is how the buttons ended up unreachable elsewhere.
      minHeight: '100dvh',
      position: 'relative',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'url(' + bgLogin + ')',
        backgroundSize: 'cover', backgroundPosition: 'center',
        opacity: 0.22, pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', alignItems: 'center',
        textAlign: 'center',
        padding: 'calc(32px + env(safe-area-inset-top, 0px)) 24px calc(28px + env(safe-area-inset-bottom, 0px))',
      }}>
        {/* The mark, optically centred in the space above the buttons rather
            than pinned to the top — a logo hard against the status bar reads
            as a web page that forgot about the notch. */}
        <div style={{
          flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '18px',
        }}>
          <img
            src={logo}
            alt=""
            style={{ width: '84px', height: '84px', objectFit: 'contain' }}
          />
          <div style={heroWordmarkStyle('34px')}>{BRAND_NAME}</div>
          <p style={{
            margin: 0, maxWidth: '300px',
            fontSize: '16px', lineHeight: 1.55,
            color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif',
          }}>
            Learn the words. Read real Chinese stories the same week.
          </p>
        </div>

        <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={onStart}
            onPointerDown={() => setPressed(true)}
            onPointerUp={() => setPressed(false)}
            onPointerCancel={() => setPressed(false)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
              width: '100%', minHeight: '54px', padding: '0 24px',
              borderRadius: '16px', border: 'none',
              background: pressed ? SAGE_DARK : SAGE, color: '#fff',
              fontSize: '17px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
              transition: 'background 120ms ease, transform 120ms ease',
              transform: pressed ? 'scale(0.985)' : 'scale(1)',
              boxShadow: '0 6px 18px rgba(110,132,102,0.22)',
            }}
          >
            Get started
            <ArrowRight size={18} strokeWidth={2.2} color="#fff" />
          </button>

          <button
            onClick={onLogIn}
            style={{
              width: '100%', minHeight: '48px',
              borderRadius: '14px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: '15px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            I already have an account
          </button>
        </div>
      </div>
    </div>
  )
}
