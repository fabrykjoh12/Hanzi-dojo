import { useState } from 'react'
import logo from './assets/Hanzi-logo.png'
import bgLogin from './assets/bg-login.webp'
import { BRAND_NAME, heroWordmarkStyle } from './brand'
import { FIRST_MISSION_WELCOME } from './firstMission'
import { ArrowRight } from 'lucide-react'

const SAGE = '#6E8466'
const SAGE_DARK = '#5C7155'

// The single welcome screen of the First Mission. One calm message, one CTA —
// no skip, no secondary actions, no navigation. It hands straight off to the
// (guided) first study session.
export default function FirstMissionWelcome({ onStart }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', padding: '24px', background: 'var(--bg)',
    }}>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'url(' + bgLogin + ')', backgroundSize: 'cover',
        backgroundPosition: 'center', opacity: 0.28, pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '440px', textAlign: 'center' }}>
        <img src={logo} alt="" style={{ width: '64px', height: '64px', objectFit: 'contain', marginBottom: '12px' }} />
        <div style={{ ...heroWordmarkStyle('34px'), marginBottom: '26px' }}>{BRAND_NAME}</div>

        <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', margin: '0 0 18px' }}>
          {FIRST_MISSION_WELCOME.title}
        </h1>
        <div style={{ fontSize: '16px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '34px' }}>
          {FIRST_MISSION_WELCOME.body.map((line, i) => (
            <p key={i} style={{ margin: '0 0 4px' }}>{line}</p>
          ))}
        </div>

        <button
          onClick={onStart}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            width: '100%', minHeight: '56px', borderRadius: '16px', border: 'none',
            background: hovered ? SAGE_DARK : SAGE, color: '#fff',
            fontSize: '16px', fontWeight: 750, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
            transition: 'background 160ms ease, transform 160ms ease, box-shadow 160ms ease',
            transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: hovered ? '0 14px 32px rgba(110,132,102,0.30)' : '0 6px 18px rgba(110,132,102,0.20)',
          }}
        >
          {FIRST_MISSION_WELCOME.cta}
          <ArrowRight size={19} strokeWidth={2.2} color="#fff" />
        </button>
      </div>
    </div>
  )
}
