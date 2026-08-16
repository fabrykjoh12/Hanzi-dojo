import { HomeGlyph, PracticeGlyph, StoriesGlyph } from './HomeV2NavGlyphs'
import { DOCK_HEIGHT, dockBottom } from './bottomBar'
import { HOME_MOTION } from './homePresentation'
import { ink, languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

// The dock: a floating tab bar of three equal destinations, where the SELECTED
// tab expands into a labelled capsule and the other two rest as icons.
//
// The reasoning, since the shape is unusual enough to deserve it:
//
// · Floating, not edge-to-edge, so navigation reads as an app control sitting
//   above the page rather than as the page's own footer. It is a plain surface
//   with a hairline border and a soft shadow — no blur, no glass, no gradient.
// · The three tabs are equal by construction: same flex basis, same icon size,
//   same target. Only the CURRENT one carries a label, which is what makes the
//   bar legible at a glance without printing three words that never change.
//   Home is a tab like the others — no cradle, no elevation, no centre button.
// · Selection is a single travelling object. The capsule grows on the tab you
//   tapped while the previous one collapses, so the eye follows one movement
//   instead of watching three colours repaint.
//
// Accessibility note: an inactive tab's label is clipped visually (max-width 0)
// but stays in the DOM, so the accessible name is always the destination —
// never a bare icon.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)'
const GLYPHS = { stories: StoriesGlyph, home: HomeGlyph, practice: PracticeGlyph }

// The selected tab's share of the row. 1.85 gives the label room without the
// capsule dominating: at 390px the active tab is ~150px against ~81px for each
// resting tab — clearly selected, nowhere near a centre-stage control.
const ACTIVE_FLEX = 1.85

export default function MobileNav({ view, onNavigate, language, hidden = false }) {
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex

  return (
    <nav
      aria-label="Primary"
      data-tour="nav"
      data-nav-hidden={hidden ? '' : undefined}
      // Hidden is a STATE, not an unmount: the dock slides down and fades as the
      // session or the reader takes over, and slides back when it releases. An
      // unmounted bar would pop.
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        position: 'fixed', left: '16px', right: '16px', bottom: dockBottom(), zIndex: 30,
        height: DOCK_HEIGHT + 'px', maxWidth: '440px', margin: '0 auto',
        display: 'flex', alignItems: 'center', gap: '2px', padding: '6px',
        background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: '29px',
        boxShadow: '0 10px 28px -14px rgba(24,24,27,0.30), 0 1px 2px rgba(24,24,27,0.05), inset 0 1px 0 var(--hairline)',
        fontFamily: UI_FONT,
        transform: hidden ? 'translateY(' + (DOCK_HEIGHT + 24) + 'px)' : 'none',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        visibility: hidden ? 'hidden' : 'visible',
        transition: 'transform ' + HOME_MOTION.nav + 'ms ' + EASE
          + ', opacity ' + (hidden ? 140 : 200) + 'ms ease'
          + ', visibility 0s linear ' + (hidden ? HOME_MOTION.nav : 0) + 'ms',
      }}
    >
      {MOBILE_PRIMARY.map(item => {
        const Glyph = GLYPHS[item.key]
        const active = activeKey === item.key
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? 'page' : undefined}
            tabIndex={hidden ? -1 : undefined}
            onClick={() => onNavigate(item.key)}
            className="hd-dock-tab"
            style={{
              flex: active ? ACTIVE_FLEX : 1,
              minWidth: 0, height: '46px', padding: 0, border: 0, borderRadius: '23px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
              background: active ? 'color-mix(in srgb, ' + accent + ' 9%, var(--surface))' : 'transparent',
              color: active ? ink(accent) : 'var(--text-muted)',
              fontFamily: UI_FONT, cursor: 'pointer',
              transition: 'flex ' + HOME_MOTION.nav + 'ms ' + EASE
                + ', background ' + HOME_MOTION.nav + 'ms ease'
                + ', color 200ms ease',
            }}
          >
            <span aria-hidden="true" style={{ flexShrink: 0, display: 'grid', placeItems: 'center' }}>
              <Glyph size={22} active={false} color="currentColor" />
            </span>
            <span
              style={{
                fontSize: '12.5px', lineHeight: 1, fontWeight: 720, letterSpacing: '-0.005em',
                whiteSpace: 'nowrap', overflow: 'hidden',
                maxWidth: active ? '86px' : '0px',
                opacity: active ? 1 : 0,
                transition: 'max-width ' + HOME_MOTION.nav + 'ms ' + EASE
                  + ', opacity ' + (active ? 200 : 110) + 'ms ease' + (active ? ' 60ms' : ''),
              }}
            >
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
