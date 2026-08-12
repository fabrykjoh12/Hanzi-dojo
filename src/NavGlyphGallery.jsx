import { NAV_GLYPHS, IDENTITY_GLYPHS, GLYPH_SIZES, navGlyphPx } from './navGlyphFamily'
import { NAV_ICON_PX, CARDS_SHELL, NAV_COLUMN, cardsShellStyle } from './navEmphasis'
import { TYPE } from './typeScale'
import { RADIUS } from './shape'

// The P14-3 evaluation surface: the dimensional glyphs, every state, every size
// they can be asked for, side by side.
//
// It exists because of one thing the brief is right about — an icon can look
// excellent alone and terrible as a family. Silhouette clash, one glyph out-inking
// the rest, an accent that fragments the set: none of those are visible one glyph
// at a time, and none of them are visible in source. So they get a screen.
//
// It is in TWO sections on purpose. The production five (Home · Stories · Cards ·
// Practice · More) are the bar exactly as it ships. Profile is drawn to the same
// rules and is NOT a tab — it belongs to the screen it already has. Showing all six
// in one row invited exactly the wrong conclusion, so they are shown apart.
//
// Two things it deliberately is NOT:
//
//   · It is not a new bottom bar. MobileNav.jsx, NavIcons.jsx, navConfig.js and
//     navEmphasis.js are untouched by P14-3; the bar still ships the flat family.
//     The strips below borrow navEmphasis.js's real numbers so the comparison is
//     honest, but they are swatches, not a tray — no routing, no safe area.
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

// One size, both states. `sizeFor` lets the "intended navigation size" row hand
// each glyph its own number instead of one shared one.
function Grid({ set, label, size, sizeFor }) {
  const px = g => (sizeFor ? sizeFor(g) : size)
  return (
    // Named, because `data-glyph-size` is no longer unique across the page: the
    // recommended-ramp grid hands every glyph a different number, so a test that
    // selected on size alone would collect cells from three different grids.
    <div data-glyph-grid={label} style={{ marginBottom: '18px' }}>
      <Caption>{label} · active, then inactive</Caption>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'flex-start',
        padding: '12px 14px', borderRadius: RADIUS.card + 'px',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
      }}>
        {/* Wrapping, not shrinking: five labelled cells are wider than a 320px
            phone's content column, and a squeezed cell would move the glyph,
            which is the one thing this page exists to look at. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {set.map(g => <Cell key={g.key} glyph={g} size={px(g)} active />)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
          {set.map(g => <Cell key={g.key} glyph={g} size={px(g)} active={false} />)}
        </div>
      </div>
    </div>
  )
}

// The five in a row at nav scale, Cards in the container it already wears. This is
// the only view that answers "is Cards still the loudest thing, and is anything
// else shouting?" — the P8 defect, re-asked of a new family.
//
// `sizes` is either the family's own recommended ramp (NAV_GLYPH_PX) or the bar's
// current one (NAV_ICON_PX), so the two can be compared directly rather than
// argued about.
function NavStrip({ active, sizes, label, id }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <Caption>{label} · {active ? 'all selected' : 'all resting'}</Caption>
      <div
        data-nav-strip={id + '-' + (active ? 'active' : 'resting')}
        style={{
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
          height: '58px', padding: '0 6px',
          borderRadius: RADIUS.card + 'px',
          background: 'var(--surface)', border: '1px solid var(--border)',
        }}
      >
        {NAV_GLYPHS.map((g) => {
          const shell = g.key === 'study'
          return (
            <div key={g.key} data-strip-tab={g.key} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            }}>
              <div style={shell
                ? cardsShellStyle({ active, accentHex: 'var(--primary)' })
                : {
                  height: CARDS_SHELL.height + 'px', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                <g.Glyph size={sizes(g)} active={active} color={MUTED} />
              </div>
              <span style={{
                // The bar's own label metrics (MobileNav.jsx / NAV_COLUMN), so
                // the strip weighs the same as the thing it is standing in for.
                fontSize: '10.5px', lineHeight: NAV_COLUMN.labelLine + 'px',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--text)' : 'var(--text-muted)',
              }}>{g.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const RECOMMENDED = g => navGlyphPx(g.key)
const BAR_TODAY = g => NAV_ICON_PX[g.key] || NAV_ICON_PX.home

export default function NavGlyphGallery() {
  return (
    <div data-nav-glyph-gallery="" style={{ width: '100%', paddingBottom: '4px' }}>
      <div data-glyph-section="production">
        <NavStrip active sizes={RECOMMENDED} id="rec" label="production nav · the family's own ramp" />
        <NavStrip active={false} sizes={RECOMMENDED} id="rec" label="production nav · the family's own ramp" />
        {/* The bar's own ramp, unchanged and shown for comparison: 27.5 down to
            20, which is 1.89x in area before a single glyph is drawn. */}
        <NavStrip active sizes={BAR_TODAY} id="bar" label="production nav · the bar's ramp today" />
        <Grid set={NAV_GLYPHS} label="20px" size={20} />
        <Grid set={NAV_GLYPHS} label="24px" size={24} />
        <Grid set={NAV_GLYPHS} label="intended navigation size" sizeFor={RECOMMENDED} />
        {GLYPH_SIZES.filter(s => s !== 20 && s !== 24).map(size => (
          <Grid key={size} set={NAV_GLYPHS} label={size + 'px'} size={size} />
        ))}
      </div>

      {/* Not a tab. Drawn to the same rules for the place Profile already has. */}
      <div data-glyph-section="identity" style={{ marginTop: '6px' }}>
        <Caption>additional identity icon — not on the bar</Caption>
        {[20, 24, 32].map(size => (
          <Grid key={size} set={IDENTITY_GLYPHS} label={'Profile · ' + size + 'px'} size={size} />
        ))}
      </div>

      <div style={{ ...TYPE.caption, color: 'var(--text-faint)', lineHeight: 1.6 }}>
        Active = the dimensional treatment. Inactive = the same silhouette, flat,
        in <code>--text-muted</code>. Light and dark are the same page under the
        theme toggle. Measured ink is written to <code>ink.*.json</code> by
        <code> nav-glyphs.spec.js</code>.
      </div>
    </div>
  )
}
