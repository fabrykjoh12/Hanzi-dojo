import { useState } from 'react'
import logo from './assets/Hanzi-logo.png'
import { BRAND_NAME, heroWordmarkStyle } from './brand'

// The first screen inside the store apps, in place of the marketing landing
// page (see initialLandingMode in prelogin.js for why they differ).
//
// It is deliberately almost empty, and flat. Someone who installed the app has
// already read the pitch on the store listing; this screen's whole job is the
// brand and a fork: start, or sign in. The texture and feature copy the web
// landing carries would be clutter here — the pattern every polished consumer
// app converges on is a calm solid ground, the mark, one line, two buttons.
//
// Everything is measured from the safe-area insets rather than the screen
// edge, because on a notched phone the screen edge is under the status bar
// and the home indicator. The splash overlay fades out on top of this screen,
// so its logo position matching the splash's is what makes launch → welcome
// feel like one motion rather than two screens.

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
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      padding: 'calc(24px + env(safe-area-inset-top, 0px)) 28px calc(24px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* The brand block sits a touch above true centre — optically centred
          once the button stack claims the bottom. */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '22px',
        paddingBottom: '8vh',
      }}>
        <img
          src={logo}
          alt=""
          style={{ width: '112px', height: '112px', objectFit: 'contain' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
          <div style={heroWordmarkStyle('32px')}>{BRAND_NAME}</div>
          <p style={{
            margin: 0, maxWidth: '280px',
            fontSize: '15.5px', lineHeight: 1.5,
            color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif',
          }}>
            Learn words. Unlock stories you can actually&nbsp;read.
          </p>
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: '340px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <button
          onClick={onStart}
          onPointerDown={() => setPressed(true)}
          onPointerUp={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
          style={{
            width: '100%', minHeight: '54px', padding: '0 24px',
            borderRadius: '16px', border: 'none',
            background: pressed ? SAGE_DARK : SAGE, color: '#fff',
            fontSize: '16.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
            transition: 'background 120ms ease, transform 120ms ease',
            transform: pressed ? 'scale(0.985)' : 'scale(1)',
          }}
        >
          Get started
        </button>

        {/* Quiet on purpose: a second boxed button makes the fork read as a
            decision to weigh. Returning users find their door; everyone else
            never notices it. */}
        <button
          onClick={onLogIn}
          style={{
            width: '100%', minHeight: '48px',
            borderRadius: '14px', border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            fontSize: '15px', fontWeight: 650, fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
          }}
        >
          I already have an account
        </button>
      </div>
    </div>
  )
}
