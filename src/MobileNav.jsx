import { DOCK_HEIGHT, dockBottom } from './bottomBar'
import { HOME_MOTION } from './homePresentation'
import { ink, languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

// The floating dock: five equal destinations — Home · Stories · Cards ·
// Practice · Profile — in a light glass bar above the safe area.
//
// The shape is deliberately conventional (Apple-toolbar restraint, not a
// concept piece):
//
// · Five fixed tabs, icon over label, every label always printed. Geometry is
//   identical for every tab in every state — selection changes colour and
//   stroke weight only, so switching tabs moves nothing.
// · Glass belongs here because this is system chrome, the one layer that
//   floats over scrolling content. `--surface-glass` + blur, with a plain
//   opaque fallback where backdrop-filter isn't available. Content surfaces
//   stay opaque.
// · Cards sits in the centre because it is the main learning action. Its
//   emphasis is optical — a slightly larger, slightly heavier glyph — not a
//   pedestal, a circle, or a different tab shape.
//
// Hidden is a STATE, not an unmount: the dock slides down as a focused screen
// (a card session, the reader) takes over, and slides back when it releases.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)'

export default function MobileNav({ view, onNavigate, language, hidden = false }) {
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex
  const reduced = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const slideMs = reduced ? 0 : HOME_MOTION.nav

  return (
    <nav
      aria-label="Primary"
      data-tour="nav"
      data-nav-hidden={hidden ? '' : undefined}
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        position: 'fixed', left: '16px', right: '16px', bottom: dockBottom(), zIndex: 30,
        height: DOCK_HEIGHT + 'px', maxWidth: '440px', margin: '0 auto',
        display: 'flex', alignItems: 'stretch', padding: '5px 6px',
        background: 'var(--surface-glass)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
        backdropFilter: 'blur(16px) saturate(1.6)',
        border: '1px solid var(--border)', borderRadius: '30px',
        boxShadow: '0 10px 28px -14px rgba(24,24,27,0.28), 0 1px 2px rgba(24,24,27,0.05), inset 0 1px 0 var(--hairline)',
        fontFamily: UI_FONT,
        transform: hidden ? 'translateY(' + (DOCK_HEIGHT + 24) + 'px)' : 'none',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        visibility: hidden ? 'hidden' : 'visible',
        transition: 'transform ' + slideMs + 'ms ' + EASE
          + ', opacity ' + (hidden ? 140 : 200) + 'ms ease'
          + ', visibility 0s linear ' + (hidden ? slideMs : 0) + 'ms',
      }}
    >
      {MOBILE_PRIMARY.map(item => {
        const Icon = item.icon
        const active = activeKey === item.key
        const centre = item.key === 'study'
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => onNavigate(item.key)}
            className="hd-dock-tab"
            style={{
              // Equal flex basis: five identical columns, no growth on
              // selection, no centre pedestal. The geometry never moves.
              flex: '1 1 0', minWidth: 0, padding: 0, border: 0, borderRadius: '24px',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '3px',
              background: 'transparent',
              color: active ? ink(accent) : 'var(--text-muted)',
              fontFamily: UI_FONT, cursor: 'pointer',
              transition: 'color 180ms ease, transform 90ms ease',
            }}
          >
            <span aria-hidden="true" style={{ height: '25px', display: 'grid', placeItems: 'center' }}>
              <Icon
                size={centre ? 24 : 22}
                strokeWidth={(centre ? 0.15 : 0) + (active ? 2.3 : 1.9)}
                absoluteStrokeWidth
              />
            </span>
            <span style={{ fontSize: '10.5px', lineHeight: 1, fontWeight: 640, letterSpacing: '0.005em', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
