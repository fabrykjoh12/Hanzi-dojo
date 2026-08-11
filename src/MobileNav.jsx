import { useState, useEffect, useRef } from 'react'
import { MoreHorizontal, X } from 'lucide-react'
import { languageTheme, ink } from './languageTheme'
import { MOBILE_PRIMARY, MOBILE_MORE, ADMIN_NAV } from './navConfig'
import { navBadge, navItemLabel } from './navBadges'
import { MOBILE_NAV_SPACE } from './navMetrics'
import { trapDialogFocus } from './dialogFocus'
import { pushSheet } from './sheetStack'
import { tapFeedback } from './haptics'

const MUTED = 'var(--text-muted)'

// The selected-tab marker. Three values, tuned against the rendered bar rather
// than chosen on paper: the gap that stops it reading as part of the bar's
// hairline border, how heavy the mark is, and how much of its column it spans —
// enough to sit under the widest label ("Practice"), so it underlines the tab
// instead of ticking it.
const MARKER_INSET = '3px'
const MARKER_THICKNESS = '3px'
const MARKER_WIDTH = '62%'

// Primary tabs live directly in the bottom bar; the rest go behind the "More"
// sheet. Study/practice modes are reached through the Practice tab.
const PRIMARY = MOBILE_PRIMARY
const MORE_ITEMS = MOBILE_MORE

function Tab({ icon: Icon, label, active, accentHex, onClick, expanded, hasPopup, badge }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
      aria-haspopup={hasPopup}
      // The count is drawn as digits and spoken as words; without this the
      // screen reader would say "Cards 24", which is a different sentence.
      aria-label={badge ? navItemLabel(label, badge) : undefined}
      className={'hd-tab hd-press' + (active ? ' is-active' : '')}
      style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '3px', padding: '9px 0 7px', minWidth: 0,
      }}
    >
      <span style={{ position: 'relative', display: 'flex' }}>
        <Icon
          className="hd-tab-icon"
          size={22} strokeWidth={active ? 2.2 : 1.85}
          color={active ? accentHex : MUTED}
        />
        {/* How many cards are waiting. Plain accent digits beside the icon —
            not a filled pill, not a circle, not a red dot. The rail already
            made this call once (Sidebar.jsx) and it is the same call: this is
            information, not an alert, and the bar is not a notification tray.
            Absolutely positioned so it cannot shift the icon or the label, and
            it carries no transition — a number that animates when it changes
            is a number asking to be watched. */}
        {badge && (
          <span aria-hidden style={{
            position: 'absolute', left: '100%', top: '-4px', marginLeft: '1px',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            fontSize: '10px', fontWeight: 750, lineHeight: 1,
            letterSpacing: '-0.01em', color: accentHex,
          }}>
            {badge}
          </span>
        )}
      </span>
      <span style={{
        fontSize: '10.5px', fontWeight: active ? 700 : 500,
        letterSpacing: '0.1px', color: active ? accentHex : MUTED,
        transition: 'color 160ms ease',
      }}>
        {label}
      </span>
    </button>
  )
}

export default function MobileNav({ view, onNavigate, onLogout, isAdmin, language, counts }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const accentHex = languageTheme(language).accentHex
  const accentInk = ink(accentHex)
  const moreItems = isAdmin ? [...ADMIN_NAV, ...MORE_ITEMS] : MORE_ITEMS
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
  // The bar is PRIMARY tabs plus "More"; the marker slides across that many
  // equal columns, so adding a tab needs no other change here.
  const columns = PRIMARY.length + 1
  const activeColumn = moreActive ? columns - 1 : PRIMARY.findIndex(i => i.key === view)

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
            boxShadow: '0 -12px 40px -12px rgba(0,0,0,0.35), inset 0 1px 0 var(--hairline)',
            padding: '8px 14px calc(16px + env(safe-area-inset-bottom))',
            animation: 'hd-sheet-up 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
          }}>
            {/* Grab handle — tells the thumb this panel belongs to the bottom edge. */}
            <div aria-hidden style={{
              width: '38px', height: '4px', borderRadius: '999px',
              background: 'var(--border)', margin: '6px auto 4px',
            }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 6px 8px' }}>
              <span style={{
                fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: 'var(--text-faint)',
              }}>
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
              const tint = danger ? '#DC2626' : accentHex
              const tintInk = danger ? '#DC2626' : accentInk
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
                    color: danger ? '#DC2626' : (active ? tintInk : 'var(--text)'),
                    fontSize: '15px', fontWeight: active ? 650 : 500, textAlign: 'left',
                    animationDelay: `${40 + i * 22}ms`,
                  }}
                >
                  {active && (
                    <span aria-hidden style={{
                      position: 'absolute', left: 0, top: '11px', bottom: '11px',
                      width: '3px', borderRadius: '0 3px 3px 0', background: tintInk,
                    }} />
                  )}
                  <Icon size={20} strokeWidth={active ? 2.1 : 1.85} color={danger ? '#DC2626' : (active ? tintInk : MUTED)} />
                  {item.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Fixed bottom navigation bar */}
      <nav aria-label="Primary" data-tour="nav" style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30,
        display: 'flex', alignItems: 'stretch',
        background: 'var(--surface-glass)', backdropFilter: 'blur(14px)',
        borderTop: '1px solid var(--border)',
        // Declared, not emergent. The bar used to be however tall its padding,
        // icon and label happened to add up to, while App.jsx reserved a
        // different number it had been told once — see navMetrics.js.
        boxSizing: 'border-box', height: MOBILE_NAV_SPACE,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* One ink marker sliding between columns.
            It used to be a 3px dash flush against the bar's own 1px top border,
            42% of its column wide — narrower than most of the labels it was
            meant to be marking. At arm's length the two lines read as one, so
            the selected tab was carried almost entirely by colour.
            Now it is held clear of the border by MARKER_INSET, rounded at both
            ends so it is a mark rather than a segment of a rule, and wide
            enough to underline the tab rather than tick it. */}
        <span aria-hidden style={{
          position: 'absolute', top: MARKER_INSET, left: 0, height: MARKER_THICKNESS,
          width: `${100 / columns}%`,
          transform: `translateX(${Math.max(0, activeColumn) * 100}%)`,
          opacity: activeColumn < 0 ? 0 : 1,
          transition: 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease',
          pointerEvents: 'none',
        }}>
          <span style={{
            display: 'block', height: '100%', width: MARKER_WIDTH, margin: '0 auto',
            borderRadius: '999px', background: accentInk,
          }} />
        </span>

        {PRIMARY.map(item => (
          <Tab key={item.key} icon={item.icon} label={item.label} accentHex={accentInk}
            active={view === item.key} badge={navBadge(item.key, counts)} onClick={() => go(item.key)} />
        ))}
        <Tab icon={MoreHorizontal} label="More" accentHex={accentInk} active={moreActive}
          expanded={moreOpen} hasPopup="dialog" onClick={() => setMoreOpen(o => !o)} />
      </nav>
    </>
  )
}
