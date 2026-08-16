import { PracticeGlyph, StoriesGlyph, TodayGlyph } from './HomeV2NavGlyphs'
import {
  DOCK_HEIGHT, DOCK_PADDING, DOCK_SEGMENT, DOCK_SEGMENT_HEIGHT, DOCK_WIDTH, dockBottom,
} from './bottomBar'
import { HOME_MOTION } from './homePresentation'
import { ink, languageTheme } from './languageTheme'
import { MOBILE_PRIMARY } from './navConfig'
import { mobileNavRoot } from './mobileNavState'

// The compact dock: three equal destinations in a fixed-width control, centred
// above the content.
//
// The shape is deliberately the least interesting thing on the screen. This
// product's navigation is unusual — the middle destination is a *state* rather
// than a page — so the control that carries it has to be the most conventional
// object in the app, or the learner is decoding two new ideas at once.
//
// · **Fixed width, centred.** It reads as a control sitting above the page, not
//   as the page's own footer. The width is a constant (bottomBar.js), so the
//   three destinations are the same size on a 320 and on a 430 — a bar that
//   stretches with the viewport is furniture; this is an object.
// · **Nothing moves on selection.** Every segment keeps its width, its icon and
//   its label in every state. Selection is carried by ink and a neutral seated
//   surface, which means the transition is colour only: no layout pass, no
//   reflow, no label sliding out from under a growing capsule.
// · **The selected surface is neutral, and only the ink is vermilion.** A tinted
//   accent pill behind the label was tried first and reads pink at 8% and pastel
//   at 12% — a washed-out sticker, not a control. Seating the segment on the
//   app's own secondary surface says "pressed in" the way a physical switch
//   does, and leaves the accent to do one job: mark which one is selected.
// · **All three are structurally equal.** Today is selected more often than the
//   others; it is not raised, not larger, not cradled, and not a button that
//   floats above the bar. There is no centre control here.
// · **Inactive is available, not disabled.** Resting segments use the muted
//   foreground — the same weight the rest of the app uses for legible secondary
//   text — so "not selected" never reads as "not allowed".
//
// Hidden is a STATE, not an unmount: entering focused work sinks the dock toward
// the bottom edge as it fades, and leaving lifts it back. Unmounting would pop.

const UI_FONT = "'Mona Sans', 'Inter', sans-serif"
const EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)'
const GLYPHS = { stories: StoriesGlyph, home: TodayGlyph, practice: PracticeGlyph }

// How far the dock sinks on its way out. Short: it is settling into the edge of
// the screen, not being thrown off it.
const SINK = 34

export default function MobileNav({ view, onNavigate, language, hidden = false }) {
  const activeKey = mobileNavRoot(view)
  const accent = languageTheme(language).accentHex
  const rest = 'translateX(-50%)'

  return (
    <nav
      aria-label="Primary"
      data-tour="nav"
      data-nav-hidden={hidden ? '' : undefined}
      aria-hidden={hidden ? 'true' : undefined}
      style={{
        position: 'fixed', left: '50%', bottom: dockBottom(), zIndex: 30,
        width: DOCK_WIDTH + 'px', height: DOCK_HEIGHT + 'px',
        display: 'flex', alignItems: 'center', padding: DOCK_PADDING + 'px',
        background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: (DOCK_HEIGHT / 2) + 'px',
        boxShadow: '0 10px 28px -14px rgba(24,24,27,0.30), 0 1px 2px rgba(24,24,27,0.05), inset 0 1px 0 var(--hairline)',
        fontFamily: UI_FONT,
        transformOrigin: '50% 100%',
        transform: hidden ? rest + ' translateY(' + SINK + 'px) scale(0.94)' : rest,
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        visibility: hidden ? 'hidden' : 'visible',
        transition: 'transform ' + HOME_MOTION.nav + 'ms ' + EASE
          + ', opacity ' + (hidden ? 150 : 200) + 'ms ease'
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
              width: DOCK_SEGMENT + 'px', height: DOCK_SEGMENT_HEIGHT + 'px',
              flexShrink: 0, padding: 0, border: 0, borderRadius: (DOCK_SEGMENT_HEIGHT / 2) + 'px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px',
              background: active ? 'var(--surface-2)' : 'transparent',
              color: active ? ink(accent) : 'var(--text-muted)',
              fontFamily: UI_FONT, cursor: 'pointer',
              transition: 'background ' + HOME_MOTION.tab + 'ms ease, color ' + HOME_MOTION.tab + 'ms ease',
            }}
          >
            <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center' }}>
              <Glyph size={20} active={false} color="currentColor" />
            </span>
            <span style={{ fontSize: '10.5px', lineHeight: 1, fontWeight: active ? 730 : 620, letterSpacing: '0.005em' }}>
              {item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
