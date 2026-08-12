import { NAV_GLYPHS, GLYPH_SIZES } from './navGlyphFamily'
import { NAV_ICON_PX, CARDS_SHELL, NAV_COLUMN, cardsShellStyle } from './navEmphasis'
import { TYPE } from './typeScale'
import { RADIUS } from './shape'

// The P14-3 evaluation surface: the five dimensional glyphs, every state, every
// size the bar can ask for, side by side.
//
// It exists because of one thing the brief is right about — an icon can look
// excellent alone and terrible as a family. Silhouette clash, one glyph out-inking
// the rest, an accent that fragments the set: none of those are visible one glyph
// at a time, and none of them are visible in source. So they get a screen.
//
// Two things it deliberately is NOT:
//
//   · It is not a new bottom bar. MobileNav.jsx and NavIcons.jsx are untouched by
//     P14-3; the bar still ships the flat family. The "at nav size" strip below
//     borrows navEmphasis.js's real numbers so the comparison is honest, but it
//     is a swatch, not a tray — no routing, no labels-as-tabs, no safe area. Note
//     the fifth column is Profile, and the bar's fifth tab is More: whether
//     Profile becomes a tab is a navigation-architecture decision for P14-4
//     (docs/BACKLOG.md), not something this gallery is proposing.
//   · It is not theme-switchable in place. Every neutral in this app is declared
//     on `:root[data-theme]`, so a dark island inside a light page would mean
//     re-declaring the tokens by hand — i.e. hardcoded hexes. Light and dark are
//     compared by viewing this page twice, which is exactly what
//     `nav-glyphs.spec.js` does.
//
// Delete it when the family is either shipped on the bar or rejected.

const MUTED = 'var(--text-muted)'

function Caption({ children }) {
  return (
    <div style={{ ...TYPE.eyebrow, color: 'var(--text-faint)', marginBottom: '8px' }}>
      {children}
    </div>
  )
}

// A labelled cell, so a glyph is always identified next to its own drawing —
// "which one is Practice?" is a question the grid should never provoke.
function Cell({ glyph, size, active }) {
  const { key, label, Glyph } = glyph
  return (
    <div
      data-glyph={key} data-glyph-state={active ? 'active' : 'inactive'} data-glyph-size={size}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
        minWidth: '44px',
      }}
    >
      <div style={{ height: '34px', display: 'flex', alignItems: 'center' }}>
        <Glyph size={size} active={active} color={MUTED} />
      </div>
      <span style={{ ...TYPE.caption, color: 'var(--text-faint)' }}>{label}</span>
    </div>
  )
}

function Grid({ size }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <Caption>{size}px · active, then inactive</Caption>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'flex-start',
        padding: '12px 14px', borderRadius: RADIUS.card + 'px',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        {/* Wrapping, not shrinking: five labelled cells are wider than a 320px
            phone's content column, and a squeezed cell would move the glyph,
            which is the one thing this page exists to look at. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {NAV_GLYPHS.map(g => <Cell key={g.key} glyph={g} size={size} active />)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {NAV_GLYPHS.map(g => <Cell key={g.key} glyph={g} size={size} active={false} />)}
        </div>
      </div>
    </div>
  )
}

// The five at the sizes the CURRENT bar would hand them, Cards in the container
// it already wears. This is the only view that answers "is Cards still the
// loudest thing, and is anything else shouting?" — the P8 defect, re-asked of a
// new family.
function NavStrip({ active }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <Caption>
        at the current bar’s sizes ({active ? 'all selected' : 'all resting'})
      </Caption>
      <div
        data-nav-strip={active ? 'active' : 'resting'}
        style={{
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          height: '58px', padding: '0 6px',
          borderRadius: RADIUS.card + 'px',
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}
      >
        {NAV_GLYPHS.map((g) => {
          const size = NAV_ICON_PX[g.key] || NAV_ICON_PX.home
          const on = active
          const shell = g.key === 'study'
          return (
            <div key={g.key} data-strip-tab={g.key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            }}>
              <div style={shell
                ? cardsShellStyle({ active: on, accentHex: 'var(--primary)' })
                : {
                  height: CARDS_SHELL.height + 'px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                <g.Glyph size={size} active={on} color={MUTED} />
              </div>
              <span style={{
                // The bar's own label metrics (MobileNav.jsx / NAV_COLUMN), so
                // the strip weighs the same as the thing it is standing in for.
                fontSize: '10.5px', lineHeight: NAV_COLUMN.labelLine + 'px',
                fontWeight: on ? 700 : 500,
                color: on ? 'var(--text)' : 'var(--text-muted)',
              }}>{g.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function NavGlyphGallery() {
  return (
    <div data-nav-glyph-gallery="" style={{ width: '100%', paddingBottom: '4px' }}>
      <NavStrip active />
      <NavStrip active={false} />
      {GLYPH_SIZES.map(size => <Grid key={size} size={size} />)}
      <div style={{ ...TYPE.caption, color: 'var(--text-faint)', lineHeight: 1.6 }}>
        Active = the dimensional treatment. Inactive = the same silhouette, flat,
        in <code>--text-muted</code>. Light and dark are the same page under the
        theme toggle.
      </div>
    </div>
  )
}
