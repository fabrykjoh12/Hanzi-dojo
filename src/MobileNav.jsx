import { HOME_MOTION } from './homePresentation'
import { ink, languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

// One quiet, edge-to-edge text bar — navigation from an established app, not
// a designed object. Three labels; the active one is red ink, and a 4px ink
// dot slides between tabs so switching is movement, not a repaint. That dot
// is the bar's entire indicator: no capsule, no pill, no icons.
//
// On screens outside the three roots the dot fades out and every label goes
// quiet. During a study session the bar isn't rendered at all (App.jsx) — the
// session owns the screen.
//
// Reduced motion needs no branch here: the transitions are CSS, and
// index.css's prefers-reduced-motion catch-all flattens them.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.3, 0.8, 0.3, 1)'
const ORDER = ['stories', 'home', 'practice']

export default function MobileNav({ view, onNavigate, language }) {
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex
  const idx = ORDER.indexOf(activeKey)

  return (
    <nav aria-label="Primary" data-tour="nav" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
      height: 'calc(54px + max(env(safe-area-inset-bottom), 14px))',
      paddingBottom: 'max(env(safe-area-inset-bottom), 14px)',
      background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
      WebkitBackdropFilter: 'blur(18px)', backdropFilter: 'blur(18px)',
      borderTop: '1px solid color-mix(in srgb, var(--border) 72%, transparent)',
      fontFamily: UI_FONT,
    }}>
      <span aria-hidden="true" style={{
        position: 'absolute', top: '40px', left: 'calc(100% / 6 - 2px)',
        width: '4px', height: '4px', borderRadius: '50%', background: ink(accent),
        opacity: idx < 0 ? 0 : 1,
        transform: 'translateX(calc(' + (idx < 0 ? 1 : idx) + ' * 100vw / 3))',
        transition: 'transform ' + HOME_MOTION.nav + 'ms ' + EASE + ', opacity 180ms ease',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', height: '54px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {MOBILE_PRIMARY.map(item => {
          const active = activeKey === item.key
          return (
            <button key={item.key} type="button" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(item.key)} className="hd-press" style={{
              minWidth: 0, height: '100%', padding: 0, border: 0, background: 'transparent', cursor: 'pointer',
              fontFamily: UI_FONT, display: 'grid', placeItems: 'center',
              color: active ? ink(accent) : 'var(--text-muted)',
              transition: 'color 220ms ease',
            }}>
              <span style={{ fontSize: '13px', lineHeight: '13px', fontWeight: active ? 720 : 560, letterSpacing: '0.005em', transition: 'font-weight 240ms ease' }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
