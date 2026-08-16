import { HomeGlyph, PracticeGlyph, StoriesGlyph } from './HomeV2NavGlyphs'
import { HOME_MOTION } from './homePresentation'
import { ink, languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

// One calm glass dock: three equal tabs, and the active one sits on a tinted
// ink pill that slides between them. No notch, no raised medallion — emphasis
// comes from the gateway glyph in the centre and the red ink of the active
// state, not from architecture. On screens outside the three roots (Study,
// Profile…) the pill fades out and the dock goes quiet.
//
// Reduced motion needs no branch here: every transition below is a CSS
// transition, and index.css's prefers-reduced-motion catch-all flattens them.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.3, 0.9, 0.2, 1)'
const GLYPHS = { stories: StoriesGlyph, home: HomeGlyph, practice: PracticeGlyph }
const ORDER = ['stories', 'home', 'practice']

function DockTab({ item, active, accent, onNavigate }) {
  const Glyph = GLYPHS[item.key]
  return (
    <button type="button" aria-current={active ? 'page' : undefined} onClick={() => onNavigate(item.key)} className="hd-press" style={{
      position: 'relative', minWidth: 0, height: '100%', padding: '9px 0 8px', border: 0, background: 'transparent',
      color: active ? ink(accent) : 'var(--text-muted)', fontFamily: UI_FONT, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '3px',
      '--primary-bright': active ? '#E66A52' : 'var(--text-faint)',
      '--primary-fill': active ? accent : 'var(--text-muted)',
      '--primary-pressed': active ? '#8F2D1D' : 'var(--text-muted)',
      '--plum': active ? accent : 'var(--text-muted)',
      transition: 'color ' + HOME_MOTION.nav + 'ms ' + EASE,
    }}>
      <span aria-hidden="true" style={{ height: '26px', display: 'grid', placeItems: 'center' }}>
        <Glyph size={item.key === 'home' ? 26 : 24} active={active} color="currentColor" />
      </span>
      <span style={{ height: '12px', fontSize: '11px', lineHeight: '12px', fontWeight: active ? 720 : 600, letterSpacing: '0.01em' }}>{item.label}</span>
    </button>
  )
}

export default function MobileNav({ view, onNavigate, language }) {
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex
  const idx = ORDER.indexOf(activeKey)

  return (
    <nav aria-label="Primary" data-tour="nav" style={{
      position: 'fixed', left: '16px', right: '16px', bottom: 'max(10px, env(safe-area-inset-bottom))', zIndex: 30,
      height: '64px', maxWidth: '360px', margin: '0 auto',
      background: 'var(--surface-glass)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.4)', backdropFilter: 'blur(16px) saturate(1.4)',
      border: '1px solid var(--border)', borderRadius: '22px',
      boxShadow: 'var(--shadow-2), inset 0 1px 0 var(--hairline)',
      fontFamily: UI_FONT,
    }}>
      <span aria-hidden="true" style={{
        position: 'absolute', top: '7px', bottom: '7px', left: '7px', width: 'calc((100% - 14px) / 3)',
        borderRadius: '15px',
        background: 'color-mix(in srgb, ' + accent + ' 11%, var(--surface))',
        boxShadow: 'inset 0 1px 0 var(--hairline), inset 0 0 0 1px color-mix(in srgb, ' + accent + ' 15%, var(--surface))',
        opacity: idx < 0 ? 0 : 1,
        transform: 'translateX(' + (idx < 0 ? 100 : idx * 100) + '%)',
        transition: 'transform ' + HOME_MOTION.nav + 'ms ' + EASE + ', opacity 180ms ease',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {MOBILE_PRIMARY.map(item => (
          <DockTab key={item.key} item={item} active={activeKey === item.key} accent={accent} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  )
}
