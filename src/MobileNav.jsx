import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { languageTheme, ink } from './languageTheme'
import { MOBILE_PRIMARY, MOBILE_MORE_TAB, moreItemsFor } from './navConfig'
import { TYPE } from './typeScale'
import { NAV_COLUMN, navIconPx, iconRowStyle, cardsShellStyle, navTrayStyle } from './navEmphasis'
import { trapDialogFocus } from './dialogFocus'
import { pushSheet } from './sheetStack'
import { tapFeedback } from './haptics'

const MUTED = 'var(--text-muted)'

// Icon sizes, the Cards container, the tray's chrome and the column's height
// budget all live in navEmphasis.js / navMetrics.js, with the measurements that
// chose them. Nothing about the bar's geometry or hierarchy is a literal here.
//
// P14-4 dropped one thing from this file: More's glyph used to be drawn a step
// fainter than the other four (`--text-faint` rather than `--text-muted`). That
// existed because the flat MoreIcon was three tiny dots that still out-shouted its
// neighbours at 20px. The dimensional family is drawn to one weight and More is
// already the smallest of the five at 22px, so the extra colour step was quieting
// something twice — and it made More the one tab whose resting state did not match
// the others, which is the opposite of a family.

// Primary tabs live directly in the bottom bar; the rest go behind the "More"
// sheet. Study/practice modes are reached through the Practice tab.
const PRIMARY = MOBILE_PRIMARY

// One tab. Selection is carried by the glyph going from FLAT to DIMENSIONAL —
// then by colour, then by the label's weight. Three signals, of which only one is
// colour; the accent line that used to ride the bar's top edge is gone, and with it
// the last thing on here that was decoration rather than information.
//
// P14-4 changed the shape of that first signal but not its job. The flat family
// (NavIcons.jsx) swapped outline for filled: two different drawings. The
// dimensional family (navGlyphs.jsx) draws ONE silhouette and lights it, so the
// resting glyph paints that silhouette once in `--text-muted` and the selected one
// clips three planes of the brand to the same shape. Still a change in the mark
// rather than only in its hue — which is the property that matters — and
// nav-bar.spec.js counts tones now instead of fills.
//
// `shell` is the fourth signal, and it belongs to exactly one tab: Cards gets a
// rounded container behind its glyph. It is inside the tray, not floating over
// it — no notch, no circle, no raised button, it does not break the tray's
// silhouette, and the tray's height is untouched by it (navEmphasis.js owns that
// budget and a test holds it).
function Tab({
  icon: Icon, label, active, accentHex, shellAccent, onClick,
  expanded, hasPopup, size, emphasis, shell,
}) {
  const tone = active ? accentHex : MUTED
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      className={'hd-tab hd-press' + (active ? ' is-active' : '')}
      style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        // It has to add up: the column shrinks its children when it doesn't, and
        // the first thing to give is the icon row — which crops the glyphs from
        // the top. navColumnHeight() is this sum, and navEmphasis.test.js
        // asserts it stays inside the bar.
        gap: NAV_COLUMN.gap + 'px',
        padding: NAV_COLUMN.paddingTop + 'px 0 ' + NAV_COLUMN.paddingBottom + 'px',
        minWidth: 0,
      }}
    >
      {/* Every icon sits in a row of the same height — the container's height —
          so the five glyphs share one centre line whatever their size, and the
          one that has a container does not sit a pixel off the others. */}
      <span style={shell ? cardsShellStyle({ active, accentHex: shellAccent }) : iconRowStyle()}>
        <Icon size={size} active={active} color={tone} />
      </span>
      <span style={{
        fontSize: '10.5px', lineHeight: NAV_COLUMN.labelLine + 'px',
        // Cards carries one step more weight at rest than its neighbours. Same
        // face, same size, same colour — the difference is meant to be felt
        // rather than noticed.
        fontWeight: active ? 700 : (emphasis ? 600 : 500),
        letterSpacing: '0.1px', color: active ? accentHex : MUTED,
        transition: 'color 160ms ease',
      }}>
        {label}
      </span>
    </button>
  )
}

// No counts, deliberately. The waiting number lived here for one build and on a
// real phone it made the bar read as a dashboard: the bar's job is "where do I
// want to go", and it should not answer a question Home already answers better.
// It stays on Home and on the desktop rail (navBadges.js).
export default function MobileNav({ view, onNavigate, onLogout, isAdmin, language }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const accentHex = languageTheme(language).accentHex
  const accentInk = ink(accentHex)
  // Who sees which rows is decided in navConfig.js, and tested there.
  const moreItems = moreItemsFor(isAdmin)
  const moreKeys = moreItems.map(i => i.key)

  const go = (key) => {
    // A tick when the bar actually changes tab — not on a tap that lands you
    // where you already are, which would be the app buzzing at nothing.
    if (key !== view && key !== 'logout') tapFeedback()
    setMoreOpen(false)
    if (key === 'logout') onLogout()
    else onNavigate(key)
  }

  // Escape closes the "More" sheet (keyboard parity with the backdrop tap).
  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  // …and Android's hardware Back closes it too. It used to navigate the screen
  // UNDERNEATH while the sheet stayed open on top of the result, because the
  // sheet's state lives here and the back handler could not see it.
  useEffect(() => {
    if (!moreOpen) return undefined
    return pushSheet(() => setMoreOpen(false))
  }, [moreOpen])

  // aria-modal hides the page from assistive tech, so focus must actually move
  // into the sheet — and back to the More button on close.
  const sheetRef = useRef(null)
  const openerRef = useRef(null)
  useEffect(() => {
    if (!moreOpen) return
    openerRef.current = document.activeElement
    if (sheetRef.current) sheetRef.current.focus({ preventScroll: true })
    return () => {
      if (openerRef.current && openerRef.current.focus) openerRef.current.focus({ preventScroll: true })
    }
  }, [moreOpen])

  const moreActive = moreKeys.indexOf(view) !== -1

  return (
    <>
      {/* "More" bottom sheet */}
      {moreOpen && (
        <>
          <div
            onClick={() => setMoreOpen(false)}
            aria-hidden
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40,
              background: 'rgba(9, 9, 11, 0.42)', backdropFilter: 'blur(2px)',
              animation: 'hd-fade-in 200ms ease both',
            }}
          />
          {/* `aria-modal` hides the rest of the page from assistive tech, so Tab
              must not be able to leave the sheet — without the trap the next Tab
              lands on a page the screen reader can no longer see. */}
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-label="More menu" tabIndex={-1}
            onKeyDown={(e) => trapDialogFocus(e, sheetRef.current)} style={{
            outline: 'none',
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 41,
            background: 'var(--surface)',
            borderTopLeftRadius: '22px', borderTopRightRadius: '22px',
            borderTop: '1px solid var(--border)',
            boxShadow: 'var(--shadow-sheet), inset 0 1px 0 var(--inset-highlight)',
            padding: '8px 14px calc(16px + env(safe-area-inset-bottom))',
            animation: 'hd-sheet-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
          }}>
            {/* Grab handle — tells the thumb this panel belongs to the bottom edge. */}
            <div aria-hidden style={{
              width: '38px', height: '4px', borderRadius: '999px',
              background: 'var(--border)', margin: '6px auto 4px',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 6px 8px' }}>
              <span style={{ ...TYPE.eyebrow, color: 'var(--text-faint)' }}>
                More
              </span>
              {/* 44x44 thumb target. The negative margin cancels the growth back
                  to the old 28px box in layout, so the X sits exactly where it did
                  and the row keeps its height — only the hit area gets bigger. */}
              <button onClick={() => setMoreOpen(false)} aria-label="Close menu" className="hd-press"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  width: '44px', height: '44px', margin: '-8px -8px -8px 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                <X size={20} strokeWidth={1.9} color={MUTED} />
              </button>
            </div>
            {moreItems.map((item, i) => {
              const Icon = item.icon
              const active = view === item.key
              const danger = item.key === 'logout'
              // `var(--danger)` rather than the literal, which was a
              // LIGHT-mode red shipping into dark mode: #DC2626 on the dark
              // sheet measured 3.49:1 (P10-A5). The token is #DC2626 in light —
              // so light is byte-identical — and #F87171 in dark, at 6.1:1.
              // A colour correction, not a change to the bar's design.
              const tint = danger ? 'var(--danger)' : accentHex
              const tintInk = danger ? 'var(--danger)' : accentInk
              return (
                <button
                  key={item.key}
                  onClick={() => go(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className="hd-press hd-rise"
                  style={{
                    position: 'relative', width: '100%', border: 'none', cursor: 'pointer',
                    background: active ? `color-mix(in srgb, ${tint} 11%, var(--surface))` : 'none',
                    display: 'flex', alignItems: 'center', gap: '14px',
                    padding: '13px 14px', borderRadius: '12px',
                    color: danger ? 'var(--danger)' : (active ? tintInk : 'var(--text)'),
                    fontSize: '15px', fontWeight: active ? 600 : 500, textAlign: 'left',
                    animationDelay: `${40 + i * 22}ms`,
                  }}
                >
                  {active && (
                    <span aria-hidden style={{
                      position: 'absolute', left: 0, top: '11px', bottom: '11px',
                      width: '3px', borderRadius: '0 3px 3px 0', background: tintInk,
                    }} />
                  )}
                  <Icon size={20} strokeWidth={active ? 2.1 : 1.85} color={danger ? 'var(--danger)' : (active ? tintInk : MUTED)} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* The floating tray. Every number in its chrome — the inset, the radius, the
          height, the surface, the elevation — is navTrayStyle() in navEmphasis.js,
          so a unit test can read them and the /dev gallery draws the same object.

          What changed in P14-4 and what did not: the tray is inset, rounded on all
          four corners, solid instead of `--surface-glass` + `blur(14px)`, and it
          floats clear of the bottom edge. The five tabs, their order, their keys,
          their routing, the More sheet and Android Back are all untouched. */}
      <nav aria-label="Primary" data-tour="nav" style={navTrayStyle()}>
        {PRIMARY.map(item => (
          <Tab key={item.key} icon={item.icon} label={item.label} accentHex={accentInk}
            // The glyph is a drawn mark, so it takes the ink-lifted accent; the
            // container is a TINT and takes the raw hex, because it mixes into a
            // surface (CLAUDE.md §5). Two different values on purpose.
            shellAccent={accentHex}
            active={view === item.key} onClick={() => go(item.key)}
            size={navIconPx(item.key)}
            emphasis={item.key === 'study'} shell={item.key === 'study'} />
        ))}
        <Tab icon={MOBILE_MORE_TAB.Glyph} label={MOBILE_MORE_TAB.label}
          accentHex={accentInk} active={moreActive}
          size={navIconPx(MOBILE_MORE_TAB.key)}
          expanded={moreOpen} hasPopup="dialog" onClick={() => setMoreOpen(o => !o)} />
      </nav>
    </>
  )
}
